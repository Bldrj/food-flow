-- Үйлдвэрлэлийн батч (docs/system-design.md §5) + захиалгаас delivery_time хасах
-- Ажиллуулах: Supabase Dashboard > SQL Editor дээр хуулж Run дарна.
-- Дараа нь production_batches-ийн RLS унтарсан эсэхийг шалгаарай.
--
-- Шийдвэрүүд (2026-08-21):
--   - ТК SNAPSHOT ЭНД АВАГДАНА (0007-ын шийдвэрийн үргэлжлэл): батч үүсэх
--     мөчид тухайн хоолны идэвхтэй ТК-г tech_card_id-д хөлдөөнө. Идэвхтэй
--     ТК-гүй хоолтой бол батч үүсэхгүй (хатуу хориг энд).
--   - Батч = generate_batches(p_date) RPC-ийн үр дүн: тухайн өдрийн
--     батлагдсан захиалгын мөрүүдийг product-аар Σ. Дахин дуудахад:
--     planned батчийн тоог шинэчилнэ (нэмэлт захиалга орсон бол),
--     захиалгагүй болсон planned батчийг устгана, шинэ хоолны батч нэмнэ.
--     Үйлдвэрлэлд орсон (in_production/done) батчид ХҮРЭХГҮЙ — зөрүүг UI
--     daily_order_totals view-тэй харьцуулж анхааруулна (шийдвэр хүний гарт).
--   - unique(production_date, product_id): нэг өдөр нэг хоол нэг л батч.
--   - Материалын хэрэгцээ daily_material_needs view-ээр DB талд exact
--     numeric-ээр бодогдоно (frontend reduce хийхгүй зарчим).
--   - delivery_time-ийг orders-оос хасав (2026-08-21): хүргэлтийн цаг
--     төлөвлөх шаардлагагүй гэж үзэв.

-- ---------------------------------------------------------------------------
-- Захиалгаас хүргэх цагийг хасна
-- ---------------------------------------------------------------------------

alter table public.orders drop column if exists delivery_time;

-- ---------------------------------------------------------------------------
-- Үйлдвэрлэлийн батч (production_batches)
-- ---------------------------------------------------------------------------

create table if not exists public.production_batches (
  id uuid primary key default gen_random_uuid(),
  production_date date not null,
  product_id uuid not null references public.products (id) on delete restrict,
  tech_card_id uuid not null references public.tech_cards (id) on delete restrict,
    -- батч үүсэх мөчийн идэвхтэй ТК (snapshot) — дараа нь өөрчлөгдөхгүй
  total_qty integer not null check (total_qty > 0),
  status text not null default 'planned'
    check (status in ('planned', 'in_production', 'done')),
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (production_date, product_id)
);

create index if not exists production_batches_date_idx
  on public.production_batches (production_date);

drop trigger if exists production_batches_updated_at on public.production_batches;
create trigger production_batches_updated_at
  before update on public.production_batches
  for each row execute function public.set_updated_at();

alter table public.production_batches disable row level security;

-- Батчийн identity талбарууд (өдөр, хоол, ТК snapshot) хэзээ ч өөрчлөгдөхгүй;
-- total_qty зөвхөн generate_batches() RPC-ээр (planned үед) шинэчлэгдэнэ
create or replace function public.block_batch_change()
returns trigger as $$
begin
  if new.production_date <> old.production_date
     or new.product_id <> old.product_id
     or new.tech_card_id <> old.tech_card_id then
    raise exception 'Батчийн огноо/хоол/ТК snapshot-ийг өөрчлөх боломжгүй';
  end if;
  if new.total_qty <> old.total_qty then
    if coalesce(current_setting('app.batching', true), '') <> 'on' then
      raise exception 'Батчийн тоог зөвхөн generate_batches() функцээр шинэчилнэ';
    end if;
    if old.status <> 'planned' then
      raise exception 'Үйлдвэрлэлд орсон батчийн тоог өөрчлөх боломжгүй';
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists production_batches_immutable on public.production_batches;
create trigger production_batches_immutable
  before update on public.production_batches
  for each row execute function public.block_batch_change();

-- ---------------------------------------------------------------------------
-- Өдрийн захиалгын нийлбэр (батчтай харьцуулах эх сурвалж)
-- draft/cancelled-ээс бусад бүх захиалга эрэлтэд тооцогдоно
-- ---------------------------------------------------------------------------

create or replace view public.daily_order_totals as
select
  o.production_date,
  oi.product_id,
  sum(oi.qty)::integer as total_qty,
  count(distinct o.id)::integer as order_count
from public.orders o
join public.order_items oi on oi.order_id = o.id
where o.status not in ('draft', 'cancelled')
group by o.production_date, oi.product_id;

-- ---------------------------------------------------------------------------
-- Өдрийн материалын хэрэгцээ — батч × хөлдөөсөн ТК-ийн орц, exact numeric
-- ---------------------------------------------------------------------------

create or replace view public.daily_material_needs as
select
  b.production_date,
  i.material_id,
  m.code,
  m.name,
  m.base_unit,
  sum(i.brutto_qty * b.total_qty) as brutto_need,   -- агуулахаас гаргах
  sum(i.netto_qty * b.total_qty) as netto_need      -- үйлдвэрлэлд орох
from public.production_batches b
join public.tech_card_groups g on g.tech_card_id = b.tech_card_id
join public.tech_card_items i on i.group_id = g.id
join public.materials m on m.id = i.material_id
group by b.production_date, i.material_id, m.code, m.name, m.base_unit;

-- ---------------------------------------------------------------------------
-- Батч үүсгэх/шинэчлэх RPC
-- Frontend: supabase.rpc('generate_batches', { p_date, p_actor })
-- ---------------------------------------------------------------------------

create or replace function public.generate_batches(
  p_date date,
  p_actor text default null
)
returns void as $$
declare
  v_missing text;
begin
  -- Нэг өдрийн батчийг зэрэг үүсгэх race-ээс хамгаална
  perform pg_advisory_xact_lock(hashtext('generate_batches:' || p_date::text));

  -- Бүх хоол идэвхтэй ТК-тай байх ёстой — үйлдвэрлэлийн хатуу хориг энд
  select string_agg(p.name, ', ') into v_missing
    from public.daily_order_totals t
    join public.products p on p.id = t.product_id
    where t.production_date = p_date
      and not exists (
        select 1 from public.tech_cards tc
        where tc.product_id = t.product_id and tc.is_active
      );
  if v_missing is not null then
    raise exception 'Идэвхтэй технологийн картгүй хоол: %', v_missing;
  end if;

  perform set_config('app.batching', 'on', true);

  -- Шинэ батч нэмэх / planned батчийн тоог шинэчлэх (ТК snapshot хэвээр)
  insert into public.production_batches
      (production_date, product_id, tech_card_id, total_qty, created_by)
  select
      t.production_date, t.product_id, tc.id, t.total_qty, p_actor
    from public.daily_order_totals t
    join public.tech_cards tc
      on tc.product_id = t.product_id and tc.is_active
    where t.production_date = p_date
  on conflict (production_date, product_id) do update
    set total_qty = excluded.total_qty
    where public.production_batches.status = 'planned'
      and public.production_batches.total_qty <> excluded.total_qty;

  -- Захиалгагүй болсон planned батчийг цэвэрлэнэ
  delete from public.production_batches b
    where b.production_date = p_date
      and b.status = 'planned'
      and not exists (
        select 1 from public.daily_order_totals t
        where t.production_date = p_date and t.product_id = b.product_id
      );
end;
$$ language plpgsql;
