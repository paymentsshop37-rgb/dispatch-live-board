alter table public.job_files add column if not exists document_type text default 'Job photo';

alter table public.job_files enable row level security;

drop policy if exists "active users read job files" on public.job_files;
drop policy if exists "active users insert job files" on public.job_files;
drop policy if exists "active users delete job files" on public.job_files;

create policy "active users read job files"
  on public.job_files for select
  to authenticated
  using (public.is_active_app_user());

create policy "active users insert job files"
  on public.job_files for insert
  to authenticated
  with check (public.is_active_app_user());

create policy "active users delete job files"
  on public.job_files for delete
  to authenticated
  using (public.is_active_app_user());

drop policy if exists "active users upload job photos" on storage.objects;
drop policy if exists "active users update job photos" on storage.objects;
drop policy if exists "active users delete job photos" on storage.objects;
drop policy if exists "active users read job photos" on storage.objects;

create policy "active users read job photos"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'job-photos' and public.is_active_app_user());

create policy "active users upload job photos"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'job-photos' and public.is_active_app_user());

create policy "active users update job photos"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'job-photos' and public.is_active_app_user())
  with check (bucket_id = 'job-photos' and public.is_active_app_user());

create policy "active users delete job photos"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'job-photos' and public.is_active_app_user());
