-- Ensure direct technician lifecycle queries work for Admins only.

alter table public.technicians
  add column if not exists is_active boolean not null default true,
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id) on delete set null;

alter table public.technicians enable row level security;

drop policy if exists "admins update technicians" on public.technicians;
create policy "admins update technicians"
  on public.technicians for update
  to authenticated
  using (public.is_active_admin())
  with check (public.is_active_admin());

drop policy if exists "admins delete technicians" on public.technicians;
create policy "admins delete technicians"
  on public.technicians for delete
  to authenticated
  using (public.is_active_admin());

-- Restrictive DELETE policy prevents any broader legacy policy from allowing
-- a Dispatcher to delete a technician.
drop policy if exists "only admins may delete technicians" on public.technicians;
create policy "only admins may delete technicians"
  on public.technicians as restrictive for delete
  to authenticated
  using (public.is_active_admin());

grant update, delete on public.technicians to authenticated;

create or replace function public.audit_direct_technician_lifecycle_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  lifecycle_action text;
begin
  if tg_op = 'DELETE' then
    lifecycle_action := 'permanently deleted';
  elsif old.is_active and not new.is_active then
    lifecycle_action := 'deactivated';
  elsif not old.is_active and new.is_active then
    lifecycle_action := 'restored';
  else
    return new;
  end if;

  insert into public.technician_deletion_audit
    (technician_id, technician_name, action, admin_user, previous_values)
  values
    (old.id, coalesce(old.full_name, 'Technician'), lifecycle_action, auth.uid(), to_jsonb(old));

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists audit_direct_technician_lifecycle_change on public.technicians;
create trigger audit_direct_technician_lifecycle_change
after update or delete on public.technicians
for each row execute function public.audit_direct_technician_lifecycle_change();
