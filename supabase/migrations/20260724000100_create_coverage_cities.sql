create table if not exists public.coverage_cities (
  id uuid primary key default gen_random_uuid(),
  city text not null,
  state text not null,
  normalized_city text not null,
  is_active boolean not null default true,
  region text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (normalized_city, state)
);

create index if not exists coverage_cities_active_state_city_idx
  on public.coverage_cities (is_active, state, normalized_city);

insert into public.coverage_cities (city, state, normalized_city, is_active)
select distinct
  trim(city),
  upper(trim(state)),
  regexp_replace(
    replace(
      replace(
        regexp_replace(upper(trim(city)), '^FT[.]?[[:space:]]+', 'FORT '),
        'ALBURQUERQUE',
        'ALBUQUERQUE'
      ),
      '.',
      ''
    ),
    '[[:space:]]+',
    ' ',
    'g'
  ),
  true
from public.technicians
where is_active = true
  and nullif(trim(city), '') is not null
  and nullif(trim(state), '') is not null
on conflict (normalized_city, state) do nothing;

alter table public.coverage_cities enable row level security;

drop policy if exists "active users read coverage cities" on public.coverage_cities;
create policy "active users read coverage cities"
  on public.coverage_cities for select
  to authenticated
  using (public.is_active_app_user());

drop policy if exists "admins insert coverage cities" on public.coverage_cities;
create policy "admins insert coverage cities"
  on public.coverage_cities for insert
  to authenticated
  with check (public.is_active_admin());

drop policy if exists "admins update coverage cities" on public.coverage_cities;
create policy "admins update coverage cities"
  on public.coverage_cities for update
  to authenticated
  using (public.is_active_admin())
  with check (public.is_active_admin());

drop policy if exists "admins delete coverage cities" on public.coverage_cities;
create policy "admins delete coverage cities"
  on public.coverage_cities for delete
  to authenticated
  using (public.is_active_admin());

grant select, insert, update, delete on public.coverage_cities to authenticated;
