begin;

create function public.get_cfo_technician_cost_page(
  from_date date, to_date date, after_key text default ''
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not public.can_access_intelligence() then
    raise exception 'Exclusive CFO access required.' using errcode = '42501';
  end if;
  if from_date is null or to_date is null or from_date > to_date then
    raise exception 'Select a valid report period.' using errcode = '22023';
  end if;

  with movements as (
    select 'payment:' || p.id::text as movement_key, 'transaction' as source,
      p.payment_date::text as movement_date, j.id as job_id, j.invoice_number, j.reference_number,
      coalesce(p.technician_id, case when nullif(trim(p.technician_name), '') is null then j.technician_id end) as technician_id,
      coalesce(nullif(trim(p.technician_name), ''), nullif(trim(j.tech), '')) as technician,
      p.amount, p.payment_method, p.confirmation_number
    from public.technician_payment_transactions p
    join public.jobs j on j.id = p.job_id
    where p.voided_at is null and p.payment_date between from_date and to_date

    union all

    select 'legacy:' || j.id::text, 'paid_status',
      coalesce((j.tech_payment_paid_at at time zone 'America/Denver')::date::text,
        substring(to_jsonb(j)->>'tech_paid_date' from '^\d{4}-\d{2}-\d{2}')),
      j.id, j.invoice_number, j.reference_number,
      case when nullif(trim(a.technician), '') is null or lower(trim(a.technician)) = lower(trim(j.tech))
        then j.technician_id end,
      coalesce(nullif(trim(a.technician), ''), nullif(trim(j.tech), '')),
      coalesce(a.amount, j.tech_labor), j.tech_payment_method, null
    from public.jobs j
    left join lateral (
      select h.amount, h.technician
      from public.technician_payment_audit h
      where h.job_id = j.id and h.new_status = 'Paid' and h.performed_at = j.tech_payment_paid_at
      order by h.id desc
      limit 1
    ) a on true
    where lower(trim(j.tech_payment_status)) = 'paid'
      and not exists (
        select 1 from public.technician_payment_transactions p
        where p.job_id = j.id
          and (p.voided_at is null or j.tech_payment_paid_at is null or p.voided_at >= j.tech_payment_paid_at)
      )

    union all

    select 'parts:' || j.id::text, 'job_parts', j.job_date::date::text,
      j.id, j.invoice_number, j.reference_number, j.technician_id, nullif(trim(j.tech), ''),
      j.parts, null, null
    from public.jobs j
    where j.parts <> 0 and (j.job_date between from_date and to_date or j.job_date is null)
  )
  select coalesce(jsonb_agg(to_jsonb(page) order by page.movement_key), '[]'::jsonb) into result
  from (
    select * from movements
    where movement_key > coalesce(after_key, '')
      and (movement_date between from_date::text and to_date::text or movement_date is null)
    order by movement_key
    limit 500
  ) page;

  return result;
end;
$$;

revoke all on function public.get_cfo_technician_cost_page(date, date, text) from public, anon;
grant execute on function public.get_cfo_technician_cost_page(date, date, text) to authenticated;
notify pgrst, 'reload schema';
commit;
