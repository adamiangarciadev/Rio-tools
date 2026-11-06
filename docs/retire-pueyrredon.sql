
create or replace function public.rio_branch_retired(value text) returns boolean
language sql immutable set search_path='' as $$
 select regexp_replace(upper(translate(coalesce(value,''),'óÓ','oO')),'[^A-Z0-9]','','g') in ('PUEYRREDON','PUEY','PRUPUEY')
$$;
-- Existing rows are preserved. Only new operations and operational lists change.
do $migration$
declare src text; old text; name text;
begin
 foreach name in array array['mt2_pilot_list','mt2_pilot_archive_old','mt2_pilot_import','mt2_pilot_action','crc_list','crc_action','crc_migrate','inc_create_ticket'] loop
  select pg_get_functiondef(p.oid) into src from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=name;
  if src is null then raise exception 'Missing function %',name; end if;
  old:=src;
  if name='mt2_pilot_list' then
   src:=replace(src,'where data->>''fecha''>=cutoff','where not public.rio_branch_retired(data->>''desde'') and not public.rio_branch_retired(data->>''hacia'') and data->>''fecha''>=cutoff');
  elsif name='mt2_pilot_archive_old' then
   src:=replace(src,'where data->>''fecha''<cutoff','where not public.rio_branch_retired(data->>''desde'') and not public.rio_branch_retired(data->>''hacia'') and data->>''fecha''<cutoff');
  elsif name='mt2_pilot_import' then
   src:=replace(src,E'begin\n',E'begin\n if public.rio_branch_retired(p#>>''{data,desde}'') or public.rio_branch_retired(p#>>''{data,hacia}'') or public.rio_branch_retired(p#>>''{data,codigo_cliente}'') then return jsonb_build_object(''skipped'',true,''reason'',''Sucursal retirada de la operación''); end if;\n');
  elsif name='mt2_pilot_action' then
   src:=replace(src,'prev:=r.estado;','if public.rio_branch_retired(r.data->>''desde'') or public.rio_branch_retired(r.data->>''hacia'') or public.rio_branch_retired(p->>''destino'') then raise exception ''Sucursal retirada de la operación''; end if; prev:=r.estado;');
  elsif name='crc_list' then
   src:=replace(src,'where r.desde=p->>''sucursal''','where not public.rio_branch_retired(r.desde) and r.desde=p->>''sucursal''');
  elsif name='crc_action' then
   src:=replace(src,E'begin\n',E'begin\n if public.rio_branch_retired(p->>''sucursal'') then raise exception ''Sucursal retirada de la operación''; end if;\n');
  elsif name='crc_migrate' then
   src:=replace(src,'if coalesce(d->>''fecha'','''')<','if public.rio_branch_retired(d->>''desde'') then continue; end if; if coalesce(d->>''fecha'','''')<');
  elsif name='inc_create_ticket' then
   src:=replace(src,E'begin\n',E'begin\n if public.rio_branch_retired(p->>''branch'') then raise exception ''Sucursal retirada de la operación''; end if;\n');
  end if;
  if src=old then raise exception 'Retirement patch did not match %',name; end if;
  execute src;
 end loop;
end $migration$;
create or replace function public.rio_reject_retired_branch() returns trigger language plpgsql set search_path='' as $$
begin
 if public.rio_branch_retired(new.branch) then raise exception 'Sucursal retirada de la operación'; end if;
 return new;
end $$;
create trigger rio_retired_branch_insert before insert on public.staff_vouchers for each row execute function public.rio_reject_retired_branch();
create trigger rio_retired_branch_insert before insert on public.inc_tickets for each row execute function public.rio_reject_retired_branch();

