-- PRODUCTION FIX: Жэюүгийн идэвхтэй ТК-с «Омлет /1листний орц ба 45порц гарна/» бүлгийг хасах
-- Огноо: 2026-09-26
--
-- Яагаад: 0033 нь «1. Жэюүг» хуудасны 5–61-р мөрийг бүхэлд нь авсан тул 20–29-р
-- мөрний омлет блок дагаж орсон. Гэтэл:
--   • тэр хуудасны порцын бүрэлдэхүүн (AB–AD багана): Үдэн 40, Будаа 180,
--     Жэюүг мах 140, Шар манжин 20, Цагаан лууван 10 — омлет байхгүй;
--   • омлет блокт бохир жин, захиалгын тоо, бэлдэц/порцлох жин бүгд хоосон;
--   • «савлагаа» хуудсанд «Омлет 2ш» нь Тефтель 530гр-ын доор байна;
--   • хуучин data.xlsx-д «Тефтель омлет … 6 лист хийнэ» гэж тэмдэглэсэн;
--   • 0001 seed (2026-08-27) энэ бүлгийг зориудаар хассан байсан.
-- Бүлэг нь гарцгүй (output_material_id null) тул Халуун цехээс порц тутамд
-- омлетын орц хасагдаад, Савлагаанд юу ч ордоггүй байсан.
--
-- Excel-д өөрчлөлт ОРУУЛААГҮЙ. Баталгаажуулах асуулт: docs/асуулт.md
--
-- Юу хийдэг вэ: идэвхтэй ТК-с омлет бүлэг + 9 орцыг устгаж, дараах бүлгүүдийн
-- sort_order-ийг 1-ээр урагшлуулна. station_work / intermediate_recipes нь view
-- тул автоматаар дагана. Дахин ажиллуулахад аюулгүй.
-- Шалгасан: v3 ТК-д холбогдсон цорын ганц батч (2026-09-26) цехийн явцгүй.

do $$
declare
  v_tc  uuid;
  v_gid uuid;
  v_sort int;
  v_items int;
begin
  select tc.id into v_tc
  from public.tech_cards tc
  join public.products p on p.id = tc.product_id
  where p.code = 'PRD-016' and tc.is_active;
  if v_tc is null then
    raise exception 'PRD-016-ийн идэвхтэй ТК олдсонгүй';
  end if;

  select g.id, g.sort_order into v_gid, v_sort
  from public.tech_card_groups g
  where g.tech_card_id = v_tc and g.name like 'Омлет%';
  if v_gid is null then
    raise notice 'Омлет бүлэг аль хэдийн байхгүй — алгасав';
    return;
  end if;

  delete from public.tech_card_items where group_id = v_gid;
  get diagnostics v_items = row_count;
  delete from public.tech_card_groups where id = v_gid;

  update public.tech_card_groups
  set sort_order = sort_order - 1
  where tech_card_id = v_tc and sort_order > v_sort;

  raise notice 'Омлет бүлэг устгав: % орц, sort_order % -с дээшхийг шилжүүлэв', v_items, v_sort;
end $$;
