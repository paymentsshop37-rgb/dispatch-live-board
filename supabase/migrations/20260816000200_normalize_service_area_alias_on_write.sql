create or replace function public.normalize_service_area_alias_on_write()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.city := trim(coalesce(new.city, ''));
  new.state := upper(trim(coalesce(new.state, '')));

  if new.city = '' or new.state = '' then
    raise exception 'Alias city and state are required' using errcode = '23514';
  end if;

  new.normalized_city := public.normalize_location_text(new.city);
  new.normalized_state := new.state;
  return new;
end;
$$;

drop trigger if exists service_area_aliases_normalize_on_write on public.service_area_city_aliases;
create trigger service_area_aliases_normalize_on_write
before insert or update on public.service_area_city_aliases
for each row execute function public.normalize_service_area_alias_on_write();
