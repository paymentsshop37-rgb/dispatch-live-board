create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  billing_email text,
  phone text,
  account_status text not null default 'Active',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Compatibility fields used by the existing CRM UI.
  name text,
  main_phone text,
  main_email text,
  address text,
  city text,
  state text,
  zip text,
  zip_code text,
  preferred_payment_method text,
  credit_status text,
  customer_status text,
  status text
);

create table if not exists public.customer_contacts (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  name text,
  phone text,
  email text,
  position text,
  is_primary boolean not null default false,
  -- Compatibility fields used by the existing CRM UI.
  role text,
  contact_role text,
  contact_name text,
  contact_phone text,
  contact_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customer_locations (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  location_name text,
  address text,
  city text,
  state text,
  zip_code text,
  latitude numeric,
  longitude numeric,
  -- Compatibility fields used by the existing CRM UI.
  name text,
  zip text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.jobs add column if not exists customer_id uuid references public.customers(id) on delete set null;
alter table public.jobs add column if not exists customer_location_id uuid references public.customer_locations(id) on delete set null;

create unique index if not exists customers_company_name_unique_ci
  on public.customers (lower(company_name));
create index if not exists customer_contacts_customer_id_idx on public.customer_contacts(customer_id);
create index if not exists customer_locations_customer_id_idx on public.customer_locations(customer_id);
create index if not exists jobs_customer_id_idx on public.jobs(customer_id);
create index if not exists jobs_customer_location_id_idx on public.jobs(customer_location_id);

insert into public.customers (company_name, name, phone, main_phone, account_status, customer_status, status, created_at, updated_at)
select distinct
  trim(company),
  trim(company),
  nullif(max(dispatch), ''),
  nullif(max(dispatch), ''),
  'Active',
  'Active',
  'Active',
  now(),
  now()
from public.jobs
where nullif(trim(company), '') is not null
group by trim(company)
on conflict (lower(company_name)) do nothing;

update public.jobs j
set customer_id = c.id
from public.customers c
where j.customer_id is null
  and lower(trim(j.company)) = lower(trim(c.company_name));

insert into public.customer_locations (customer_id, location_name, address, city, state, zip_code, zip, created_at, updated_at)
select distinct
  c.id,
  nullif(trim(j.location), ''),
  nullif(trim(j.location), ''),
  nullif(trim(split_part(j.location, ',', 1)), ''),
  nullif(trim(split_part(j.location, ',', 2)), ''),
  nullif(trim(split_part(j.location, ',', 3)), ''),
  nullif(trim(split_part(j.location, ',', 3)), ''),
  now(),
  now()
from public.jobs j
join public.customers c on c.id = j.customer_id
where nullif(trim(j.location), '') is not null
  and not exists (
    select 1
    from public.customer_locations l
    where l.customer_id = c.id
      and lower(coalesce(l.address, '')) = lower(trim(j.location))
  );

update public.jobs j
set customer_location_id = l.id
from public.customer_locations l
where j.customer_id = l.customer_id
  and j.customer_location_id is null
  and lower(coalesce(l.address, '')) = lower(trim(j.location));

create or replace function public.set_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists customers_set_updated_at on public.customers;
create trigger customers_set_updated_at before update on public.customers for each row execute function public.set_updated_at();

drop trigger if exists customer_contacts_set_updated_at on public.customer_contacts;
create trigger customer_contacts_set_updated_at before update on public.customer_contacts for each row execute function public.set_updated_at();

drop trigger if exists customer_locations_set_updated_at on public.customer_locations;
create trigger customer_locations_set_updated_at before update on public.customer_locations for each row execute function public.set_updated_at();

alter table public.customers enable row level security;
alter table public.customer_contacts enable row level security;
alter table public.customer_locations enable row level security;

drop policy if exists "active users manage customers" on public.customers;
drop policy if exists "active users manage customer contacts" on public.customer_contacts;
drop policy if exists "active users manage customer locations" on public.customer_locations;

create policy "active users manage customers" on public.customers
  for all to authenticated
  using (public.is_active_app_user())
  with check (public.is_active_app_user());

create policy "active users manage customer contacts" on public.customer_contacts
  for all to authenticated
  using (public.is_active_app_user())
  with check (public.is_active_app_user());

create policy "active users manage customer locations" on public.customer_locations
  for all to authenticated
  using (public.is_active_app_user())
  with check (public.is_active_app_user());
