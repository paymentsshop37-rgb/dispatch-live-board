-- Review and apply manually. This makes app_users the one-to-one profile for auth.users.
create table if not exists public.app_users (
  id uuid primary key constraint app_users_auth_user_fk references auth.users(id) on delete cascade,
  username text not null,
  name text not null,
  email text not null,
  role text not null default 'dispatcher',
  status text not null default 'Active',
  notes text not null default '',
  force_password_change boolean not null default true,
  last_login_at timestamptz,
  login_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_users_role_check check (role in ('admin', 'dispatcher')),
  constraint app_users_status_check check (status in ('Active', 'Inactive'))
);

alter table public.app_users add column if not exists username text;
alter table public.app_users add column if not exists name text;
alter table public.app_users add column if not exists email text;
alter table public.app_users add column if not exists role text default 'dispatcher';
alter table public.app_users add column if not exists status text default 'Active';
alter table public.app_users add column if not exists notes text default '';
alter table public.app_users add column if not exists force_password_change boolean default true;
alter table public.app_users add column if not exists last_login_at timestamptz;
alter table public.app_users add column if not exists login_count integer default 0;
alter table public.app_users add column if not exists created_at timestamptz default now();
alter table public.app_users add column if not exists updated_at timestamptz default now();

-- Safety stop: create/link every legacy profile in Supabase Authentication first.
-- This intentionally aborts instead of deleting legacy credentials prematurely.
do $$
begin
  if exists (
    select 1 from public.app_users p
    where not exists (select 1 from auth.users a where a.id::text = p.id::text)
  ) then
    raise exception 'app_users contains profiles not linked to auth.users; migrate those accounts before applying this migration';
  end if;
end $$;

-- Remove legacy plaintext password columns only after the preflight passes.
alter table public.app_users drop column if exists password;
alter table public.app_users drop column if exists temporary_password;
create unique index if not exists app_users_username_unique_ci on public.app_users (lower(username));
create unique index if not exists app_users_email_unique_ci on public.app_users (lower(email));

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'app_users_auth_user_fk') then
    alter table public.app_users add constraint app_users_auth_user_fk foreign key (id) references auth.users(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'app_users_role_check') then
    alter table public.app_users add constraint app_users_role_check check (role in ('admin', 'dispatcher'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'app_users_status_check') then
    alter table public.app_users add constraint app_users_status_check check (status in ('Active', 'Inactive'));
  end if;
end $$;
alter table public.app_users alter column username set not null;
alter table public.app_users alter column name set not null;
alter table public.app_users alter column email set not null;
alter table public.app_users alter column role set not null;
alter table public.app_users alter column status set not null;
alter table public.app_users alter column force_password_change set not null;
alter table public.app_users alter column login_count set default 0;
update public.app_users set login_count = 0 where login_count is null;
alter table public.app_users alter column login_count set not null;

create table if not exists public.user_access_history (
  id bigserial primary key,
  user_id uuid references public.app_users(id) on delete set null,
  username text,
  action text not null,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);
alter table public.user_access_history enable row level security;

create or replace function public.set_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end; $$;
drop trigger if exists app_users_set_updated_at on public.app_users;
create trigger app_users_set_updated_at before update on public.app_users for each row execute function public.set_updated_at();

create or replace function public.is_active_app_user() returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.app_users where id = auth.uid() and status = 'Active');
$$;
create or replace function public.is_active_admin() returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.app_users where id = auth.uid() and status = 'Active' and role = 'admin');
$$;
revoke all on function public.is_active_app_user() from public;
revoke all on function public.is_active_admin() from public;
grant execute on function public.is_active_app_user() to authenticated;
grant execute on function public.is_active_admin() to authenticated;

drop policy if exists "admins read access history" on public.user_access_history;
create policy "admins read access history" on public.user_access_history for select to authenticated using (public.is_active_admin());

alter table public.app_users enable row level security;
drop policy if exists "users read own profile" on public.app_users;
drop policy if exists "admins manage profiles" on public.app_users;
drop policy if exists "users finish password change" on public.app_users;
drop policy if exists "users update own session flags" on public.app_users;
create policy "users read own profile" on public.app_users for select to authenticated using (id = auth.uid() or public.is_active_admin());
create policy "admins manage profiles" on public.app_users for all to authenticated using (public.is_active_admin()) with check (public.is_active_admin());
create policy "users update own session flags" on public.app_users for update to authenticated using (id = auth.uid() and public.is_active_app_user()) with check (id = auth.uid() and status = 'Active');
revoke update on public.app_users from authenticated;
grant update (force_password_change, last_login_at) on public.app_users to authenticated;

-- A restrictive policy composes with existing table-specific policies, so an
-- authenticated user must also be active. Anonymous registration policies are
-- not changed. Review the table list when adding future protected modules.
do $$
declare table_name text;
begin
  foreach table_name in array array[
    'jobs', 'change_logs', 'technicians', 'technician_documents',
    'technician_services', 'technician_coverage', 'technician_ratings',
    'technician_payments', 'activity_log', 'customers'
  ] loop
    if to_regclass('public.' || table_name) is not null then
      execute format('alter table public.%I enable row level security', table_name);
      execute format('drop policy if exists "active authenticated users only" on public.%I', table_name);
      execute format('create policy "active authenticated users only" on public.%I as restrictive for all to authenticated using (public.is_active_app_user()) with check (public.is_active_app_user())', table_name);
    end if;
  end loop;
end $$;
