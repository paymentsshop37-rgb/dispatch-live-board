-- Active technician directory visibility for operational roles.

create or replace function public.can_view_active_technicians()
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
      and lower(role::text) in ('admin', 'dispatcher', 'supervisor')
  );
$$;

revoke all on function public.can_view_active_technicians() from public;
grant execute on function public.can_view_active_technicians() to authenticated;

alter table public.technicians enable row level security;

drop policy if exists "active technicians or admins read technicians" on public.technicians;
drop policy if exists "operational roles read active technicians" on public.technicians;
create policy "operational roles read active technicians"
  on public.technicians for select
  to authenticated
  using (is_active = true and public.can_view_active_technicians());

drop policy if exists "admins read inactive technicians" on public.technicians;
create policy "admins read inactive technicians"
  on public.technicians for select
  to authenticated
  using (public.is_active_admin());

drop policy if exists "admins insert technicians" on public.technicians;
create policy "admins insert technicians"
  on public.technicians for insert
  to authenticated
  with check (public.is_active_admin());

drop policy if exists "only admins may insert technicians" on public.technicians;
create policy "only admins may insert technicians"
  on public.technicians as restrictive for insert
  to authenticated
  with check (public.is_active_admin());

drop policy if exists "only admins may update technicians" on public.technicians;
create policy "only admins may update technicians"
  on public.technicians as restrictive for update
  to authenticated
  using (public.is_active_admin())
  with check (public.is_active_admin());

grant select, insert, update, delete on public.technicians to authenticated;
