create schema if not exists caja_private;
revoke all on schema caja_private from public, anon, authenticated;

create table public.cash_sheets (
 id uuid primary key default gen_random_uuid(),
 branch text not null check (branch in ('AV2','NAZCA','LAMARCA','CORRIENTES','CASTELLI','QUILMES','SARMIENTO','PUEYRREDON','WEB','DEPOSITO','ADMINISTRACION')),
 business_date date not null,
 data jsonb not null,
 totals jsonb not null default '{}'::jsonb,
 version integer not null default 1 check(version>0),
 created_by uuid default auth.uid() references auth.users(id),
 updated_by uuid default auth.uid() references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(branch,business_date),
 check(jsonb_typeof(data)='object' and octet_length(data::text)<200000)
);
alter table public.cash_sheets enable row level security;
revoke all on public.cash_sheets from anon, authenticated;
create policy cash_no_direct_access on public.cash_sheets for all to anon, authenticated using (false) with check (false);
create function caja_private.amount(v jsonb) returns numeric
language plpgsql immutable set search_path='' as $$
declare n numeric;
begin
 if v is null or v='null'::jsonb or v='""'::jsonb then return 0; end if;
 n:=(v#>>'{}')::numeric;
 if n<0 or n>999999999 or n::text in ('NaN','Infinity','-Infinity') then raise exception 'Monto inválido'; end if;
 return round(n,2);
end $$;

create function caja_private.validate_sheet() returns trigger
language plpgsql set search_path='' as $$
declare d jsonb:=new.data; r jsonb; section text;
 expenses numeric:=0; vc numeric:=0; vg numeric:=0; withdrawals numeric:=0; dc numeric:=0; deposits numeric:=0;
 sc numeric:=0; sd numeric:=0; expected numeric; difference numeric; cash numeric; final numeric; sale_total numeric; cash_sales numeric;
begin
 if tg_op='UPDATE' then
  if new.version<>old.version+1 then raise exception 'Versión inválida'; end if;
  new.created_at:=old.created_at; new.created_by:=old.created_by;
  new.updated_by:=coalesce(auth.uid(),old.updated_by);
 end if;
 new.updated_at:=now();
 if d->>'date' is null or (d->>'date')::date<>new.business_date or length(trim(coalesce(d->>'responsible','')))=0 or length(d->>'responsible')>120 or length(coalesce(d->>'notes',''))>4000 then raise exception 'Fecha o responsable inválidos'; end if;
 foreach section in array array['expenses','vouchers','withdrawals','deposits','shipping'] loop
  if jsonb_typeof(d->section) is distinct from 'array' or jsonb_array_length(d->section)>100 then raise exception 'Filas inválidas'; end if;
  for r in select value from jsonb_array_elements(d->section) loop
   if jsonb_typeof(r) is distinct from 'object' or length(trim(coalesce(r->>'name','')))=0 or length(r->>'name')>240 or length(coalesce(r->>'signature',''))>240 then raise exception 'Detalle inválido'; end if;
   if section='expenses' then expenses:=expenses+caja_private.amount(r->'amount');
   elsif section='withdrawals' then withdrawals:=withdrawals+caja_private.amount(r->'amount');
   elsif section='vouchers' then
    if r->>'kind'='cash' then vc:=vc+caja_private.amount(r->'amount');
    elsif r->>'kind'='goods' then vg:=vg+caja_private.amount(r->'amount');
    else raise exception 'Tipo de vale inválido'; end if;
   elsif section='deposits' then
    deposits:=deposits+caja_private.amount(r->'amount');
    -- Every deposit is an external collection; it never represents cash withdrawn from this drawer.
   else sc:=sc+caja_private.amount(r->'cash');sd:=sd+caja_private.amount(r->'digital'); end if;
  end loop;
 end loop;
 if d ? 'f9' and d->'f9'<>'null'::jsonb and d->>'f9'<>'' then
  sale_total:=caja_private.amount(d->'f9');
  cash_sales:=sale_total-caja_private.amount(d->'mp')-caja_private.amount(d->'cards')-caja_private.amount(d->'go')-vg-(deposits-dc);
 else
  cash_sales:=caja_private.amount(d->'cashSales');
  sale_total:=cash_sales+caja_private.amount(d->'mp')+caja_private.amount(d->'cards')+caja_private.amount(d->'go')+vg;
 end if;
 expected:=cash_sales-expenses-vc-withdrawals-dc;
 difference:=caja_private.amount(d->'counted')-expected;
 cash:=caja_private.amount(d->'counted')+expenses+vc+withdrawals+dc;
 final:=cash+caja_private.amount(d->'mp')+caja_private.amount(d->'cards')+caja_private.amount(d->'go')+vg+case when d ? 'f9' and d->'f9'<>'null'::jsonb and d->>'f9'<>'' then deposits-dc else 0 end-greatest(difference,0)+greatest(-difference,0)-sc-sd;
 new.totals:=jsonb_build_object('saleTotal',sale_total,'cashSales',cash_sales,'expenses',expenses,'vouchersCash',vc,'vouchersGoods',vg,'vouchers',vc+vg,'withdrawals',withdrawals,'deposits',deposits,'depositsExternal',deposits-dc,'shippingCash',sc,'shippingDigital',sd,'shipping',sc+sd,'expected',expected,'difference',difference,'cash',cash,'surplus',greatest(difference,0),'shortage',greatest(-difference,0),'final',final);
 return new;
end $$;
create trigger cash_validate before insert or update on public.cash_sheets
for each row execute function caja_private.validate_sheet();
-- These invoker functions are only reached by the table trigger; the schema is not exposed by the API.
grant usage on schema caja_private to service_role;
grant execute on function caja_private.amount(jsonb), caja_private.validate_sheet() to service_role;
revoke all on function caja_private.amount(jsonb), caja_private.validate_sheet() from public, anon;

-- Executes after cash_validate: keeps validation of LOCAL inputs, then reconciles the shared drawer.
create or replace function caja_private.shared_sheet() returns trigger
language plpgsql set search_path='' as $$
declare w public.cash_sheets%rowtype; t jsonb:=new.totals; local_sale numeric; local_expected numeric; expected numeric; diff numeric; shipping numeric; local_final numeric; web_external numeric; web_cash numeric; web_expected numeric; web_goods numeric; web_out numeric;
begin
 if new.branch='WEB' then
  new.data:=new.data-'webClose'-'sharedDrawer'-'f9Mode';
  new.totals:=t||jsonb_build_object('difference',0,'surplus',0,'shortage',0,'cash',(t->>'cashSales')::numeric,'final',(t->>'saleTotal')::numeric-(t->>'shipping')::numeric);
 elsif new.branch='AV2' and new.data->>'sharedDrawer'='true' then
  if coalesce(new.data->>'f9Mode','local') not in ('local','combined') then raise exception 'Modo F9 inválido'; end if;
  select * into w from public.cash_sheets where branch='WEB' and business_date=new.business_date for share;
  if not found then raise exception 'WEB debe guardar el cierre del mismo día antes de cerrar Avellaneda'; end if;
  if new.data->'webClose'->>'id' is distinct from w.id::text or new.data->'webClose'->>'version' is distinct from w.version::text then raise exception 'El cierre WEB cambió. Actualizá e incorporá la versión actual antes de guardar'; end if;
  new.data:=jsonb_set(new.data,'{webClose}',jsonb_build_object('id',w.id,'version',w.version,'data',w.data));
  select coalesce(sum(caja_private.amount(value->'amount')),0) into web_external from jsonb_array_elements(w.data->'deposits');
  select coalesce(sum(caja_private.amount(value->'amount')),0) into web_goods from jsonb_array_elements(w.data->'vouchers') where value->>'kind'='goods';
  select coalesce(sum(caja_private.amount(value->'amount')),0) into web_out from (
   select value from jsonb_array_elements(w.data->'expenses')
   union all select value from jsonb_array_elements(w.data->'withdrawals')
   union all select value from jsonb_array_elements(w.data->'vouchers') where value->>'kind'='cash'
  ) movements;
  if w.data ? 'f9' and w.data->'f9'<>'null'::jsonb and w.data->>'f9'<>'' then
   web_cash:=caja_private.amount(w.data->'f9')-caja_private.amount(w.data->'mp')-caja_private.amount(w.data->'cards')-caja_private.amount(w.data->'go')-web_goods-web_external;
  else web_cash:=caja_private.amount(w.data->'cashSales'); end if;
  web_expected:=web_cash-web_out;
  local_sale:=(t->>'saleTotal')::numeric;
  if new.data->>'f9Mode'='combined' then local_sale:=local_sale-(w.totals->>'saleTotal')::numeric; end if;
  if local_sale<0 then raise exception 'El F9 total no puede ser menor que el F9 WEB'; end if;
  local_expected:=(t->>'expected')::numeric+local_sale-(t->>'saleTotal')::numeric;
  local_final:=local_sale-(t->>'shipping')::numeric;
  expected:=local_expected+web_expected;
  diff:=caja_private.amount(new.data->'counted')-expected;
  shipping:=(t->>'shipping')::numeric+(w.totals->>'shipping')::numeric;
  new.totals:=t||jsonb_build_object('localSaleTotal',local_sale,'localExpected',local_expected,'localFinal',local_final,'webSaleTotal',(w.totals->>'saleTotal')::numeric,'webExpected',web_expected,'webFinal',(w.totals->>'saleTotal')::numeric-(w.totals->>'shipping')::numeric,'saleTotal',local_sale+(w.totals->>'saleTotal')::numeric,'cashSales',(t->>'cashSales')::numeric+local_sale-(t->>'saleTotal')::numeric,'expected',expected,'difference',diff,'surplus',greatest(diff,0),'shortage',greatest(-diff,0),'shipping',shipping,'final',local_sale+(w.totals->>'saleTotal')::numeric-shipping,'cash',(t->>'cash')::numeric+web_cash-web_expected,'localCounted',caja_private.amount(new.data->'counted')-web_expected);
 else
  new.data:=new.data-'webClose';
 end if;
 return new;
end $$;
revoke all on function caja_private.shared_sheet() from public, anon, authenticated;
grant execute on function caja_private.shared_sheet() to service_role;
create trigger cash_z_shared before insert or update on public.cash_sheets for each row execute function caja_private.shared_sheet();
