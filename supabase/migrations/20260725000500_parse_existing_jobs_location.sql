begin;

-- Incremental geographic backfill from the existing Dispatch Board field:
-- public.jobs.location
--
-- This migration does not recreate tables and never updates jobs.location.

create temporary table job_location_state_names (
  state_name text primary key,
  state_code text not null
) on commit drop;

insert into job_location_state_names (state_name, state_code) values
  ('ALABAMA','AL'),('ALASKA','AK'),('ARIZONA','AZ'),('ARKANSAS','AR'),
  ('CALIFORNIA','CA'),('COLORADO','CO'),('CONNECTICUT','CT'),
  ('DELAWARE','DE'),('DISTRICT OF COLUMBIA','DC'),('FLORIDA','FL'),
  ('GEORGIA','GA'),('HAWAII','HI'),('IDAHO','ID'),('ILLINOIS','IL'),
  ('INDIANA','IN'),('IOWA','IA'),('KANSAS','KS'),('KENTUCKY','KY'),
  ('LOUISIANA','LA'),('MAINE','ME'),('MARYLAND','MD'),
  ('MASSACHUSETTS','MA'),('MICHIGAN','MI'),('MINNESOTA','MN'),
  ('MISSISSIPPI','MS'),('MISSOURI','MO'),('MONTANA','MT'),
  ('NEBRASKA','NE'),('NEVADA','NV'),('NEW HAMPSHIRE','NH'),
  ('NEW JERSEY','NJ'),('NEW MEXICO','NM'),('NEW YORK','NY'),
  ('NORTH CAROLINA','NC'),('NORTH DAKOTA','ND'),('OHIO','OH'),
  ('OKLAHOMA','OK'),('OREGON','OR'),('PENNSYLVANIA','PA'),
  ('RHODE ISLAND','RI'),('SOUTH CAROLINA','SC'),('SOUTH DAKOTA','SD'),
  ('TENNESSEE','TN'),('TEXAS','TX'),('UTAH','UT'),('VERMONT','VT'),
  ('VIRGINIA','VA'),('WASHINGTON','WA'),('WEST VIRGINIA','WV'),
  ('WISCONSIN','WI'),('WYOMING','WY'),
  ('AL','AL'),('AK','AK'),('AZ','AZ'),('AR','AR'),('CA','CA'),
  ('CO','CO'),('CT','CT'),('DE','DE'),('FL','FL'),('GA','GA'),
  ('HI','HI'),('ID','ID'),('IL','IL'),('IN','IN'),('IA','IA'),
  ('KS','KS'),('KY','KY'),('LA','LA'),('ME','ME'),('MD','MD'),
  ('MA','MA'),('MI','MI'),('MN','MN'),('MS','MS'),('MO','MO'),
  ('MT','MT'),('NE','NE'),('NV','NV'),('NH','NH'),('NJ','NJ'),
  ('NM','NM'),('NY','NY'),('NC','NC'),('ND','ND'),('OH','OH'),
  ('OK','OK'),('OR','OR'),('PA','PA'),('RI','RI'),('SC','SC'),
  ('SD','SD'),('TN','TN'),('TX','TX'),('UT','UT'),('VT','VT'),
  ('VA','VA'),('WA','WA'),('WV','WV'),('WI','WI'),('WY','WY'),
  ('DC','DC');

create temporary table parsed_existing_job_locations (
  id uuid primary key,
  location text not null,
  parsed_city text not null,
  parsed_state text not null
) on commit drop;

insert into parsed_existing_job_locations (
  id,
  location,
  parsed_city,
  parsed_state
)
with normalized_locations as (
  select
    j.id,
    j.location,
    trim(
      regexp_replace(
        upper(trim(j.location)),
        '\s+[0-9]{5}(-[0-9]{4})?\s*$',
        ''
      )
    ) as normalized_location
  from public.jobs j
  where nullif(trim(j.location), '') is not null
),
matched_states as (
  select
    source.id,
    source.location,
    source.normalized_location,
    matched.state_name,
    matched.state_code
  from normalized_locations source
  cross join lateral (
    select states.state_name, states.state_code
    from job_location_state_names states
    where source.normalized_location = states.state_name
       or right(
            source.normalized_location,
            length(states.state_name) + 1
          ) = ' ' || states.state_name
       or right(
            source.normalized_location,
            length(states.state_name) + 1
          ) = ',' || states.state_name
    order by length(states.state_name) desc
    limit 1
  ) matched
),
city_prefixes as (
  select
    id,
    location,
    state_code,
    trim(
      regexp_replace(
        trim(
          left(
            normalized_location,
            length(normalized_location) - length(state_name)
          )
        ),
        ',\s*$',
        ''
      )
    ) as city_prefix
  from matched_states
),
city_candidates as (
  select
    id,
    location,
    state_code,
    case
      when city_prefix like '%,%'
        then trim(regexp_replace(city_prefix, '^.*,\s*', ''))
      else city_prefix
    end as city_candidate
  from city_prefixes
),
normalized_cities as (
  select
    id,
    location,
    state_code,
    trim(
      regexp_replace(
        replace(city_candidate, '.', ''),
        '\s+',
        ' ',
        'g'
      )
    ) as normalized_city
  from city_candidates
  where nullif(trim(city_candidate), '') is not null
    and city_candidate !~ '[0-9]'
)
select
  id,
  location,
  case normalized_city
    when 'FT WORTH' then 'FORT WORTH'
    when 'FT STOCKTON' then 'FORT STOCKTON'
    when 'ALBURQUERQUE' then 'ALBUQUERQUE'
    when 'OKC' then 'OKLAHOMA CITY'
    when 'DFW' then 'DALLAS'
    when 'JOPLIN MS' then 'JOPLIN'
    else normalized_city
  end as parsed_city,
  case
    when normalized_city in ('JOPLIN', 'JOPLIN MS') and state_code = 'MS'
      then 'MO'
    else state_code
  end as parsed_state
from normalized_cities;

create temporary table updated_existing_job_locations (
  id uuid primary key
) on commit drop;

with updated_jobs as (
  update public.jobs jobs
  set
    job_city = parsed.parsed_city,
    job_state = parsed.parsed_state
  from parsed_existing_job_locations parsed
  where jobs.id = parsed.id
    and parsed.parsed_city is not null
    and parsed.parsed_state is not null
  returning jobs.id
)
insert into updated_existing_job_locations (id)
select id from updated_jobs;

-- The existing assignment function protects manual assignments internally.
-- It is called immediately for every job updated above.
select public.assign_job_service_area(updated.id)
from updated_existing_job_locations updated;

notify pgrst, 'reload schema';

commit;

-- Verification: this row proves the complete migration reached COMMIT.
select
  '20260725000500_parse_existing_jobs_location.sql' as migration,
  'executed successfully' as result,
  count(*) as total_jobs,
  count(*) filter (
    where job_city is not null and job_state is not null
  ) as parsed_jobs,
  count(*) filter (where job_city is null) as remaining_null_job_city,
  count(*) filter (where job_state is null) as remaining_null_job_state
from public.jobs;

-- Verification: parsed jobs.
select
  id,
  location,
  job_city,
  job_state,
  service_area_id,
  service_area_assignment_method
from public.jobs
where job_city is not null and job_state is not null
order by job_state, job_city, id;

-- Verification: remaining NULL job_city.
select id, location, job_city, job_state
from public.jobs
where job_city is null
order by id;

-- Verification: remaining NULL job_state.
select id, location, job_city, job_state
from public.jobs
where job_state is null
order by id;

-- Verification: jobs grouped by service area, including unassigned.
select
  coalesce(service_areas.area_name, 'Outside Coverage / Unassigned')
    as service_area,
  count(*) as total_jobs
from public.jobs jobs
left join public.service_areas service_areas
  on service_areas.id = jobs.service_area_id
group by coalesce(
  service_areas.area_name,
  'Outside Coverage / Unassigned'
)
order by total_jobs desc, service_area;
