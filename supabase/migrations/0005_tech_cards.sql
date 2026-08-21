-- Технологийн карт (docs/system-design.md §5): tech_cards + бүлэг + орц
-- Ажиллуулах: Supabase Dashboard > SQL Editor дээр хуулж Run дарна.
--
-- Шийдвэрүүд (2026-08-21, Master sheet-ийн бодит датаг шалгасны үндсэн дээр):
--   - Орцууд бүлэгтэй (tech_card_groups): «Жэюүг мах /Үндсэн орц/», «Соус»,
--     «Омлет» гэх мэт — бүх хоолны sheet дээр давтагдсан бодит бүтэц.
--     Мөр бүрд чөлөөт текст биш тусдаа хүснэгт: нэрийг нэг газар засна,
--     дараалал эрэмбэлэгдэнэ, хожим бүлгийн түвшний мэдээлэл (жишээ нь
--     «Омлет» 1 лист = 45 порц гэх мэт бэлдэцийн суурь) нэмэх боломжтой.
--   - `station` талбарыг ТҮР ХАСАВ: материал станц дамждаг («Бэлтгэл →
--     Халуун туслах»), мөн Excel дээр 4 дэх станц «Халуун туслах» илэрсэн
--     тул станцын загварыг Үе 3 (станцын дэлгэц) дээр эргэж шийднэ.
--   - instructions нэг text талбар (олон мөр \n-ээр): алхам бүр станц/
--     чеклист гэх мэт бүтэцтэй болох хэрэгцээ гарвал тэр үед tech_card_steps
--     хүснэгт рүү салгана.
--   - CHECK: netto_qty <= brutto_qty (§5-ын шийдвэр) — нетто нь ТУХАЙН
--     материалын цэвэрлэгээ/бэлтгэлийн дараах хэмжээ тул бруттогоос
--     хэтрэхгүй. Боловсруулалтаар жин нэмэгддэг тохиолдлыг тусдаа материал
--     («Агшаасан будаа» гэх мэт)-аар шийднэ.
--   - Тоо хэмжээ материалын base_unit-ээр хадгалагдана (150 гр → 0.150 kg),
--     мөр дээр тусдаа unit талбар байхгүй (§5 материалын нэгжийн шийдвэр).
--   - Хувилбар (version): орц өөрчлөгдвөл шинэ version үүсгэнэ — хуучин
--     захиалгын түүх (order_items.tech_card_id) хэвээр үлдэнэ. Нэг product-д
--     зөвхөн 1 идэвхтэй хувилбар (partial unique index).
--   - Ашиглагдсан (захиалгад орсон) хувилбарын immutability-г orders
--     хүснэгт үүсэх алхам дээр trigger-ээр хамгаална — одоохондоо
--     захиалга байхгүй тул чөлөөтэй засварлана.

-- ---------------------------------------------------------------------------
-- Технологийн карт (tech_cards) — header, хувилбартай
-- ---------------------------------------------------------------------------

create table if not exists public.tech_cards (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete restrict,
  version int not null default 1 check (version >= 1),
  portion_yield_g numeric(10,2)
    check (portion_yield_g is null or portion_yield_g > 0),
    -- 1 порцын гарцын жин (гр) — хувилбар бүрээр (v1=350г, v2=380г …)
  instructions text,           -- олон мөрт заавар ("1. ...\n2. ...")
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, version)
);

-- Нэг хоолонд зөвхөн нэг идэвхтэй хувилбар
create unique index if not exists tech_cards_one_active_idx
  on public.tech_cards (product_id) where is_active;

create trigger tech_cards_updated_at
  before update on public.tech_cards
  for each row execute function public.set_updated_at();

alter table public.tech_cards disable row level security;

-- ---------------------------------------------------------------------------
-- Орцын бүлэг (tech_card_groups) — «Үндсэн орц», «Соус» гэх мэт
-- ---------------------------------------------------------------------------

create table if not exists public.tech_card_groups (
  id uuid primary key default gen_random_uuid(),
  tech_card_id uuid not null references public.tech_cards (id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- Нэг карт дотор бүлгийн нэр давхардахгүй (том/жижиг үсэг ялгахгүй)
create unique index if not exists tech_card_groups_name_unique_idx
  on public.tech_card_groups (tech_card_id, lower(name));

create index if not exists tech_card_groups_card_idx
  on public.tech_card_groups (tech_card_id);

alter table public.tech_card_groups disable row level security;

-- ---------------------------------------------------------------------------
-- Картын орц (tech_card_items) — 1 порцод ногдох, base_unit-ээр
-- ---------------------------------------------------------------------------

create table if not exists public.tech_card_items (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.tech_card_groups (id) on delete cascade,
  material_id uuid not null references public.materials (id) on delete restrict,
  brutto_qty numeric(14,6) not null check (brutto_qty > 0),
    -- агуулахаас авах хэмжээ (хаягдал орсон), base_unit-ээр
  netto_qty numeric(14,6) not null check (netto_qty > 0),
    -- бэлтгэлийн дараа үйлдвэрлэлд орох хэмжээ, base_unit-ээр
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  constraint tech_card_items_netto_lte_brutto check (netto_qty <= brutto_qty)
);

-- Нэг бүлэгт нэг материал давхардахгүй (өөр бүлэгт давтагдаж болно:
-- Сой соус «Соус» болон «Үдэн чанах» хоёуланд нь ордог)
create unique index if not exists tech_card_items_material_unique_idx
  on public.tech_card_items (group_id, material_id);

create index if not exists tech_card_items_group_idx
  on public.tech_card_items (group_id);

alter table public.tech_card_items disable row level security;
