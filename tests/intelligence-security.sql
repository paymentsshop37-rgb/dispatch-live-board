-- Run against the configured database with psql. Every profile change rolls back.
\set ON_ERROR_STOP on
begin;
select auth_user_id as cfo_uuid, app_user_id as cfo_profile from public.intelligence_cfo_account \gset
select auth_user_id as admin_uuid from public.app_users where role='admin' and status='Active' and auth_user_id is not null order by created_at limit 1 \gset
update public.app_users set force_password_change=true where id=:'cfo_profile';

do $$ begin
  if has_table_privilege('authenticated','public.intelligence_cfo_account','INSERT')
    or has_table_privilege('authenticated','public.intelligence_cfo_account','UPDATE')
    or has_table_privilege('anon','public.intelligence_cfo_account','SELECT')
    or has_function_privilege('anon','public.get_intelligence_page(text,integer,integer)','EXECUTE') then
    raise exception 'CFO configuration or dataset privileges are too broad.';
  end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claims', jsonb_build_object('sub', :'cfo_uuid', 'role','authenticated')::text, true) as claims \gset
do $$ begin
  if public.can_access_intelligence() then raise exception 'First-login password change was bypassed.'; end if;
end $$;
update public.app_users set force_password_change=false where auth_user_id=auth.uid();
do $$ declare page jsonb; begin
  if not public.can_access_intelligence() then raise exception 'Bound CFO access was denied.'; end if;
  page := public.get_intelligence_page('jobs',0,1);
  if jsonb_typeof(page) <> 'array' or jsonb_array_length(page)>1 then raise exception 'Invalid job page.'; end if;
  page := public.get_intelligence_page('technicians',0,1);
  if page->0 ?| array['phone','email','notes','w9','insurance'] then raise exception 'Private technician fields leaked.'; end if;
  begin perform public.get_intelligence_page('app_users',0,1); raise exception 'Dataset allowlist bypassed.'; exception when invalid_parameter_value then null; end;
  begin perform public.get_intelligence_page('jobs',0,501); raise exception 'Page bound bypassed.'; exception when invalid_parameter_value then null; end;
end $$;

select set_config('request.jwt.claims', jsonb_build_object('sub', :'admin_uuid', 'role','authenticated')::text, true) as claims \gset
do $$ begin
  if public.can_access_intelligence() then raise exception 'Admin account was allowed into Intelligence.'; end if;
  begin perform public.get_intelligence_page('jobs',0,1); raise exception 'Admin fetched CFO dataset.'; exception when insufficient_privilege then null; end;
  begin
    update public.app_users set username='changed-cfo' where lower(role)='cfo';
    raise exception 'Admin changed protected CFO profile.';
  exception when insufficient_privilege then null; end;
end $$;
rollback;
select 'PASS: exclusive identity, password gate, datasets, pagination, technician privacy and Admin denial; changes rolled back' as result;
