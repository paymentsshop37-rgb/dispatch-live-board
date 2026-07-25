begin;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. Incrementally repair tables that may have been partially created.
-- ---------------------------------------------------------------------------
create table if not exists public.service_areas (id uuid);
alter table public.service_areas
  add column if not exists id uuid,
  add column if not exists area_name text,
  add column if not exists primary_city text,
  add column if not exists state text,
  add column if not exists normalized_primary_city text,
  add column if not exists normalized_state text,
  add column if not exists latitude numeric,
  add column if not exists longitude numeric,
  add column if not exists coverage_radius_miles numeric default 75,
  add column if not exists is_active boolean default true,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();
alter table public.service_areas alter column id set default gen_random_uuid();
update public.service_areas set id = gen_random_uuid() where id is null;

create table if not exists public.coverage_cities (id uuid);
alter table public.coverage_cities
  add column if not exists id uuid,
  add column if not exists city text,
  add column if not exists state text,
  add column if not exists normalized_city text,
  add column if not exists normalized_state text,
  add column if not exists service_area_id uuid,
  add column if not exists latitude numeric,
  add column if not exists longitude numeric,
  add column if not exists coverage_radius_miles numeric default 75,
  add column if not exists is_active boolean default true,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();
alter table public.coverage_cities alter column id set default gen_random_uuid();
update public.coverage_cities set id = gen_random_uuid() where id is null;

create table if not exists public.service_area_city_aliases (id uuid);
alter table public.service_area_city_aliases
  add column if not exists id uuid,
  add column if not exists service_area_id uuid,
  add column if not exists city text,
  add column if not exists state text,
  add column if not exists normalized_city text,
  add column if not exists normalized_state text,
  add column if not exists assignment_type text default 'manual',
  add column if not exists created_at timestamptz default now();
alter table public.service_area_city_aliases alter column id set default gen_random_uuid();
update public.service_area_city_aliases set id = gen_random_uuid() where id is null;

alter table public.jobs
  add column if not exists job_city text,
  add column if not exists job_state text,
  add column if not exists latitude numeric,
  add column if not exists longitude numeric,
  add column if not exists service_area_id uuid,
  add column if not exists service_area_assignment_method text,
  add column if not exists service_area_distance_miles numeric,
  add column if not exists service_area_assigned_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.service_areas'::regclass and contype = 'p'
  ) then
    alter table public.service_areas add constraint service_areas_pkey primary key (id);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.coverage_cities'::regclass and contype = 'p'
  ) then
    alter table public.coverage_cities add constraint coverage_cities_pkey primary key (id);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.service_area_city_aliases'::regclass and contype = 'p'
  ) then
    alter table public.service_area_city_aliases add constraint service_area_city_aliases_pkey primary key (id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.coverage_cities'::regclass
      and conname = 'coverage_cities_service_area_id_fkey'
  ) then
    alter table public.coverage_cities
      add constraint coverage_cities_service_area_id_fkey
      foreign key (service_area_id) references public.service_areas(id) on delete set null;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.service_area_city_aliases'::regclass
      and conname = 'service_area_city_aliases_service_area_id_fkey'
  ) then
    alter table public.service_area_city_aliases
      add constraint service_area_city_aliases_service_area_id_fkey
      foreign key (service_area_id) references public.service_areas(id) on delete cascade;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.jobs'::regclass
      and conname = 'jobs_service_area_id_fkey'
  ) then
    alter table public.jobs
      add constraint jobs_service_area_id_fkey
      foreign key (service_area_id) references public.service_areas(id) on delete set null;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Conservative city/state normalization.
-- ---------------------------------------------------------------------------
create or replace function public.normalize_location_text(value text)
returns text
language sql
immutable
parallel safe
as $$
  select case
    when normalized = 'FT WORTH' then 'FORT WORTH'
    when normalized = 'FT STOCKTON' then 'FORT STOCKTON'
    when normalized = 'ALBURQUERQUE' then 'ALBUQUERQUE'
    when normalized = 'OKC' then 'OKLAHOMA CITY'
    when normalized = 'DFW' then 'DALLAS FORT WORTH'
    when normalized = 'JOPLIN MS' then 'JOPLIN MO'
    else normalized
  end
  from (
    select trim(regexp_replace(
      regexp_replace(upper(coalesce(value, '')), '[.,;:/\\]+', ' ', 'g'),
      '\s+', ' ', 'g'
    )) as normalized
  ) source;
$$;

update public.service_areas
set
  area_name = coalesce(nullif(trim(area_name), ''), 'Service Area ' || left(id::text, 8)),
  primary_city = coalesce(nullif(trim(primary_city), ''), 'Unknown'),
  state = upper(trim(coalesce(state, ''))),
  normalized_primary_city = public.normalize_location_text(coalesce(nullif(primary_city, ''), normalized_primary_city)),
  normalized_state = public.normalize_location_text(coalesce(nullif(state, ''), normalized_state)),
  coverage_radius_miles = coalesce(coverage_radius_miles, 75),
  is_active = coalesce(is_active, true),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now());

update public.coverage_cities
set
  city = coalesce(nullif(trim(city), ''), 'Unknown'),
  state = upper(trim(coalesce(state, ''))),
  normalized_city = public.normalize_location_text(coalesce(nullif(city, ''), normalized_city)),
  normalized_state = public.normalize_location_text(coalesce(nullif(state, ''), normalized_state)),
  coverage_radius_miles = coalesce(coverage_radius_miles, 75),
  is_active = coalesce(is_active, true),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now());

update public.service_area_city_aliases
set
  city = coalesce(nullif(trim(city), ''), 'Unknown'),
  state = upper(trim(coalesce(state, ''))),
  normalized_city = public.normalize_location_text(coalesce(nullif(city, ''), normalized_city)),
  normalized_state = public.normalize_location_text(coalesce(nullif(state, ''), normalized_state)),
  assignment_type = coalesce(nullif(trim(assignment_type), ''), 'manual'),
  created_at = coalesce(created_at, now());

alter table public.service_areas
  alter column area_name set not null,
  alter column primary_city set not null,
  alter column state set not null,
  alter column normalized_primary_city set not null,
  alter column normalized_state set not null,
  alter column coverage_radius_miles set default 75,
  alter column is_active set default true,
  alter column created_at set default now(),
  alter column updated_at set default now();
alter table public.coverage_cities
  alter column city set not null,
  alter column state set not null,
  alter column normalized_city set not null,
  alter column normalized_state set not null,
  alter column is_active set default true,
  alter column created_at set default now(),
  alter column updated_at set default now();
alter table public.service_area_city_aliases
  alter column city set not null,
  alter column state set not null,
  alter column normalized_city set not null,
  alter column normalized_state set not null,
  alter column assignment_type set default 'manual',
  alter column created_at set default now();

-- ---------------------------------------------------------------------------
-- 3. Required indexes and duplicate protection.
-- ---------------------------------------------------------------------------
create unique index if not exists service_areas_normalized_city_state_uidx
  on public.service_areas (normalized_primary_city, normalized_state);
create unique index if not exists coverage_cities_normalized_city_state_uidx
  on public.coverage_cities (normalized_city, normalized_state);
create unique index if not exists service_area_alias_normalized_city_state_uidx
  on public.service_area_city_aliases (normalized_city, normalized_state);
create index if not exists jobs_job_city_state_idx
  on public.jobs (job_city, job_state);
create index if not exists jobs_service_area_id_idx
  on public.jobs (service_area_id);
create index if not exists service_areas_normalized_location_idx
  on public.service_areas (normalized_primary_city, normalized_state);
create index if not exists coverage_cities_service_area_idx
  on public.coverage_cities (service_area_id);
create index if not exists service_area_alias_service_area_idx
  on public.service_area_city_aliases (service_area_id);

-- ---------------------------------------------------------------------------
-- 4. Seed/upsert primary areas. Conflict updates intentionally preserve an
--    Admin-edited radius and coordinates.
-- ---------------------------------------------------------------------------
with seed(area_name, primary_city, state, latitude, longitude, radius) as (
  values
    ('Phoenix Area','Phoenix','AZ',33.4484,-112.0740,75::numeric),
    ('Denver Area','Denver','CO',39.7392,-104.9903,75),
    ('Chicago Area','Chicago','IL',41.8781,-87.6298,75),
    ('Indianapolis Area','Indianapolis','IN',39.7684,-86.1581,75),
    ('Baton Rouge Area','Baton Rouge','LA',30.4515,-91.1871,75),
    ('Albuquerque Area','Albuquerque','NM',35.0844,-106.6504,75),
    ('Oklahoma City Area','Oklahoma City','OK',35.4676,-97.5164,75),
    ('Tulsa Area','Tulsa','OK',36.1540,-95.9928,75),
    ('Amarillo Area','Amarillo','TX',35.2220,-101.8313,100),
    ('El Paso Area','El Paso','TX',31.7619,-106.4850,75),
    ('Fort Stockton Area','Fort Stockton','TX',30.8940,-102.8793,120),
    ('Houston Area','Houston','TX',29.7604,-95.3698,75),
    ('Ozona Area','Ozona','TX',30.7102,-101.2007,120),
    ('Sonora Area','Sonora','TX',30.5669,-100.6434,100),
    ('Van Horn Area','Van Horn','TX',31.0399,-104.8308,120),
    ('Tyler Area','Tyler','TX',32.3513,-95.3011,75),
    ('San Antonio Area','San Antonio','TX',29.4241,-98.4936,75),
    ('Midland Area','Midland','TX',31.9973,-102.0779,75),
    ('Laredo Area','Laredo','TX',27.5306,-99.4803,75),
    ('College Station Area','College Station','TX',30.6280,-96.3344,75),
    ('Nashville Area','Nashville','TN',36.1627,-86.7816,75),
    ('Chattanooga Area','Chattanooga','TN',35.0456,-85.3097,75),
    ('Jackson Area','Jackson','MS',32.2988,-90.1848,75),
    ('Shreveport Area','Shreveport','LA',32.5252,-93.7502,75),
    ('Little Rock Area','Little Rock','AR',34.7465,-92.2896,75),
    ('Joplin Area','Joplin','MO',37.0842,-94.5133,90),
    ('Waco Area','Waco','TX',31.5493,-97.1467,75),
    ('Odessa Area','Odessa','TX',31.8457,-102.3676,75),
    ('Memphis Area','Memphis','TN',35.1495,-90.0490,75),
    ('Abilene Area','Abilene','TX',32.4487,-99.7331,75),
    ('Las Vegas Area','Las Vegas','NV',36.1699,-115.1398,75),
    ('Atlanta Area','Atlanta','GA',33.7490,-84.3880,75),
    ('Dallas–Fort Worth Area','Dallas','TX',32.7767,-96.7970,85)
)
insert into public.service_areas (
  area_name, primary_city, state, normalized_primary_city, normalized_state,
  latitude, longitude, coverage_radius_miles, is_active
)
select
  area_name, primary_city, state,
  public.normalize_location_text(primary_city),
  public.normalize_location_text(state),
  latitude, longitude, radius, true
from seed
on conflict (normalized_primary_city, normalized_state) do update
set
  area_name = excluded.area_name,
  primary_city = excluded.primary_city,
  state = excluded.state,
  is_active = true,
  updated_at = now();

-- Seed each primary area as an exact coverage city without overwriting Admin
-- edits to coordinates, radius, or active state on a repeat run.
insert into public.coverage_cities (
  city, state, normalized_city, normalized_state, service_area_id,
  latitude, longitude, coverage_radius_miles, is_active
)
select
  sa.primary_city, sa.state, sa.normalized_primary_city, sa.normalized_state,
  sa.id, sa.latitude, sa.longitude, sa.coverage_radius_miles, true
from public.service_areas sa
where sa.normalized_primary_city in (
  'PHOENIX','DENVER','CHICAGO','INDIANAPOLIS','BATON ROUGE','ALBUQUERQUE',
  'OKLAHOMA CITY','TULSA','AMARILLO','EL PASO','FORT STOCKTON','HOUSTON',
  'OZONA','SONORA','VAN HORN','TYLER','SAN ANTONIO','MIDLAND','LAREDO',
  'COLLEGE STATION','NASHVILLE','CHATTANOOGA','JACKSON','SHREVEPORT',
  'LITTLE ROCK','JOPLIN','WACO','ODESSA','MEMPHIS','ABILENE','LAS VEGAS',
  'ATLANTA','DALLAS'
)
on conflict (normalized_city, normalized_state) do update
set service_area_id = excluded.service_area_id, updated_at = now();

-- ---------------------------------------------------------------------------
-- 5. DFW regional aliases. DFW itself is never inserted as an exact city.
-- ---------------------------------------------------------------------------
with dfw_alias(city, state) as (
  values
    ('Dallas','TX'),('Fort Worth','TX'),('Arlington','TX'),('Irving','TX'),
    ('Grand Prairie','TX'),('Grapevine','TX'),('Euless','TX'),('Bedford','TX'),
    ('Hurst','TX'),('Mesquite','TX'),('Garland','TX'),('Plano','TX'),
    ('Richardson','TX'),('Carrollton','TX'),('Lewisville','TX'),('Denton','TX'),
    ('McKinney','TX'),('Frisco','TX')
), dfw_area as (
  select id from public.service_areas
  where normalized_primary_city = 'DALLAS' and normalized_state = 'TX'
  limit 1
)
insert into public.service_area_city_aliases (
  service_area_id, city, state, normalized_city, normalized_state, assignment_type
)
select
  dfw_area.id, dfw_alias.city, dfw_alias.state,
  public.normalize_location_text(dfw_alias.city),
  public.normalize_location_text(dfw_alias.state),
  'regional'
from dfw_alias cross join dfw_area
on conflict (normalized_city, normalized_state) do update
set
  service_area_id = excluded.service_area_id,
  city = excluded.city,
  state = excluded.state,
  assignment_type = excluded.assignment_type;

-- ---------------------------------------------------------------------------
-- 6. Haversine distance.
-- ---------------------------------------------------------------------------
create or replace function public.distance_miles(
  lat1 numeric, lon1 numeric, lat2 numeric, lon2 numeric
)
returns numeric
language sql
immutable
parallel safe
as $$
  select case
    when lat1 is null or lon1 is null or lat2 is null or lon2 is null then null
    else 3958.7613 * 2 * asin(sqrt(
      power(sin(radians((lat2 - lat1)::double precision) / 2), 2) +
      cos(radians(lat1::double precision)) *
      cos(radians(lat2::double precision)) *
      power(sin(radians((lon2 - lon1)::double precision) / 2), 2)
    ))
  end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Assignment function. It references only canonical public.jobs columns.
-- ---------------------------------------------------------------------------
create or replace function public.assign_job_service_area(job_uuid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_job public.jobs%rowtype;
  matched_area_id uuid;
  matched_method text;
  matched_distance numeric;
begin
  select * into target_job from public.jobs where id = job_uuid for update;
  if not found then return; end if;

  if target_job.service_area_assignment_method = 'manual' then
    return;
  end if;

  -- Exact normalized alias + state match.
  select sa.id, 'alias', 0
  into matched_area_id, matched_method, matched_distance
  from public.service_area_city_aliases alias
  join public.service_areas sa on sa.id = alias.service_area_id
  where sa.is_active
    and alias.normalized_city = public.normalize_location_text(target_job.job_city)
    and alias.normalized_state = public.normalize_location_text(target_job.job_state)
  order by alias.created_at
  limit 1;

  -- Exact configured coverage city + state match.
  if matched_area_id is null then
    select sa.id, 'coverage_city', 0
    into matched_area_id, matched_method, matched_distance
    from public.coverage_cities cc
    join public.service_areas sa on sa.id = cc.service_area_id
    where cc.is_active and sa.is_active
      and cc.normalized_city = public.normalize_location_text(target_job.job_city)
      and cc.normalized_state = public.normalize_location_text(target_job.job_state)
    limit 1;
  end if;

  -- Exact primary city + state match.
  if matched_area_id is null then
    select sa.id, 'primary_city', 0
    into matched_area_id, matched_method, matched_distance
    from public.service_areas sa
    where sa.is_active
      and sa.normalized_primary_city = public.normalize_location_text(target_job.job_city)
      and sa.normalized_state = public.normalize_location_text(target_job.job_state)
    limit 1;
  end if;

  -- Closest active area inside its editable radius.
  if matched_area_id is null
     and target_job.latitude is not null
     and target_job.longitude is not null then
    select candidate.id, 'nearest_radius', candidate.distance
    into matched_area_id, matched_method, matched_distance
    from (
      select
        sa.id,
        sa.coverage_radius_miles,
        public.distance_miles(
          target_job.latitude, target_job.longitude, sa.latitude, sa.longitude
        ) as distance
      from public.service_areas sa
      where sa.is_active and sa.latitude is not null and sa.longitude is not null
    ) candidate
    where candidate.distance <= candidate.coverage_radius_miles
    order by candidate.distance
    limit 1;
  end if;

  update public.jobs
  set
    service_area_id = matched_area_id,
    service_area_assignment_method = coalesce(matched_method, 'unassigned'),
    service_area_distance_miles = matched_distance,
    service_area_assigned_at = now()
  where id = job_uuid;
end;
$$;

create or replace function public.trigger_assign_job_service_area()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assign_job_service_area(new.id);
  return new;
end;
$$;

revoke all on function public.assign_job_service_area(uuid) from public;
revoke all on function public.trigger_assign_job_service_area() from public;

drop trigger if exists jobs_assign_service_area on public.jobs;
drop trigger if exists jobs_assign_service_area_after_geography on public.jobs;
create trigger jobs_assign_service_area_after_geography
after insert or update of job_city, job_state, latitude, longitude
on public.jobs
for each row
execute function public.trigger_assign_job_service_area();

-- Backfill all non-manual jobs. Null city/state/coordinates safely become
-- Outside Coverage / Unassigned.
do $$
declare
  job_record record;
begin
  for job_record in
    select id from public.jobs
    where service_area_id is null
       or service_area_assignment_method is null
       or service_area_assignment_method <> 'manual'
  loop
    perform public.assign_job_service_area(job_record.id);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 8. RLS: active app users read; active Admin users write.
-- ---------------------------------------------------------------------------
create or replace function public.nttr_is_active_app_user()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  allowed boolean;
begin
  if to_regprocedure('public.is_active_app_user()') is not null then
    execute 'select public.is_active_app_user()' into allowed;
    return coalesce(allowed, false);
  end if;
  return exists (
    select 1 from public.app_users
    where (auth_user_id = auth.uid() or id = auth.uid())
      and lower(coalesce(status, '')) = 'active'
      and lower(coalesce(role, '')) in ('admin', 'dispatcher')
  );
end;
$$;

create or replace function public.nttr_is_active_admin()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  allowed boolean;
begin
  if to_regprocedure('public.is_active_admin()') is not null then
    execute 'select public.is_active_admin()' into allowed;
    return coalesce(allowed, false);
  end if;
  return exists (
    select 1 from public.app_users
    where (auth_user_id = auth.uid() or id = auth.uid())
      and lower(coalesce(status, '')) = 'active'
      and lower(coalesce(role, '')) = 'admin'
  );
end;
$$;

revoke all on function public.nttr_is_active_app_user() from public;
revoke all on function public.nttr_is_active_admin() from public;
grant execute on function public.nttr_is_active_app_user() to authenticated;
grant execute on function public.nttr_is_active_admin() to authenticated;

alter table public.service_areas enable row level security;
alter table public.coverage_cities enable row level security;
alter table public.service_area_city_aliases enable row level security;

drop policy if exists "active users read service areas" on public.service_areas;
drop policy if exists "admins manage service areas" on public.service_areas;
drop policy if exists "Authenticated users can view service areas" on public.service_areas;
create policy "active users read service areas"
  on public.service_areas for select to authenticated
  using (public.nttr_is_active_app_user());
create policy "admins manage service areas"
  on public.service_areas for all to authenticated
  using (public.nttr_is_active_admin())
  with check (public.nttr_is_active_admin());

drop policy if exists "active users read coverage cities" on public.coverage_cities;
drop policy if exists "admins insert coverage cities" on public.coverage_cities;
drop policy if exists "admins update coverage cities" on public.coverage_cities;
drop policy if exists "admins delete coverage cities" on public.coverage_cities;
drop policy if exists "admins manage coverage cities" on public.coverage_cities;
drop policy if exists "Authenticated users can view coverage cities" on public.coverage_cities;
create policy "active users read coverage cities"
  on public.coverage_cities for select to authenticated
  using (public.nttr_is_active_app_user());
create policy "admins manage coverage cities"
  on public.coverage_cities for all to authenticated
  using (public.nttr_is_active_admin())
  with check (public.nttr_is_active_admin());

drop policy if exists "active users read service area aliases" on public.service_area_city_aliases;
drop policy if exists "admins manage service area aliases" on public.service_area_city_aliases;
drop policy if exists "Authenticated users can view city aliases" on public.service_area_city_aliases;
create policy "active users read service area aliases"
  on public.service_area_city_aliases for select to authenticated
  using (public.nttr_is_active_app_user());
create policy "admins manage service area aliases"
  on public.service_area_city_aliases for all to authenticated
  using (public.nttr_is_active_admin())
  with check (public.nttr_is_active_admin());

revoke all on public.service_areas from anon;
revoke all on public.coverage_cities from anon;
revoke all on public.service_area_city_aliases from anon;
grant select, insert, update, delete on public.service_areas to authenticated;
grant select, insert, update, delete on public.coverage_cities to authenticated;
grant select, insert, update, delete on public.service_area_city_aliases to authenticated;

notify pgrst, 'reload schema';

commit;

-- ---------------------------------------------------------------------------
-- Verification queries (run manually after the migration).
-- ---------------------------------------------------------------------------
-- Required tables:
-- select table_name from information_schema.tables
-- where table_schema = 'public'
--   and table_name in ('service_areas','coverage_cities','service_area_city_aliases','jobs')
-- order by table_name;

-- Required columns:
-- select table_name, column_name, data_type
-- from information_schema.columns
-- where table_schema = 'public'
--   and table_name in ('service_areas','coverage_cities','service_area_city_aliases','jobs')
--   and column_name in (
--     'normalized_primary_city','normalized_state','normalized_city',
--     'job_city','job_state','latitude','longitude','service_area_id',
--     'service_area_assignment_method','service_area_distance_miles',
--     'service_area_assigned_at'
--   )
-- order by table_name, ordinal_position;

-- Seeded service areas:
-- select area_name, primary_city, state, coverage_radius_miles, is_active
-- from public.service_areas order by state, area_name;

-- DFW aliases:
-- select sa.area_name, alias.city, alias.state, alias.assignment_type
-- from public.service_area_city_aliases alias
-- join public.service_areas sa on sa.id = alias.service_area_id
-- where sa.normalized_primary_city = 'DALLAS' and sa.normalized_state = 'TX'
-- order by alias.city;

-- RLS policies:
-- select tablename, policyname, roles, cmd
-- from pg_policies
-- where schemaname = 'public'
--   and tablename in ('service_areas','coverage_cities','service_area_city_aliases')
-- order by tablename, policyname;

-- Outside Coverage / Unassigned:
-- select id, job_city, job_state, latitude, longitude,
--        service_area_assignment_method
-- from public.jobs
-- where service_area_id is null
-- order by service_area_assigned_at desc nulls last;

-- Assigned jobs by service area:
-- select sa.area_name, sa.primary_city, sa.state, count(j.id) as total_jobs
-- from public.service_areas sa
-- left join public.jobs j on j.service_area_id = sa.id
-- group by sa.id, sa.area_name, sa.primary_city, sa.state
-- order by total_jobs desc, sa.area_name;
