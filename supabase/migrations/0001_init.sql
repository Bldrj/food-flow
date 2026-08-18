-- Master data: Захиалагч, Нийлүүлэгч, Материал, Бүтээгдэхүүн (docs/system-design.md §5)
-- Нэгтгэсэн анхны schema (2026-08-18) — өмнөх 0001..0009 migration-уудыг нэг болгов.
-- Ажиллуулах: Supabase Dashboard > SQL Editor дээр хуулж Run дарна.
--
-- Нийтлэг зарчим:
--   - code (CUS-001, SUP-001, MAT-001, PRD-001) DB талд sequence + BEFORE INSERT
--     trigger-ээр олгогдоно (client талд "max+1" хийвэл concurrency эрсдэлтэй).
--     Client insert дээр code илгээх шаардлагагүй.
--   - updated_at trigger-ээр автоматаар шинэчлэгдэнэ.
--   - ТЕСТ ГОРИМ: login-гүй хөгжүүлэлтийн үед RLS унтраалттай. Үе 6 (Auth & RLS)-д
--     `enable row level security` + дүр тус бүрийн policy нэмнэ (docs §4).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Нийтлэг функцууд
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ---------------------------------------------------------------------------
-- Захиалагч (customers)
-- ---------------------------------------------------------------------------

create sequence if not exists public.customers_code_seq;

create or replace function public.assign_customer_code()
returns trigger as $$
begin
  if new.code is null or new.code = '' then
    new.code := 'CUS-' || lpad(nextval('public.customers_code_seq')::text, 3, '0');
  end if;
  return new;
end;
$$ language plpgsql;

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  contact text,            -- холбоо барих хүн, утас (чөлөөт текст)
  email text,
  address text,
  delivery_note text,      -- хүргэлтийн тэмдэглэл
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger customers_assign_code
  before insert on public.customers
  for each row execute function public.assign_customer_code();

create trigger customers_updated_at
  before update on public.customers
  for each row execute function public.set_updated_at();

alter table public.customers disable row level security;

-- ---------------------------------------------------------------------------
-- Нийлүүлэгч (suppliers)
-- ---------------------------------------------------------------------------

create sequence if not exists public.suppliers_code_seq;

create or replace function public.assign_supplier_code()
returns trigger as $$
begin
  if new.code is null or new.code = '' then
    new.code := 'SUP-' || lpad(nextval('public.suppliers_code_seq')::text, 3, '0');
  end if;
  return new;
end;
$$ language plpgsql;

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  contact text,            -- холбоо барих хүн, утас (чөлөөт текст)
  email text,
  address text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger suppliers_assign_code
  before insert on public.suppliers
  for each row execute function public.assign_supplier_code();

create trigger suppliers_updated_at
  before update on public.suppliers
  for each row execute function public.set_updated_at();

alter table public.suppliers disable row level security;

-- ---------------------------------------------------------------------------
-- Материал (materials)
-- Нэгжийг canonical утгаар (kg|g|l|ml|pcs) хадгална — UI талд кг/гр/л/мл/ш гэж харуулна.
-- Үлдэгдэл, үнэ, нийлүүлэгч энд хадгалагдахгүй (ledger + material_suppliers-ийн ажил).
-- ---------------------------------------------------------------------------

create sequence if not exists public.materials_code_seq;

create or replace function public.assign_material_code()
returns trigger as $$
begin
  if new.code is null or new.code = '' then
    new.code := 'MAT-' || lpad(nextval('public.materials_code_seq')::text, 3, '0');
  end if;
  return new;
end;
$$ language plpgsql;

create table if not exists public.materials (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,   -- системийн код (MAT-001, автомат)
  base_code text,              -- гараас оруулах үндсэн код (сонголттой; ж: нягтлан/агуулахын код)
  name text not null,
  base_unit text not null
    check (base_unit in ('kg', 'g', 'l', 'ml', 'pcs')),
  category text not null default 'other'
    check (category in ('food', 'packaging', 'other')),
  min_stock numeric
    check (min_stock is null or min_stock >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Материал давхар бүртгэгдвэл үлдэгдэл/хэрэгцээний тооцоо салж зөрөх тул
-- нэрийг (том/жижиг үсэг ялгахгүй) давхардуулахгүй
create unique index if not exists materials_name_unique_idx
  on public.materials (lower(name));

-- base_code оруулсан бол давхардуулахгүй (хоосон утга олон байж болно)
create unique index if not exists materials_base_code_unique_idx
  on public.materials (lower(base_code)) where base_code is not null;

create trigger materials_assign_code
  before insert on public.materials
  for each row execute function public.assign_material_code();

create trigger materials_updated_at
  before update on public.materials
  for each row execute function public.set_updated_at();

alter table public.materials disable row level security;

-- ---------------------------------------------------------------------------
-- Бүтээгдэхүүн (products) — эцсийн бүтээгдэхүүн (хоол)-ны лавлах
-- Зориудаар минимал: орц, гарцын жин, заавар нь Технологийн карт (tech_cards)-ийн
-- ажил — хувилбар бүрээр tech_cards дээр хадгалагдана.
-- ---------------------------------------------------------------------------

create sequence if not exists public.products_code_seq;

create or replace function public.assign_product_code()
returns trigger as $$
begin
  if new.code is null or new.code = '' then
    new.code := 'PRD-' || lpad(nextval('public.products_code_seq')::text, 3, '0');
  end if;
  return new;
end;
$$ language plpgsql;

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Хоол давхар бүртгэгдвэл захиалга/батчийн нэгтгэл салж зөрөх тул
-- нэрийг (том/жижиг үсэг ялгахгүй) давхардуулахгүй
create unique index if not exists products_name_unique_idx
  on public.products (lower(name));

create trigger products_assign_code
  before insert on public.products
  for each row execute function public.assign_product_code();

create trigger products_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

alter table public.products disable row level security;
