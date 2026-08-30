-- Материалын хорогдлын хувь (docs/system-design.md §5)
-- Ажиллуулах: Supabase Dashboard > SQL Editor дээр Run дарна.
--
-- Шийдвэрүүд (2026-08-26, Excel-ийн «Бэлтгэл» sheet-ийн бүтцээс):
--   - Хорогдол нь ХООЛНООС ХАМААРАХГҮЙ, МАТЕРИАЛ БҮРД ТОГТМОЛ шинж чанар
--     (Байцаа 0.2, Бууцай 0.4, Лууван 0 …) тул ТК-ийн мөр бүрд brutto-д
--     давхардуулж бөглөх биш materials.loss_pct-д НЭГ УДАА хадгална.
--   - ТК-д цаашид зөвхөн ЦЭВЭР (netto) норм оруулна — UI брутто талбарыг
--     нуусан; хуучин мөрүүдийн brutto_qty өгөгдөл хэвээр (түүхэн).
--   - «Хэрэгцээ (агуулахаас авах)» = Σ(netto × порц) × (1 + loss_pct) —
--     daily_material_needs.issue_need. Зөвхөн агуулахын олголтын тооцоонд
--     үйлчилнэ (олгох шаардлагатай, зарлагын prefill).
--   - Цех ХООРОНДЫН норм хорогдолгүй ЦЭВЭР норм — Excel-ийн «халуун туслах»,
--     «савлагаа» sheet-үүдэд хорогдлын багана байхгүйтэй нийцнэ. station_work
--     view-ийн qty-г brutto → netto болгож солив.
--   - Excel-ийн формула хорогдлыг үлдэгдэл хасахаас ӨМНӨ нийт дээр
--     үйлчлүүлдэг байсныг алдаа гэж үзэв — системд:
--     олгох = хэрэгцээ×(1+хорогдол) − цехийн үлдэгдэл − олгосон.

-- ---------------------------------------------------------------------------
-- materials.loss_pct — бутархай коэффициент (0.2 = 20% хорогдол)
-- ---------------------------------------------------------------------------

alter table public.materials
  add column if not exists loss_pct numeric(6,4) not null default 0
    check (loss_pct >= 0 and loss_pct <= 5);

-- Backfill: идэвхтэй ТК-уудын бохир/цэвэр харьцаанаас материал бүрийн
-- одоо мөрдөгдөж буй хорогдлыг нэг удаа гаргаж авна
update public.materials m
  set loss_pct = least(round(x.ratio - 1, 4), 5)
  from (
    select i.material_id,
           sum(i.brutto_qty) / nullif(sum(i.netto_qty), 0) as ratio
    from public.tech_card_items i
    join public.tech_card_groups g on g.id = i.group_id
    join public.tech_cards tc on tc.id = g.tech_card_id and tc.is_active
    group by i.material_id
  ) x
  where x.material_id = m.id
    and x.ratio is not null
    and x.ratio > 1;

-- ---------------------------------------------------------------------------
-- daily_material_needs: issue_need = Σ(netto × порц) × (1 + loss_pct)
-- (хуучин brutto_need/netto_need баганууд хэвээр — байрлал өөрчлөгдөхгүй)
-- ---------------------------------------------------------------------------

create or replace view public.daily_material_needs as
select
  b.production_date,
  i.material_id,
  m.code,
  m.name,
  m.base_unit,
  sum(i.brutto_qty * b.total_qty) as brutto_need,
  sum(i.netto_qty * b.total_qty) as netto_need,
  m.loss_pct,
  sum(i.netto_qty * b.total_qty) * (1 + m.loss_pct) as issue_need
from public.production_batches b
join public.tech_card_groups g on g.tech_card_id = b.tech_card_id
join public.tech_card_items i on i.group_id = g.id
join public.materials m on m.id = i.material_id
group by b.production_date, i.material_id, m.code, m.name, m.base_unit,
         m.loss_pct;

-- ---------------------------------------------------------------------------
-- station_work: цехийн норм = ЦЭВЭР норм × порц (хорогдолгүй)
-- ---------------------------------------------------------------------------

create or replace view public.station_work as
select
  b.id as batch_id,
  b.production_date,
  b.product_id,
  b.status,
  b.total_qty,
  b.tech_card_id,
  b.batch_seq,
  g.id as group_id,
  g.name as group_name,
  g.sort_order as group_sort,
  i.material_id,
  m.name as material_name,
  m.code as material_code,
  m.base_unit,
  i.sort_order as item_sort,
  (i.netto_qty * b.total_qty) as qty,
  s.station
from public.production_batches b
join public.tech_card_groups g on g.tech_card_id = b.tech_card_id
join public.tech_card_items i on i.group_id = g.id
join public.materials m on m.id = i.material_id
cross join lateral unnest(
  coalesce(
    i.stations,
    case
      when g.station is null then array[]::text[]
      when g.station = 'packaging' then array['packaging']
      else array[g.station, 'packaging']
    end
  )
) as s(station);
