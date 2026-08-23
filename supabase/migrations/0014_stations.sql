-- Станцууд, Үе 3-ын 1-р алхам (docs/system-design.md §5)
-- Ажиллуулах: Supabase Dashboard > SQL Editor дээр Run дарна.
-- Дараа нь batch_station_progress-ийн RLS унтарсан эсэхийг шалгаарай.
--
-- Шийдвэрүүд (2026-08-23, 0005-д хойшлуулсан станцын загварыг буцааж авчрав):
--   - 4 станц: prep (Бэлтгэл) | hot (Халуун) | hot_aux (Халуун туслах) |
--     packaging (Савлагаа). Excel-ийн бодит дата дээр илэрсэн бүтэц.
--   - ТК-ийн БҮЛЭГ бүр станцад оноогдоно (tech_card_groups.station) — станц
--     бүр өдрийн батчуудаас өөрийн бүлгүүдээ автоматаар харна. NULL =
--     хуваарилагдаагүй (UI-д сануулга).
--   - Мөрийн prep_station (сонголттой): «Бэлтгэл → Халуун туслах» маягийн
--     транзит — материалыг анх боловсруулах станц. NULL = шууд бүлгийнхээ
--     станцад очно.
--   - Савлагаа руу БҮХ хоол дамждаг тул ТК-д тэмдэглэхгүй (процессын тогтмол
--     дүрэм) — савлагааны дэлгэц батчийн порцын тоогоор ажиллана.
--   - batch_station_progress: станцын «Дууслаа» тэмдэглэгээ. Ledger биш,
--     мэдээллийн чанартай тул immutable хамгаалалтгүй — андуурч дарсныг
--     устгаж болно. Батч уствал (төлөвлөсөн батч цэвэрлэгдэх) cascade.
--     Батчийн статустай одоохондоо холбохгүй (packed Үе 3-ын дараа).

-- ---------------------------------------------------------------------------
-- ТК: бүлгийн станц + мөрийн транзит станц
-- ---------------------------------------------------------------------------

alter table public.tech_card_groups
  add column if not exists station text
    check (station in ('prep', 'hot', 'hot_aux', 'packaging'));

alter table public.tech_card_items
  add column if not exists prep_station text
    check (prep_station in ('prep', 'hot', 'hot_aux', 'packaging'));

-- ---------------------------------------------------------------------------
-- Станцын гүйцэтгэлийн тэмдэглэгээ
-- ---------------------------------------------------------------------------

create table if not exists public.batch_station_progress (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.production_batches (id) on delete cascade,
  station text not null
    check (station in ('prep', 'hot', 'hot_aux', 'packaging')),
  done_at timestamptz not null default now(),
  done_by text,
  unique (batch_id, station)
);

create index if not exists batch_station_progress_batch_idx
  on public.batch_station_progress (batch_id);

alter table public.batch_station_progress disable row level security;
