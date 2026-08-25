-- Preserve business and audit history while allowing an administrator to
-- remove a login account and its application profile.

-- These references are attribution fields, not ownership of the records.
-- Keep the records and detach the deleted Auth identity explicitly. Session
-- audit rows intentionally retain their existing ON DELETE CASCADE behavior.
do $$
declare
  reference_item record;
  constraint_record record;
  relation regclass;
begin
  for reference_item in
    select * from (values
      ('flat_rate_categories', 'created_by'),
      ('flat_rate_categories', 'updated_by'),
      ('flat_rate_operations', 'created_by'),
      ('flat_rate_operations', 'updated_by'),
      ('labor_rate_settings', 'created_by'),
      ('labor_rate_settings', 'updated_by'),
      ('city_labor_rates', 'created_by'),
      ('city_labor_rates', 'updated_by'),
      ('job_labor_operations', 'created_by'),
      ('job_labor_operations', 'updated_by'),
      ('flat_rate_audit_log', 'changed_by'),
      ('part_categories', 'created_by'),
      ('part_categories', 'updated_by'),
      ('part_brands', 'created_by'),
      ('part_brands', 'updated_by'),
      ('parts_catalog', 'created_by'),
      ('parts_catalog', 'updated_by'),
      ('part_supplier_prices', 'created_by'),
      ('part_supplier_prices', 'updated_by'),
      ('part_price_history', 'changed_by'),
      ('job_parts', 'created_by'),
      ('estimate_parts', 'created_by'),
      ('parts_audit_log', 'changed_by'),
      ('part_import_batches', 'created_by'),
      ('part_requests', 'requested_by'),
      ('part_requests', 'reviewed_by'),
      ('parts_pricing_settings', 'updated_by'),
      ('part_category_markup_rules', 'updated_by'),
      ('technician_deletion_audit', 'admin_user'),
      ('technician_audit_log', 'actor_user_id')
    ) as explicit_auth_references(table_name, column_name)
  loop
    relation := to_regclass(format('public.%I', reference_item.table_name));
    if relation is null then
      continue;
    end if;

    if not exists (
      select 1 from pg_attribute
      where attrelid = relation
        and attname = reference_item.column_name
        and not attisdropped
    ) then
      continue;
    end if;

    execute format(
      'alter table public.%I alter column %I drop not null',
      reference_item.table_name,
      reference_item.column_name
    );

    for constraint_record in
      select constraint_definition.conname
      from pg_constraint constraint_definition
      join unnest(constraint_definition.conkey) as constrained_column(attnum) on true
      join pg_attribute attribute_definition
        on attribute_definition.attrelid = constraint_definition.conrelid
       and attribute_definition.attnum = constrained_column.attnum
      where constraint_definition.contype = 'f'
        and constraint_definition.conrelid = relation
        and constraint_definition.confrelid = 'auth.users'::regclass
        and attribute_definition.attname = reference_item.column_name
    loop
      execute format(
        'alter table public.%I drop constraint %I',
        reference_item.table_name,
        constraint_record.conname
      );
    end loop;

    execute format(
      'alter table public.%I add constraint %I foreign key (%I) references auth.users(id) on delete set null',
      reference_item.table_name,
      reference_item.table_name || '_' || reference_item.column_name || '_fkey',
      reference_item.column_name
    );
  end loop;
end
$$;

-- FK-driven app_users detachment is the only mutation allowed here. Business
-- values and immutable history remain unchanged.
create or replace function public.protect_paid_technician_payment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(current_setting('app.user_profile_delete', true), '') = 'on'
     and old.tech_payment_paid_by is not null
     and new.tech_payment_paid_by is null
     and new.tech_payment_paid_at is not distinct from old.tech_payment_paid_at
     and new.tech_payment_status is not distinct from old.tech_payment_status then
    return new;
  end if;

  if (
    new.tech_payment_paid_at is distinct from old.tech_payment_paid_at
    or new.tech_payment_paid_by is distinct from old.tech_payment_paid_by
    or (
      lower(trim(coalesce(new.tech_payment_status, ''))) = 'paid'
      and lower(trim(coalesce(old.tech_payment_status, ''))) <> 'paid'
    )
  ) and coalesce(current_setting('app.tech_payment_rpc', true), '') <> 'on' then
    raise exception 'Technician payments must be completed through the audited payment action.';
  end if;
  return new;
end;
$$;

create or replace function public.prevent_technician_payment_audit_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and coalesce(current_setting('app.user_profile_delete', true), '') = 'on'
     and old.performed_by is not null
     and new.performed_by is null
     and (to_jsonb(new) - 'performed_by') = (to_jsonb(old) - 'performed_by') then
    return new;
  end if;
  raise exception 'Technician payment audit history is immutable.';
end;
$$;

create or replace function public.prevent_accounting_transaction_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  old_row jsonb := to_jsonb(old);
  new_row jsonb := to_jsonb(new);
begin
  if tg_op = 'UPDATE'
     and coalesce(current_setting('app.user_profile_delete', true), '') = 'on'
     and (
       (old_row->>'recorded_by' is not null and new_row->>'recorded_by' is null)
       or (old_row->>'created_by' is not null and new_row->>'created_by' is null)
       or (old_row->>'voided_by' is not null and new_row->>'voided_by' is null)
     )
     and (new_row - 'recorded_by' - 'created_by' - 'voided_by' - 'updated_at')
       = (old_row - 'recorded_by' - 'created_by' - 'voided_by' - 'updated_at') then
    return new;
  end if;

  if tg_op = 'DELETE' or coalesce(current_setting('app.accounting_void_rpc', true), '') <> 'on' then
    raise exception using errcode='42501', message='Accounting transactions are immutable. Use the authorized void action.';
  end if;
  return new;
end;
$$;

create or replace function public.prevent_accounting_audit_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and coalesce(current_setting('app.safe_job_delete', true), '') = 'on'
     and old.job_id is not null
     and new.job_id is null
     and (to_jsonb(new) - 'job_id') = (to_jsonb(old) - 'job_id') then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and coalesce(current_setting('app.user_profile_delete', true), '') = 'on'
     and old.performed_by is not null
     and new.performed_by is null
     and (to_jsonb(new) - 'performed_by') = (to_jsonb(old) - 'performed_by') then
    return new;
  end if;

  raise exception 'Accounting audit history is immutable.';
end;
$$;

-- The Edge Function calls this with the authenticated caller's Auth UUID.
-- It rechecks admin authorization in the database and performs all app_users
-- FK detachment in one transaction.
create or replace function public.delete_app_user_profile(
  p_profile_id uuid,
  p_actor_auth_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_profile public.app_users%rowtype;
begin
  select * into actor_profile
  from public.app_users
  where (auth_user_id = p_actor_auth_user_id or id = p_actor_auth_user_id)
    and lower(coalesce(status::text, '')) = 'active'
    and lower(role::text) = 'admin'
  limit 1;

  if actor_profile.id is null then
    raise exception using errcode = '42501', message = 'Admin access required.';
  end if;
  if actor_profile.id = p_profile_id then
    raise exception using errcode = '22023', message = 'Administrators cannot delete their own profile.';
  end if;

  perform set_config('app.user_profile_delete', 'on', true);
  delete from public.app_users where id = p_profile_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'User profile not found.';
  end if;
end;
$$;

revoke all on function public.delete_app_user_profile(uuid, uuid) from public;
revoke all on function public.delete_app_user_profile(uuid, uuid) from anon;
revoke all on function public.delete_app_user_profile(uuid, uuid) from authenticated;
grant execute on function public.delete_app_user_profile(uuid, uuid) to service_role;

comment on function public.delete_app_user_profile(uuid, uuid) is
  'Deletes one app_users profile transactionally after server-side admin verification, preserving dependent history by nulling attribution FKs.';

notify pgrst, 'reload schema';
