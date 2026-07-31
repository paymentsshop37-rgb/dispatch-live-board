create table if not exists public.ai_labor_guide_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default true,
  allowed_roles text[] not null default array['admin','supervisor','dispatcher','technician_manager'],
  max_requests_per_user_per_day integer not null default 100 check (max_requests_per_user_per_day between 1 and 1000),
  require_job_before_attach boolean not null default true,
  require_supervisor_for_low_confidence boolean not null default true,
  disclaimer text not null default 'AI-generated labor-time estimate for dispatch guidance only. Actual repair time may vary based on vehicle configuration, condition, access, corrosion, diagnosis and roadside conditions.',
  updated_by uuid,
  updated_at timestamptz not null default now()
);

insert into public.ai_labor_guide_settings (id) values (true) on conflict (id) do nothing;

create table if not exists public.ai_labor_estimates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  user_email text,
  user_name text,
  job_id uuid references public.jobs(id) on delete set null,
  question text not null,
  vehicle_type text,
  year text,
  make text,
  model text,
  engine text,
  axle_position text,
  component_location text,
  service_context text,
  component_count text,
  service_name text not null,
  estimated_hours numeric(8,2) not null check (estimated_hours >= 0 and mod(estimated_hours * 100, 25) = 0),
  minimum_hours numeric(8,2) not null check (minimum_hours >= 0 and mod(minimum_hours * 100, 25) = 0),
  maximum_hours numeric(8,2) not null check (maximum_hours >= minimum_hours and mod(maximum_hours * 100, 25) = 0),
  diagnostic_hours numeric(8,2) not null default 0 check (diagnostic_hours >= 0 and mod(diagnostic_hours * 100, 25) = 0),
  difficulty text not null,
  confidence_level text not null check (confidence_level in ('HIGH','MODERATE','LOW')),
  assumptions jsonb not null default '[]',
  included_operations jsonb not null default '[]',
  excluded_operations jsonb not null default '[]',
  factors_that_increase_time jsonb not null default '[]',
  related_repairs jsonb not null default '[]',
  required_information jsonb not null default '[]',
  safety_warning text not null,
  estimate_summary text not null,
  exact_ai_response jsonb not null,
  ai_model text not null,
  prompt_version text not null,
  request_fingerprint text not null,
  cached_from_estimate_id uuid references public.ai_labor_estimates(id) on delete set null,
  generated_at timestamptz not null default now(),
  attached_to_job boolean not null default false,
  attached_at timestamptz,
  approval_status text not null default 'pending' check (approval_status in ('pending','approved','rejected')),
  approved_by uuid,
  approved_at timestamptz,
  review_notes text
);

create index if not exists ai_labor_estimates_generated_idx on public.ai_labor_estimates (generated_at desc);
create index if not exists ai_labor_estimates_user_idx on public.ai_labor_estimates (user_id, generated_at desc);
create index if not exists ai_labor_estimates_job_idx on public.ai_labor_estimates (job_id, generated_at desc);
create index if not exists ai_labor_estimates_service_idx on public.ai_labor_estimates (service_name);
create index if not exists ai_labor_estimates_fingerprint_idx on public.ai_labor_estimates (request_fingerprint, generated_at desc);

create or replace function public.current_app_role()
returns text language sql stable security definer set search_path = ''
as $$
  select lower(role::text) from public.app_users
  where (auth_user_id = auth.uid() or id = auth.uid()) and status = 'Active' limit 1
$$;

create or replace function public.can_use_ai_labor_guide()
returns boolean language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select enabled and public.current_app_role() = any(allowed_roles)
     from public.ai_labor_guide_settings where id = true), false
  )
$$;

revoke all on function public.current_app_role() from public;
revoke all on function public.can_use_ai_labor_guide() from public;
grant execute on function public.current_app_role(), public.can_use_ai_labor_guide() to authenticated;

alter table public.ai_labor_estimates enable row level security;
alter table public.ai_labor_guide_settings enable row level security;

create policy "authorized roles read ai estimates" on public.ai_labor_estimates
for select to authenticated using (public.can_use_ai_labor_guide());

create policy "requester inserts own ai estimates" on public.ai_labor_estimates
for insert to authenticated with check (public.can_use_ai_labor_guide() and user_id = auth.uid());

create policy "authorized roles update review state" on public.ai_labor_estimates
for update to authenticated using (public.can_use_ai_labor_guide())
with check (public.can_use_ai_labor_guide());

create policy "authorized roles read ai settings" on public.ai_labor_guide_settings
for select to authenticated using (public.can_use_ai_labor_guide() or public.current_app_role() = 'admin');

create policy "admins update ai settings" on public.ai_labor_guide_settings
for update to authenticated using (public.current_app_role() = 'admin')
with check (public.current_app_role() = 'admin');

create or replace function public.protect_ai_labor_original()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if row(
    old.user_id, old.question, old.vehicle_type, old.year, old.make, old.model, old.engine,
    old.axle_position, old.component_location, old.service_context, old.component_count,
    old.service_name, old.estimated_hours, old.minimum_hours, old.maximum_hours,
    old.diagnostic_hours, old.difficulty, old.confidence_level, old.assumptions,
    old.included_operations, old.excluded_operations, old.factors_that_increase_time,
    old.related_repairs, old.required_information, old.safety_warning, old.estimate_summary,
    old.exact_ai_response, old.ai_model, old.prompt_version, old.generated_at
  ) is distinct from row(
    new.user_id, new.question, new.vehicle_type, new.year, new.make, new.model, new.engine,
    new.axle_position, new.component_location, new.service_context, new.component_count,
    new.service_name, new.estimated_hours, new.minimum_hours, new.maximum_hours,
    new.diagnostic_hours, new.difficulty, new.confidence_level, new.assumptions,
    new.included_operations, new.excluded_operations, new.factors_that_increase_time,
    new.related_repairs, new.required_information, new.safety_warning, new.estimate_summary,
    new.exact_ai_response, new.ai_model, new.prompt_version, new.generated_at
  ) then raise exception 'Original AI estimate fields are immutable'; end if;
  if public.current_app_role() not in ('admin','supervisor') and
     (old.approval_status is distinct from new.approval_status or old.approved_by is distinct from new.approved_by or old.approved_at is distinct from new.approved_at)
  then raise exception 'Supervisor approval required'; end if;
  if public.current_app_role() = 'dispatcher' and old.review_notes is distinct from new.review_notes
  then raise exception 'Review-note access required'; end if;
  return new;
end;
$$;

drop trigger if exists protect_ai_labor_original on public.ai_labor_estimates;
create trigger protect_ai_labor_original before update on public.ai_labor_estimates
for each row execute function public.protect_ai_labor_original();

grant select, insert, update on public.ai_labor_estimates to authenticated;
grant select, update on public.ai_labor_guide_settings to authenticated;
notify pgrst, 'reload schema';
