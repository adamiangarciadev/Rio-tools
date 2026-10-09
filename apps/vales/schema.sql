create table if not exists public.staff_vouchers (
 id uuid primary key default gen_random_uuid(),
 branch text not null check(branch in ('AV2','NAZCA','LAMARCA','CORRIENTES','CASTELLI','QUILMES','SARMIENTO','PUEYRREDON','WEB','DEPOSITO','ADMINISTRACION')),
 staff_code text not null, staff_name text not null,
 business_date date not null default (now() at time zone 'America/Argentina/Buenos_Aires')::date,
 requested_cash numeric(12,2) not null check(requested_cash>=0 and requested_cash<=999999999),
 merchandise_requested boolean not null default false,
 status text not null default 'pending' check(status in ('pending','approved','rejected')),
 approved_cash numeric(12,2), approved_merchandise numeric(12,2),
 version integer not null default 1,
 constraint staff_vouchers_decision_amounts check(status='pending' or (approved_cash is not null and approved_merchandise is not null)),
 created_at timestamptz not null default now(), reviewed_at timestamptz,
 check(requested_cash>0 or merchandise_requested),
 check((status='pending' and approved_cash is null and approved_merchandise is null) or
       (status='approved' and approved_cash is not null and approved_cash>=0 and approved_cash<=requested_cash and approved_merchandise is not null and approved_merchandise>=0 and approved_merchandise<=999999999 and (approved_cash>0 or approved_merchandise>0)) or
       (status='rejected' and approved_cash=0 and approved_merchandise=0))
);
create index if not exists staff_vouchers_month_idx on public.staff_vouchers(business_date,staff_code);
create index if not exists staff_vouchers_branch_month_idx on public.staff_vouchers(branch,business_date);
alter table public.staff_vouchers enable row level security;
revoke all on public.staff_vouchers from anon, authenticated;
grant select,insert,update,delete on public.staff_vouchers to service_role;
comment on table public.staff_vouchers is 'Solicitudes de vales. Acceso exclusivo por vales-api; revisión reservada a Administración.';
