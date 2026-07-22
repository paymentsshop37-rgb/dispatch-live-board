create table if not exists public.session_audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  user_name text not null,
  role text not null,
  login_time timestamptz not null default now(),
  logout_time timestamptz,
  logout_reason text,
  session_duration integer,
  browser text,
  device text,
  created_at timestamptz not null default now(),
  constraint session_audit_logout_reason_check check (
    logout_reason is null or logout_reason in (
      'manual_logout',
      'inactivity_timeout',
      'internet_connection_lost',
      'network_changed',
      'session_invalid',
      'admin_forced_logout'
    )
  ),
  constraint session_audit_duration_check check (session_duration is null or session_duration >= 0)
);

create index if not exists session_audit_user_time_idx
  on public.session_audit_log (user_id, login_time desc);

alter table public.session_audit_log enable row level security;

drop policy if exists "users insert own session audit" on public.session_audit_log;
create policy "users insert own session audit"
  on public.session_audit_log for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "users update own session audit" on public.session_audit_log;
create policy "users update own session audit"
  on public.session_audit_log for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "admins read session audit" on public.session_audit_log;
create policy "admins read session audit"
  on public.session_audit_log for select
  to authenticated
  using (public.is_active_admin());

grant insert, update, select on public.session_audit_log to authenticated;
