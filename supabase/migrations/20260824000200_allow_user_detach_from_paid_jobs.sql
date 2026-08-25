-- Preserve paid-job history when an app user profile is deleted. The active
-- jobs trigger calls protect_technician_payment_fields (not the older
-- protect_paid_technician_payment function).
create or replace function public.protect_technician_payment_fields()
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
    new.tech_payment_status is distinct from old.tech_payment_status
    or new.tech_payment_paid_at is distinct from old.tech_payment_paid_at
    or new.tech_payment_paid_by is distinct from old.tech_payment_paid_by
  ) and coalesce(current_setting('app.tech_payment_rpc', true), '') <> 'on' then
    raise exception using
      errcode = '42501',
      message = 'Technician payment fields must be updated through the authorized payment action.';
  end if;
  return new;
end;
$$;

comment on function public.protect_technician_payment_fields() is
  'Protects audited Tech Payment fields while allowing FK-only payer detachment during the transactional app-user deletion RPC.';
