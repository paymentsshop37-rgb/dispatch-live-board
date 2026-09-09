-- These authorization functions depend only on the caller, not on an alias row.
-- Scalar subqueries make PostgreSQL evaluate them once per statement (InitPlan),
-- instead of performing app_users lookups for every alias before sorting.
-- Keep the exact same read/write permissions and existing alias data.
alter policy "active users read service area aliases" on public.service_area_city_aliases
  using ((select public.nttr_is_active_app_user()));
alter policy "admins manage service area aliases" on public.service_area_city_aliases
  using ((select public.nttr_is_active_admin()))
  with check ((select public.nttr_is_active_admin()));
alter policy "only admins insert aliases" on public.service_area_city_aliases
  with check ((select public.nttr_is_active_admin()));
alter policy "only admins update aliases" on public.service_area_city_aliases
  using ((select public.nttr_is_active_admin()))
  with check ((select public.nttr_is_active_admin()));
alter policy "only admins delete aliases" on public.service_area_city_aliases
  using ((select public.nttr_is_active_admin()));

create index if not exists service_area_alias_read_page_idx
  on public.service_area_city_aliases(created_at, id);
