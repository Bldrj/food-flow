-- Master data: Захиалагч, Нийлүүлэгч (docs/system-design.md §5)
-- Ажиллуулах: Supabase Dashboard > SQL Editor дээр хуулж Run дарна.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Захиалагчийн лавлах
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  customer_type text not null default 'other'
    check (customer_type in ('school', 'kindergarten', 'corporate', 'other')),
  contact_person text,
  phone text,
  email text,
  address text,
  delivery_note text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger customers_updated_at
  before update on public.customers
  for each row execute function public.set_updated_at();

-- Нийлүүлэгчийн лавлах
create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  registration_no text,
  category text not null default 'other'
    check (category in ('meat', 'vegetable', 'grocery', 'packaging', 'other')),
  contact_person text,
  phone text,
  email text,
  address text,
  payment_terms text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger suppliers_updated_at
  before update on public.suppliers
  for each row execute function public.set_updated_at();

-- ТЕСТ ГОРИМ: RLS-ийг зориуд идэвхжүүлээгүй — anon түлхүүрээр бүрэн хандана.
-- Үе 6 (Auth & RLS)-д дараахыг нэмнэ:
--   alter table public.customers enable row level security;
--   alter table public.suppliers enable row level security;
--   + дүр тус бүрийн policy
