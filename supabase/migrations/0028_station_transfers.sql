-- Цех хоорондын шилжилтийн бүртгэл (docs/system-design.md §5)
-- Ажиллуулах: 0027-ийн ДАРАА Supabase Dashboard > SQL Editor дээр Run дарна.
--
-- Шийдвэрүүд (2026-08-27, Excel савлагаа sheet-ийн «Халуунаас орж ирсэн /
-- Зөрүү илүү-дутуу» багануудаас):
--   - НЭГ ТАЛЫН ХӨНГӨН БҮРТГЭЛ: өгсөн цех дүнгээ бүртгээд л болно; хүлээн
--     авагчийн ✓ (received_by/received_at) сонголттой баталгаажуулалт.
--     Нормоос ИЛҮҮ дүнгээр өгч болно — qty чөлөөтэй.
--   - ШИЛЖИЛТ БОЛ ХЯНАЛТЫН БҮРТГЭЛ, ТООЦООНЫ ЭХ СУРВАЛЖ БИШ: маргаашийн
--     хэрэгцээ өмнөх шигээ зөвхөн station_stock_counts.leftover-оос хасалт
--     хийнэ. Шилжилтийг бас хасвал нэг илүүдэл 2 удаа хасагдах тул
--     daily_*/station_* view-үүдэд огт оролцохгүй.
--   - Хүлээн авагч цехийн дэлгэц «ирсэн Σ vs норм vs зөрүү»-г шилжилтүүд +
--     station_work-оос UI талд бодож харуулна (Excel-ийн багана).
--   - Ledger-т нөлөөгүй (материал аль хэдийн агуулахаас зарлагдсан).
--   - Дутуу үеийн урсгал өөрчлөгдөхгүй — material_requests (0022) хэвээр.
--   - Immutable биш: хүлээн аваагүй байгаа шилжилтээ өгсөн цех нь устгаж
--     болно (андуурсан бичилт); хүлээн авснаас хойш түүх болж үлдэнэ.

create table if not exists public.station_transfers (
  id uuid primary key default gen_random_uuid(),
  transfer_date date not null default current_date,
  from_station text not null
    check (from_station in ('prep', 'hot', 'hot_aux', 'packaging')),
  to_station text not null
    check (to_station in ('prep', 'hot', 'hot_aux', 'packaging')),
  material_id uuid not null references public.materials (id) on delete restrict,
  qty numeric(14,6) not null check (qty > 0),
  note text,
  given_by text,
  received_by text,
  received_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint station_transfers_diff_check check (from_station <> to_station),
  constraint station_transfers_received_check
    check ((received_at is null) = (received_by is null))
);

create index if not exists station_transfers_date_idx
  on public.station_transfers (transfer_date);

drop trigger if exists station_transfers_updated_at on public.station_transfers;
create trigger station_transfers_updated_at
  before update on public.station_transfers
  for each row execute function public.set_updated_at();

alter table public.station_transfers disable row level security;

-- ---------------------------------------------------------------------------
-- Dev reset функцүүдэд шилжилтийн цэвэрлэгээг нэмнэ (0022-ын хувилбар дээр)
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

  delete from public.station_transfers where true;
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

  delete from public.station_transfers where true;
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
