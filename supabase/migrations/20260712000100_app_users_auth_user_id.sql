alter table public.app_users add column if not exists auth_user_id uuid;

update public.app_users p
set auth_user_id = p.id
where p.auth_user_id is null
  and exists (select 1 from auth.users a where a.id = p.id);

alter table public.app_users alter column password drop not null;
alter table public.app_users alter column temporary_password drop not null;

create unique index if not exists app_users_auth_user_id_unique
  on public.app_users (auth_user_id)
  where auth_user_id is not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'app_users_auth_user_id_fk') then
    alter table public.app_users
      add constraint app_users_auth_user_id_fk
      foreign key (auth_user_id) references auth.users(id) on delete set null;
  end if;
end $$;

create or replace function public.is_active_app_user() returns boolean language sql stable security definer set search_path = '' as $$
  select exists(
    select 1
    from public.app_users
    where (auth_user_id = auth.uid() or id = auth.uid())
      and status = 'Active'
  );
$$;

create or replace function public.is_active_admin() returns boolean language sql stable security definer set search_path = '' as $$
  select exists(
    select 1
    from public.app_users
    where (auth_user_id = auth.uid() or id = auth.uid())
      and status = 'Active'
      and role = 'admin'
  );
$$;

drop policy if exists "users read own profile" on public.app_users;
drop policy if exists "admins manage profiles" on public.app_users;
drop policy if exists "users update own session flags" on public.app_users;
create policy "users read own profile" on public.app_users for select to authenticated using (auth_user_id = auth.uid() or id = auth.uid() or public.is_active_admin());
create policy "admins manage profiles" on public.app_users for all to authenticated using (public.is_active_admin()) with check (public.is_active_admin());
create policy "users update own session flags" on public.app_users for update to authenticated using ((auth_user_id = auth.uid() or id = auth.uid()) and public.is_active_app_user()) with check ((auth_user_id = auth.uid() or id = auth.uid()) and status = 'Active');
