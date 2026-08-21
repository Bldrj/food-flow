-- Захиалгын модуль, 1-р алхам: orders + order_items (docs/system-design.md §5)
-- Ажиллуулах: Supabase Dashboard > SQL Editor дээр хуулж Run дарна.
-- Ажилласны дараа доорх 3 хүснэгтийн RLS унтарсан эсэхийг шалгаарай
-- (0005 дээр disable мөр үйлчлээгүй тохиолдол гарсан).
--
-- Шийдвэрүүд (2026-08-21):
--   - Баримт → snapshot зарчим (receipts-тэй ижил): захиалга draft байхдаа
--     чөлөөтэй засагдана; батлах мөчид мөр бүрийн хоолны ИДЭВХТЭЙ ТК-г
--     order_items.tech_card_id-д хөлдөөнө. Дараа нь шинэ хувилбар гарсан ч
--     батлагдсан захиалгын тооцоо, түүх өөрчлөгдөхгүй.
--   - Агуулахад НӨЛӨӨГҮЙ: зарлага нь үйлдвэрлэлийн алхам (Үе 3, stock_issues)
--     дээр гарна. Захиалга бол зөвхөн эрэлтийн баримт.
--   - delivery_date хоосон бол "үйлдвэрлэсэн өдрөө хүргэнэ" гэсэн утгатай
--     (бизнесийн хэвийн урсгал); өөр өдөр бол л бөглөнө.
--   - Нэг захиалгад нэг хоол давхардаж орж болно, мөн нэг өдөрт нэмэлт
--     захиалга дараалан орж ирнэ (өглөө 300 + үдэд 30) — unique constraint
--     тавихгүй, өдрийн батч Σ-ээр нэгтгэнэ.
--   - Статусын бүх утгыг одоо зарлана; UI эхэндээ draft|confirmed|cancelled
--     гурвыг хэрэглэж, үлдсэн шилжилтүүд (in_production…) Үе 3-4 дээр
--     өөрийн RPC-тэйгээр нэмэгдэнэ.
--   - Цуцлах: draft-ыг устгана эсвэл cancelled болгоно; батлагдсаныг цуцлах
--     журмыг үйлдвэрлэлийн алхамтай хамт шийднэ (одоо trigger хориглоно).

-- ---------------------------------------------------------------------------
-- Захиалга (orders) — header
-- ---------------------------------------------------------------------------

create sequence if not exists public.orders_no_seq;

create or replace function public.assign_order_no()
returns trigger as $$
begin
  if new.order_no is null or new.order_no = '' then
    new.order_no := 'ORD-' || lpad(nextval('public.orders_no_seq')::text, 6, '0');
  end if;
  return new;
end;
$$ language plpgsql;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_no text not null unique,
  customer_id uuid not null references public.customers (id) on delete restrict,
  order_date date not null default current_date,   -- захиалга авсан өдөр
  production_date date not null,                   -- үйлдвэрлэх өдөр (батчийн түлхүүр)
  delivery_date date,                              -- NULL = production_date-д хүргэнэ
  delivery_time time,                              -- төлөвлөсөн цаг (сонголттой)
  status text not null default 'draft'
    check (status in ('draft', 'confirmed', 'in_production', 'packed',
                      'delivered', 'closed', 'cancelled')),
  confirmed_at timestamptz,
  note text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- draft бол батлагдаагүй; батлагдсаны дараах статусууд confirmed_at-тай
  constraint orders_confirmed_at_check check (
    (status = 'draft' and confirmed_at is null)
    or status = 'cancelled'
    or (status in ('confirmed', 'in_production', 'packed', 'delivered', 'closed')
        and confirmed_at is not null)
  )
);

create index if not exists orders_production_date_idx
  on public.orders (production_date);
create index if not exists orders_customer_idx
  on public.orders (customer_id);

create trigger orders_assign_no
  before insert on public.orders
  for each row execute function public.assign_order_no();

create trigger orders_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

alter table public.orders disable row level security;

-- Батлагдсан захиалгын толгойг өөрчлөхийг хориглоно; draft→confirmed шилжилт
-- зөвхөн confirm_order() RPC-ээр (transaction-local флаг) — 0003-ын хэв маяг
create or replace function public.block_confirmed_order_change()
returns trigger as $$
begin
  if old.status <> 'draft' then
    raise exception 'Батлагдсан захиалгыг өөрчлөх боломжгүй (статус: %)', old.status;
  end if;
  if new.status = 'confirmed'
     and coalesce(current_setting('app.confirming_order', true), '') <> 'on' then
    raise exception 'Захиалгыг зөвхөн confirm_order() функцээр батална';
  end if;
  if new.status not in ('draft', 'confirmed', 'cancelled') then
    raise exception 'Draft захиалгыг % статус руу шууд шилжүүлэх боломжгүй', new.status;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger orders_immutable
  before update on public.orders
  for each row execute function public.block_confirmed_order_change();

-- ---------------------------------------------------------------------------
-- Захиалгын мөр (order_items)
-- ---------------------------------------------------------------------------

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete restrict,
  tech_card_id uuid references public.tech_cards (id) on delete restrict,
    -- батлах мөчид идэвхтэй ТК-гаар бөглөгдөнө (draft үед NULL)
  qty numeric(14,6) not null check (qty > 0),      -- порцын тоо
  unit_price numeric(14,2) check (unit_price is null or unit_price >= 0),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists order_items_order_idx
  on public.order_items (order_id);
create index if not exists order_items_product_idx
  on public.order_items (product_id);

alter table public.order_items disable row level security;

-- Батлагдсан захиалгын мөрийг өөрчлөхийг хориглоно (0003-ын FOR SHARE хэв маяг:
-- confirm_order-ийн FOR UPDATE түгжээтэй race үүсгэхгүй)
create or replace function public.block_confirmed_order_item_change()
returns trigger as $$
declare
  v_new_order uuid;
  v_old_order uuid;
begin
  if tg_op in ('INSERT', 'UPDATE') then
    v_new_order := new.order_id;
  end if;
  if tg_op in ('UPDATE', 'DELETE') then
    v_old_order := old.order_id;
  end if;

  perform 1 from public.orders
    where id in (v_new_order, v_old_order)
    for share;

  if exists (
    select 1 from public.orders
    where id in (v_new_order, v_old_order)
      and status <> 'draft'
  ) and coalesce(current_setting('app.confirming_order', true), '') <> 'on' then
    raise exception 'Батлагдсан захиалгын мөрийг өөрчлөх боломжгүй';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger order_items_immutable
  before insert or update or delete on public.order_items
  for each row execute function public.block_confirmed_order_item_change();

-- ---------------------------------------------------------------------------
-- Захиалга батлах RPC — атомик: ТК snapshot + статус нэг transaction-д.
-- Frontend: supabase.rpc('confirm_order', { p_order_id, p_actor })
-- ---------------------------------------------------------------------------

create or replace function public.confirm_order(
  p_order_id uuid,
  p_actor text default null
)
returns void as $$
declare
  v_status text;
  v_item_count int;
  v_missing text;
begin
  -- Давхар батлах race-ээс хамгаалж толгойг түгжинэ
  select status into v_status
    from public.orders
    where id = p_order_id
    for update;

  if v_status is null then
    raise exception 'Захиалга олдсонгүй';
  end if;
  if v_status <> 'draft' then
    raise exception 'Зөвхөн draft захиалгыг батална (одоогийн статус: %)', v_status;
  end if;

  select count(*) into v_item_count
    from public.order_items
    where order_id = p_order_id;
  if v_item_count = 0 then
    raise exception 'Мөргүй захиалгыг батлах боломжгүй';
  end if;

  -- Бүх мөрийн хоол идэвхтэй ТК-тай байх ёстой (хэрэгцээний тооцооны суурь)
  select string_agg(p.name, ', ') into v_missing
    from public.order_items oi
    join public.products p on p.id = oi.product_id
    where oi.order_id = p_order_id
      and not exists (
        select 1 from public.tech_cards tc
        where tc.product_id = oi.product_id and tc.is_active
      );
  if v_missing is not null then
    raise exception 'Идэвхтэй технологийн картгүй хоол: %', v_missing;
  end if;

  -- Item trigger-ийн хоригийг тойрох transaction-local флаг
  perform set_config('app.confirming_order', 'on', true);

  -- Идэвхтэй ТК-г мөр бүрд хөлдөөнө (snapshot)
  update public.order_items oi
    set tech_card_id = tc.id
    from public.tech_cards tc
    where oi.order_id = p_order_id
      and tc.product_id = oi.product_id
      and tc.is_active;

  update public.orders
    set status = 'confirmed',
        confirmed_at = now(),
        created_by = coalesce(created_by, p_actor)
    where id = p_order_id;
end;
$$ language plpgsql;
