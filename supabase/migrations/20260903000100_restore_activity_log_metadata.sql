alter table public.activity_log
  add column if not exists metadata jsonb;

comment on column public.activity_log.metadata is
  'Structured, non-secret operational audit details. Passwords and tokens must never be stored here.';
