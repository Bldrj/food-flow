-- Master data: Материалын лавлах (docs/system-design.md §5)
-- Нэгжийг canonical утгаар (kg|g|l|ml|pcs) хадгална — UI талд кг/гр/л/мл/ш гэж харуулна.
-- Үлдэгдэл, үнэ, нийлүүлэгч энд хадгалагдахгүй (ledger + material_suppliers-ийн ажил).
-- Ажиллуулах: Supabase Dashboard > SQL Editor дээр хуулж Run дарна.

create table if not exists public.materials (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
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

create trigger materials_updated_at
  before update on public.materials
  for each row execute function public.set_updated_at();

-- Код олголт: DB талд sequence + trigger (0005-тай ижил зарчим, concurrency-safe)
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

drop trigger if exists materials_assign_code on public.materials;
create trigger materials_assign_code
  before insert on public.materials
  for each row execute function public.assign_material_code();

-- ТЕСТ ГОРИМ: login-гүй хөгжүүлэлтийн үед RLS-гүй (Үе 6-д policy нэмж идэвхжүүлнэ)
alter table public.materials disable row level security;
