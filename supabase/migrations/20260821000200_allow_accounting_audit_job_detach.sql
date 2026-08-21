-- Preserve accounting history when an approved duplicate job is deleted.
-- The FK already specifies ON DELETE SET NULL, but the immutable-row trigger
-- previously rejected that FK-managed update.

create or replace function public.prevent_accounting_audit_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and coalesce(current_setting('app.safe_job_delete', true), '') = 'on'
     and old.job_id is not null
     and new.job_id is null
     and (to_jsonb(new) - 'job_id') = (to_jsonb(old) - 'job_id') then
    return new;
  end if;

  raise exception 'Accounting audit history is immutable.';
end;
$$;

comment on function public.prevent_accounting_audit_mutation() is
  'Keeps accounting audit rows immutable except for FK detachment during the atomic admin job-delete RPC.';

notify pgrst, 'reload schema';
