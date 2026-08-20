-- Агуулах, ledger-ийн хамгаалалтын засварууд (0002-ын кодын шалгалтаар илэрсэн цоорхойнууд)
-- Ажиллуулах: Supabase Dashboard > SQL Editor дээр хуулж Run дарна.
--
-- Хаах цоорхойнууд:
--   1. goods_receipts-ийн ТОЛГОЙ хамгаалалтгүй байсан — батлагдсаны дараа
--      supplier_id, receipt_date, бүр status-ыг UPDATE-ээр өөрчилж болж байв.
--      Status-ыг draft руу буцаагаад дахин confirm хийвэл ДАВХАР movement үүснэ.
--   2. RPC-г тойроод `update ... set status='confirmed'` хийвэл ledger-гүй
--      "батлагдсан" баримт үүсэж байв → батлах шилжилтийг зөвхөн RPC-ээр болгов.
--   3. Race: confirm явж байх агшинд өөр session тухайн draft баримтад мөр нэмбэл
--      шинэ мөр RPC-ийн INSERT..SELECT-д орохгүй өнгөрч, movement-гүй мөр
--      confirmed баримтад үлдэж болж байв → item trigger receipt-ийн мөрийг
--      FOR SHARE-ээр түгжиж confirm-тэй цуваа болгов.
--   4. TRUNCATE row-level trigger-т баригддаггүй байв → statement trigger нэмэв.
--   5. Draft баримтад confirmed_at гараар тавигдахыг CHECK-ээр хориглов.

-- ---------------------------------------------------------------------------
-- 1+2. Батлагдсан баримтын толгойг хамгаалах + батлах шилжилтийг зөвхөн RPC-ээр
-- RPC нь transaction-local тохиргоо (app.confirming_gr) тавьдаг — trigger үүгээр
-- "энэ update RPC дотроос ирсэн" гэдгийг таньж, гаднаас статус солихыг хориглоно.
-- ---------------------------------------------------------------------------

create or replace function public.block_confirmed_receipt_change()
returns trigger as $$
begin
  if old.status = 'confirmed' then
    raise exception 'Батлагдсан орлогын баримтыг өөрчлөх боломжгүй — залруулгыг adjust гүйлгээгээр хийнэ үү';
  end if;
  if new.status = 'confirmed'
     and current_setting('app.confirming_gr', true) is distinct from 'on' then
    raise exception 'Баримтыг зөвхөн confirm_goods_receipt() функцээр батална';
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists goods_receipts_immutable on public.goods_receipts;
create trigger goods_receipts_immutable
  before update on public.goods_receipts
  for each row execute function public.block_confirmed_receipt_change();

-- ---------------------------------------------------------------------------
-- 3. Item trigger: receipt-ийн мөрийг FOR SHARE-ээр түгжинэ.
-- Confirm (FOR UPDATE) явж байвал энд хүлээгээд, дууссаны дараа хамгийн сүүлийн
-- committed статусыг (confirmed) хараад raise хийнэ — race хаагдана.
-- Trigger нь 0002-ынхтой ижил нэртэй тул функцийг л солиход хангалттай.
-- ---------------------------------------------------------------------------

create or replace function public.block_confirmed_receipt_item_change()
returns trigger as $$
declare
  v_new_receipt uuid;
  v_old_receipt uuid;
begin
  -- INSERT: шинэ баримт, DELETE: хуучин баримт, UPDATE: хоёуланг нь шалгана
  -- (DELETE үед NEW, INSERT үед OLD тодорхойгүй тул TG_OP-оор салгана)
  if tg_op in ('INSERT', 'UPDATE') then
    v_new_receipt := new.goods_receipt_id;
  end if;
  if tg_op in ('UPDATE', 'DELETE') then
    v_old_receipt := old.goods_receipt_id;
  end if;

  -- Confirm-тэй зэрэгцэхээс сэргийлж түгжинэ (FOR SHARE нь FOR UPDATE-тэй
  -- зөрчилддөг тул confirm дуустал хүлээнэ; өөр item өөрчлөлтүүд хоорондоо
  -- FOR SHARE тул түгжирэлгүй зэрэг явна)
  perform 1 from public.goods_receipts
    where id in (v_new_receipt, v_old_receipt)
    for share;

  if exists (
    select 1 from public.goods_receipts
    where status = 'confirmed'
      and id in (v_new_receipt, v_old_receipt)
  ) then
    raise exception 'Батлагдсан орлогын баримтын мөрийг өөрчлөх боломжгүй — adjust гүйлгээгээр залруулна уу';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$ language plpgsql;

-- ---------------------------------------------------------------------------
-- 4. Ledger-ийг TRUNCATE-ээс хамгаалах (row trigger TRUNCATE-д ажилладаггүй)
-- ---------------------------------------------------------------------------

drop trigger if exists stock_movements_no_truncate on public.stock_movements;
create trigger stock_movements_no_truncate
  before truncate on public.stock_movements
  for each statement execute function public.block_ledger_change();

-- ---------------------------------------------------------------------------
-- 5. confirmed_at зөвхөн confirmed баримтад л байж болно
-- ---------------------------------------------------------------------------

alter table public.goods_receipts
  drop constraint if exists goods_receipts_confirmed_at_check;
alter table public.goods_receipts
  add constraint goods_receipts_confirmed_at_check
  check (status = 'confirmed' or confirmed_at is null);

-- ---------------------------------------------------------------------------
-- RPC шинэчлэл: батлахын өмнө transaction-local флаг тавина (trigger №1-2-т таарна).
-- set_config(..., true) — transaction дуусмагц (commit/rollback аль аль нь) арилна.
-- ---------------------------------------------------------------------------

create or replace function public.confirm_goods_receipt(
  p_receipt_id uuid,
  p_actor text default null
)
returns void as $$
declare
  v_status text;
  v_item_count int;
begin
  -- Давхар батлах race-ээс хамгаалж мөрийг түгжинэ
  select status into v_status
    from public.goods_receipts
    where id = p_receipt_id
    for update;

  if v_status is null then
    raise exception 'Орлогын баримт олдсонгүй';
  end if;
  if v_status <> 'draft' then
    raise exception 'Зөвхөн draft төлөвтэй баримтыг батална (одоогийн төлөв: %)', v_status;
  end if;

  select count(*) into v_item_count
    from public.goods_receipt_items
    where goods_receipt_id = p_receipt_id;
  if v_item_count = 0 then
    raise exception 'Мөргүй баримтыг батлах боломжгүй';
  end if;

  insert into public.stock_movements
      (material_id, type, qty, unit_price, goods_receipt_id, created_by)
  select
      i.material_id, 'in', i.base_quantity, i.unit_price, i.goods_receipt_id, p_actor
    from public.goods_receipt_items i
    where i.goods_receipt_id = p_receipt_id;

  -- Header trigger-т "RPC дотроос байна" гэдгийг мэдэгдэнэ
  perform set_config('app.confirming_gr', 'on', true);

  update public.goods_receipts
    set status = 'confirmed',
        confirmed_at = now(),
        received_by = coalesce(p_actor, received_by)
    where id = p_receipt_id;
end;
$$ language plpgsql;
