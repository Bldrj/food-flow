-- dishes → products (2026-08-15): хоолны лавлахыг "эцсийн бүтээгдэхүүн"-ий
-- лавлах болгож өргөтгөв. Нэмэлт: code (PRD-001, автомат), portion_weight
-- (1 порцын гарцын жин, граммаар), description.
-- portion_weight энд байх тул tech_cards-д portion_yield_g давхардуулж хадгалахгүй.
-- Энэ migration нь 0007_dishes.sql ажилласан/ажиллаагүй аль ч тохиолдолд зөв ажиллана.
-- Ажиллуулах: Supabase Dashboard > SQL Editor дээр хуулж Run дарна.

-- 0007 ажилласан бол хүснэгтийг нэрлэж шилжүүлнэ, үгүй бол шинээр үүсгэнэ
alter table if exists public.dishes rename to products;

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter index if exists dishes_name_unique_idx rename to products_name_unique_idx;
create unique index if not exists products_name_unique_idx
  on public.products (lower(name));

drop trigger if exists dishes_updated_at on public.products;
drop trigger if exists products_updated_at on public.products;
create trigger products_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

-- Шинэ талбарууд
alter table public.products add column if not exists code text;
alter table public.products add column if not exists portion_weight numeric;
alter table public.products add column if not exists description text;

alter table public.products drop constraint if exists products_portion_weight_check;
alter table public.products add constraint products_portion_weight_check
  check (portion_weight is null or portion_weight > 0);

-- Код олголт: DB талд sequence + trigger (0005/0006-тай ижил зарчим)
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

drop trigger if exists products_assign_code on public.products;
create trigger products_assign_code
  before insert on public.products
  for each row execute function public.assign_product_code();

-- 0007-оор орсон кодгүй мөрүүдэд код олгоод NOT NULL болгоно
update public.products
set code = 'PRD-' || lpad(nextval('public.products_code_seq')::text, 3, '0')
where code is null or code = '';

alter table public.products alter column code set not null;
create unique index if not exists products_code_unique_idx
  on public.products (code);

-- ТЕСТ ГОРИМ: login-гүй хөгжүүлэлтийн үед RLS-гүй (Үе 6-д policy нэмж идэвхжүүлнэ)
alter table public.products disable row level security;
