-- The application currently has two operational directory roles.

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
      and lower(role::text) in ('admin', 'dispatcher')
  );
$$;
