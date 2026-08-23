-- Агуулахын зарлага (stock_issues) — docs/system-design.md §5
-- Ажиллуулах: Supabase Dashboard > SQL Editor дээр хуулж Run дарна.
-- Дараа нь stock_issues, stock_issue_items-ийн RLS унтарсан эсэхийг шалгаарай.
--
-- Шийдвэрүүд (2026-08-23, дизайн шүүмжийн дараа):
--   - Загвар орлогын баримттай тэгш хэмтэй: draft баримт → confirm RPC →
--     append-only ledger. stock_movements = inventory truth,
--     stock_issues = business document — үлдэгдэл ХЭЗЭЭ Ч баримтаас
--     тооцогдохгүй, зөвхөн ledger-ээс (stock_balances).
--   - Зарлага ӨДРИЙН түвшинд (production_date), батчид хуваарилагдахгүй:
--     нэг материалын олголт тухайн өдрийн ХЭД ХЭДЭН батчийн нийлбэр хэрэгцээг
--     хангадаг (Гахайн мах 21.6кг = Жэюүг + Карри удон) тул батчийн FK худал
--     холбоос үүсгэнэ. Батч түвшний хэрэгцээ daily_material_needs-т бий.
--   - Нэг зарлагад материал давхардахгүй: unique(stock_issue_id, material_id).
--   - Хасах үлдэгдлийг ЗӨВШӨӨРНӨ: нярав бодитоор олгосон бол бичигдэх ёстой.
--     Хасах үлдэгдэл = бүртгэлийн зөрүүний ДОХИО (орлого дутуу, буруу материал,
--     буруу тоо, нэгжийн алдаа г.м. байж болно) — шалтгааныг тогтоосны дараа
--     нөхөн орлого эсвэл adjust-аар засна; автомат "adjust хий" дүрэм байхгүй.
--     UI батлахын өмнө улаан анхааруулга үзүүлнэ; RPC-д үлдэгдлийн шалгалт
--     ЗОРИУД байхгүй (зөвшөөрдөг бодлоготой үед шалгалт үр дүнгүй).
--   - Idempotency давхар давхаргаар: ① confirm зөвхөн draft дээр (FOR UPDATE +
--     статус шалгалт), ② DB түвшинд partial unique index
--     (stock_issue_id, material_id) — давхар ledger insertion боломжгүй.
--   - Ledger source integrity CHECK: нэг movement зэрэг орлого + зарлагын
--     баримтад харьяалагдахгүй; in ↔ goods_receipt, out ↔ stock_issue.
--   - Cancel байхгүй (батлагдсан баримт immutable). Буруу олголтын зөв урт
--     хугацааны шийдэл нь explicit reversal баримт — MVP-д adjust ашиглана.

-- ---------------------------------------------------------------------------
-- Зарлагын баримт (stock_issues) — header
-- ---------------------------------------------------------------------------

create sequence if not exists public.stock_issues_no_seq;

create or replace function public.assign_issue_no()
returns trigger as $$
begin
  if new.issue_no is null or new.issue_no = '' then
    new.issue_no := 'ISS-' || lpad(nextval('public.stock_issues_no_seq')::text, 6, '0');
  end if;
  return new;
end;
$$ language plpgsql;

create table if not exists public.stock_issues (
  id uuid primary key default gen_random_uuid(),
  issue_no text not null unique,
  production_date date not null default current_date,
    -- аль өдрийн үйлдвэрлэлд олгож буй (delta prefill энэ түлхүүрээр бодогдоно)
  status text not null default 'draft'
    check (status in ('draft', 'confirmed')),
  created_by text,             -- ноорог үүсгэсэн ажилтан
  confirmed_by text,           -- баталсан ажилтан (үүсгэгчээс өөр байж болно)
  confirmed_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stock_issues_confirmed_at_check
    check (status = 'confirmed' or confirmed_at is null)
);

create index if not exists stock_issues_production_date_idx
  on public.stock_issues (production_date);

drop trigger if exists stock_issues_assign_no on public.stock_issues;
create trigger stock_issues_assign_no
  before insert on public.stock_issues
  for each row execute function public.assign_issue_no();

drop trigger if exists stock_issues_updated_at on public.stock_issues;
create trigger stock_issues_updated_at
  before update on public.stock_issues
  for each row execute function public.set_updated_at();

alter table public.stock_issues disable row level security;

-- Батлагдсан толгой өөрчлөгдөхгүй; батлах шилжилт зөвхөн RPC-ээр
-- (transaction-local app.confirming_si флаг — 0003-ын загвар)
create or replace function public.block_confirmed_issue_change()
returns trigger as $$
begin
  if old.status = 'confirmed' then
    raise exception 'Батлагдсан зарлагын баримтыг өөрчлөх боломжгүй — залруулгыг adjust гүйлгээгээр хийнэ үү';
  end if;
  if new.status = 'confirmed'
     and current_setting('app.confirming_si', true) is distinct from 'on' then
    raise exception 'Баримтыг зөвхөн confirm_stock_issue() функцээр батална';
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists stock_issues_immutable on public.stock_issues;
create trigger stock_issues_immutable
  before update on public.stock_issues
  for each row execute function public.block_confirmed_issue_change();

-- ---------------------------------------------------------------------------
-- Зарлагын мөр (stock_issue_items)
-- qty нь материалын base_unit-ээр (UI гр/мл-ээр оруулбал ×0.001 хөрвүүлнэ)
-- ---------------------------------------------------------------------------

create table if not exists public.stock_issue_items (
  id uuid primary key default gen_random_uuid(),
  stock_issue_id uuid not null references public.stock_issues (id) on delete cascade,
  material_id uuid not null references public.materials (id) on delete restrict,
  qty numeric(14,6) not null check (qty > 0),
  note text,
  created_at timestamptz not null default now(),
  unique (stock_issue_id, material_id)
    -- нэг баримтад нэг материал нэг л мөр (нийлбэрээр нь бичнэ)
);

create index if not exists stock_issue_items_issue_idx
  on public.stock_issue_items (stock_issue_id);

alter table public.stock_issue_items disable row level security;

-- Батлагдсан баримтын мөр өөрчлөгдөхгүй; FOR SHARE нь confirm-ийн FOR UPDATE-тэй
-- зөрчилдөж race хаана (0003 №3-ын загвар)
create or replace function public.block_confirmed_issue_item_change()
returns trigger as $$
declare
  v_new_issue uuid;
  v_old_issue uuid;
begin
  if tg_op in ('INSERT', 'UPDATE') then
    v_new_issue := new.stock_issue_id;
  end if;
  if tg_op in ('UPDATE', 'DELETE') then
    v_old_issue := old.stock_issue_id;
  end if;

  perform 1 from public.stock_issues
    where id in (v_new_issue, v_old_issue)
    for share;

  if exists (
    select 1 from public.stock_issues
    where status = 'confirmed'
      and id in (v_new_issue, v_old_issue)
  ) then
    raise exception 'Батлагдсан зарлагын баримтын мөрийг өөрчлөх боломжгүй — adjust гүйлгээгээр залруулна уу';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists stock_issue_items_immutable on public.stock_issue_items;
create trigger stock_issue_items_immutable
  before insert or update or delete on public.stock_issue_items
  for each row execute function public.block_confirmed_issue_item_change();

-- ---------------------------------------------------------------------------
-- Ledger: зарлагын холбоос + source integrity + idempotency индекс
-- ---------------------------------------------------------------------------

alter table public.stock_movements
  add column if not exists stock_issue_id uuid
    references public.stock_issues (id) on delete restrict;

create index if not exists stock_movements_issue_idx
  on public.stock_movements (stock_issue_id);

-- Давхар ledger insertion DB түвшинд боломжгүй: нэг зарлагын нэг материал
-- ganc movement (unique(issue,material) баримтын мөртэй 1:1 таарна)
create unique index if not exists stock_movements_issue_material_idx
  on public.stock_movements (stock_issue_id, material_id)
  where stock_issue_id is not null;

-- Source integrity: movement-ийн эх сурвалж хоёрдмолгүй
--   in  → goods_receipt_id (зарлагын холбоосгүй)
--   out → stock_issue_id (орлогын холбоосгүй, заавал баримттай)
--   adjust → аль ч баримтгүй
alter table public.stock_movements
  drop constraint if exists stock_movements_source_check;
alter table public.stock_movements
  add constraint stock_movements_source_check check (
    not (goods_receipt_id is not null and stock_issue_id is not null)
    and (goods_receipt_id is null or type = 'in')
    and (stock_issue_id is null or type = 'out')
    and (type <> 'out' or stock_issue_id is not null)
  );

-- ---------------------------------------------------------------------------
-- Өдрийн олголтын нийлбэр (daily_order_totals-ын тэгш хэм) —
-- /production-ийн «Олгосон» багана болон delta prefill-ийн эх сурвалж.
-- Энэ нь БАРИМТЫН нийлбэр (business document); үлдэгдэл нь ledger-ээс.
-- ---------------------------------------------------------------------------

create or replace view public.daily_issued_totals as
select
  si.production_date,
  i.material_id,
  sum(i.qty) as issued_qty
from public.stock_issues si
join public.stock_issue_items i on i.stock_issue_id = si.id
where si.status = 'confirmed'
group by si.production_date, i.material_id;

-- ---------------------------------------------------------------------------
-- Батлах RPC — атомик: статус солих + ledger бичих нэг transaction-д.
-- Frontend: supabase.rpc('confirm_stock_issue', { p_issue_id, p_actor })
-- Үлдэгдлийн шалгалт ЗОРИУД байхгүй — хасах үлдэгдлийг зөвшөөрнө (дээрх шийдвэр).
-- ---------------------------------------------------------------------------

create or replace function public.confirm_stock_issue(
  p_issue_id uuid,
  p_actor text default null
)
returns void as $$
declare
  v_status text;
  v_item_count int;
begin
  -- Давхар батлах race-ээс хамгаалж мөрийг түгжинэ
  select status into v_status
    from public.stock_issues
    where id = p_issue_id
    for update;

  if v_status is null then
    raise exception 'Зарлагын баримт олдсонгүй';
  end if;
  if v_status <> 'draft' then
    raise exception 'Зөвхөн draft төлөвтэй баримтыг батална (одоогийн төлөв: %)', v_status;
  end if;

  select count(*) into v_item_count
    from public.stock_issue_items
    where stock_issue_id = p_issue_id;
  if v_item_count = 0 then
    raise exception 'Мөргүй баримтыг батлах боломжгүй';
  end if;

  insert into public.stock_movements
      (material_id, type, qty, stock_issue_id, created_by)
  select
      i.material_id, 'out', i.qty, i.stock_issue_id, p_actor
    from public.stock_issue_items i
    where i.stock_issue_id = p_issue_id;

  -- Header trigger-т "RPC дотроос байна" гэдгийг мэдэгдэнэ
  perform set_config('app.confirming_si', 'on', true);

  update public.stock_issues
    set status = 'confirmed',
        confirmed_at = now(),
        confirmed_by = p_actor
    where id = p_issue_id;
end;
$$ language plpgsql;
