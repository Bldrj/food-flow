-- Нэг бэлдэцийг НЭГ ТК доторх ОЛОН бүлэг хамтдаа зарлаж чадна.
--
-- 0026-гийн intermediate_recipes нь `distinct on (output_material_id)`-оор
-- бэлдэц бүрт ганц бүлэг сонгодог байв. Гэтэл технологийн карт нь ажлын
-- алхмаар хуваагддаг: «Үдэн» бэлдэц «Үдэн чанах» + «Үдэн амтлах» гэсэн
-- хоёр бүлгээс бүрдэнэ. Хуучин хувилбар дээр хоёр дахь бүлэг чимээгүй
-- алгасагдаж, жор дутуу задардаг байсан.
--
-- Шинэ логик: бэлдэц бүрт КАНОНИК ТК-г сонгоод (хамгийн сүүлд үүссэн
-- зарлалтаар), тэр ТК доторх ижил гарц зарласан БҮХ бүлгийг авна.
-- Өөр ТК-д давхар зарласан бол өмнөх шигээ нэгийг нь л авна — тэгэхгүй бол
-- жор олон дахин үржих байсан.
--
-- Хосолсон бүлгүүд ижил output_qty_per_portion-той байх ёстой: qty_per_output
-- нь бүлэг тус бүрийн орцыг НИЙТ гарцад хуваадаг тул ижил хуваарь дээр
-- нийлж бүтэн жор гарна.

drop view if exists public.station_intermediate_work;
drop view if exists public.daily_material_needs;
drop view if exists public.intermediate_recipes;

create view public.intermediate_recipes as
with def_card as (
  select distinct on (g.output_material_id)
    g.output_material_id, g.tech_card_id
  from public.tech_card_groups g
  join public.tech_cards tc on tc.id = g.tech_card_id and tc.is_active
  where g.output_material_id is not null
  order by g.output_material_id, g.created_at desc
),
def_group as (
  select g.id, g.output_material_id, g.output_qty_per_portion, g.tech_card_id
  from public.tech_card_groups g
  join def_card c on c.output_material_id = g.output_material_id
                 and c.tech_card_id = g.tech_card_id
)
select
  d.output_material_id as intermediate_id,
  d.id as group_id,
  d.tech_card_id,
  d.output_qty_per_portion,
  i.material_id as component_id,
  i.netto_qty / d.output_qty_per_portion as qty_per_output,
  i.stations,
  i.sort_order
from def_group d
join public.tech_card_items i on i.group_id = d.id;

create view public.daily_material_needs as
with direct as (
  select
    b.production_date,
    i.material_id,
    sum(i.brutto_qty * b.total_qty) as brutto,
    sum(i.netto_qty * b.total_qty) as netto
  from public.production_batches b
  join public.tech_card_groups g on g.tech_card_id = b.tech_card_id
  join public.tech_card_items i on i.group_id = g.id
  join public.materials m on m.id = i.material_id and m.kind = 'raw'
  where g.output_material_id is null
  group by b.production_date, i.material_id
),
exploded as (
  select
    d.production_date,
    r.component_id as material_id,
    sum(d.net_qty * r.qty_per_output) as netto
  from public.daily_intermediate_demand d
  join public.intermediate_recipes r on r.intermediate_id = d.material_id
  join public.materials cm on cm.id = r.component_id and cm.kind = 'raw'
  group by d.production_date, r.component_id
),
combined as (
  select production_date, material_id, brutto, netto from direct
  union all
  select production_date, material_id, netto, netto from exploded
)
select
  c.production_date,
  c.material_id,
  m.code,
  m.name,
  m.base_unit,
  sum(c.brutto) as brutto_need,
  sum(c.netto) as netto_need,
  m.loss_pct,
  sum(c.netto) * (1 + m.loss_pct) as issue_need
from combined c
join public.materials m on m.id = c.material_id
group by c.production_date, c.material_id, m.code, m.name, m.base_unit,
         m.loss_pct;

create view public.station_intermediate_work as
select
  d.production_date,
  d.source_station as station,
  d.material_id as intermediate_id,
  d.name as intermediate_name,
  d.base_unit as intermediate_unit,
  null::uuid as component_id,
  null::text as component_name,
  null::text as component_unit,
  d.gross_qty,
  d.leftover_qty,
  d.net_qty,
  d.net_qty as qty,
  -1 as sort_order
from public.daily_intermediate_demand d
union all
select
  d.production_date,
  s.station,
  d.material_id,
  d.name,
  d.base_unit,
  r.component_id,
  cm.name,
  cm.base_unit,
  d.gross_qty,
  d.leftover_qty,
  d.net_qty,
  d.net_qty * r.qty_per_output as qty,
  r.sort_order
from public.daily_intermediate_demand d
join public.intermediate_recipes r on r.intermediate_id = d.material_id
join public.materials cm on cm.id = r.component_id
cross join lateral unnest(
  coalesce(
    r.stations,
    case
      when d.source_station is null then array[]::text[]
      else array[d.source_station]
    end
  )
) as s(station);
