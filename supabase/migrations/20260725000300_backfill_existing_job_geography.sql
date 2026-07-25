begin;

-- This migration discovers the columns that actually exist on public.jobs.
-- It never updates any original location/address/customer text column.
do $$
declare
  discovered_columns text;
begin
  select string_agg(column_name, ', ' order by ordinal_position)
  into discovered_columns
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'jobs'
    and (
      column_name ~* '(city|state|zip|address|location)'
      or column_name in ('notes', 'updates')
    );

  raise notice 'Geographic public.jobs columns found: %',
    coalesce(discovered_columns, '(none)');
end $$;

create or replace function public.normalize_job_backfill_city(value text)
returns text
language sql
immutable
parallel safe
as $$
  select case cleaned
    when 'FT WORTH' then 'FORT WORTH'
    when 'FT STOCKTON' then 'FORT STOCKTON'
    when 'ALBURQUERQUE' then 'ALBUQUERQUE'
    when 'OKC' then 'OKLAHOMA CITY'
    when 'DFW' then 'DALLAS'
    when 'JOPLIN MS' then 'JOPLIN'
    else cleaned
  end
  from (
    select nullif(trim(regexp_replace(
      regexp_replace(upper(coalesce(value, '')), '[.]', '', 'g'),
      '\s+', ' ', 'g'
    )), '') as cleaned
  ) source;
$$;

create or replace function public.valid_job_backfill_state(value text)
returns text
language sql
immutable
parallel safe
as $$
  select case
    when upper(trim(coalesce(value, ''))) ~
      '^(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)$'
    then upper(trim(value))
    else null
  end;
$$;

create or replace function public.job_backfill_first_value(
  source jsonb,
  candidate_keys text[]
)
returns text
language sql
immutable
parallel safe
as $$
  select nullif(trim(source ->> candidate_key), '')
  from unnest(candidate_keys) with ordinality candidates(candidate_key, priority)
  where nullif(trim(source ->> candidate_key), '') is not null
  order by priority
  limit 1;
$$;

create or replace function public.parse_job_backfill_state(location_text text)
returns text
language sql
immutable
parallel safe
as $$
  select case
    when upper(trim(coalesce(location_text, ''))) ~ '(^|[,\s])JOPLIN[\s,]+MS(\s+\d{5}(-\d{4})?)?\s*$'
      then 'MO'
    else public.valid_job_backfill_state(
      (regexp_match(
        upper(trim(coalesce(location_text, ''))),
        '(?:,\s*|\s+)([A-Z]{2})(?:\s+\d{5}(?:-\d{4})?)?\s*$'
      ))[1]
    )
  end;
$$;

create or replace function public.parse_job_backfill_city(location_text text)
returns text
language plpgsql
immutable
parallel safe
as $$
declare
  source text := trim(coalesce(location_text, ''));
  without_state text;
  city_candidate text;
begin
  if source = '' or public.parse_job_backfill_state(source) is null then
    return null;
  end if;

  without_state := regexp_replace(
    source,
    '(?:,\s*|\s+)[A-Za-z]{2}(?:\s+\d{5}(?:-\d{4})?)?\s*$',
    '',
    'i'
  );
  city_candidate := trim(regexp_replace(without_state, '^.*,\s*', ''));
  return public.normalize_job_backfill_city(city_candidate);
end;
$$;

-- Snapshot derived values only. to_jsonb lets this migration use whichever
-- structured/original geographic columns exist without referencing missing
-- columns. Notes are deliberately not parsed: they are not reliable geography.
create temporary table job_geography_backfill_source on commit drop as
select
  j.id,
  to_jsonb(j) as source,
  public.job_backfill_first_value(
    to_jsonb(j),
    array['location', 'address', 'service_location', 'service_address',
          'customer_location', 'breakdown_location', 'location_text']
  ) as full_location,
  public.job_backfill_first_value(
    to_jsonb(j),
    array['job_city', 'city', 'service_city', 'location_city', 'customer_city']
  ) as structured_city,
  public.job_backfill_first_value(
    to_jsonb(j),
    array['job_state', 'state', 'service_state', 'location_state', 'customer_state']
  ) as structured_state
from public.jobs j;

-- If this deployment has the linked customer_locations table, use its
-- structured city/state before parsing its preserved address text.
do $$
begin
  if to_regclass('public.customer_locations') is not null then
    execute $sql$
      update job_geography_backfill_source src
      set
        structured_city = coalesce(
          src.structured_city,
          public.job_backfill_first_value(
            to_jsonb(location_row),
            array['city', 'service_city', 'location_city']
          )
        ),
        structured_state = coalesce(
          src.structured_state,
          public.job_backfill_first_value(
            to_jsonb(location_row),
            array['state', 'service_state', 'location_state']
          )
        ),
        full_location = coalesce(
          src.full_location,
          public.job_backfill_first_value(
            to_jsonb(location_row),
            array['address', 'location', 'service_location', 'location_name']
          )
        )
      from public.customer_locations location_row
      where location_row.id::text = src.source ->> 'customer_location_id'
    $sql$;
  end if;
end $$;

update public.jobs j
set
  job_city = coalesce(
    nullif(trim(j.job_city), ''),
    public.normalize_job_backfill_city(src.structured_city),
    public.parse_job_backfill_city(src.full_location)
  ),
  job_state = coalesce(
    public.valid_job_backfill_state(j.job_state),
    public.valid_job_backfill_state(src.structured_state),
    public.parse_job_backfill_state(src.full_location)
  )
from job_geography_backfill_source src
where src.id = j.id
  and (
    nullif(trim(j.job_city), '') is null
    or public.valid_job_backfill_state(j.job_state) is null
  );

-- Apply the required spelling aliases to canonical fields only.
update public.jobs
set
  job_city = public.normalize_job_backfill_city(job_city),
  job_state = case
    when public.normalize_job_backfill_city(job_city) = 'JOPLIN'
      and upper(trim(coalesce(job_state, ''))) = 'MS' then 'MO'
    else public.valid_job_backfill_state(job_state)
  end
where job_city is not null or job_state is not null;

-- Re-run the existing assignment function for every non-manual job.
-- Manual assignments are not changed, including manual rows with a null area.
do $$
declare
  job_record record;
begin
  if to_regprocedure('public.assign_job_service_area(uuid)') is null then
    raise exception 'Required function public.assign_job_service_area(uuid) does not exist';
  end if;

  for job_record in
    select id
    from public.jobs
    where coalesce(service_area_assignment_method, '') <> 'manual'
  loop
    perform public.assign_job_service_area(job_record.id);
  end loop;
end $$;

notify pgrst, 'reload schema';
commit;

-- Verification: totals and assignment coverage.
select
  count(*) as total_jobs,
  count(*) filter (where nullif(trim(job_city), '') is not null) as jobs_with_job_city,
  count(*) filter (where nullif(trim(job_state), '') is not null) as jobs_with_job_state,
  count(*) filter (where service_area_id is not null) as jobs_assigned_to_service_area,
  count(*) filter (where service_area_id is null) as unassigned_jobs
from public.jobs;

-- Verification: jobs grouped by service area, including unassigned.
select
  coalesce(sa.area_name, 'Outside Coverage / Unassigned') as service_area,
  count(*) as total_jobs
from public.jobs j
left join public.service_areas sa on sa.id = j.service_area_id
group by coalesce(sa.area_name, 'Outside Coverage / Unassigned')
order by total_jobs desc, service_area;

-- Optional audit: see the actual geographic source columns in this database.
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'jobs'
  and (
    column_name ~* '(city|state|zip|address|location)'
    or column_name in ('notes', 'updates')
  )
order by ordinal_position;
