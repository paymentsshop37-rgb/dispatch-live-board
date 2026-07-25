begin;

-- The Dispatch Board LOCATION trace is:
-- public.jobs.location -> fromDbJob(row).location -> job.location -> row/card.
-- This migration reads that column and never updates it.
create or replace function public.dispatch_location_state(value text)
returns text
language plpgsql
immutable
parallel safe
as $$
declare
  token text;
begin
  token := upper((regexp_match(
    trim(coalesce(value, '')),
    '(?:,\s*|\s+)(NEW MEXICO|MISSISSIPPI|TENNESSEE|LOUISIANA|OKLAHOMA|COLORADO|ILLINOIS|INDIANA|ARKANSAS|MISSOURI|ARIZONA|NEVADA|GEORGIA|TEXAS|[A-Z]{2})(?:\s+\d{5}(?:-\d{4})?)?\s*$',
    'i'
  ))[1]);
  return case token
    when 'TEXAS' then 'TX' when 'ARIZONA' then 'AZ'
    when 'COLORADO' then 'CO' when 'ILLINOIS' then 'IL'
    when 'INDIANA' then 'IN' when 'LOUISIANA' then 'LA'
    when 'NEW MEXICO' then 'NM' when 'OKLAHOMA' then 'OK'
    when 'TENNESSEE' then 'TN' when 'MISSISSIPPI' then 'MS'
    when 'ARKANSAS' then 'AR' when 'MISSOURI' then 'MO'
    when 'NEVADA' then 'NV' when 'GEORGIA' then 'GA'
    when 'AL' then 'AL' when 'AK' then 'AK' when 'AZ' then 'AZ'
    when 'AR' then 'AR' when 'CA' then 'CA' when 'CO' then 'CO'
    when 'CT' then 'CT' when 'DE' then 'DE' when 'FL' then 'FL'
    when 'GA' then 'GA' when 'HI' then 'HI' when 'ID' then 'ID'
    when 'IL' then 'IL' when 'IN' then 'IN' when 'IA' then 'IA'
    when 'KS' then 'KS' when 'KY' then 'KY' when 'LA' then 'LA'
    when 'ME' then 'ME' when 'MD' then 'MD' when 'MA' then 'MA'
    when 'MI' then 'MI' when 'MN' then 'MN' when 'MS' then 'MS'
    when 'MO' then 'MO' when 'MT' then 'MT' when 'NE' then 'NE'
    when 'NV' then 'NV' when 'NH' then 'NH' when 'NJ' then 'NJ'
    when 'NM' then 'NM' when 'NY' then 'NY' when 'NC' then 'NC'
    when 'ND' then 'ND' when 'OH' then 'OH' when 'OK' then 'OK'
    when 'OR' then 'OR' when 'PA' then 'PA' when 'RI' then 'RI'
    when 'SC' then 'SC' when 'SD' then 'SD' when 'TN' then 'TN'
    when 'TX' then 'TX' when 'UT' then 'UT' when 'VT' then 'VT'
    when 'VA' then 'VA' when 'WA' then 'WA' when 'WV' then 'WV'
    when 'WI' then 'WI' when 'WY' then 'WY' when 'DC' then 'DC'
    else null
  end;
end;
$$;

create or replace function public.dispatch_location_city(value text)
returns text
language plpgsql
immutable
parallel safe
as $$
declare
  source text := trim(coalesce(value, ''));
  state_value text;
  without_state text;
  candidate text;
begin
  state_value := public.dispatch_location_state(source);
  if source = '' or state_value is null then return null; end if;

  without_state := trim(regexp_replace(
    source,
    '(?:,\s*|\s+)(NEW MEXICO|MISSISSIPPI|TENNESSEE|LOUISIANA|OKLAHOMA|COLORADO|ILLINOIS|INDIANA|ARKANSAS|MISSOURI|ARIZONA|NEVADA|GEORGIA|TEXAS|[A-Z]{2})(?:\s+\d{5}(?:-\d{4})?)?\s*$',
    '',
    'i'
  ));

  if without_state like '%,%' then
    candidate := trim(regexp_replace(without_state, '^.*,\s*', ''));
  elsif without_state ~* '\mnear\M' then
    candidate := trim(regexp_replace(without_state, '^.*\mnear\M\s+', '', 'i'));
  elsif without_state ~ '[0-9]' or without_state ~* '\m(I-|US-|HWY|HIGHWAY|MM)\M' then
    return null;
  else
    candidate := without_state;
  end if;

  candidate := upper(trim(regexp_replace(candidate, '\s+', ' ', 'g')));
  candidate := replace(candidate, '.', '');
  candidate := case candidate
    when 'FT WORTH' then 'FORT WORTH'
    when 'FT STOCKTON' then 'FORT STOCKTON'
    when 'ALBURQUERQUE' then 'ALBUQUERQUE'
    when 'OKC' then 'OKLAHOMA CITY'
    when 'DFW' then 'DALLAS'
    when 'JOPLIN MS' then 'JOPLIN'
    else candidate
  end;
  return nullif(candidate, '');
end;
$$;

-- Re-derive automatic rows from the preserved Dispatch Board location.
-- Manual rows retain corrections; missing canonical values may still be filled.
with parsed as (
  select
    id,
    public.dispatch_location_city(location) as city,
    public.dispatch_location_state(location) as state
  from public.jobs
)
update public.jobs j
set
  job_city = case
    when coalesce(j.service_area_assignment_method, '') = 'manual'
      then coalesce(nullif(trim(j.job_city), ''), parsed.city)
    else parsed.city
  end,
  job_state = case
    when coalesce(j.service_area_assignment_method, '') = 'manual'
      then coalesce(nullif(trim(j.job_state), ''), case when parsed.city = 'JOPLIN' and parsed.state = 'MS' then 'MO' else parsed.state end)
    else case when parsed.city = 'JOPLIN' and parsed.state = 'MS' then 'MO' else parsed.state end
  end
from parsed
where parsed.id = j.id;

-- Service areas must already be seeded by the preceding coverage migrations.
do $$
declare job_record record;
begin
  if not exists (select 1 from public.service_areas) then
    raise exception 'Seed service areas before running the location backfill';
  end if;
  if to_regprocedure('public.assign_job_service_area(uuid)') is null then
    raise exception 'public.assign_job_service_area(uuid) is required';
  end if;

  for job_record in
    select id from public.jobs
    where coalesce(service_area_assignment_method, '') <> 'manual'
  loop
    perform public.assign_job_service_area(job_record.id);
  end loop;
end $$;

notify pgrst, 'reload schema';
commit;

-- Verification summary.
select
  count(*) as total_jobs,
  count(*) filter (where nullif(trim(location), '') is not null) as jobs_with_location,
  count(*) filter (
    where nullif(trim(job_city), '') is not null
      and nullif(trim(job_state), '') is not null
  ) as jobs_successfully_parsed,
  count(*) filter (where service_area_id is not null) as jobs_assigned_to_an_area,
  count(*) filter (where service_area_id is null) as jobs_still_unassigned
from public.jobs;

-- Top exact cities includes jobs that have no service_area_id.
select job_city, job_state, count(*) as total_jobs
from public.jobs
where nullif(trim(job_city), '') is not null
  and nullif(trim(job_state), '') is not null
group by job_city, job_state
order by total_jobs desc, job_state, job_city
limit 10;

select
  coalesce(sa.area_name, 'Outside Coverage / Unassigned') as service_area,
  count(*) as total_jobs
from public.jobs j
left join public.service_areas sa on sa.id = j.service_area_id
group by coalesce(sa.area_name, 'Outside Coverage / Unassigned')
order by total_jobs desc, service_area;

-- Review uncertain values without altering their original LOCATION text.
select id, location, job_city, job_state
from public.jobs
where nullif(trim(location), '') is not null
  and (job_city is null or job_state is null)
order by id;
