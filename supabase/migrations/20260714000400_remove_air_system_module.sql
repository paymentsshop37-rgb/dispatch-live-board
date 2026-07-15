drop policy if exists "dispatch users read air system photos" on storage.objects;
drop policy if exists "dispatch users upload air system photos" on storage.objects;
drop policy if exists "dispatch users delete air system photos" on storage.objects;

drop table if exists public.air_system_inspection_photos cascade;
drop table if exists public.air_system_inspections cascade;
