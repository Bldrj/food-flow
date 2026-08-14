-- Master data: Хоолны лавлах (docs/system-design.md §5)
-- Зориудаар минимал: нэр + идэвхтэй эсэх. Орц, жин, заавар нь ТК-ийн ажил —
-- хоол бүр Технологийн картаараа (tech_cards) тодорхойлогдоно.
-- Ажиллуулах: Supabase Dashboard > SQL Editor дээр хуулж Run дарна.

create table if not exists public.dishes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Хоол давхар бүртгэгдвэл захиалга/батчийн нэгтгэл салж зөрөх тул
-- нэрийг (том/жижиг үсэг ялгахгүй) давхардуулахгүй
create unique index if not exists dishes_name_unique_idx
  on public.dishes (lower(name));

create trigger dishes_updated_at
  before update on public.dishes
  for each row execute function public.set_updated_at();

-- ТЕСТ ГОРИМ: login-гүй хөгжүүлэлтийн үед RLS-гүй (Үе 6-д policy нэмж идэвхжүүлнэ)
alter table public.dishes disable row level security;
