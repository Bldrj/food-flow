-- Мөрийн станцын зам (0014-ийн prep_station-ийг орлоно)
-- Ажиллуулах: 0014-ийн ДАРАА Supabase Dashboard > SQL Editor дээр Run дарна.
--
-- Шийдвэрийн өөрчлөлт (2026-08-23):
--   - Excel-ийн станцын тэмдэглэгээ бодит биш — бодитоор нэг материал ХЭДЭН Ч
--     цехээр дамжиж болно (Бэлтгэл хэрчинэ → Халуун чанана → Савлагаа
--     савлана). Ганц prep_station талбар хүрэлцэхгүй тул мөр бүрд
--     ДАРААЛАЛТАЙ замын жагсаалт (stations text[]) хадгална.
--   - Савлагаа замын жинхэнэ алхам (бүх хоол дамждаг тул default замд
--     автоматаар орно).
--   - stations = NULL → default зам [бүлгийн станц, савлагаа] гэж үзнэ —
--     ингэснээр ихэнх мөрөнд гараар зам заах шаардлагагүй, бүлгийн станцын
--     оноолт л хангалттай. Зам нь бүлгээс гаждаг мөрөнд л custom зам бичнэ.
--   - Станцын дэлгэц (Үе 3-ын дараагийн алхам) мөрийг замд нь орсон станц
--     бүр дээр харуулна.

alter table public.tech_card_items
  add column if not exists stations text[]
    check (
      stations is null
      or stations <@ array['prep', 'hot', 'hot_aux', 'packaging']
    );

-- prep_station-д утга оноосон мөрийг замд хөрвүүлж шилжүүлнэ:
-- [prep_station, бүлгийн станц, савлагаа] (null-ууд хасагдана)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'tech_card_items'
      and column_name = 'prep_station'
  ) then
    update public.tech_card_items i
      set stations = array_remove(
        array[i.prep_station, g.station, 'packaging'], null)
      from public.tech_card_groups g
      where g.id = i.group_id
        and i.prep_station is not null;
    alter table public.tech_card_items drop column prep_station;
  end if;
end $$;
