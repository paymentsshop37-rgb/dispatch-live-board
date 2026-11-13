begin;

alter table public.app_users drop constraint app_users_role_check;
alter table public.app_users add constraint app_users_role_check
  check (lower(role) = any (array['admin','dispatcher','supervisor','technician_manager','cfo']));

-- One server-managed binding. Application administrators cannot grant access.
create table public.intelligence_cfo_account (
  singleton boolean primary key default true check (singleton),
  auth_user_id uuid not null unique references auth.users(id) on delete restrict,
  app_user_id uuid not null unique references public.app_users(id) on delete restrict,
  created_at timestamptz not null default now()
);
alter table public.intelligence_cfo_account enable row level security;
revoke all on public.intelligence_cfo_account from public, anon, authenticated;
grant all on public.intelligence_cfo_account to service_role;

create function public.can_access_intelligence() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.intelligence_cfo_account binding
    join public.app_users profile on profile.id = binding.app_user_id
    where binding.auth_user_id = auth.uid()
      and profile.auth_user_id = binding.auth_user_id
      and lower(profile.role) = 'cfo'
      and profile.status = 'Active'
      and not profile.force_password_change
  );
$$;
revoke all on function public.can_access_intelligence() from public, anon;
grant execute on function public.can_access_intelligence() to authenticated;

-- Reads for this application are checked on the server on every page.
create function public.get_intelligence_page(dataset text, page_offset integer default 0, page_size integer default 500)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  if not public.can_access_intelligence() then
    raise exception 'Exclusive CFO access required.' using errcode = '42501';
  end if;
  if page_offset < 0 or page_size < 1 or page_size > 500 then
    raise exception 'Invalid pagination.' using errcode = '22023';
  end if;
  case dataset
    when 'jobs' then
      select coalesce(jsonb_agg(to_jsonb(rows)), '[]'::jsonb) into result
      from (select * from public.jobs order by id limit page_size offset page_offset) rows;
    when 'coverage_cities' then
      select coalesce(jsonb_agg(to_jsonb(rows)), '[]'::jsonb) into result
      from (select * from public.coverage_cities order by id limit page_size offset page_offset) rows;
    when 'service_areas' then
      select coalesce(jsonb_agg(to_jsonb(rows)), '[]'::jsonb) into result
      from (select * from public.service_areas order by id limit page_size offset page_offset) rows;
    when 'service_area_city_aliases' then
      select coalesce(jsonb_agg(to_jsonb(rows)), '[]'::jsonb) into result
      from (select * from public.service_area_city_aliases order by id limit page_size offset page_offset) rows;
    when 'technicians' then
      select coalesce(jsonb_agg(to_jsonb(rows)), '[]'::jsonb) into result
      from (select id,city,state,status,is_active,deleted_at from public.technicians order by id limit page_size offset page_offset) rows;
    else raise exception 'Unsupported dataset.' using errcode = '22023';
  end case;
  return result;
end;
$$;
revoke all on function public.get_intelligence_page(text,integer,integer) from public, anon;
grant execute on function public.get_intelligence_page(text,integer,integer) to authenticated;

-- Other application administrators cannot rename, relink or disable this profile.
create function public.protect_intelligence_cfo_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.intelligence_cfo_account where app_user_id = old.id)
    and coalesce(auth.role(), '') not in ('service_role', '') then
    if tg_op = 'DELETE' or auth.uid() is distinct from old.auth_user_id then
      raise exception 'The exclusive CFO account is managed outside application administration.' using errcode = '42501';
    end if;
    if (to_jsonb(new) - array['force_password_change','updated_at','last_login_at','login_count'])
      is distinct from (to_jsonb(old) - array['force_password_change','updated_at','last_login_at','login_count']) then
      raise exception 'The exclusive CFO identity cannot be changed here.' using errcode = '42501';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.protect_intelligence_cfo_profile() from public, anon, authenticated;
create trigger protect_intelligence_cfo_profile before update or delete on public.app_users
  for each row execute function public.protect_intelligence_cfo_profile();

-- Password changes remain self-service for this dedicated role.
create policy "CFO reads own profile" on public.app_users for select to authenticated
  using (lower(role) = 'cfo' and auth_user_id = auth.uid());
create policy "CFO updates own password flag" on public.app_users for update to authenticated
  using (lower(role) = 'cfo' and auth_user_id = auth.uid())
  with check (lower(role) = 'cfo' and auth_user_id = auth.uid());

notify pgrst, 'reload schema';
commit;
