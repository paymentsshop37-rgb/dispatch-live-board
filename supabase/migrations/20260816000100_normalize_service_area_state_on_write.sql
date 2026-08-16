create or replace function public.normalize_service_area_state_on_write()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  normalized_state_value text;
begin
  normalized_state_value := upper(trim(coalesce(new.state, '')));

  if normalized_state_value = '' then
    raise exception 'State is required' using errcode = '23514';
  end if;

  new.state := normalized_state_value;
  new.normalized_state := normalized_state_value;
  return new;
end;
$$;

drop trigger if exists service_areas_normalize_state_on_write on public.service_areas;
create trigger service_areas_normalize_state_on_write
before insert or update on public.service_areas
for each row execute function public.normalize_service_area_state_on_write();
