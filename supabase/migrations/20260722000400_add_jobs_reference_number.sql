alter table public.jobs
  add column if not exists reference_number text;

create index if not exists jobs_reference_number_idx
  on public.jobs (reference_number);
