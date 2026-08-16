-- Every service area uses one fixed 150-mile radius. Keep the application and
-- database invariant aligned, including writes made outside the dashboard.
update public.service_areas
set coverage_radius_miles = 150
where coverage_radius_miles is distinct from 150;

alter table public.service_areas
  alter column coverage_radius_miles set default 150;

create or replace function public.enforce_service_area_radius_150()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.coverage_radius_miles := 150;
  return new;
end;
$$;

drop trigger if exists service_areas_enforce_radius_150 on public.service_areas;
create trigger service_areas_enforce_radius_150
before insert or update of coverage_radius_miles on public.service_areas
for each row execute function public.enforce_service_area_radius_150();
