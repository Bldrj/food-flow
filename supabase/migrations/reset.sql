-- ТУРШИЛТЫН ДАТА ЦЭВЭРЛЭХ QUERY-НУУД (энэ бол migration БИШ — гараар,
-- хэрэгтэй ХЭСГИЙГ Л сонгож ажиллуулна. Буцаах боломжгүй устгал!)
--
--   А хэсэг: БҮХ гүйлгээний дата (захиалга + үйлдвэрлэл + агуулах)
--   Б хэсэг: зөвхөн ЗАХИАЛГА + ҮЙЛДВЭРЛЭЛ (агуулахын орлого/зарлага/ledger үлдэнэ)
--
-- Лавлагаа (захиалагч, нийлүүлэгч, материал, ангилал, хоол, ТК) аль ч
-- хэсэгт устахгүй.

-- ===========================================================================
-- А ХЭСЭГ: БҮХ ГҮЙЛГЭЭНИЙ ДАТА
-- ===========================================================================

begin;

-- Хамгаалалтын trigger-үүдийг түр унтраана (доор буцааж асаана)
alter table public.stock_movements     disable trigger stock_movements_append_only;
alter table public.stock_movements     disable trigger stock_movements_no_truncate;
alter table public.goods_receipt_items disable trigger goods_receipt_items_immutable;
alter table public.stock_issue_items   disable trigger stock_issue_items_immutable;
alter table public.order_items         disable trigger order_items_immutable;
alter table public.deliveries          disable trigger deliveries_immutable;
alter table public.delivery_items      disable trigger delivery_items_immutable;

-- FK-ийн дарааллаар: эхлээд ledger, дараа нь баримтууд
delete from public.stock_movements;
delete from public.stock_issue_items;
delete from public.stock_issues;
delete from public.goods_receipt_items;
delete from public.goods_receipts;
delete from public.batch_station_progress;
delete from public.production_batches;
delete from public.delivery_items;
delete from public.deliveries;
delete from public.order_items;
delete from public.orders;

-- Баримтын дугаарлалт эхнээс
alter sequence public.orders_no_seq         restart with 1;
alter sequence public.goods_receipts_no_seq restart with 1;
alter sequence public.stock_issues_no_seq   restart with 1;

-- Trigger-үүдийг заавал буцааж асаана
alter table public.stock_movements     enable trigger stock_movements_append_only;
alter table public.stock_movements     enable trigger stock_movements_no_truncate;
alter table public.goods_receipt_items enable trigger goods_receipt_items_immutable;
alter table public.stock_issue_items   enable trigger stock_issue_items_immutable;
alter table public.order_items         enable trigger order_items_immutable;
alter table public.deliveries          enable trigger deliveries_immutable;
alter table public.delivery_items      enable trigger delivery_items_immutable;

commit;

-- ===========================================================================
-- Б ХЭСЭГ: ЗАХИАЛГА + ҮЙЛДВЭРЛЭЛ + ЗАРЛАГА
-- (агуулахын орлого болон ledger-ийн орлого/залруулгын мөр, үлдэгдэл
--  хэвээр үлдэнэ; зарлагын баримт болон ledger-ийн out мөрүүд устана —
--  зарлагаар хасагдсан үлдэгдэл буцаж нэмэгдэнэ гэдгийг анхаар)
-- ===========================================================================

begin;

alter table public.order_items      disable trigger order_items_immutable;
alter table public.deliveries       disable trigger deliveries_immutable;
alter table public.delivery_items   disable trigger delivery_items_immutable;
alter table public.stock_issue_items disable trigger stock_issue_items_immutable;
alter table public.stock_movements  disable trigger stock_movements_append_only;

-- Зарлага: эхлээд ledger-ийн out мөрүүд (FK restrict), дараа нь баримтууд
delete from public.stock_movements where stock_issue_id is not null;
delete from public.stock_issue_items;
delete from public.stock_issues;

-- batch_station_progress батчаа дагаж cascade устна
delete from public.batch_station_progress;
delete from public.production_batches;
delete from public.delivery_items;
delete from public.deliveries;
delete from public.order_items;
delete from public.orders;

alter sequence public.orders_no_seq       restart with 1;
alter sequence public.stock_issues_no_seq restart with 1;

alter table public.order_items      enable trigger order_items_immutable;
alter table public.deliveries       enable trigger deliveries_immutable;
alter table public.delivery_items   enable trigger delivery_items_immutable;
alter table public.stock_issue_items enable trigger stock_issue_items_immutable;
alter table public.stock_movements  enable trigger stock_movements_append_only;

commit;

-- ===========================================================================
-- Шалгах query (устгасны дараа 0, лавлагаанууд хэвээр байх ёстой)
-- ===========================================================================

-- select 'orders' t, count(*) from public.orders
-- union all select 'production_batches', count(*) from public.production_batches
-- union all select 'deliveries', count(*) from public.deliveries
-- union all select 'goods_receipts', count(*) from public.goods_receipts
-- union all select 'stock_issues', count(*) from public.stock_issues
-- union all select 'stock_movements', count(*) from public.stock_movements
-- union all select 'materials (үлдэнэ)', count(*) from public.materials
-- union all select 'tech_cards (үлдэнэ)', count(*) from public.tech_cards;
