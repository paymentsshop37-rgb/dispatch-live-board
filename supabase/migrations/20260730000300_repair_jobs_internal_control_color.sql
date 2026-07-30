alter table public.jobs
  add column if not exists internal_control_color text;

alter table public.jobs
  drop constraint if exists jobs_internal_control_color_check;

alter table public.jobs
  add constraint jobs_internal_control_color_check
  check (
    internal_control_color is null
    or internal_control_color in (
      'none',
      'yellow',
      'orange',
      'blue',
      'purple',
      'green',
      'red',
      'brown',
      'gray'
    )
  );

alter table public.jobs
  alter column internal_control_color set default 'none';

update public.jobs
set internal_control_color = 'none'
where internal_control_color is null;

notify pgrst, 'reload schema';
