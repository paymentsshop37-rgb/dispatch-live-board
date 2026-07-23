alter table public.jobs
  add column if not exists tech_payment_status text default 'Pending';
