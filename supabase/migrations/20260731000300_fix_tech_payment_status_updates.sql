-- Route every Tech Payment status transition through one audited, role-aware RPC.

alter table public.jobs drop constraint if exists jobs_tech_payment_status_check;
alter table public.jobs
  add constraint jobs_tech_payment_status_check
  check (tech_payment_status in ('Pending', 'Paid', 'Cancelled')) not valid;
alter table public.jobs validate constraint jobs_tech_payment_status_check;

-- Anonymous users must never update jobs. Authenticated app users retain the
-- existing policies; Tech Payment itself is further restricted by the trigger below.
drop policy if exists "Allow public update jobs" on public.jobs;

create or replace function public.protect_technician_payment_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (
    new.tech_payment_status is distinct from old.tech_payment_status
    or new.tech_payment_paid_at is distinct from old.tech_payment_paid_at
    or new.tech_payment_paid_by is distinct from old.tech_payment_paid_by
  ) and coalesce(current_setting('app.tech_payment_rpc', true), '') <> 'on' then
    raise exception using
      errcode = '42501',
      message = 'Technician payment fields must be updated through the authorized payment action.';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_paid_technician_payment on public.jobs;
drop trigger if exists protect_technician_payment_fields on public.jobs;
create trigger protect_technician_payment_fields
before update of tech_payment_status, tech_payment_paid_at, tech_payment_paid_by on public.jobs
for each row execute function public.protect_technician_payment_fields();

create or replace function public.set_technician_payment_status(
  p_job_id uuid,
  p_status text
)
returns table (
  job_id uuid,
  previous_status text,
  new_status text,
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
  v_changed_at timestamptz := now();
begin
  if p_status not in ('Pending', 'Paid', 'Cancelled') then
    raise exception using errcode = '23514', message = 'Invalid technician payment status.';
  end if;

  select * into v_actor
  from public.app_users
  where (auth_user_id = auth.uid() or id = auth.uid())
    and status = 'Active'
  limit 1;

  if v_actor.id is null then
    raise exception using errcode = '28000', message = 'Your session is not active.';
  end if;

  if not (
    lower(v_actor.role::text) = 'admin'
    or lower(v_actor.role::text) = 'dispatcher'
    or (
      lower(v_actor.role::text) = 'technician_manager'
      and v_actor.can_view_tech_payments
      and v_actor.can_mark_tech_payments_paid
    )
  ) then
    raise exception using errcode = '42501', message = 'You do not have permission to update technician payment status.';
  end if;

  select * into v_job from public.jobs where id = p_job_id for update;
  if v_job.id is null then
    raise exception using errcode = 'P0002', message = 'Job not found.';
  end if;

  if v_job.tech_payment_status = p_status then
    job_id := v_job.id;
    previous_status := v_job.tech_payment_status;
    new_status := v_job.tech_payment_status;
    paid_at := v_job.tech_payment_paid_at;
    paid_by := v_job.tech_payment_paid_by;
    return next;
    return;
  end if;

  perform set_config('app.tech_payment_rpc', 'on', true);

  if p_status = 'Paid' then
    update public.jobs
    set tech_payment_status = 'Paid',
        tech_payment_paid_at = v_changed_at,
        tech_payment_paid_by = auth.uid()
    where id = v_job.id;
  elsif p_status = 'Pending' then
    update public.jobs
    set tech_payment_status = 'Pending',
        tech_payment_paid_at = null,
        tech_payment_paid_by = null
    where id = v_job.id;
  else
    update public.jobs
    set tech_payment_status = 'Cancelled'
    where id = v_job.id;
  end if;

  insert into public.technician_payment_audit (
    job_id, previous_status, new_status, amount, technician,
    performed_by, performed_by_name, performed_at
  ) values (
    v_job.id,
    coalesce(v_job.tech_payment_status, ''),
    p_status,
    coalesce(v_job.tech_labor, 0),
    coalesce(nullif(trim(v_job.tech), ''), 'Unassigned'),
    v_actor.id,
    coalesce(nullif(trim(v_actor.name), ''), nullif(trim(v_actor.username), ''), 'User'),
    v_changed_at
  );

  job_id := v_job.id;
  previous_status := v_job.tech_payment_status;
  new_status := p_status;
  paid_at := case when p_status = 'Pending' then null when p_status = 'Paid' then v_changed_at else v_job.tech_payment_paid_at end;
  paid_by := case when p_status = 'Pending' then null when p_status = 'Paid' then auth.uid() else v_job.tech_payment_paid_by end;
  return next;
end;
$$;

revoke all on function public.set_technician_payment_status(uuid, text) from public;
grant execute on function public.set_technician_payment_status(uuid, text) to authenticated;

comment on function public.set_technician_payment_status(uuid, text) is
  'Authorized single-job Tech Payment transition. Updates only payment status/audit columns and records one immutable audit row.';
