-- Захиалгын засварууд (2026-08-21, дизайн шүүмжийн дараа):
-- Ажиллуулах: Supabase Dashboard > SQL Editor дээр хуулж Run дарна.
--
--   ① order_items.tech_card_id-г ХАСАВ. ТК snapshot-ийг захиалга батлахад
--      биш, ҮЙЛДВЭРЛЭЛИЙН БАТЧ үүсэхэд авна (production_batches.tech_card_id,
--      дараагийн алхам). Учир нь:
--        - Гал тогоо үйлдвэрлэх өдрөө хүчинтэй идэвхтэй жороор хийнэ —
--          захиалга баталсан мөчийн жороор биш. Батлахад хөлдөөвөл 2 хоногийн
--          дараах үйлдвэрлэл хуучирсан хувилбарт түгжигдэж, баримт бодит
--          үйлдвэрлэлээс зөрнө.
--        - Батч үүсэх мөчид нэг л идэвхтэй ТК байдаг тул "нэг батч = нэг ТК"
--          дүрэм өөрөө биелнэ (өөр өөр snapshot-той мөрүүд нийлэх асуудал
--          үүсэхгүй).
--        - Хариуцлагын зааг: захиалга = эрэлт (хэн/юу/хэд/хэзээ),
--          батч = гүйцэтгэл (яг ямар жороор).
--   ② confirm_order()-оос идэвхтэй ТК шаардах хатуу шалгалтыг хасав —
--      захиалга бол эрэлтийн баримт, ТК нь дараа бэлэн болж болно.
--      Хатуу хориг нь батч үүсгэх RPC дээр (ТК-гүйгээр үйлдвэрлэж болохгүй);
--      UI дээр зөвлөмжийн шар анхааруулга хэвээр.
--   ③ confirmed_by нэмэв — created_by (үүсгэгч) ба баталагч хоёр өөр хүн
--      байж болно; нэг баганад холихгүй.
--   ④ qty numeric(14,6) → integer — порц үргэлж бүхэл тоо. Хожим 0.5 порц
--      хэрэгтэй болбол integer→numeric өргөтгөх нь алдагдалгүй нэг alter.
--   ⑤ Одооноос trigger-үүдийг drop if exists + create хэв маягаар бичнэ
--      (SQL Editor дээр дахин Run хийхэд алдаа өгөхгүй).

-- ① ТК snapshot баганыг хасна (draft data-д NULL байсан тул аюулгүй)
alter table public.order_items drop column if exists tech_card_id;

-- ③ Баталагчийн талбар
alter table public.orders add column if not exists confirmed_by text;

-- ④ Порц бүхэл тоо. Бутархай утга орсон байвал зогсооно (өгөгдөл гэмтээхгүй)
do $$
declare
  v_bad int;
begin
  select count(*) into v_bad
    from public.order_items
    where qty <> round(qty);
  if v_bad > 0 then
    raise exception 'Бутархай порцтой % мөр байна — эхлээд гараар засна уу', v_bad;
  end if;
end $$;

alter table public.order_items
  alter column qty type integer using qty::integer;

-- ② RPC-г шинэчилнэ: ТК шалгалт/snapshot-гүй, confirmed_by-тай
create or replace function public.confirm_order(
  p_order_id uuid,
  p_actor text default null
)
returns void as $$
declare
  v_status text;
  v_item_count int;
begin
  -- Давхар батлах race-ээс хамгаалж толгойг түгжинэ
  select status into v_status
    from public.orders
    where id = p_order_id
    for update;

  if v_status is null then
    raise exception 'Захиалга олдсонгүй';
  end if;
  if v_status <> 'draft' then
    raise exception 'Зөвхөн draft захиалгыг батална (одоогийн статус: %)', v_status;
  end if;

  select count(*) into v_item_count
    from public.order_items
    where order_id = p_order_id;
  if v_item_count = 0 then
    raise exception 'Мөргүй захиалгыг батлах боломжгүй';
  end if;

  -- Header trigger-ийн хоригийг тойрох transaction-local флаг
  perform set_config('app.confirming_order', 'on', true);

  update public.orders
    set status = 'confirmed',
        confirmed_at = now(),
        confirmed_by = p_actor
    where id = p_order_id;
end;
$$ language plpgsql;
