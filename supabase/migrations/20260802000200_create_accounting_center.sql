-- NTTR Accounting Center: transaction-grade receivables, technician payments,
-- settings, audit history, restricted reporting endpoints, and reporting indexes.

alter table public.jobs
  add column if not exists invoice_date date,
  add column if not exists invoice_due_date date,
  add column if not exists payment_terms_days integer,
  add column if not exists customer_payment_status text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'jobs_payment_terms_days_check') then
    alter table public.jobs add constraint jobs_payment_terms_days_check
      check (payment_terms_days is null or payment_terms_days between 0 and 3650);
  end if;
end $$;

create table if not exists public.invoice_payments (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete restrict,
  invoice_number text,
  payment_date date not null,
  amount numeric(12,2) not null check (amount > 0),
  payment_method text,
  confirmation_number text,
  notes text,
  recorded_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references public.app_users(id) on delete set null,
  void_reason text,
  constraint invoice_payments_void_reason_check check (voided_at is null or nullif(trim(void_reason), '') is not null)
);

create table if not exists public.technician_payment_transactions (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete restrict,
  technician_id uuid references public.technicians(id) on delete set null,
  technician_name text,
  amount numeric(12,2) not null check (amount > 0),
  payment_date date not null,
  payment_method text,
  confirmation_number text,
  notes text,
  created_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references public.app_users(id) on delete set null,
  void_reason text,
  constraint technician_payment_transactions_void_reason_check check (voided_at is null or nullif(trim(void_reason), '') is not null)
);

create table if not exists public.accounting_settings (
  singleton boolean primary key default true check (singleton),
  default_payment_terms_days integer check (default_payment_terms_days is null or default_payment_terms_days between 0 and 3650),
  allowed_payment_methods text[] not null default array['ACH','Card','Cash','Check','EFS','Comcheck','Wire','Zelle'],
  aging_thresholds integer[] not null default array[30,60,90],
  technician_payment_approval_threshold numeric(12,2),
  require_confirmation_number boolean not null default false,
  require_payment_notes boolean not null default false,
  default_report_date_range text not null default 'This Month',
  company_legal_name text not null default 'NTTR - National Truck Trailer Repair',
  accounting_contact_information text,
  pdf_footer text not null default 'Confidential - NTTR',
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  updated_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.accounting_settings (singleton) values (true) on conflict (singleton) do nothing;

create table if not exists public.accounting_audit_log (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  record_type text not null,
  record_id text,
  job_id uuid references public.jobs(id) on delete set null,
  performed_by uuid references public.app_users(id) on delete set null,
  performed_by_name text not null default 'System',
  previous_value jsonb,
  new_value jsonb,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists invoice_payments_job_id_idx on public.invoice_payments(job_id);
create index if not exists invoice_payments_payment_date_idx on public.invoice_payments(payment_date desc);
create index if not exists invoice_payments_active_job_idx on public.invoice_payments(job_id) where voided_at is null;
create index if not exists technician_payment_transactions_job_id_idx on public.technician_payment_transactions(job_id);
create index if not exists technician_payment_transactions_payment_date_idx on public.technician_payment_transactions(payment_date desc);
create index if not exists accounting_audit_log_created_at_idx on public.accounting_audit_log(created_at desc);
create index if not exists accounting_audit_log_job_id_idx on public.accounting_audit_log(job_id, created_at desc);
create index if not exists jobs_job_date_idx on public.jobs(job_date);
create index if not exists jobs_invoice_number_idx on public.jobs(invoice_number);
create index if not exists jobs_tech_payment_status_idx on public.jobs(tech_payment_status);
create index if not exists jobs_internal_control_color_idx on public.jobs(internal_control_color);
create index if not exists jobs_invoice_status_idx on public.jobs(invoice_status);

create or replace function public.accounting_actor()
returns public.app_users
language sql stable security definer set search_path = ''
as $$
  select u from public.app_users u
  where (u.auth_user_id = auth.uid() or u.id = auth.uid()) and u.status = 'Active'
  limit 1
$$;

create or replace function public.can_view_accounting()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.app_users
    where (auth_user_id = auth.uid() or id = auth.uid())
      and status = 'Active' and lower(role::text) = 'admin'
  )
$$;

create or replace function public.get_accounting_jobs(p_from_date date default null, p_to_date date default null)
returns setof public.jobs
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.can_view_accounting() then raise exception using errcode='42501', message='Accounting access required.'; end if;
  return query select j.* from public.jobs j
    where (p_from_date is null or j.job_date >= p_from_date)
      and (p_to_date is null or j.job_date <= p_to_date)
    order by j.job_date desc nulls last, j.created_at desc;
end;
$$;

create or replace function public.get_invoice_payment_summary()
returns table(job_id uuid, amount_paid numeric, last_payment_date date, payment_count bigint)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.can_view_accounting() then raise exception using errcode='42501', message='Accounting access required.'; end if;
  return query select p.job_id, coalesce(sum(p.amount),0), max(p.payment_date), count(*)
    from public.invoice_payments p where p.voided_at is null group by p.job_id;
end;
$$;

create or replace function public.get_pending_technician_payment_jobs()
returns setof public.jobs
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.can_view_technician_payments() then raise exception using errcode='42501', message='Technician payment access required.'; end if;
  return query select j.* from public.jobs j
    where lower(trim(coalesce(j.tech_payment_status,'')))='pending'
    order by j.job_date asc nulls first, j.created_at asc;
end;
$$;

create or replace function public.touch_accounting_updated_at()
returns trigger language plpgsql set search_path = '' as $$ begin new.updated_at = now(); return new; end $$;

drop trigger if exists invoice_payments_updated_at on public.invoice_payments;
create trigger invoice_payments_updated_at before update on public.invoice_payments for each row execute function public.touch_accounting_updated_at();
drop trigger if exists accounting_settings_updated_at on public.accounting_settings;
create trigger accounting_settings_updated_at before update on public.accounting_settings for each row execute function public.touch_accounting_updated_at();

create or replace function public.prevent_accounting_transaction_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' or coalesce(current_setting('app.accounting_void_rpc', true),'') <> 'on' then
    raise exception using errcode='42501', message='Accounting transactions are immutable. Use the authorized void action.';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_invoice_payment_mutation on public.invoice_payments;
create trigger protect_invoice_payment_mutation before update or delete on public.invoice_payments for each row execute function public.prevent_accounting_transaction_mutation();
drop trigger if exists protect_technician_payment_transaction_mutation on public.technician_payment_transactions;
create trigger protect_technician_payment_transaction_mutation before update or delete on public.technician_payment_transactions for each row execute function public.prevent_accounting_transaction_mutation();

create or replace function public.prevent_accounting_audit_mutation()
returns trigger language plpgsql set search_path = '' as $$ begin raise exception 'Accounting audit history is immutable.'; end $$;
drop trigger if exists protect_accounting_audit_log on public.accounting_audit_log;
create trigger protect_accounting_audit_log before update or delete on public.accounting_audit_log for each row execute function public.prevent_accounting_audit_mutation();

create or replace function public.record_invoice_payment(
  p_job_id uuid, p_payment_date date, p_amount numeric, p_payment_method text default null,
  p_confirmation_number text default null, p_notes text default null
)
returns public.invoice_payments
language plpgsql security definer set search_path = ''
as $$
declare v_actor public.app_users%rowtype; v_job public.jobs%rowtype; v_settings public.accounting_settings%rowtype; v_payment public.invoice_payments%rowtype; v_paid numeric;
begin
  select * into v_actor from public.app_users where (auth_user_id=auth.uid() or id=auth.uid()) and status='Active' and lower(role::text)='admin' limit 1;
  if v_actor.id is null then raise exception using errcode='42501', message='Admin accounting access required.'; end if;
  if p_amount is null or p_amount <= 0 then raise exception using errcode='22003', message='Payment amount must be greater than zero.'; end if;
  if p_payment_date is null then raise exception using errcode='22004', message='Payment date is required.'; end if;
  select * into v_job from public.jobs where id=p_job_id for update;
  if v_job.id is null then raise exception using errcode='P0002', message='Invoice job not found.'; end if;
  select coalesce(sum(amount),0) into v_paid from public.invoice_payments where job_id=v_job.id and voided_at is null;
  if v_paid + p_amount > coalesce(v_job.total_bill,0) then raise exception 'Payment exceeds the remaining invoice balance.'; end if;
  select * into v_settings from public.accounting_settings where singleton;
  if v_settings.require_confirmation_number and nullif(trim(coalesce(p_confirmation_number,'')),'') is null then raise exception 'Confirmation number is required.'; end if;
  if v_settings.require_payment_notes and nullif(trim(coalesce(p_notes,'')),'') is null then raise exception 'Payment notes are required.'; end if;
  insert into public.invoice_payments(job_id,invoice_number,payment_date,amount,payment_method,confirmation_number,notes,recorded_by)
  values(v_job.id,v_job.invoice_number,p_payment_date,p_amount,nullif(trim(p_payment_method),''),nullif(trim(p_confirmation_number),''),nullif(trim(p_notes),''),v_actor.id)
  returning * into v_payment;
  update public.jobs set customer_payment_status=case when v_paid+p_amount >= coalesce(total_bill,0) then 'Paid' else 'Partially Paid' end where id=v_job.id;
  insert into public.accounting_audit_log(action,record_type,record_id,job_id,performed_by,performed_by_name,new_value)
  values('Invoice payment created','invoice_payment',v_payment.id::text,v_job.id,v_actor.id,coalesce(nullif(v_actor.name,''),v_actor.username,'User'),to_jsonb(v_payment));
  return v_payment;
end;
$$;

create or replace function public.void_invoice_payment(p_payment_id uuid, p_reason text)
returns public.invoice_payments
language plpgsql security definer set search_path = ''
as $$
declare v_actor public.app_users%rowtype; v_before public.invoice_payments%rowtype; v_after public.invoice_payments%rowtype; v_paid numeric; v_total numeric;
begin
  select * into v_actor from public.app_users where (auth_user_id=auth.uid() or id=auth.uid()) and status='Active' and lower(role::text)='admin' limit 1;
  if v_actor.id is null then raise exception using errcode='42501', message='Admin accounting access required.'; end if;
  if nullif(trim(coalesce(p_reason,'')),'') is null then raise exception 'Void reason is required.'; end if;
  select * into v_before from public.invoice_payments where id=p_payment_id for update;
  if v_before.id is null then raise exception using errcode='P0002', message='Payment not found.'; end if;
  if v_before.voided_at is not null then raise exception 'Payment is already voided.'; end if;
  perform set_config('app.accounting_void_rpc','on',true);
  update public.invoice_payments set voided_at=now(),voided_by=v_actor.id,void_reason=trim(p_reason) where id=v_before.id returning * into v_after;
  select coalesce(sum(amount),0) into v_paid from public.invoice_payments where job_id=v_after.job_id and voided_at is null;
  select coalesce(total_bill,0) into v_total from public.jobs where id=v_after.job_id;
  update public.jobs set customer_payment_status=case when v_paid<=0 then 'Unpaid' when v_paid>=v_total then 'Paid' else 'Partially Paid' end where id=v_after.job_id;
  insert into public.accounting_audit_log(action,record_type,record_id,job_id,performed_by,performed_by_name,previous_value,new_value,reason)
  values('Invoice payment voided','invoice_payment',v_after.id::text,v_after.job_id,v_actor.id,coalesce(nullif(v_actor.name,''),v_actor.username,'User'),to_jsonb(v_before),to_jsonb(v_after),trim(p_reason));
  return v_after;
end;
$$;

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
  if v_paid+p_amount > coalesce(v_job.tech_labor,0) then raise exception 'Payment exceeds the remaining technician balance.'; end if;
  if v_settings.require_confirmation_number and nullif(trim(coalesce(p_confirmation_number,'')),'') is null then raise exception 'Confirmation number is required.'; end if;
  if v_settings.require_payment_notes and nullif(trim(coalesce(p_notes,'')),'') is null then raise exception 'Payment notes are required.'; end if;
  insert into public.technician_payment_transactions(job_id,technician_id,technician_name,amount,payment_date,payment_method,confirmation_number,notes,created_by)
  values(v_job.id,v_job.technician_id,v_job.tech,p_amount,p_payment_date,nullif(trim(p_payment_method),''),nullif(trim(p_confirmation_number),''),nullif(trim(p_notes),''),v_actor.id) returning * into v_tx;
  perform set_config('app.tech_payment_rpc','on',true);
  update public.jobs set tech_payment_status=case when v_paid+p_amount>=coalesce(tech_labor,0) then 'Paid' else 'Pending' end,tech_payment_paid_at=case when v_paid+p_amount>=coalesce(tech_labor,0) then now() else null end,tech_payment_paid_by=case when v_paid+p_amount>=coalesce(tech_labor,0) then v_actor.id else null end where id=v_job.id;
  insert into public.technician_payment_audit(job_id,previous_status,new_status,amount,technician,performed_by,performed_by_name,performed_at)
  values(v_job.id,coalesce(v_job.tech_payment_status,''),case when v_paid+p_amount>=coalesce(v_job.tech_labor,0) then 'Paid' else 'Pending' end,p_amount,coalesce(nullif(trim(v_job.tech),''),'Unassigned'),v_actor.id,coalesce(nullif(v_actor.name,''),v_actor.username,'User'),now());
  insert into public.accounting_audit_log(action,record_type,record_id,job_id,performed_by,performed_by_name,new_value)
  values('Technician payment created','technician_payment',v_tx.id::text,v_job.id,v_actor.id,coalesce(nullif(v_actor.name,''),v_actor.username,'User'),to_jsonb(v_tx));
  return v_tx;
end;
$$;

create or replace function public.void_technician_payment_transaction(p_transaction_id uuid, p_reason text)
returns public.technician_payment_transactions
language plpgsql security definer set search_path = ''
as $$
declare v_actor public.app_users%rowtype; v_before public.technician_payment_transactions%rowtype; v_after public.technician_payment_transactions%rowtype; v_remaining bigint;
begin
  select * into v_actor from public.app_users where (auth_user_id=auth.uid() or id=auth.uid()) and status='Active' and lower(role::text)='admin' limit 1;
  if v_actor.id is null then raise exception using errcode='42501', message='Admin accounting access required.'; end if;
  if nullif(trim(coalesce(p_reason,'')),'') is null then raise exception 'Void reason is required.'; end if;
  select * into v_before from public.technician_payment_transactions where id=p_transaction_id for update;
  if v_before.id is null then raise exception using errcode='P0002', message='Transaction not found.'; end if;
  if v_before.voided_at is not null then raise exception 'Transaction is already voided.'; end if;
  perform set_config('app.accounting_void_rpc','on',true);
  update public.technician_payment_transactions set voided_at=now(),voided_by=v_actor.id,void_reason=trim(p_reason) where id=v_before.id returning * into v_after;
  select count(*) into v_remaining from public.technician_payment_transactions where job_id=v_before.job_id and voided_at is null;
  if v_remaining=0 then perform set_config('app.tech_payment_rpc','on',true); update public.jobs set tech_payment_status='Pending',tech_payment_paid_at=null,tech_payment_paid_by=null where id=v_before.job_id; end if;
  insert into public.accounting_audit_log(action,record_type,record_id,job_id,performed_by,performed_by_name,previous_value,new_value,reason)
  values('Technician payment voided','technician_payment',v_after.id::text,v_after.job_id,v_actor.id,coalesce(nullif(v_actor.name,''),v_actor.username,'User'),to_jsonb(v_before),to_jsonb(v_after),trim(p_reason));
  return v_after;
end;
$$;

create or replace function public.log_accounting_export(p_report_type text, p_filters jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path = ''
as $$ declare v_actor public.app_users%rowtype; v_id uuid:=gen_random_uuid(); begin
  select * into v_actor from public.app_users where (auth_user_id=auth.uid() or id=auth.uid()) and status='Active' and lower(role::text)='admin' limit 1;
  if v_actor.id is null then raise exception using errcode='42501', message='Financial export permission required.'; end if;
  insert into public.accounting_audit_log(id,action,record_type,record_id,performed_by,performed_by_name,new_value)
  values(v_id,'Financial export generated','accounting_export',v_id::text,v_actor.id,coalesce(nullif(v_actor.name,''),v_actor.username,'User'),jsonb_build_object('report_type',p_report_type,'filters',p_filters));
  return v_id;
end $$;

create or replace function public.audit_accounting_job_change()
returns trigger language plpgsql security definer set search_path = ''
as $$ declare v_actor public.app_users%rowtype; begin
  if new.invoice_date is distinct from old.invoice_date or new.invoice_due_date is distinct from old.invoice_due_date or new.payment_terms_days is distinct from old.payment_terms_days or new.customer_payment_status is distinct from old.customer_payment_status or new.tech_payment_status is distinct from old.tech_payment_status then
    select * into v_actor from public.app_users where (auth_user_id=auth.uid() or id=auth.uid()) and status='Active' limit 1;
    insert into public.accounting_audit_log(action,record_type,record_id,job_id,performed_by,performed_by_name,previous_value,new_value)
    values('Accounting job fields changed','job',new.id::text,new.id,v_actor.id,coalesce(nullif(v_actor.name,''),v_actor.username,'System'),jsonb_build_object('invoice_date',old.invoice_date,'invoice_due_date',old.invoice_due_date,'payment_terms_days',old.payment_terms_days,'customer_payment_status',old.customer_payment_status,'tech_payment_status',old.tech_payment_status),jsonb_build_object('invoice_date',new.invoice_date,'invoice_due_date',new.invoice_due_date,'payment_terms_days',new.payment_terms_days,'customer_payment_status',new.customer_payment_status,'tech_payment_status',new.tech_payment_status));
  end if; return new;
end $$;
drop trigger if exists audit_accounting_job_fields on public.jobs;
create trigger audit_accounting_job_fields after update of invoice_date,invoice_due_date,payment_terms_days,customer_payment_status,tech_payment_status on public.jobs for each row execute function public.audit_accounting_job_change();

create or replace function public.audit_accounting_settings_change()
returns trigger language plpgsql security definer set search_path = ''
as $$ declare v_actor public.app_users%rowtype; begin
  select * into v_actor from public.app_users where (auth_user_id=auth.uid() or id=auth.uid()) and status='Active' limit 1;
  insert into public.accounting_audit_log(action,record_type,record_id,performed_by,performed_by_name,previous_value,new_value)
  values('Accounting settings changed','accounting_settings','singleton',v_actor.id,coalesce(nullif(v_actor.name,''),v_actor.username,'System'),to_jsonb(old),to_jsonb(new));
  return new;
end $$;
drop trigger if exists audit_accounting_settings on public.accounting_settings;
create trigger audit_accounting_settings after update on public.accounting_settings for each row execute function public.audit_accounting_settings_change();

create or replace function public.get_red_internal_control_jobs()
returns setof public.jobs language sql stable security definer set search_path = ''
as $$
  select j.* from public.jobs j
  where public.can_view_accounting() and lower(trim(coalesce(j.internal_control_color,'')))='red'
  order by coalesce(j.job_date,j.created_at::date) desc, j.id;
$$;

-- Keep the legacy bulk action transaction-safe. Every paid job receives a permanent ledger row.
create or replace function public.mark_technician_payments_paid(p_job_ids uuid[], p_allow_multiple_technicians boolean default false)
returns table(job_id uuid, amount numeric, technician text, paid_at timestamptz, paid_by uuid)
language plpgsql security definer set search_path = ''
as $$
declare v_actor public.app_users%rowtype; v_job public.jobs%rowtype; v_count integer; v_tech_count integer; v_previous_paid numeric; v_amount numeric; v_tx public.technician_payment_transactions%rowtype;
begin
  select * into v_actor from public.app_users where (auth_user_id=auth.uid() or id=auth.uid()) and status='Active' limit 1;
  if v_actor.id is null or not (lower(v_actor.role::text)='admin' or (lower(v_actor.role::text)='technician_manager' and v_actor.can_view_tech_payments and v_actor.can_mark_tech_payments_paid)) then raise exception using errcode='42501', message='Technician payment authority required.'; end if;
  v_count:=coalesce(array_length(p_job_ids,1),0);
  if v_count=0 then raise exception 'Select at least one pending technician payment.'; end if;
  select count(*),count(distinct coalesce(nullif(trim(j.tech),''),'Unassigned')) into v_count,v_tech_count from public.jobs j where j.id=any(p_job_ids) and lower(trim(coalesce(j.tech_payment_status,'')))='pending';
  if v_count<>coalesce(array_length(p_job_ids,1),0) then raise exception 'One or more selected jobs are no longer pending.'; end if;
  if v_tech_count>1 and not p_allow_multiple_technicians then raise exception 'Bulk payment across technicians requires explicit approval.'; end if;
  for v_job in select j.* from public.jobs j where j.id=any(p_job_ids) for update loop
    select coalesce(sum(t.amount),0) into v_previous_paid from public.technician_payment_transactions t where t.job_id=v_job.id and t.voided_at is null;
    v_amount:=greatest(coalesce(v_job.tech_labor,0)-v_previous_paid,0);
    if v_amount<=0 then raise exception 'A selected job has no remaining technician balance.'; end if;
    select * into v_tx from public.record_technician_payment_transaction(v_job.id,current_date,v_amount,'Other',null,'Legacy bulk payment action');
    job_id:=v_job.id; amount:=v_amount; technician:=coalesce(nullif(trim(v_job.tech),''),'Unassigned'); paid_at:=v_tx.created_at; paid_by:=v_actor.id; return next;
  end loop;
end $$;

-- Status dropdowns cannot create a paid financial state; payment must go through a ledger RPC.
create or replace function public.set_technician_payment_status(p_job_id uuid,p_status text)
returns table(job_id uuid,previous_status text,new_status text,paid_at timestamptz,paid_by uuid)
language plpgsql security definer set search_path = ''
as $$
declare v_actor public.app_users%rowtype; v_job public.jobs%rowtype; v_live bigint;
begin
  if p_status not in ('Pending','Paid','Cancelled') then raise exception using errcode='23514', message='Invalid technician payment status.'; end if;
  if p_status='Paid' then raise exception using errcode='42501', message='Use the Accounting Center payment action to record a Paid status.'; end if;
  select * into v_actor from public.app_users where (auth_user_id=auth.uid() or id=auth.uid()) and status='Active' limit 1;
  if v_actor.id is null or not (lower(v_actor.role::text)='admin' or (lower(v_actor.role::text)='technician_manager' and v_actor.can_view_tech_payments and v_actor.can_mark_tech_payments_paid)) then raise exception using errcode='42501', message='Technician payment authority required.'; end if;
  select * into v_job from public.jobs where id=p_job_id for update;
  if v_job.id is null then raise exception using errcode='P0002', message='Job not found.'; end if;
  select count(*) into v_live from public.technician_payment_transactions where job_id=v_job.id and voided_at is null;
  if v_live>0 then raise exception 'Void the existing technician payment transaction before changing its status.'; end if;
  perform set_config('app.tech_payment_rpc','on',true);
  update public.jobs set tech_payment_status=p_status,tech_payment_paid_at=null,tech_payment_paid_by=null where id=v_job.id;
  insert into public.technician_payment_audit(job_id,previous_status,new_status,amount,technician,performed_by,performed_by_name,performed_at)
  values(v_job.id,coalesce(v_job.tech_payment_status,''),p_status,coalesce(v_job.tech_labor,0),coalesce(nullif(trim(v_job.tech),''),'Unassigned'),v_actor.id,coalesce(nullif(v_actor.name,''),v_actor.username,'User'),now());
  job_id:=v_job.id; previous_status:=v_job.tech_payment_status; new_status:=p_status; paid_at:=null; paid_by:=null; return next;
end $$;

alter table public.invoice_payments enable row level security;
alter table public.technician_payment_transactions enable row level security;
alter table public.accounting_settings enable row level security;
alter table public.accounting_audit_log enable row level security;

drop policy if exists "admins read invoice payments" on public.invoice_payments;
create policy "admins read invoice payments" on public.invoice_payments for select to authenticated using (public.can_view_accounting());
drop policy if exists "authorized users read technician payment transactions" on public.technician_payment_transactions;
create policy "authorized users read technician payment transactions" on public.technician_payment_transactions for select to authenticated using (public.can_view_technician_payments());
drop policy if exists "admins manage accounting settings" on public.accounting_settings;
create policy "admins manage accounting settings" on public.accounting_settings for all to authenticated using (public.can_view_accounting()) with check (public.can_view_accounting());
drop policy if exists "admins read accounting audit" on public.accounting_audit_log;
create policy "admins read accounting audit" on public.accounting_audit_log for select to authenticated using (public.can_view_accounting());

revoke all on public.invoice_payments, public.technician_payment_transactions, public.accounting_settings, public.accounting_audit_log from anon;
grant select on public.invoice_payments, public.technician_payment_transactions, public.accounting_settings, public.accounting_audit_log to authenticated;
grant insert,update on public.accounting_settings to authenticated;
revoke all on function public.get_accounting_jobs(date,date), public.get_invoice_payment_summary(), public.get_pending_technician_payment_jobs(), public.record_invoice_payment(uuid,date,numeric,text,text,text), public.void_invoice_payment(uuid,text), public.record_technician_payment_transaction(uuid,date,numeric,text,text,text), public.void_technician_payment_transaction(uuid,text), public.log_accounting_export(text,jsonb) from public;
grant execute on function public.get_accounting_jobs(date,date), public.get_invoice_payment_summary(), public.get_pending_technician_payment_jobs(), public.record_invoice_payment(uuid,date,numeric,text,text,text), public.void_invoice_payment(uuid,text), public.record_technician_payment_transaction(uuid,date,numeric,text,text,text), public.void_technician_payment_transaction(uuid,text), public.log_accounting_export(text,jsonb) to authenticated;
revoke all on function public.get_red_internal_control_jobs(), public.mark_technician_payments_paid(uuid[],boolean), public.set_technician_payment_status(uuid,text) from public;
grant execute on function public.get_red_internal_control_jobs(), public.mark_technician_payments_paid(uuid[],boolean), public.set_technician_payment_status(uuid,text) to authenticated;

comment on table public.invoice_payments is 'Immutable customer payment transactions; corrections use audited voids.';
comment on table public.technician_payment_transactions is 'Transaction-grade technician payment history; corrections use audited voids.';
comment on column public.jobs.invoice_due_date is 'Explicit due date only; never inferred unless an authorized user applies configured terms.';
