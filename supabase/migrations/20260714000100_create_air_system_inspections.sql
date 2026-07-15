create table if not exists public.air_system_inspections (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references public.jobs(id) on delete set null,
  created_by uuid references public.app_users(id) on delete set null,
  assigned_technician_id uuid references public.technicians(id) on delete set null,
  vehicle_section text,
  component_key text not null,
  component_name text not null,
  component_name_es text,
  condition text,
  symptoms text,
  possible_causes text,
  recommendation text,
  dispatcher_notes text,
  primary_psi numeric default 0,
  secondary_psi numeric default 0,
  trailer_psi numeric default 0,
  simulation_type text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.air_system_inspection_photos (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.air_system_inspections(id) on delete cascade,
  storage_path text not null,
  uploaded_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_air_system_inspections_job_id
  on public.air_system_inspections (job_id);
create index if not exists idx_air_system_inspections_component
  on public.air_system_inspections (component_key);
create index if not exists idx_air_system_inspection_photos_inspection_id
  on public.air_system_inspection_photos (inspection_id);

create or replace function public.set_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists air_system_inspections_set_updated_at on public.air_system_inspections;
create trigger air_system_inspections_set_updated_at
  before update on public.air_system_inspections
  for each row execute function public.set_updated_at();

create or replace function public.is_active_dispatch_user() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(
    select 1
    from public.app_users
    where (auth_user_id = auth.uid() or id = auth.uid())
      and status = 'Active'
      and role in ('admin', 'dispatcher')
  );
$$;

revoke all on function public.is_active_dispatch_user() from public;
grant execute on function public.is_active_dispatch_user() to authenticated;

alter table public.air_system_inspections enable row level security;
alter table public.air_system_inspection_photos enable row level security;

drop policy if exists "dispatch users manage air inspections" on public.air_system_inspections;
drop policy if exists "dispatch users manage air inspection photos" on public.air_system_inspection_photos;

create policy "dispatch users manage air inspections"
  on public.air_system_inspections for all
  to authenticated
  using (public.is_active_dispatch_user())
  with check (public.is_active_dispatch_user());

create policy "dispatch users manage air inspection photos"
  on public.air_system_inspection_photos for all
  to authenticated
  using (public.is_active_dispatch_user())
  with check (public.is_active_dispatch_user());

insert into storage.buckets (id, name, public)
values ('air-system-photos', 'air-system-photos', true)
on conflict (id) do nothing;

drop policy if exists "dispatch users read air system photos" on storage.objects;
drop policy if exists "dispatch users upload air system photos" on storage.objects;
drop policy if exists "dispatch users delete air system photos" on storage.objects;

create policy "dispatch users read air system photos"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'air-system-photos' and public.is_active_dispatch_user());

create policy "dispatch users upload air system photos"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'air-system-photos' and public.is_active_dispatch_user());

create policy "dispatch users delete air system photos"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'air-system-photos' and public.is_active_dispatch_user());
