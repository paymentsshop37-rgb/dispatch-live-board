alter table public.technicians
  add column if not exists assigned_number integer;

create unique index if not exists technicians_assigned_number_idx
  on public.technicians (assigned_number)
  where assigned_number is not null;

alter table public.technicians
  drop constraint if exists technicians_assigned_number_positive;

alter table public.technicians
  add constraint technicians_assigned_number_positive
  check (assigned_number is null or assigned_number >= 1);
