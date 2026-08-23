-- Цехийн өдрийн тооллого: үлдэгдэл + хаягдал (docs/system-design.md §5)
-- Ажиллуулах: Supabase Dashboard > SQL Editor дээр Run дарна.
-- Дараа нь station_stock_counts-ийн RLS унтарсан эсэхийг шалгаарай.
--
-- Шийдвэрүүд (2026-08-24):
--   - Цех бүр өдрийн эцэст материалын үлдэгдлээ (leftover) болон маргааш
--     ашиглах боломжгүй хаягдлаа (waste) тоолж бүртгэнэ. Цехийн ажилтан
--     өөрийн дэлгэцээсээ бүртгэнэ.
--   - ҮЛДЭГДЭЛ ДАРААГИЙН ӨДРИЙН ТООЦООНД ОРНО: /production-ийн «Олгох
--     шаардлагатай» = хэрэгцээ − цехийн үлдэгдэл (сүүлчийн тоолсон өдрийн)
--     − олгосон. «Материал олгох» delta prefill мөн үүгээр бөглөгдөнө.
--     Хаягдал тооцоонд орохгүй — Үе 5-ын тайлангийн түүхий эд (норм vs
--     бодит, хаягдлын %).
--   - LEDGER-Т НӨЛӨӨГҮЙ: материал агуулахаас аль хэдийн зарлагдсан тул
--     цехийн үлдэгдэл ч, хаягдал ч агуулахын үлдэгдлийг өөрчлөхгүй.
--     Энэ бол цехийн түвшний тооллогын snapshot — тиймээс immutable биш,
--     ажилтан өдөртөө засаж/устгаж болно.
--   - Урьдчилсан зарлага (маргааш, 48 цагийн дараах хэрэгцээнд) нэмэлт
--     загвар шаардахгүй — stock_issues.production_date аль хэдийн ирээдүйн
--     огноог дэмждэг, олголт тухайн өдрийнхөө тооцоонд л орно.

create table if not exists public.station_stock_counts (
  id uuid primary key default gen_random_uuid(),
  date date not null default current_date,
  station text not null
    check (station in ('prep', 'hot', 'hot_aux', 'packaging')),
  material_id uuid not null references public.materials (id) on delete restrict,
  qty numeric(14,6) not null check (qty > 0),
  type text not null check (type in ('leftover', 'waste')),
  note text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (date, station, material_id, type)
    -- нэг өдөр нэг цехэд нэг материал төрөл бүрээр нэг л мөр
);

create index if not exists station_stock_counts_date_idx
  on public.station_stock_counts (date, type);

drop trigger if exists station_stock_counts_updated_at on public.station_stock_counts;
create trigger station_stock_counts_updated_at
  before update on public.station_stock_counts
  for each row execute function public.set_updated_at();

alter table public.station_stock_counts disable row level security;
