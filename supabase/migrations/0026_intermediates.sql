-- Бэлдэц (intermediate) — нэгдэж хувирдаг цэгийн загвар (docs/system-design.md §5)
-- Ажиллуулах: 0025-ын ДАРАА Supabase Dashboard > SQL Editor дээр Run дарна.
--
-- Шийдвэрүүд (2026-08-27, «савлагаа» sheet-ийн «Жэюүг мах 140гр» кейсээс):
--   - 0025-ын замын модель ДАМЖИН ӨНГӨРӨХ материалд зөв боловч НЭГДЭЖ
--     ХУВИРДАГ цэгт хүрэлцэхгүй: 5 түүхий эд халуун цехэд чанагдаж шинэ
--     нэр, шинэ жинтэй «Жэюүг мах» болдог — савлагаа үүнийг задалж жинлэж
--     чадахгүй, үлдэгдлээ зөвхөн бэлдэцээр тоолно. Тиймээс ГИБРИД:
--     энгийн мөрөнд зам хэвээр, нэгдэх цэгт бэлдэц.
--   - Бэлдэц = materials мөр (kind='intermediate', source_station) — 0021-ийн
--     санаа эргэж оров. Агуулахын ledger-т бүртгэгдэхгүй хэвээр;
--     station_stock_counts-д ердийн материал шиг тоологдоно.
--   - ЖОР НЭГ Л ГАЗАР: гарган авдаг хоолны ТК-ийн бүлэгт output_material_id +
--     output_qty_per_portion (тухайн хоолны 1 порцод ноогдох гарц, base_unit).
--     Бүлгийн мөрүүд = бэлдэцийн жор. Гарцын 1 нэгжид орох түүхий эд =
--     мөрийн норм ÷ гарцын норм (Гахайн мах 81.9/140 = 0.585 гр/гр) —
--     чанахад жин өөрчлөгдөхийг (гарцын коэффициент) энэ харьцаа шингээнэ.
--   - ХЭРЭГЛЭЭ ХЭД Ч БАЙЖ БОЛНО: хэрэглэгч ТК-ууд бэлдэцийг энгийн орцын
--     мөрөөр заана (Жэюүг 140гр, Korean bento 120гр) — нийт эрэлт граммаар
--     нэгтгэгдэнэ, «аль хоолны порц вэ» гэж хуваарилах шаардлагагүй.
--   - ДАВХАР ТООЦООЛОЛГҮЙ: гарц зарласан бүлгийн мөрүүд шууд хэрэгцээ/
--     station_work-оос ХАСАГДАНА — тэдний ажил бэлдэцийн нийт эрэлтээс
--     (бүх хэрэглэгч хоолны Σ) day-түвшинд бодогдоно (station_intermediate_work).
--     Учир нь зөвхөн өөрийн батчаар үржүүлбэл Korean bento-гийн хэрэглээ
--     орхигдоно.
--   - ҮЛДЭГДЛИЙН ХАСАЛТ ТҮВШИН БҮРДЭЭ: бэлдэцийн үлдэгдэл (бүх цехийн Σ,
--     сүүлчийн тоолсон өдрийн — /production-ий carryover-той ижил дүрэм)
--     бэлдэцийн эрэлтээс SQL талд хасагдаад ДАРАА нь жороор задардаг.
--     «Захиалгаас 0.5 порц хасах» биш — бусад орц (үдэн, будаа) 8 порцоороо
--     үлддэг тул зөвхөн тухайн бэлдэцийн орцууд 7.5 порцоор бэлтгэгдэнэ.
--   - Түүхий эдийн үлдэгдэл өмнөх шигээ UI талд (/production carryover) хасагдана.
--   - Бэлдэц дотор бэлдэц: одоогийн өгөгдөлд байхгүй тул задаргаа 1 үе шат —
--     жорын бүлэг доторх бэлдэц орц задаргаанд орохгүй (хожим recursive CTE).
--   - Жорыг ИДЭВХТЭЙ ТК-аас уншина (батч ТК-гаа хөлдөөдөг ч бэлдэцийн жор
--     нэг эх сурвалжтай байх нь энгийн) — нэг бэлдэцийг идэвхтэй картуудын
--     нэг л бүлэг тодорхойлох ёстой; давхардвал сүүлд үүссэн бүлгийг авна.

-- ---------------------------------------------------------------------------
-- 1. materials.kind + source_station (0021-ийн адил)
-- ---------------------------------------------------------------------------

alter table public.materials
  add column if not exists kind text not null default 'raw'
    check (kind in ('raw', 'intermediate')),
  add column if not exists source_station text
    check (source_station in ('prep', 'hot', 'hot_aux', 'packaging'));

alter table public.materials
  drop constraint if exists materials_kind_source_check;
alter table public.materials
  add constraint materials_kind_source_check check (
    (kind = 'raw' and source_station is null)
    or (kind = 'intermediate' and source_station is not null)
  );

-- ---------------------------------------------------------------------------
-- 2. tech_card_groups: бүлгийн гарц (энэ бүлэг ямар бэлдэц гаргадаг вэ)
-- ---------------------------------------------------------------------------

alter table public.tech_card_groups
  add column if not exists output_material_id uuid
    references public.materials (id) on delete set null,
  add column if not exists output_qty_per_portion numeric(14,6)
    check (output_qty_per_portion > 0);

alter table public.tech_card_groups
  drop constraint if exists tech_card_groups_output_check;
alter table public.tech_card_groups
  add constraint tech_card_groups_output_check check (
    (output_material_id is null) = (output_qty_per_portion is null)
  );

create index if not exists tech_card_groups_output_idx
  on public.tech_card_groups (output_material_id)
  where output_material_id is not null;

-- ---------------------------------------------------------------------------
-- 3. intermediate_recipes: бэлдэц бүрийн жор, гарцын 1 нэгжид шилжүүлсэн
-- ---------------------------------------------------------------------------

create or replace view public.intermediate_recipes as
with def_group as (
  -- Бэлдэц бүрийг тодорхойлох бүлэг: идэвхтэй ТК-уудаас, давхардвал сүүлийнх
  select distinct on (g.output_material_id)
    g.id, g.output_material_id, g.output_qty_per_portion, g.station,
    g.tech_card_id
  from public.tech_card_groups g
  join public.tech_cards tc on tc.id = g.tech_card_id and tc.is_active
  where g.output_material_id is not null
  order by g.output_material_id, g.created_at desc
)
select
  d.output_material_id as intermediate_id,
  d.id as group_id,
  d.tech_card_id,
  d.station as group_station,
  d.output_qty_per_portion,
  i.material_id as component_id,
  i.netto_qty / d.output_qty_per_portion as qty_per_output,
  i.stations,
  i.sort_order
from def_group d
join public.tech_card_items i on i.group_id = d.id;

-- ---------------------------------------------------------------------------
-- 4. daily_intermediate_demand: өдрөөр бэлдэцийн эрэлт − үлдэгдэл
--    (үлдэгдэл = сүүлчийн тоолсон өдрийн бүх цехийн Σ — /production-той ижил)
-- ---------------------------------------------------------------------------

create or replace view public.daily_intermediate_demand as
with gross as (
  select
    b.production_date,
    i.material_id,
    sum(i.netto_qty * b.total_qty) as gross_qty
  from public.production_batches b
  join public.tech_card_groups g on g.tech_card_id = b.tech_card_id
  join public.tech_card_items i on i.group_id = g.id
  join public.materials m on m.id = i.material_id and m.kind = 'intermediate'
  where g.output_material_id is null -- хэрэглээний мөр л (жорын бүлэг биш)
  group by b.production_date, i.material_id
)
select
  x.production_date,
  x.material_id,
  m.name,
  m.base_unit,
  m.source_station,
  x.gross_qty,
  coalesce(l.qty, 0) as leftover_qty,
  greatest(x.gross_qty - coalesce(l.qty, 0), 0) as net_qty
from gross x
join public.materials m on m.id = x.material_id
left join lateral (
  select sum(c.qty) as qty
  from public.station_stock_counts c
  where c.type = 'leftover'
    and c.material_id = x.material_id
    and c.date = (
      select max(c2.date)
      from public.station_stock_counts c2
      where c2.type = 'leftover' and c2.date < x.production_date
    )
) l on true;

-- ---------------------------------------------------------------------------
-- 5. daily_material_needs: 2 үе шаттай задаргаа
--    шууд түүхий эд (жорын бүлгээс бусад) + бэлдэцийн цэвэр эрэлт × жор
-- ---------------------------------------------------------------------------

create or replace view public.daily_material_needs as
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

-- ---------------------------------------------------------------------------
-- 6. station_work: жорын бүлгийн мөрүүд ХАСАГДАНА (давхар тооцооноос
--    сэргийлж — тэдний ажил station_intermediate_work-т day-түвшинд)
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
) as s(station)
where g.output_material_id is null;

-- ---------------------------------------------------------------------------
-- 7. station_intermediate_work: бэлдэцийн өдрийн ажил цехээр
--    component_id NULL мөр = гарц («гаргаж өгөх») source цех дээр;
--    бусад мөр = жорын орц, замынхаа цех бүр дээр (default: жорын бүлгийн цех)
-- ---------------------------------------------------------------------------

create or replace view public.station_intermediate_work as
select
  d.production_date,
  coalesce(d.source_station, r.group_station) as station,
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
left join lateral (
  select r0.group_station
  from public.intermediate_recipes r0
  where r0.intermediate_id = d.material_id
  limit 1
) r on true
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
      when r.group_station is null then array[]::text[]
      else array[r.group_station]
    end
  )
) as s(station);
