alter table public.air_system_inspections add column if not exists failure_type text;
alter table public.air_system_inspections add column if not exists diagnostic_results jsonb default '[]'::jsonb;
alter table public.air_system_inspections add column if not exists required_parts text;
