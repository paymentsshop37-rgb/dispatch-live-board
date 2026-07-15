alter table public.air_system_inspections
  add column if not exists svg_component_id text,
  add column if not exists related_line_ids text[] default '{}'::text[];

create index if not exists idx_air_system_inspections_svg_component_id
  on public.air_system_inspections (svg_component_id);
