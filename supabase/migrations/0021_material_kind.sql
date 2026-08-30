-- Материалын төрөл: түүхий эд / бэлдэц (docs/system-design.md §5)
-- Ажиллуулах: 0020-ийн ДАРАА Supabase Dashboard > SQL Editor дээр Run дарна.
--
-- Шийдвэрүүд (2026-08-26, Excel-ийн «савлагаа» sheet-ээс):
--   - Савлагааны орцын мөрүүд («Жэюүг мах», «Цуйван», «Тефтель соус») түүхий
--     эд биш ӨМНӨХ ЦЕХИЙН ГАРЦ — тусдаа төрөл (kind = 'intermediate') болгож,
--     аль цех үйлдвэрлэдгийг source_station-д заана.
--   - Ингэснээр хүлээн авагч цехийн дэлгэц «{source} цехээс орж ирэх N кг»
--     гэж норм×порцоор харуулна; source цехийн дэлгэц «гаргаж өгөх бэлдэц»
--     хэсэгтээ өөрийн гарцуудаа харна — Excel-ийн «Халуунаас орж ирсэн /
--     Зөрүү» баганууд яг энэ.
--   - Бэлдэц агуулахын ledger-т бүртгэгдэхгүй (цех дотор үйлдвэрлэгдэж
--     өдөртөө хэрэглэгдэнэ) — kind нь зөвхөн цехийн урсгалын мэдээлэл.
--   - Нэхэмжлэлийн (0022) хүлээн авагчийг автоматаар оноход ашиглана:
--     raw → агуулах, intermediate → source_station.

alter table public.materials
  add column if not exists kind text not null default 'raw'
    check (kind in ('raw', 'intermediate')),
  add column if not exists source_station text
    check (source_station in ('prep', 'hot', 'hot_aux', 'packaging'));

-- Бэлдэц заавал үйлдвэрлэдэг цехтэй; түүхий эдэд source_station утгагүй
alter table public.materials
  drop constraint if exists materials_kind_source_check;
alter table public.materials
  add constraint materials_kind_source_check check (
    (kind = 'raw' and source_station is null)
    or (kind = 'intermediate' and source_station is not null)
  );
