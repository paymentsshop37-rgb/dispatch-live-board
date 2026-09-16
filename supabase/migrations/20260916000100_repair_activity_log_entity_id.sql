-- activity_log is polymorphic: legacy entities used numeric IDs, while users,
-- jobs, and technicians use UUIDs. CREATE TABLE IF NOT EXISTS did not reconcile
-- the deployed bigint column with the original UUID declaration.
-- Preserve every existing reference and support both representations.
begin;
set local lock_timeout = '5s';
alter table public.activity_log
  alter column entity_id type text using entity_id::text;
comment on column public.activity_log.entity_id is
  'Entity identifier as text; supports UUID and legacy numeric IDs. Interpreted together with entity_type.';
notify pgrst, 'reload schema';
commit;
