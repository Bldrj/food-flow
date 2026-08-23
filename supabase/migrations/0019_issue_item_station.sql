-- Зарлагын мөрөнд цехийн харьяалал (docs/system-design.md §5)
-- Ажиллуулах: Supabase Dashboard > SQL Editor дээр Run дарна.
--
-- Шийдвэрүүд (2026-08-24):
--   - Агуулахаас гарсан материал «үйлдвэрлэл» гэсэн ерөнхий хар хайрцагт
--     очдог байсныг зассан: зарлагын мөр бүр ЦЕХЭД харьяалагдана.
--   - «Материал олгох» prefill цехийг материалын ЗАМЫН ЭХНИЙ АЖЛЫН ЦЕХЭЭС
--     автоматаар онооно (гахайн мах [Бэлтгэл, Халуун, Савлагаа] замтай бол
--     Бэлтгэлд олгогдоно); нярав зарлагын дэлгэц дээр сольж болно.
--   - Үр дүн: цех бүрийн тэнцэл = авсан (олгогдсон Σ) − үлдэгдэл (тоолсон)
--     − хаягдал = хэрэглэсэн — Үе 5-ын норм vs бодит тайлангийн суурь.
--   - Цех ХООРОНДЫН шилжилт баримтжихгүй (ухамсартай хязгаарлалт) — өдрийн
--     эцсийн тооллого биет байршлыг хаана ч байсан барьж авна.
--   - station nullable: хуучин баримтууд болон чөлөөт зарлагад цехгүй мөр
--     байж болно.

alter table public.stock_issue_items
  add column if not exists station text
    check (station in ('prep', 'hot', 'hot_aux', 'packaging'));

-- Цех бүрийн өдрийн бодит авсан Σ — цехийн тооллогын «Авсан» багана болон
-- Үе 5-ын тайлангийн эх сурвалж
create or replace view public.daily_station_issued as
select
  si.production_date,
  i.station,
  i.material_id,
  sum(i.qty) as issued_qty
from public.stock_issues si
join public.stock_issue_items i on i.stock_issue_id = si.id
where si.status = 'confirmed'
  and i.station is not null
group by si.production_date, i.station, i.material_id;
