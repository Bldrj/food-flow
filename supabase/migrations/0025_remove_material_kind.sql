-- «Түүхий эд / бэлдэц» төрлийг хасна (0021-ийг буцаана)
-- Ажиллуулах: Supabase Dashboard > SQL Editor дээр Run дарна.
--
-- Шийдвэрийн өөрчлөлт (2026-08-26, хэрэглэгчийн туршилтын дараа):
--   - Материалын урсгалыг тусдаа kind/source_station-аар биш ТЕХНОЛОГИЙН
--     КАРТЫН ЗАМААС (tech_card_items.stations) шууд гаргана: нэг материал
--     (Гахайн мах) замынхаа дагуу цехээс цехэд дамждаг — тусдаа «бэлдэц»
--     материал бүртгэх шаардлагагүй.
--   - Нэхэмжлэлийн хүлээн авагч замаас: нэхэмжилж буй цех замын эхний цех
--     биш бол ӨМНӨХ цех, эхний цех бол агуулах. Цехэд ирсэн нэхэмжлэлийг
--     тухайн цех цааш нярав руу дамжуулж болно (шинэ нэхэмжлэл үүсэж
--     гинж хэлбэрээр хөтлөгдөнө) — UI талд.
--   - daily_material_needs-ийн kind шүүлт хэрэггүй болов (бүх материал
--     агуулахаас олгогдоно).

-- View эхлээд kind-ээс салгана (баганыг устгахын өмнө)
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

alter table public.materials
  drop constraint if exists materials_kind_source_check;
alter table public.materials
  drop column if exists kind,
  drop column if exists source_station;
