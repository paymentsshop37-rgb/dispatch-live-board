-- Audited technician-payment completion and explicit Technician Manager access.
-- Source of truth remains jobs.tech_payment_status; amount owed remains jobs.tech_labor.

alter table public.jobs
  add column if not exists tech_payment_paid_at timestamptz,
  add column if not exists tech_payment_paid_by uuid references public.app_users(id) on delete set null;

alter table public.app_users
  add column if not exists can_view_tech_payments boolean not null default false,
  add column if not exists can_mark_tech_payments_paid boolean not null default false;

create table if not exists public.technician_payment_audit (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete restrict,
  previous_status text not null,
  new_status text not null,
  amount numeric(12,2) not null default 0,
  technician text not null default 'Unassigned',
  performed_by uuid references public.app_users(id) on delete set null,
  performed_by_name text not null,
  performed_at timestamptz not null default now()
);

create index if not exists technician_payment_audit_job_time_idx
  on public.technician_payment_audit (job_id, performed_at desc);

create or replace function public.can_view_technician_payments()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.app_users
    where (auth_user_id = auth.uid() or id = auth.uid())
      and status = 'Active'
      and (
        lower(role::text) = 'admin'
        or (lower(role::text) = 'technician_manager' and can_view_tech_payments)
      )
  );
$$;

create or replace function public.can_mark_technician_payments_paid()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.app_users
    where (auth_user_id = auth.uid() or id = auth.uid())
      and status = 'Active'
      and (
        lower(role::text) = 'admin'
        or (
          lower(role::text) = 'technician_manager'
          and can_view_tech_payments
          and can_mark_tech_payments_paid
        )
      )
  );
$$;

create or replace function public.protect_paid_technician_payment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (
    new.tech_payment_paid_at is distinct from old.tech_payment_paid_at
    or new.tech_payment_paid_by is distinct from old.tech_payment_paid_by
    or (
      lower(trim(coalesce(new.tech_payment_status, ''))) = 'paid'
      and lower(trim(coalesce(old.tech_payment_status, ''))) <> 'paid'
    )
  ) and coalesce(current_setting('app.tech_payment_rpc', true), '') <> 'on' then
    raise exception 'Technician payments must be completed through the audited payment action.';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_paid_technician_payment on public.jobs;
create trigger protect_paid_technician_payment
before update of tech_payment_status, tech_payment_paid_at, tech_payment_paid_by on public.jobs
for each row execute function public.protect_paid_technician_payment();

create or replace function public.prevent_technician_payment_audit_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Technician payment audit history is immutable.';
end;
$$;

drop trigger if exists prevent_technician_payment_audit_update on public.technician_payment_audit;
create trigger prevent_technician_payment_audit_update
before update or delete on public.technician_payment_audit
for each row execute function public.prevent_technician_payment_audit_mutation();

create or replace function public.mark_technician_payments_paid(
  p_job_ids uuid[],
  p_allow_multiple_technicians boolean default false
)
returns table (
  job_id uuid,
  amount numeric,
  technician text,
  paid_at timestamptz,
  paid_by uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.app_users%rowtype;
  v_job public.jobs%rowtype;
  v_paid_at timestamptz := now();
  v_requested_count integer;
  v_pending_count integer;
  v_technician_count integer;
begin
  select * into v_actor
  from public.app_users
  where (auth_user_id = auth.uid() or id = auth.uid())
    and status = 'Active'
  limit 1;

  if v_actor.id is null or not (
    lower(v_actor.role::text) = 'admin'
    or (
      lower(v_actor.role::text) = 'technician_manager'
      and v_actor.can_view_tech_payments
      and v_actor.can_mark_tech_payments_paid
    )
  ) then
    raise exception 'You do not have permission to mark technician payments paid.';
  end if;

  v_requested_count := coalesce(array_length(p_job_ids, 1), 0);
  if v_requested_count = 0 then
    raise exception 'Select at least one pending technician payment.';
  end if;

  select count(*), count(distinct coalesce(nullif(trim(j.tech), ''), 'Unassigned'))
  into v_pending_count, v_technician_count
  from public.jobs j
  where j.id = any(p_job_ids)
    and lower(trim(coalesce(j.tech_payment_status, ''))) = 'pending';

  if v_pending_count <> v_requested_count then
    raise exception 'One or more selected jobs are no longer pending.';
  end if;
  if v_technician_count > 1 and not p_allow_multiple_technicians then
    raise exception 'Bulk payment across technicians requires explicit approval.';
  end if;

  perform set_config('app.tech_payment_rpc', 'on', true);

  for v_job in
    select j.* from public.jobs j
    where j.id = any(p_job_ids)
      and lower(trim(coalesce(j.tech_payment_status, ''))) = 'pending'
    for update
  loop
    update public.jobs j
    set tech_payment_status = 'Paid',
        tech_payment_paid_at = v_paid_at,
        tech_payment_paid_by = v_actor.id
    where j.id = v_job.id;

    insert into public.technician_payment_audit (
      job_id, previous_status, new_status, amount, technician,
      performed_by, performed_by_name, performed_at
    ) values (
      v_job.id,
      coalesce(v_job.tech_payment_status, ''),
      'Paid',
      coalesce(v_job.tech_labor, 0),
      coalesce(nullif(trim(v_job.tech), ''), 'Unassigned'),
      v_actor.id,
      coalesce(nullif(trim(v_actor.name), ''), nullif(trim(v_actor.username), ''), 'User'),
      v_paid_at
    );

    job_id := v_job.id;
    amount := coalesce(v_job.tech_labor, 0);
    technician := coalesce(nullif(trim(v_job.tech), ''), 'Unassigned');
    paid_at := v_paid_at;
    paid_by := v_actor.id;
    return next;
  end loop;
end;
$$;

alter table public.technician_payment_audit enable row level security;

drop policy if exists "authorized users read technician payment audit" on public.technician_payment_audit;
create policy "authorized users read technician payment audit"
on public.technician_payment_audit for select to authenticated
using (public.can_view_technician_payments());

revoke all on function public.can_view_technician_payments() from public;
revoke all on function public.can_mark_technician_payments_paid() from public;
revoke all on function public.mark_technician_payments_paid(uuid[], boolean) from public;
grant execute on function public.can_view_technician_payments() to authenticated;
grant execute on function public.can_mark_technician_payments_paid() to authenticated;
grant execute on function public.mark_technician_payments_paid(uuid[], boolean) to authenticated;
grant select on public.technician_payment_audit to authenticated;

comment on column public.jobs.tech_payment_paid_at is 'Timestamp set only by the audited technician payment action.';
comment on column public.jobs.tech_payment_paid_by is 'App user who completed the audited technician payment action.';
comment on table public.technician_payment_audit is 'Immutable history of technician payment status changes to Paid.';
