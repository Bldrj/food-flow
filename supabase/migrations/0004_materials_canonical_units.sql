-- Материалын base_unit-ийг canonical 3 нэгжид хязгаарлах (docs §5, 2026-08-18-ны шийдвэр)
-- Ажиллуулах: Supabase Dashboard > SQL Editor дээр хуулж Run дарна.
--
-- base_unit = kg | l | pcs гуравхан хэмжээс. g/ml нь base unit биш — жижиг нэгжээр
-- оруулах нь орлого/ТК-ийн формын хөрвүүлэлтийн ажил (g → ×0.001 kg гэх мэт).
-- Одоо байгаа g/ml материалуудыг kg/l болгож, min_stock-ийг нь ÷1000 хөрвүүлнэ.

do $$
declare
  v_count int;
begin
  -- Хамгаалалт: g/ml материалд гүйлгээ/баримтын мөр байвал тэдгээрийн тоо хэмжээ
  -- хуучин нэгжээр бичигдсэн тул энгийн UPDATE хийж болохгүй — гараар шийднэ.
  select count(*) into v_count
  from public.materials m
  where m.base_unit in ('g', 'ml')
    and (
      exists (select 1 from public.goods_receipt_items i where i.material_id = m.id)
      or exists (select 1 from public.stock_movements s where s.material_id = m.id)
    );
  if v_count > 0 then
    raise exception 'g/ml нэгжтэй % материалд гүйлгээ/баримтын мөр байна — тоо хэмжээг нь эхлээд гараар хөрвүүлэх шаардлагатай', v_count;
  end if;

  update public.materials
    set base_unit = 'kg', min_stock = min_stock / 1000.0
    where base_unit = 'g';

  update public.materials
    set base_unit = 'l', min_stock = min_stock / 1000.0
    where base_unit = 'ml';
end $$;

alter table public.materials
  drop constraint if exists materials_base_unit_check;
alter table public.materials
  add constraint materials_base_unit_check
  check (base_unit in ('kg', 'l', 'pcs'));
