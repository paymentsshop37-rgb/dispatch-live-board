alter table public.jobs enable row level security;

drop policy if exists "active users delete jobs" on public.jobs;
drop policy if exists "admins delete jobs" on public.jobs;
drop policy if exists "only admins may delete jobs" on public.jobs;

create policy "admins delete jobs"
  on public.jobs for delete
  to authenticated
  using (public.is_active_admin());

-- This restrictive policy also protects against any older permissive DELETE
-- policy that may still exist in an environment.
create policy "only admins may delete jobs"
  on public.jobs as restrictive for delete
  to authenticated
  using (public.is_active_admin());

alter table public.activity_log
  add column if not exists metadata jsonb;

create or replace function public.audit_admin_job_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_name text;
  invoice_value text;
  company_value text;
begin
  select coalesce(nullif(name, ''), nullif(username, ''), auth.uid()::text)
    into admin_name
  from public.app_users
  where (auth_user_id = auth.uid() or id = auth.uid())
  limit 1;

  invoice_value := coalesce(to_jsonb(old)->>'reference', to_jsonb(old)->>'invoice_number', to_jsonb(old)->>'invoice', '');
  company_value := coalesce(to_jsonb(old)->>'company', to_jsonb(old)->>'company_name', '');

  insert into public.activity_log (
    entity_type,
    entity_id,
    action,
    description,
    created_by,
    metadata,
    created_at
  ) values (
    'job',
    old.id,
    'Job Deleted',
    coalesce(admin_name, auth.uid()::text) || ' deleted job ' || coalesce(nullif(invoice_value, ''), old.id::text),
    coalesce(admin_name, auth.uid()::text),
    jsonb_build_object(
      'deleted_job_id', old.id,
      'invoice_number', invoice_value,
      'company', company_value,
      'admin_user_id', auth.uid(),
      'admin_user', coalesce(admin_name, auth.uid()::text),
      'timestamp', now(),
      'previous_job_data', to_jsonb(old)
    ),
    now()
  );

  return old;
end;
$$;

drop trigger if exists audit_admin_job_delete on public.jobs;
create trigger audit_admin_job_delete
before delete on public.jobs
for each row execute function public.audit_admin_job_delete();
