alter table public.jobs
  add column if not exists internal_control_color text;

alter table public.jobs
  drop constraint if exists jobs_internal_control_color_check;

alter table public.jobs
  add constraint jobs_internal_control_color_check
  check (
    internal_control_color is null
    or internal_control_color in ('yellow', 'orange', 'blue', 'purple', 'green', 'red', 'brown', 'gray')
  );

create index if not exists jobs_internal_control_color_idx
  on public.jobs (internal_control_color);

comment on column public.jobs.internal_control_color is
  'Internal Dispatch workflow color only; does not modify operational, payment, technician, document, or financial statuses.';
