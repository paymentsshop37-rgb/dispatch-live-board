alter table public.app_users
  add column if not exists can_export_financial_reports boolean not null default false;

comment on column public.app_users.can_export_financial_reports is
  'Explicitly allows a Technician Manager to export financial NTTR reports. Administrators are authorized by role.';
