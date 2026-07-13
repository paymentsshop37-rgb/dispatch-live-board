drop policy if exists "Allow app users read" on public.app_users;
drop policy if exists "Allow app users insert" on public.app_users;
drop policy if exists "Allow app users update" on public.app_users;

alter table public.jobs enable row level security;

drop policy if exists "active users read jobs" on public.jobs;
drop policy if exists "active users insert jobs" on public.jobs;
drop policy if exists "active users update jobs" on public.jobs;
drop policy if exists "active users delete jobs" on public.jobs;

create policy "active users read jobs"
  on public.jobs for select
  to authenticated
  using (public.is_active_app_user());

create policy "active users insert jobs"
  on public.jobs for insert
  to authenticated
  with check (public.is_active_app_user());

create policy "active users update jobs"
  on public.jobs for update
  to authenticated
  using (public.is_active_app_user())
  with check (public.is_active_app_user());

create policy "active users delete jobs"
  on public.jobs for delete
  to authenticated
  using (public.is_active_app_user());

alter table public.change_logs enable row level security;

drop policy if exists "active users read change logs" on public.change_logs;
drop policy if exists "active users insert change logs" on public.change_logs;

create policy "active users read change logs"
  on public.change_logs for select
  to authenticated
  using (public.is_active_app_user());

create policy "active users insert change logs"
  on public.change_logs for insert
  to authenticated
  with check (public.is_active_app_user());
