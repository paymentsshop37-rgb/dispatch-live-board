-- Retain configured radiuses and every existing alias.
drop trigger if exists service_areas_enforce_radius_150 on public.service_areas;
drop function if exists public.enforce_service_area_radius_150();

-- A city may belong to multiple overlapping service areas.
drop index if exists public.service_area_alias_city_state_unique;
drop index if exists public.service_area_alias_normalized_city_state_uidx;
create unique index service_area_alias_area_city_state_uidx
  on public.service_area_city_aliases(service_area_id, normalized_city, normalized_state);

create or replace function public.normalize_service_area_alias_on_write()
returns trigger language plpgsql set search_path = public as $$
begin
  new.city := trim(regexp_replace(coalesce(new.city, ''), '\s+', ' ', 'g'));
  new.state := upper(regexp_replace(coalesce(new.state, ''), '\s+', '', 'g'));
  if new.city = '' or new.state !~ '^[A-Z]{2}$' then
    raise exception 'Alias city and two-letter state are required' using errcode = '23514';
  end if;
  new.normalized_city := public.normalize_location_text(new.city);
  new.normalized_state := new.state;
  return new;
end;
$$;

-- Restrictive policies also protect manual writes if another permissive policy exists.
create policy "only admins insert aliases" on public.service_area_city_aliases
  as restrictive for insert to authenticated with check (public.nttr_is_active_admin());
create policy "only admins update aliases" on public.service_area_city_aliases
  as restrictive for update to authenticated using (public.nttr_is_active_admin()) with check (public.nttr_is_active_admin());
create policy "only admins delete aliases" on public.service_area_city_aliases
  as restrictive for delete to authenticated using (public.nttr_is_active_admin());

create or replace function public.sync_nearby_cities(target_area_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  area public.service_areas%rowtype;
  postgis_schema text;
  predicate text;
  result jsonb;
begin
  if not coalesce(public.nttr_is_active_admin(), false) then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  -- Serializes repeated syncs and prevents configuration edits mid-sync.
  select * into area from public.service_areas where id = target_area_id for update;
  if not found then raise exception 'Service area not found' using errcode = 'P0002'; end if;
  if area.latitude is null or area.longitude is null or area.coverage_radius_miles is null
    or not (area.latitude between -90 and 90) or not (area.longitude between -180 and 180)
    or not (area.coverage_radius_miles > 0 and area.coverage_radius_miles < 'Infinity'::numeric) then
    raise exception 'Valid latitude, longitude and positive radius are required' using errcode = '22023';
  end if;
  select n.nspname into postgis_schema from pg_extension e
    join pg_namespace n on n.oid = e.extnamespace where e.extname = 'postgis';
  if postgis_schema is not null then
    predicate := format('%1$I.ST_DWithin(%1$I.ST_SetSRID(%1$I.ST_MakePoint(c.longitude::float8,c.latitude::float8),4326)::%1$I.geography, %1$I.ST_SetSRID(%1$I.ST_MakePoint($2::float8,$1::float8),4326)::%1$I.geography, $3::float8 * 1609.344)', postgis_schema);
  else
    -- Great-circle distance, Earth mean radius in miles, with rounding clamp.
    predicate := '3958.7613 * 2 * asin(sqrt(least(1.0, greatest(0.0,
      power(sin(radians((c.latitude - $1)::float8) / 2), 2)
      + cos(radians($1::float8)) * cos(radians(c.latitude::float8))
      * power(sin(radians((c.longitude - $2)::float8) / 2), 2))))) <= $3';
  end if;
  execute format($query$
    with candidates as materialized (
      select distinct on (public.normalize_location_text(c.city), c.state)
        c.city, c.state, public.normalize_location_text(c.city) as normalized_city
      from public.us_nearby_city_catalog() c
      where %s
      order by public.normalize_location_text(c.city), c.state, c.city
    ), inserted as (
      insert into public.service_area_city_aliases
        (service_area_id, city, state, normalized_city, normalized_state, assignment_type)
      select $4, city, state, normalized_city, state, 'nearby_sync' from candidates
      on conflict (service_area_id, normalized_city, normalized_state) do nothing
      returning id
    )
    select jsonb_build_object('found', (select count(*) from candidates),
      'added', (select count(*) from inserted),
      'already_existed', (select count(*) from candidates) - (select count(*) from inserted),
      'errors', 0)
  $query$, predicate) into result using area.latitude, area.longitude, area.coverage_radius_miles, area.id;
  return result || jsonb_build_object('service_area_id', area.id, 'area_name', area.area_name,
    'radius_miles', area.coverage_radius_miles, 'source', 'US Census Gazetteer 2025',
    'distance_method', case when postgis_schema is null then 'Haversine' else 'PostGIS geography' end);
end;
$$;
revoke all on function public.sync_nearby_cities(uuid) from public, anon;
grant execute on function public.sync_nearby_cities(uuid) to authenticated;

-- Preserve existing aliases ahead of new overlapping synced aliases.
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
  order by case when alias.assignment_type = 'nearby_sync' then 1 else 0 end,
    case when sa.normalized_primary_city = public.normalize_location_text(target_job.job_city)
      and sa.normalized_state = public.normalize_location_text(target_job.job_state) then 0 else 1 end,
    alias.created_at, alias.id
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
