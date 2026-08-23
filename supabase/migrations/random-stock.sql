-- Туршилт: бүх идэвхтэй материалд санамсаргүй үлдэгдэл оноох
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

-- Шалгах: доорх мөрүүдийн комментыг авч тусад нь ажиллуулна
-- select name, base_unit, balance
-- from public.stock_balances
-- where is_active
-- order by name;