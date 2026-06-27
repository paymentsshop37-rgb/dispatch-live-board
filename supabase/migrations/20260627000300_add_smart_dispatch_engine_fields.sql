-- Sprint 9 - Smart Dispatch Engine fields.

alter table public.jobs
  add column if not exists technician_id uuid references public.technicians(id) on delete set null,
  add column if not exists assigned_at timestamptz,
  add column if not exists requested_service text,
  add column if not exists dispatcher_phone text;

alter table public.technicians
  add column if not exists current_job_id uuid references public.jobs(id) on delete set null,
  add column if not exists availability text not null default 'Available';

do $$
begin
  if exists (
    select 1 from pg_constraint where conname = 'technicians_availability_status_check'
  ) then
    alter table public.technicians drop constraint technicians_availability_status_check;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'technicians_availability_check'
  ) then
    alter table public.technicians
      add constraint technicians_availability_check
      check (availability in ('Available', 'Busy', 'Traveling', 'On Site', 'Completed', 'Off Duty', 'Offline'));
  end if;
end $$;

create index if not exists idx_jobs_technician_id
  on public.jobs (technician_id);

create index if not exists idx_jobs_assigned_at
  on public.jobs (assigned_at);

create index if not exists idx_jobs_requested_service
  on public.jobs (requested_service);

create index if not exists idx_technicians_current_job_id
  on public.technicians (current_job_id);

create index if not exists idx_technicians_availability
  on public.technicians (availability);
