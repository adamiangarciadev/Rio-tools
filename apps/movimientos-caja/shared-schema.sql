-- Executes after cash_validate: keeps validation of LOCAL inputs, then reconciles the shared drawer.
create or replace function caja_private.shared_sheet() returns trigger
language plpgsql set search_path='' as $$
declare w public.cash_sheets%rowtype; t jsonb:=new.totals; local_sale numeric; local_expected numeric; expected numeric; diff numeric; shipping numeric; local_final numeric;
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
  local_sale:=(t->>'saleTotal')::numeric;
  if new.data->>'f9Mode'='combined' then local_sale:=local_sale-(w.totals->>'saleTotal')::numeric; end if;
  if local_sale<0 then raise exception 'El F9 total no puede ser menor que el F9 WEB'; end if;
  local_expected:=(t->>'expected')::numeric+local_sale-(t->>'saleTotal')::numeric;
  local_final:=local_sale-(t->>'shipping')::numeric;
  expected:=local_expected+(w.totals->>'expected')::numeric;
  diff:=caja_private.amount(new.data->'counted')-expected;
  shipping:=(t->>'shipping')::numeric+(w.totals->>'shipping')::numeric;
  new.totals:=t||jsonb_build_object('localSaleTotal',local_sale,'localExpected',local_expected,'localFinal',local_final,'webSaleTotal',(w.totals->>'saleTotal')::numeric,'webExpected',(w.totals->>'expected')::numeric,'webFinal',(w.totals->>'saleTotal')::numeric-(w.totals->>'shipping')::numeric,'saleTotal',local_sale+(w.totals->>'saleTotal')::numeric,'cashSales',(t->>'cashSales')::numeric+local_sale-(t->>'saleTotal')::numeric,'expected',expected,'difference',diff,'surplus',greatest(diff,0),'shortage',greatest(-diff,0),'shipping',shipping,'final',local_sale+(w.totals->>'saleTotal')::numeric-shipping,'cash',(t->>'cash')::numeric+(w.totals->>'cashSales')::numeric-(w.totals->>'expected')::numeric,'localCounted',caja_private.amount(new.data->'counted')-(w.totals->>'expected')::numeric);
 else
  new.data:=new.data-'webClose';
 end if;
 return new;
end $$;
revoke all on function caja_private.shared_sheet() from public, anon, authenticated;
grant execute on function caja_private.shared_sheet() to service_role;
create trigger cash_z_shared before insert or update on public.cash_sheets for each row execute function caja_private.shared_sheet();
