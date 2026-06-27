-- Sprint 8 - Dispatch-ready technician management fields.
-- Existing technicians table is preserved; this only adds optional CRM/dispatch columns.

alter table public.technicians
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by text,
  add column if not exists rejected_at timestamptz,
  add column if not exists rejected_reason text,
  add column if not exists inactive_at timestamptz,
  add column if not exists availability_status text not null default 'Available',
  add column if not exists profile_photo_url text,
  add column if not exists coverage text,
  add column if not exists acceptance_rate numeric(5, 2) not null default 0,
  add column if not exists average_eta integer,
  add column if not exists dot_certificate_url text,
  add column if not exists bank_zelle_info text,
  add column if not exists signed_agreement_url text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'technicians_availability_status_check'
  ) then
    alter table public.technicians
      add constraint technicians_availability_status_check
      check (availability_status in ('Available', 'Busy', 'Off Duty', 'Offline'));
  end if;
end $$;

create index if not exists idx_technicians_status
  on public.technicians (status);

create index if not exists idx_technicians_availability_status
  on public.technicians (availability_status);

create index if not exists idx_technicians_city_state
  on public.technicians (city, state);
