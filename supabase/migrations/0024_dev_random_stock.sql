-- ТЕСТ ГОРИМЫН санамсаргүй үлдэгдэл оноох RPC (random-stock.sql-ийг UI-гаас)
-- Ажиллуулах: Supabase Dashboard > SQL Editor дээр Run дарна.
--
-- АНХААР: dev_reset_* функцүүдтэй адил зөвхөн хөгжүүлэлтэд зориулагдсан —
-- бодит ашиглалтад гарахын өмнө (Үе 6, Auth/RLS) DROP хийнэ:
--   drop function public.dev_random_stock(text);
--
-- Ledger-ийн зарчмыг зөрчихгүй: үлдэгдлийг ШУУД бичихгүй, зорилтот тоо руу
-- хүргэх ADJUST мөр нэмнэ (append-only хэвээр, түүх мөшгигдөнө). Тиймээс
-- дахин дуудахад үлдэгдэл дахин санамсаргүй тоо руу шилжинэ.
-- Санамсаргүй муж (random-stock.sql-тэй ижил): ш 100–2000, л 10–100,
-- кг 20–200.

create or replace function public.dev_random_stock(p_confirm text)
returns integer as $$
declare
  v_count integer;
begin
  if p_confirm is distinct from 'RANDOM' then
    raise exception 'Баталгаажуулалт буруу — p_confirm=''RANDOM'' дамжуулна';
  end if;

  insert into public.stock_movements (material_id, type, qty, created_by, note)
    select
      d.material_id,
      'adjust',
      d.delta,
      'Тест скрипт',
      'Туршилтын үлдэгдэл оноолт'
    from (
      select
        b.material_id,
        (case b.base_unit
           when 'pcs' then floor(100 + random() * 1901)::numeric
           when 'l'   then round((10 + random() * 90)::numeric, 1)
           else            round((20 + random() * 180)::numeric, 1)
         end) - b.balance as delta
      from public.stock_balances b
      where b.is_active
    ) d
    where d.delta <> 0;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$ language plpgsql security definer;
