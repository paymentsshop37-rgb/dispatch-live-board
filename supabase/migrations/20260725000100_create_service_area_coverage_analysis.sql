create extension if not exists pgcrypto;

create table if not exists public.service_areas (
  id uuid primary key default gen_random_uuid(),
  area_name text not null,
  primary_city text not null,
  state text not null,
  normalized_primary_city text not null,
  latitude numeric,
  longitude numeric,
  coverage_radius_miles numeric not null default 75 check (coverage_radius_miles > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists service_areas_name_state_unique
  on public.service_areas (lower(area_name), upper(state));
create index if not exists service_areas_active_location_idx
  on public.service_areas (is_active, state, normalized_primary_city);

create table if not exists public.service_area_city_aliases (
  id uuid primary key default gen_random_uuid(),
  service_area_id uuid not null references public.service_areas(id) on delete cascade,
  city text not null,
  state text not null,
  normalized_city text not null,
  assignment_type text not null default 'manual',
  created_at timestamptz not null default now()
);

create unique index if not exists service_area_alias_city_state_unique
  on public.service_area_city_aliases (upper(state), normalized_city);
create index if not exists service_area_alias_area_idx
  on public.service_area_city_aliases (service_area_id);

alter table public.jobs add column if not exists job_city text;
alter table public.jobs add column if not exists job_state text;
alter table public.jobs add column if not exists latitude numeric;
alter table public.jobs add column if not exists longitude numeric;
alter table public.jobs add column if not exists service_area_id uuid references public.service_areas(id) on delete set null;
alter table public.jobs add column if not exists service_area_assignment_method text;
alter table public.jobs add column if not exists service_area_distance_miles numeric;
alter table public.jobs add column if not exists service_area_assigned_at timestamptz;
create index if not exists jobs_service_area_idx on public.jobs (service_area_id);

create or replace function public.normalize_geo_city(value text)
returns text language sql immutable as $$
  select trim(regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(upper(coalesce(value, '')), '\mFT[.]?\s+', 'FORT ', 'g'),
        '\mALBURQUERQUE\M', 'ALBUQUERQUE', 'g'
      ),
      '[^A-Z0-9 ]', ' ', 'g'
    ),
    '\s+', ' ', 'g'
  ));
$$;

insert into public.service_areas
  (area_name, primary_city, state, normalized_primary_city, latitude, longitude, coverage_radius_miles)
values
  ('Phoenix Area', 'Phoenix', 'AZ', 'PHOENIX', 33.4484, -112.0740, 75),
  ('Denver Area', 'Denver', 'CO', 'DENVER', 39.7392, -104.9903, 75),
  ('Chicago Area', 'Chicago', 'IL', 'CHICAGO', 41.8781, -87.6298, 75),
  ('Indianapolis Area', 'Indianapolis', 'IN', 'INDIANAPOLIS', 39.7684, -86.1581, 75),
  ('Baton Rouge Area', 'Baton Rouge', 'LA', 'BATON ROUGE', 30.4515, -91.1871, 75),
  ('Albuquerque Area', 'Albuquerque', 'NM', 'ALBUQUERQUE', 35.0844, -106.6504, 75),
  ('Oklahoma City Area', 'Oklahoma City', 'OK', 'OKLAHOMA CITY', 35.4676, -97.5164, 75),
  ('Tulsa Area', 'Tulsa', 'OK', 'TULSA', 36.1540, -95.9928, 75),
  ('Amarillo Area', 'Amarillo', 'TX', 'AMARILLO', 35.2220, -101.8313, 75),
  ('El Paso Area', 'El Paso', 'TX', 'EL PASO', 31.7619, -106.4850, 75),
  ('Fort Stockton Area', 'Fort Stockton', 'TX', 'FORT STOCKTON', 30.8940, -102.8793, 75),
  ('Dallas–Fort Worth Area', 'Dallas', 'TX', 'DALLAS', 32.7767, -96.7970, 85),
  ('Houston Area', 'Houston', 'TX', 'HOUSTON', 29.7604, -95.3698, 75),
  ('Ozona Area', 'Ozona', 'TX', 'OZONA', 30.7102, -101.2007, 75),
  ('Sonora Area', 'Sonora', 'TX', 'SONORA', 30.5669, -100.6434, 75),
  ('Van Horn Area', 'Van Horn', 'TX', 'VAN HORN', 31.0399, -104.8308, 75),
  ('Tyler Area', 'Tyler', 'TX', 'TYLER', 32.3513, -95.3011, 75),
  ('San Antonio Area', 'San Antonio', 'TX', 'SAN ANTONIO', 29.4241, -98.4936, 75),
  ('Midland Area', 'Midland', 'TX', 'MIDLAND', 31.9973, -102.0779, 75),
  ('Laredo Area', 'Laredo', 'TX', 'LAREDO', 27.5306, -99.4803, 75),
  ('College Station Area', 'College Station', 'TX', 'COLLEGE STATION', 30.6280, -96.3344, 75),
  ('Nashville Area', 'Nashville', 'TN', 'NASHVILLE', 36.1627, -86.7816, 75),
  ('Chattanooga Area', 'Chattanooga', 'TN', 'CHATTANOOGA', 35.0456, -85.3097, 75),
  ('Jackson Area', 'Jackson', 'MS', 'JACKSON', 32.2988, -90.1848, 75),
  ('Shreveport Area', 'Shreveport', 'LA', 'SHREVEPORT', 32.5252, -93.7502, 75),
  ('Little Rock Area', 'Little Rock', 'AR', 'LITTLE ROCK', 34.7465, -92.2896, 75),
  ('Joplin Area', 'Joplin', 'MO', 'JOPLIN', 37.0842, -94.5133, 75),
  ('Waco Area', 'Waco', 'TX', 'WACO', 31.5493, -97.1467, 75),
  ('Odessa Area', 'Odessa', 'TX', 'ODESSA', 31.8457, -102.3676, 75),
  ('Memphis Area', 'Memphis', 'TN', 'MEMPHIS', 35.1495, -90.0490, 75),
  ('Abilene Area', 'Abilene', 'TX', 'ABILENE', 32.4487, -99.7331, 75),
  ('Las Vegas Area', 'Las Vegas', 'NV', 'LAS VEGAS', 36.1699, -115.1398, 75),
  ('Atlanta Area', 'Atlanta', 'GA', 'ATLANTA', 33.7490, -84.3880, 75)
on conflict do nothing;

insert into public.service_area_city_aliases
  (service_area_id, city, state, normalized_city, assignment_type)
select id, primary_city, state, normalized_primary_city, 'primary'
from public.service_areas
on conflict do nothing;

insert into public.service_area_city_aliases
  (service_area_id, city, state, normalized_city, assignment_type)
select id, 'Fort Worth', 'TX', 'FORT WORTH', 'regional'
from public.service_areas where area_name = 'Dallas–Fort Worth Area'
on conflict do nothing;

create or replace function public.geo_distance_miles(
  lat1 numeric, lon1 numeric, lat2 numeric, lon2 numeric
) returns numeric language sql immutable as $$
  select case when lat1 is null or lon1 is null or lat2 is null or lon2 is null then null
    else 3958.7613 * 2 * asin(sqrt(
      power(sin(radians((lat2 - lat1)::double precision) / 2), 2) +
      cos(radians(lat1::double precision)) * cos(radians(lat2::double precision)) *
      power(sin(radians((lon2 - lon1)::double precision) / 2), 2)
    )) end;
$$;

create or replace function public.assign_job_service_area()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  selected_area record;
  candidate_city text;
  candidate_state text;
begin
  if new.service_area_assignment_method = 'manual' and new.service_area_id is not null then
    new.service_area_assigned_at := coalesce(new.service_area_assigned_at, now());
    return new;
  end if;

  candidate_city := public.normalize_geo_city(coalesce(new.job_city, new.city));
  candidate_state := upper(trim(coalesce(new.job_state, new.state)));

  select sa.id, 0::numeric as distance, 'alias'::text as method
    into selected_area
  from public.service_area_city_aliases alias
  join public.service_areas sa on sa.id = alias.service_area_id and sa.is_active
  where alias.normalized_city = candidate_city and upper(alias.state) = candidate_state
  limit 1;

  if selected_area.id is null then
    select sa.id, 0::numeric as distance, 'primary_city'::text as method
      into selected_area
    from public.service_areas sa
    where sa.is_active
      and sa.normalized_primary_city = candidate_city
      and upper(sa.state) = candidate_state
    limit 1;
  end if;

  if selected_area.id is null and new.latitude is not null and new.longitude is not null then
    select sa.id,
           public.geo_distance_miles(new.latitude, new.longitude, sa.latitude, sa.longitude) as distance,
           'nearest_radius'::text as method
      into selected_area
    from public.service_areas sa
    where sa.is_active and sa.latitude is not null and sa.longitude is not null
      and public.geo_distance_miles(new.latitude, new.longitude, sa.latitude, sa.longitude) <= sa.coverage_radius_miles
    order by distance asc
    limit 1;
  end if;

  new.service_area_id := selected_area.id;
  new.service_area_assignment_method := coalesce(selected_area.method, 'unassigned');
  new.service_area_distance_miles := selected_area.distance;
  new.service_area_assigned_at := now();
  return new;
end;
$$;

drop trigger if exists jobs_assign_service_area on public.jobs;
create trigger jobs_assign_service_area
before insert or update of job_city, job_state, city, state, latitude, longitude, service_area_id, service_area_assignment_method
on public.jobs for each row execute function public.assign_job_service_area();

alter table public.service_areas enable row level security;
alter table public.service_area_city_aliases enable row level security;

drop policy if exists "active users read service areas" on public.service_areas;
create policy "active users read service areas" on public.service_areas for select to authenticated
  using (public.is_active_app_user());
drop policy if exists "admins manage service areas" on public.service_areas;
create policy "admins manage service areas" on public.service_areas for all to authenticated
  using (public.is_active_admin()) with check (public.is_active_admin());

drop policy if exists "active users read service area aliases" on public.service_area_city_aliases;
create policy "active users read service area aliases" on public.service_area_city_aliases for select to authenticated
  using (public.is_active_app_user());
drop policy if exists "admins manage service area aliases" on public.service_area_city_aliases;
create policy "admins manage service area aliases" on public.service_area_city_aliases for all to authenticated
  using (public.is_active_admin()) with check (public.is_active_admin());

grant select, insert, update, delete on public.service_areas to authenticated;
grant select, insert, update, delete on public.service_area_city_aliases to authenticated;

-- Backfill only the new geographic classification fields. Original location fields are never changed.
update public.jobs set service_area_assignment_method = coalesce(service_area_assignment_method, 'unassigned');
