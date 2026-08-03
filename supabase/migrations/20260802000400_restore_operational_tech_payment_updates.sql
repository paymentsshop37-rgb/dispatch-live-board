-- Restore the operational Tech Payment rule across RPC authorization and Jobs RLS.
-- Allowed editors: Admin, Supervisor, Dispatcher, Technician Manager.

create or replace function public.can_update_technician_payment()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.app_users
    where (auth_user_id=auth.uid() or id=auth.uid())
      and status='Active'
      and lower(role::text) in ('admin','supervisor','dispatcher','technician_manager')
  )
$$;

create or replace function public.can_view_technician_payments()
returns boolean language sql stable security definer set search_path = ''
as $$ select public.can_update_technician_payment() $$;

create or replace function public.can_mark_technician_payments_paid()
returns boolean language sql stable security definer set search_path = ''
as $$ select public.can_update_technician_payment() $$;

create or replace function public.protect_paid_technician_payment()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if (
    new.tech_payment_status is distinct from old.tech_payment_status
    or new.tech_payment_paid_at is distinct from old.tech_payment_paid_at
    or new.tech_payment_paid_by is distinct from old.tech_payment_paid_by
  ) and coalesce(current_setting('app.tech_payment_rpc',true),'')<>'on' then
    raise exception using errcode='42501', message='Use the audited Tech Payment action to change payment status.';
  end if;
  return new;
end;
$$;

create or replace function public.set_technician_payment_status(p_job_id uuid,p_status text)
returns table(job_id uuid,previous_status text,new_status text,paid_at timestamptz,paid_by uuid)
language plpgsql security definer set search_path = ''
as $$
declare v_actor public.app_users%rowtype; v_job public.jobs%rowtype; v_changed_at timestamptz:=now();
begin
  if p_status not in ('Pending','Paid','Cancelled') then
    raise exception using errcode='23514', message='Invalid technician payment status. Allowed values: Pending, Paid, Cancelled.';
  end if;
  select * into v_actor from public.app_users
    where (auth_user_id=auth.uid() or id=auth.uid()) and status='Active' limit 1;
  if v_actor.id is null then
    raise exception using errcode='28000', message='Your session is not associated with an active Dispatch Live user.';
  end if;
  if lower(v_actor.role::text) not in ('admin','supervisor','dispatcher','technician_manager') then
    raise exception using errcode='42501', message='Your active role is read-only for Tech Payment. Allowed roles: Admin, Supervisor, Dispatcher, or Technician Manager.';
  end if;
  select * into v_job from public.jobs where id=p_job_id for update;
  if v_job.id is null then raise exception using errcode='P0002', message='Job not found.'; end if;
  if v_job.tech_payment_status=p_status then
    job_id:=v_job.id; previous_status:=v_job.tech_payment_status; new_status:=v_job.tech_payment_status;
    paid_at:=v_job.tech_payment_paid_at; paid_by:=v_job.tech_payment_paid_by; return next; return;
  end if;
  perform set_config('app.tech_payment_rpc','on',true);
  update public.jobs
    set tech_payment_status=p_status,
        tech_payment_paid_at=case when p_status='Paid' then v_changed_at else null end,
        tech_payment_paid_by=case when p_status='Paid' then v_actor.id else null end
    where id=v_job.id;
  insert into public.technician_payment_audit(
    job_id,previous_status,new_status,amount,technician,performed_by,performed_by_name,performed_at
  ) values (
    v_job.id,coalesce(v_job.tech_payment_status,''),p_status,coalesce(v_job.tech_labor,0),
    coalesce(nullif(trim(v_job.tech),''),'Unassigned'),v_actor.id,
    coalesce(nullif(trim(v_actor.name),''),v_actor.username,'User'),v_changed_at
  );
  job_id:=v_job.id; previous_status:=v_job.tech_payment_status; new_status:=p_status;
  paid_at:=case when p_status='Paid' then v_changed_at else null end;
  paid_by:=case when p_status='Paid' then v_actor.id else null end;
  return next;
end;
$$;

create or replace function public.mark_technician_payments_paid(p_job_ids uuid[],p_allow_multiple_technicians boolean default false)
returns table(job_id uuid,amount numeric,technician text,paid_at timestamptz,paid_by uuid)
language plpgsql security definer set search_path = ''
as $$
declare v_actor public.app_users%rowtype; v_job public.jobs%rowtype; v_result record; v_requested integer; v_pending integer; v_technicians integer;
begin
  select * into v_actor from public.app_users where (auth_user_id=auth.uid() or id=auth.uid()) and status='Active' limit 1;
  if v_actor.id is null then raise exception using errcode='28000', message='Your session is not associated with an active Dispatch Live user.'; end if;
  if lower(v_actor.role::text) not in ('admin','supervisor','dispatcher','technician_manager') then
    raise exception using errcode='42501', message='Your active role is read-only for Tech Payment. Allowed roles: Admin, Supervisor, Dispatcher, or Technician Manager.';
  end if;
  v_requested:=coalesce(array_length(p_job_ids,1),0);
  if v_requested=0 then raise exception 'Select at least one pending technician payment.'; end if;
  select count(*),count(distinct coalesce(nullif(trim(j.tech),''),'Unassigned')) into v_pending,v_technicians
    from public.jobs j where j.id=any(p_job_ids) and lower(trim(coalesce(j.tech_payment_status,'')))='pending';
  if v_pending<>v_requested then raise exception 'One or more selected jobs are no longer pending.'; end if;
  if v_technicians>1 and not p_allow_multiple_technicians then raise exception 'Bulk payment across technicians requires explicit approval.'; end if;
  for v_job in select j.* from public.jobs j where j.id=any(p_job_ids) for update loop
    select * into v_result from public.set_technician_payment_status(v_job.id,'Paid');
    job_id:=v_job.id; amount:=coalesce(v_job.tech_labor,0);
    technician:=coalesce(nullif(trim(v_job.tech),''),'Unassigned');
    paid_at:=v_result.paid_at; paid_by:=v_result.paid_by; return next;
  end loop;
end;
$$;

drop policy if exists "active authenticated users only" on public.jobs;
drop policy if exists "active users update jobs" on public.jobs;
drop policy if exists "operational roles update jobs" on public.jobs;
create policy "operational roles update jobs" on public.jobs for update to authenticated
  using (public.can_update_technician_payment())
  with check (public.can_update_technician_payment());

revoke update on public.jobs from anon;
grant update on public.jobs to authenticated;
revoke all on function public.can_update_technician_payment(),public.can_view_technician_payments(),public.can_mark_technician_payments_paid(),public.set_technician_payment_status(uuid,text),public.mark_technician_payments_paid(uuid[],boolean) from public;
grant execute on function public.can_update_technician_payment(),public.can_view_technician_payments(),public.can_mark_technician_payments_paid(),public.set_technician_payment_status(uuid,text),public.mark_technician_payments_paid(uuid[],boolean) to authenticated;

comment on function public.can_update_technician_payment() is 'Shared backend authorization rule for Admin, Supervisor, Dispatcher, and Technician Manager Tech Payment updates.';
