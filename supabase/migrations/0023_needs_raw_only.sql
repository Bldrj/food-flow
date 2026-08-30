-- daily_material_needs: зөвхөн ТҮҮХИЙ ЭД (docs/system-design.md §5)
-- Ажиллуулах: 0021-ийн ДАРАА Supabase Dashboard > SQL Editor дээр Run дарна.
--
-- Бэлдэц (kind='intermediate') ТК-ийн орцод ордог («Цуйван» савлагааны мөр)
-- боловч агуулахаас олгогддоггүй — цех дотор үйлдвэрлэгдэнэ. Агуулахын
-- хэрэгцээ/олголтын тооцоонд (/production, нүүр) оруулбал худал «дутуу
-- олголт» гарах тул view-ээс хасав. Цехийн түвшний бэлдэцийн урсгал
-- station_work + materials.source_station-оор харагдана.

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
where m.kind = 'raw'
group by b.production_date, i.material_id, m.code, m.name, m.base_unit,
         m.loss_pct;
