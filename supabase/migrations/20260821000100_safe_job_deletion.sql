-- Delete duplicate jobs through one audited, transaction-scoped operation.
-- PostgreSQL executes each function call atomically: an exception rolls back
-- the dependent deletes, FK actions, jobs delete, and delete audit together.

create or replace function public.prevent_technician_payment_audit_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(current_setting('app.safe_job_delete', true), '') <> 'on' then
    raise exception 'Technician payment audit history is immutable.';
  end if;
  return old;
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

  -- technician_payment_audit.job_id is NOT NULL and ON DELETE RESTRICT, so every
  -- matching row is owned exclusively by this job. Actual payment ledgers were
  -- rejected above. The local flag is visible solely inside this transaction and
  -- does not weaken the audit table's normal immutable behavior.
  perform set_config('app.safe_job_delete', 'on', true);
  delete from public.technician_payment_audit where job_id = p_job_id;

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
  'Admin-only atomic duplicate-job deletion with explicit financial and document safeguards.';

notify pgrst, 'reload schema';
