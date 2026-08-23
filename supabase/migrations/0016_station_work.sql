-- Станцын ажлын view, Үе 3-ын 3-р алхам (docs/system-design.md §5)
-- Ажиллуулах: 0015-ын ДАРАА Supabase Dashboard > SQL Editor дээр Run дарна.
--
-- station_work: батч × хөлдөөсөн ТК-ийн мөр × замын станц бүрд нэг мөр.
-- Мөрийн зам = i.stations, NULL бол default [бүлгийн станц, савлагаа].
-- qty = бохир × батчийн порц — станцын дэлгэцийн тоо DB талд бодогдоно.
-- Станц оноогоогүй бүлгийн (g.station NULL, custom замгүй) мөр аль ч станцад
-- гарахгүй — ТК-ийн жагсаалтын «Станц дутуу» badge үүнийг сануулна.

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
  (i.brutto_qty * b.total_qty) as qty,
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
