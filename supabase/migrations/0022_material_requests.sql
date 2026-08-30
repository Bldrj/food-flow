-- Цехийн материалын нэхэмжлэл (docs/system-design.md §5)
-- Ажиллуулах: 0021-ийн ДАРАА Supabase Dashboard > SQL Editor дээр Run дарна.
--
-- Шийдвэрүүд (2026-08-26):
--   - «Илүү бол шууд өгнө, дутвал нэхэмжилнэ» дүрэм: ХЭВИЙН урсгалд цех
--     хоорондын шилжилт баримтжихгүй хэвээр (0019-ийн шийдвэр) — илүүдэл
--     өдрийн эцсийн тооллогоор (station_stock_counts.leftover) баригдаад
--     маргаашийн тооцооноос автоматаар хасагдана. Нэхэмжлэл зөвхөн ДУТУУ
--     үед үүсдэг жижиг дохиолол.
--   - Хүлээн авагч (target) автоматаар оноогдоно: raw материал → warehouse,
--     intermediate → бэлдэцийн source_station. Нярав зарлагын дэлгэц дээр,
--     цех өөрийн дэлгэц дээр өөрчилж болохгүй (энгийн байлгав).
--   - Агуулах руу очсон нэхэмжлэл: нярав pending жагсаалтаас зарлагын ноорог
--     (stock_issues-ийн одоогийн урсгал) үүсгэхэд stock_issue_id холбогдоно;
--     баримт БАТЛАГДАХАД confirm_stock_issue() нэг transaction дотор
--     нэхэмжлэлүүдийг fulfilled болгоно. Ноорог уствал холбоос тайлагдаж
--     (on delete set null) нэхэмжлэл pending хэвээр үлдэнэ.
--   - Цех рүү очсон нэхэмжлэлийг тухайн цех «Өгсөн» товчоор шууд хаана
--     (ledger-т нөлөөгүй — бэлдэц агуулахын бүртгэлд байдаггүй).
--   - Гинжин нэхэмжлэл: өмнөх цех өөрөө түүхий эдээр дутвал өөрийн дэлгэцээс
--     агуулах руу ердийн журмаар дахин нэхэмжилнэ — тусгай загвар хэрэггүй.
--   - Immutable биш: андуурсан pending нэхэмжлэлийг үүсгэсэн цех нь цуцалж
--     болно (cancelled). Fulfilled/cancelled мөр түүх болж үлдэнэ.

create table if not exists public.material_requests (
  id uuid primary key default gen_random_uuid(),
  request_date date not null default current_date,
  station text not null
    check (station in ('prep', 'hot', 'hot_aux', 'packaging')),
    -- нэхэмжилсэн цех
  material_id uuid not null references public.materials (id) on delete restrict,
  qty numeric(14,6) not null check (qty > 0),
  target text not null
    check (target in ('warehouse', 'prep', 'hot', 'hot_aux', 'packaging')),
    -- хүлээн авагч: агуулах эсвэл бэлдэцийн source цех
  status text not null default 'pending'
    check (status in ('pending', 'fulfilled', 'cancelled')),
  note text,
  requested_by text,
  fulfilled_by text,
  fulfilled_at timestamptz,
  stock_issue_id uuid references public.stock_issues (id) on delete set null,
    -- агуулахын биелүүлж буй зарлагын баримт (target='warehouse' үед)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint material_requests_fulfilled_check
    check (status = 'fulfilled' or fulfilled_at is null),
  constraint material_requests_self_check check (station <> target)
);

create index if not exists material_requests_status_idx
  on public.material_requests (status, target);
create index if not exists material_requests_date_idx
  on public.material_requests (request_date);

drop trigger if exists material_requests_updated_at on public.material_requests;
create trigger material_requests_updated_at
  before update on public.material_requests
  for each row execute function public.set_updated_at();

alter table public.material_requests disable row level security;

-- ---------------------------------------------------------------------------
-- confirm_stock_issue: баримт батлагдахад холбогдсон нэхэмжлэлүүд нэг
-- transaction дотор автоматаар хаагдана (0010-ын хувилбар дээр нэмэв)
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

  -- Энэ баримтаар биелүүлж буй цехийн нэхэмжлэлүүдийг хаана
  update public.material_requests
    set status = 'fulfilled',
        fulfilled_at = now(),
        fulfilled_by = p_actor
    where stock_issue_id = p_issue_id
      and status = 'pending';
end;
$$ language plpgsql;

-- ---------------------------------------------------------------------------
-- Dev reset функцүүдэд нэхэмжлэлийн цэвэрлэгээг нэмнэ (0018-ын хувилбар)
-- ---------------------------------------------------------------------------

create or replace function public.dev_reset_all(p_confirm text)
returns void as $$
begin
  if p_confirm is distinct from 'RESET' then
    raise exception 'Баталгаажуулалт буруу — p_confirm=''RESET'' дамжуулна';
  end if;

  alter table public.stock_movements     disable trigger stock_movements_append_only;
  alter table public.stock_movements     disable trigger stock_movements_no_truncate;
  alter table public.goods_receipt_items disable trigger goods_receipt_items_immutable;
  alter table public.stock_issue_items   disable trigger stock_issue_items_immutable;
  alter table public.order_items         disable trigger order_items_immutable;
  alter table public.deliveries          disable trigger deliveries_immutable;
  alter table public.delivery_items      disable trigger delivery_items_immutable;

  delete from public.material_requests where true;
  delete from public.stock_movements where true;
  delete from public.stock_issue_items where true;
  delete from public.stock_issues where true;
  delete from public.goods_receipt_items where true;
  delete from public.goods_receipts where true;
  delete from public.batch_station_progress where true;
  delete from public.station_stock_counts where true;
  delete from public.production_batches where true;
  delete from public.delivery_items where true;
  delete from public.deliveries where true;
  delete from public.order_items where true;
  delete from public.orders where true;

  alter sequence public.orders_no_seq         restart with 1;
  alter sequence public.goods_receipts_no_seq restart with 1;
  alter sequence public.stock_issues_no_seq   restart with 1;

  alter table public.stock_movements     enable trigger stock_movements_append_only;
  alter table public.stock_movements     enable trigger stock_movements_no_truncate;
  alter table public.goods_receipt_items enable trigger goods_receipt_items_immutable;
  alter table public.stock_issue_items   enable trigger stock_issue_items_immutable;
  alter table public.order_items         enable trigger order_items_immutable;
  alter table public.deliveries          enable trigger deliveries_immutable;
  alter table public.delivery_items      enable trigger delivery_items_immutable;
end;
$$ language plpgsql security definer;

create or replace function public.dev_reset_orders(p_confirm text)
returns void as $$
begin
  if p_confirm is distinct from 'RESET' then
    raise exception 'Баталгаажуулалт буруу — p_confirm=''RESET'' дамжуулна';
  end if;

  alter table public.order_items       disable trigger order_items_immutable;
  alter table public.deliveries        disable trigger deliveries_immutable;
  alter table public.delivery_items    disable trigger delivery_items_immutable;
  alter table public.stock_issue_items disable trigger stock_issue_items_immutable;
  alter table public.stock_movements   disable trigger stock_movements_append_only;

  delete from public.material_requests where true;
  delete from public.stock_movements where stock_issue_id is not null;
  delete from public.stock_issue_items where true;
  delete from public.stock_issues where true;
  delete from public.batch_station_progress where true;
  delete from public.station_stock_counts where true;
  delete from public.production_batches where true;
  delete from public.delivery_items where true;
  delete from public.deliveries where true;
  delete from public.order_items where true;
  delete from public.orders where true;

  alter sequence public.orders_no_seq       restart with 1;
  alter sequence public.stock_issues_no_seq restart with 1;

  alter table public.order_items       enable trigger order_items_immutable;
  alter table public.deliveries        enable trigger deliveries_immutable;
  alter table public.delivery_items    enable trigger delivery_items_immutable;
  alter table public.stock_issue_items enable trigger stock_issue_items_immutable;
  alter table public.stock_movements   enable trigger stock_movements_append_only;
end;
$$ language plpgsql security definer;
