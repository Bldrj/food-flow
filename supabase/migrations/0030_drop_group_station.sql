-- Бүлгийн цех (tech_card_groups.station)-ийг устгаж, мөрийн зам
-- (tech_card_items.stations)-ыг цорын ганц эх сурвалж болгоно.
--
-- Шалтгаан: бүлгийн цех юуг ч хязгаарладаггүй, зөвхөн ШИНЭ мөрийн анхдагч
-- утга байсан. Мөр өөрийн stations-тай болмогц бүлгийн цех нөлөөгүй болдог
-- тул хоёр эх сурвалж чимээгүй зөрдөг байв (жишээ нь бүлэг «Бэлтгэл» атал
-- мөрүүд нь «Халуун, Савлагаа»). Нэг материал хэдэн ч цехээр дамжих
-- боломж нь мөрийн stations дээр хэвээр үлдэнэ.

-- ---------------------------------------------------------------------------
-- 1. Бүлгийн цехийг дагаж байсан мөрүүдэд замыг нь бодитоор бичнэ.
--    Томьёо нь 0016/0020-ийн fallback-тай яг ижил тул үр дүн өөрчлөгдөхгүй.
-- ---------------------------------------------------------------------------

update public.tech_card_items i
   set stations = case
         when g.station = 'packaging' then array['packaging']
         else array[g.station, 'packaging']
       end
  from public.tech_card_groups g
 where g.id = i.group_id
   and i.stations is null
   and g.station is not null;

-- Мөр ч, бүлэг ч цехгүй байсан мөрүүд NULL хэвээр — тэдгээр нь өмнө ч
-- аль ч цехийн дэлгэцэд гардаггүй байсан (зам нь хараахан тодорхойгүй).

-- ---------------------------------------------------------------------------
-- 2. station_work — g.station fallback хасаж i.stations-ыг шууд ашиглана
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
cross join lateral unnest(coalesce(i.stations, array[]::text[])) as s(station)
where g.output_material_id is null;

-- ---------------------------------------------------------------------------
-- 3-4. Бэлдэцийн view-үүд — group_station-ыг materials.source_station-оор
--      орлуулна (0026-д бэлдэц бүр source_station-тай байхыг constraint
--      шаарддаг тул энэ нь илүү найдвартай эх сурвалж).
--      Баганын жагсаалт өөрчлөгдөж буй тул drop → create.
-- ---------------------------------------------------------------------------

drop view if exists public.station_intermediate_work;
drop view if exists public.daily_material_needs;
drop view if exists public.intermediate_recipes;

create view public.intermediate_recipes as
with def_group as (
  select distinct on (g.output_material_id)
    g.id, g.output_material_id, g.output_qty_per_portion, g.tech_card_id
  from public.tech_card_groups g
  join public.tech_cards tc on tc.id = g.tech_card_id and tc.is_active
  where g.output_material_id is not null
  order by g.output_material_id, g.created_at desc
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

-- daily_material_needs — 0026-гийн тодорхойлолт хэвээр, зөвхөн
-- intermediate_recipes-ээс хамаарах тул дахин үүсгэж байна.
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

-- ---------------------------------------------------------------------------
-- 5. Багана устгана
-- ---------------------------------------------------------------------------

alter table public.tech_card_groups drop column if exists station;
