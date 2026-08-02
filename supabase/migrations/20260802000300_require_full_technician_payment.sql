-- Technician payouts are job-level settlements. Requiring the exact remaining
-- balance keeps the pending queue and transaction ledger in one reconciled state.
create or replace function public.record_technician_payment_transaction(
  p_job_id uuid, p_payment_date date, p_amount numeric, p_payment_method text default null,
  p_confirmation_number text default null, p_notes text default null
)
returns public.technician_payment_transactions
language plpgsql security definer set search_path = ''
as $$
declare v_actor public.app_users%rowtype; v_job public.jobs%rowtype; v_settings public.accounting_settings%rowtype; v_tx public.technician_payment_transactions%rowtype; v_paid numeric;
begin
  select * into v_actor from public.app_users where (auth_user_id=auth.uid() or id=auth.uid()) and status='Active' limit 1;
  if v_actor.id is null or not (lower(v_actor.role::text)='admin' or (lower(v_actor.role::text)='technician_manager' and v_actor.can_view_tech_payments and v_actor.can_mark_tech_payments_paid)) then raise exception using errcode='42501', message='Technician payment authority required.'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Payment amount must be greater than zero.'; end if;
  if p_payment_date is null then raise exception 'Payment date is required.'; end if;
  select * into v_job from public.jobs where id=p_job_id for update;
  if v_job.id is null then raise exception using errcode='P0002', message='Job not found.'; end if;
  select * into v_settings from public.accounting_settings where singleton;
  if lower(v_actor.role::text)='technician_manager' and v_settings.technician_approval_threshold is not null and p_amount>v_settings.technician_approval_threshold then raise exception 'Payment exceeds the technician manager approval threshold.'; end if;
  select coalesce(sum(amount),0) into v_paid from public.technician_payment_transactions where job_id=v_job.id and voided_at is null;
  if v_paid+p_amount <> coalesce(v_job.tech_labor,0) then raise exception 'Payment must equal the remaining technician balance.'; end if;
  if v_settings.require_confirmation_number and nullif(trim(coalesce(p_confirmation_number,'')),'') is null then raise exception 'Confirmation number is required.'; end if;
  if v_settings.require_payment_notes and nullif(trim(coalesce(p_notes,'')),'') is null then raise exception 'Payment notes are required.'; end if;
  insert into public.technician_payment_transactions(job_id,technician_id,technician_name,amount,payment_date,payment_method,confirmation_number,notes,created_by)
  values(v_job.id,v_job.technician_id,v_job.tech,p_amount,p_payment_date,nullif(trim(p_payment_method),''),nullif(trim(p_confirmation_number),''),nullif(trim(p_notes),''),v_actor.id) returning * into v_tx;
  perform set_config('app.tech_payment_rpc','on',true);
  update public.jobs set tech_payment_status='Paid',tech_payment_paid_at=now(),tech_payment_paid_by=v_actor.id where id=v_job.id;
  insert into public.technician_payment_audit(job_id,previous_status,new_status,amount,technician,performed_by,performed_by_name,performed_at)
  values(v_job.id,coalesce(v_job.tech_payment_status,''),'Paid',p_amount,coalesce(nullif(trim(v_job.tech),''),'Unassigned'),v_actor.id,coalesce(nullif(v_actor.name,''),v_actor.username,'User'),now());
  insert into public.accounting_audit_log(action,record_type,record_id,job_id,performed_by,performed_by_name,new_value)
  values('Technician payment created','technician_payment',v_tx.id::text,v_job.id,v_actor.id,coalesce(nullif(v_actor.name,''),v_actor.username,'User'),to_jsonb(v_tx));
  return v_tx;
end;
$$;

revoke all on function public.record_technician_payment_transaction(uuid,date,numeric,text,text,text) from public;
grant execute on function public.record_technician_payment_transaction(uuid,date,numeric,text,text,text) to authenticated;
