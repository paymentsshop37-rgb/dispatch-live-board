-- Allow admin deletion of an erroneous job while retaining its payment-status
-- audit history. A later user-profile migration replaced the original trigger
-- exception for safe job deletion.
alter table public.technician_payment_audit
  add column if not exists deleted_job_id uuid;

alter table public.technician_payment_audit
  alter column job_id drop not null;

create index if not exists technician_payment_audit_deleted_job_id_idx
  on public.technician_payment_audit (deleted_job_id);

comment on column public.technician_payment_audit.deleted_job_id is
  'Original job ID retained when an admin removes an erroneous job.';

create or replace function public.prevent_technician_payment_audit_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and coalesce(current_setting('app.safe_job_delete', true), '') = 'on'
     and old.job_id is not null
     and new.job_id is null
     and new.deleted_job_id = old.job_id
     and (to_jsonb(new) - 'job_id' - 'deleted_job_id')
       = (to_jsonb(old) - 'job_id' - 'deleted_job_id') then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and coalesce(current_setting('app.user_profile_delete', true), '') = 'on'
     and old.performed_by is not null
     and new.performed_by is null
     and (to_jsonb(new) - 'performed_by') = (to_jsonb(old) - 'performed_by') then
    return new;
  end if;

  raise exception 'Technician payment audit history is immutable.';
end;
$$;

create or replace function public.delete_job_safely(p_job_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.jobs%rowtype;
  v_job_data jsonb;
  v_has_records boolean := false;
begin
  if not public.is_active_admin() then
    raise exception using
      errcode = '42501',
      message = 'You do not have permission to delete jobs.';
  end if;

  select *
    into v_job
  from public.jobs
  where id = p_job_id
  for update;

  if v_job.id is null then
    raise exception using
      errcode = 'P0002',
      message = 'The job was not found or has already been deleted.';
  end if;

  v_job_data := to_jsonb(v_job);

  -- Transaction-grade and legacy payment rows are permanent financial records.
  select exists(select 1 from public.invoice_payments where job_id = p_job_id)
      or exists(select 1 from public.technician_payment_transactions where job_id = p_job_id)
      or exists(select 1 from public.technician_payments where job_id = p_job_id)
    into v_has_records;

  if v_has_records
     or lower(trim(coalesce(v_job_data ->> 'customer_payment_status', ''))) in ('paid', 'partially paid')
     or lower(trim(coalesce(v_job_data ->> 'invoice_status', ''))) = 'paid' then
    raise exception using
      errcode = 'P0001',
      message = 'This job cannot be deleted because it contains payment or financial records that must be preserved.';
  end if;

  -- Job documents are evidence and storage deletion cannot participate in this
  -- database transaction. Require an explicit document review/removal first.
  if to_regclass('public.job_files') is not null then
    execute 'select exists(select 1 from public.job_files where job_id = $1)'
      into v_has_records
      using p_job_id;
    if v_has_records then
      raise exception using
        errcode = 'P0001',
        message = 'This job cannot be deleted while it has files or documents. Review and remove them first.';
    end if;
  end if;

  -- Preserve status-change history with the original job ID, while detaching
  -- its restricting FK. The trigger accepts only this exact change while the
  -- admin deletion is running in this transaction.
  perform set_config('app.safe_job_delete', 'on', true);
  update public.technician_payment_audit
  set deleted_job_id = job_id, job_id = null
  where job_id = p_job_id;

  -- Explicitly remove safe, job-owned auxiliary rows before the parent. Dynamic
  -- SQL keeps this migration compatible with installations lacking an optional module.
  if to_regclass('public.job_labor_operations') is not null then
    execute 'delete from public.job_labor_operations where job_id = $1' using p_job_id;
  end if;
  if to_regclass('public.job_parts') is not null then
    execute 'delete from public.job_parts where job_id = $1' using p_job_id;
  end if;

  -- Existing FK policies preserve non-owned history with ON DELETE SET NULL:
  -- accounting_audit_log, ai_labor_estimates, air_system_inspections,
  -- parts_requests, technician_ratings, and technicians.current_job_id.
  delete from public.jobs where id = p_job_id;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'The job was not found or has already been deleted.';
  end if;

  return p_job_id;
exception
  when foreign_key_violation then
    raise exception using
      errcode = 'P0001',
      message = 'This job cannot be deleted because it contains related records that must be preserved.';
end;
$$;

revoke all on function public.delete_job_safely(uuid) from public;
grant execute on function public.delete_job_safely(uuid) to authenticated;

comment on function public.delete_job_safely(uuid) is
  'Admin-only atomic erroneous-job deletion that retains technician audit history and protects financial and document records.';

notify pgrst, 'reload schema';
