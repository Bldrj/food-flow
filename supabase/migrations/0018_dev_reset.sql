-- ТЕСТ ГОРИМЫН цэвэрлэх RPC-ууд (reset.sql-ийн А/Б хэсгийг UI-гаас дуудна)
-- Ажиллуулах: Supabase Dashboard > SQL Editor дээр Run дарна.
--
-- АНХААР: эдгээр нь хөгжүүлэлтийн туршилтад л зориулагдсан — бодит
-- ашиглалтад гарахын өмнө (Үе 6, Auth/RLS) ХОЁУЛАНГ НЬ DROP хийнэ:
--   drop function public.dev_reset_all(text);
--   drop function public.dev_reset_orders(text);
--
-- API холболтод safeupdate идэвхтэй тул DELETE бүр WHERE-тэй (where true).
-- security definer — функц эзэмшигчийнхээ (postgres) эрхээр ажиллаж
-- trigger түр унтраана. Санамсаргүй дуудахаас хамгаалж p_confirm='RESET'
-- шаардана. Лавлагаа (захиалагч, материал, ТК г.м.) устахгүй.

-- А: бүх гүйлгээний дата + цехийн тооллого
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

-- Б: захиалга + үйлдвэрлэл + зарлага (агуулахын орлого/ledger-ийн in үлдэнэ;
-- зарлагын out мөр устах тул үлдэгдэл буцаж нэмэгдэнэ)
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
