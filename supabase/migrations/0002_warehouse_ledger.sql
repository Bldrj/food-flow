-- Агуулах, 1-р алхам: орлогын баримт + ledger (docs/system-design.md §2.5, §5)
-- Ажиллуулах: Supabase Dashboard > SQL Editor дээр хуулж Run дарна.
--
-- Source of truth шийдвэр (2026-08-20):
--   - stock_movements (append-only ledger) нь агуулахын цорын ганц source of truth.
--     UPDATE/DELETE хориотой (trigger-ээр хамгаална) — алдааг adjust мөрөөр залруулна.
--   - Үлдэгдэл = ledger-ийн нийлбэр, stock_balances view-ээр гарна. Тусдаа balance
--     хүснэгт/багана хөтлөхгүй (drift-ийн эрсдэлгүй; хожим удаашвал snapshot нэмж болно).
--   - Баримт (goods_receipts) draft байхдаа ledger-т нөлөөгүй; батлагдах мөчид
--     confirm_goods_receipt() функц нэг transaction дотор ledger-ийн мөрүүдийг бичнэ.
--     Батлагдсан баримтыг засахгүй — буруу бол adjust/сторно гүйлгээ хийнэ.
--   - Бүх нийлбэр DB талд exact numeric-ээр бодогдоно (frontend reduce хийхгүй).
--
-- stock_issues хараахан үүсээгүй тул stock_movements.stock_issue_id баганыг
-- зарлагын алхам дээр нэмнэ.

-- ---------------------------------------------------------------------------
-- Орлогын баримт (goods_receipts) — header
-- ---------------------------------------------------------------------------

create sequence if not exists public.goods_receipts_no_seq;

create or replace function public.assign_receipt_no()
returns trigger as $$
begin
  if new.receipt_no is null or new.receipt_no = '' then
    new.receipt_no := 'GR-' || lpad(nextval('public.goods_receipts_no_seq')::text, 6, '0');
  end if;
  return new;
end;
$$ language plpgsql;

create table if not exists public.goods_receipts (
  id uuid primary key default gen_random_uuid(),
  receipt_no text not null unique,
  supplier_id uuid not null references public.suppliers (id) on delete restrict,
  receipt_date date not null default current_date,
  supplier_invoice_no text,    -- нийлүүлэгчийн падаан/нэхэмжлэхийн №
  status text not null default 'draft'
    check (status in ('draft', 'confirmed')),
  received_by text,            -- бүртгэсэн ажилтан (админ; тест горимд mock нэр).
                               -- Нийлүүлэгч системд нэвтэрдэггүй — падаан цаасаар ирж,
                               -- админ л бүртгэнэ; supplier_invoice_no нь түүний лавлагаа.
  confirmed_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger goods_receipts_assign_no
  before insert on public.goods_receipts
  for each row execute function public.assign_receipt_no();

create trigger goods_receipts_updated_at
  before update on public.goods_receipts
  for each row execute function public.set_updated_at();

alter table public.goods_receipts disable row level security;

-- ---------------------------------------------------------------------------
-- Орлогын баримтын мөр (goods_receipt_items)
-- Нэгжийн normalize: нярав чөлөөт нэгжээр оруулна (3 box, 500 g), conversion_rate-ийг
-- баримт дээр snapshot болгож хадгална — base_quantity нь generated column тул
-- input × rate ≠ base зөрүү гарах боломжгүй, ledger base_quantity-г авна.
-- ---------------------------------------------------------------------------

create table if not exists public.goods_receipt_items (
  id uuid primary key default gen_random_uuid(),
  goods_receipt_id uuid not null references public.goods_receipts (id) on delete cascade,
  material_id uuid not null references public.materials (id) on delete restrict,
  input_quantity numeric(14,6) not null check (input_quantity > 0),
  input_unit text not null,    -- чөлөөт текст: kg, g, box, bag …
  conversion_rate numeric(14,6) not null check (conversion_rate > 0),
    -- 1 input_unit = хэдэн base_unit (kg→1, g→0.001, box→12 …)
  base_quantity numeric(14,6) generated always as (input_quantity * conversion_rate) stored,
  unit_price numeric(14,2) check (unit_price is null or unit_price >= 0),
    -- base_unit-ийн 1 нэгжийн үнэ (₮)
  lot_no text,
  expiry_date date,
  created_at timestamptz not null default now()
);

create index if not exists goods_receipt_items_receipt_idx
  on public.goods_receipt_items (goods_receipt_id);

alter table public.goods_receipt_items disable row level security;

-- Батлагдсан баримтын мөрийг өөрчлөхийг хориглоно (draft үед чөлөөтэй засна)
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

create trigger goods_receipt_items_immutable
  before insert or update or delete on public.goods_receipt_items
  for each row execute function public.block_confirmed_receipt_item_change();

-- ---------------------------------------------------------------------------
-- Агуулахын ledger (stock_movements) — SOURCE OF TRUTH, append-only
-- ---------------------------------------------------------------------------

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.materials (id) on delete restrict,
  type text not null check (type in ('in', 'out', 'adjust')),
  qty numeric(14,6) not null,
    -- in/out: эерэг; adjust: тэмдэгтэй (+/−), 0 биш
  unit_price numeric(14,2),
  goods_receipt_id uuid references public.goods_receipts (id) on delete restrict,
  created_by text,
  note text,
  created_at timestamptz not null default now(),
  constraint stock_movements_qty_sign check (
    (type in ('in', 'out') and qty > 0) or (type = 'adjust' and qty <> 0)
  )
);

create index if not exists stock_movements_material_idx
  on public.stock_movements (material_id);

alter table public.stock_movements disable row level security;

-- Append-only: ledger-ийн мөрийг засах/устгахыг DB талд хориглоно
create or replace function public.block_ledger_change()
returns trigger as $$
begin
  raise exception 'Ledger (stock_movements) append-only — залруулгыг adjust төрлийн шинэ мөрөөр хийнэ';
end;
$$ language plpgsql;

create trigger stock_movements_append_only
  before update or delete on public.stock_movements
  for each row execute function public.block_ledger_change();

-- ---------------------------------------------------------------------------
-- Үлдэгдэл (stock_balances) — ledger-ийн нийлбэр, exact numeric
-- ---------------------------------------------------------------------------

create or replace view public.stock_balances as
select
  m.id as material_id,
  m.code,
  m.name,
  m.base_unit,
  m.category,
  m.min_stock,
  m.is_active,
  coalesce(sum(
    case sm.type
      when 'in' then sm.qty
      when 'out' then -sm.qty
      else sm.qty              -- adjust: тэмдэгтэй хадгалагдсан
    end
  ), 0) as balance
from public.materials m
left join public.stock_movements sm on sm.material_id = m.id
group by m.id;

-- ---------------------------------------------------------------------------
-- Баримт батлах RPC — атомик: статус солих + ledger бичих нэг transaction-д.
-- Frontend: supabase.rpc('confirm_goods_receipt', { p_receipt_id, p_actor })
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

  update public.goods_receipts
    set status = 'confirmed',
        confirmed_at = now(),
        received_by = coalesce(p_actor, received_by)
    where id = p_receipt_id;
end;
$$ language plpgsql;
