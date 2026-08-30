-- Жорын орцын default зам: [бүлгийн цех → бэлдэц бэлэн болох цех]
-- Ажиллуулах: 0028-ийн ДАРАА Supabase Dashboard > SQL Editor дээр Run дарна.
--
-- Шийдвэр (2026-08-27):
--   - 0026-д жорын орцын default зам зөвхөн [бүлгийн цех] байсан нь дутуу:
--     «Жэюүг мах»-ын орцууд БЭЛТГЭЛ цехэд хэрчигдээд ХАЛУУН цехэд чанагддаг
--     буюу 2 цехээр дамждаг атал халуун цехийн дэлгэцэд огт харагдахгүй
--     байв. Энгийн бүлгийн [цех → савлагаа] дүрмийн жорын хувилбар нь
--     [бүлгийн цех → бэлдэц бэлэн болох цех (materials.source_station)].
--   - Хоёр нь ижил бол (Омлет: бүлэг ХТ, гарц ХТ) давхардуулахгүй нэг мөр.
--   - Мөрийн stations гараар заасан бол өмнөх шигээ тэр зам давамгайлна.
--   - Зөвхөн ХАРУУЛАЛТ: daily_material_needs бэлдэцийг цехээс үл хамааран
--     intermediate_recipes-ээр задалдаг тул давхар тооцоо үүсэхгүй.

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
    coalesce(
      (select array_agg(distinct x)
       from unnest(
         array_remove(array[r.group_station, d.source_station], null)
       ) as t(x)),
      array[]::text[]
    )
  )
) as s(station);
