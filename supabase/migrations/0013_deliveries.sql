-- Хүргэлтийн модуль, Үе 4 (docs/system-design.md §5)
-- Ажиллуулах: 0012-ын ДАРАА Supabase Dashboard > SQL Editor дээр Run дарна.
-- Дараа нь deliveries, delivery_items-ийн RLS унтарсан эсэхийг шалгаарай.
--
-- Шийдвэрүүд (2026-08-23):
--   - Хүргэлт нэг удаагийн хурдан бүртгэл тул draft үе шатгүй — бүх ажлыг
--     record_delivery() RPC нэг transaction-д хийнэ: баримт бичих → захиалгыг
--     delivered болгох → батчуудыг болгоомжтой дүрмээр авто-дуусгах.
--   - Захиалгын БҮХ мөр бүртгэгдэх ёстой (дутуу хүргэсэн мөрөнд 0 бичнэ) —
--     "мартагдсан мөр" гэж байхгүй, зөрүү нь илэрхий дата болно.
--   - delivered_qty ≤/≥ захиалсан тоо байж болно (дутуу хүргэлт бүртгэгдэнэ);
--     үлдэгдлийг автоматаар нөхөх захиалга үүсгэхгүй — тайланд зөрүүгээр гарна.
--   - packed статусыг одоохондоо алгасна: confirmed → delivered шууд.
--     Савлагааны урсгал Үе 3 (станцууд) дээр орж ирнэ.
--   - Батчийн авто-дуусгалт (болгоомжтой дүрэм): өдөр+хоолны хүргэсэн Σ нь
--     тухайн өдрийн батчуудын Σ-д ХҮРСЭН үед л in_production батчуудыг
--     дуусгана — сүүлд нэмэгдсэн №2 батч зууханд байхад андуурч дуусгахгүй.
--     Хүрээгүй бол /production-ийн «Дуусгах» товч нөөц хувилбар.
--   - Хүргэлтийн бүртгэл immutable (UPDATE/DELETE хориотой) — буруу бол
--     Үе 5-ын reversal-аар залруулна.

-- ---------------------------------------------------------------------------
-- Хүргэлтийн баримт
-- ---------------------------------------------------------------------------

create table if not exists public.deliveries (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders (id) on delete restrict,
  delivered_at timestamptz not null default now(),
  delivered_by text,           -- бүртгэсэн ажилтан
  received_by text,            -- хүлээн авсан хүн (захиалагчийн тал, чөлөөт текст)
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.delivery_items (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.deliveries (id) on delete cascade,
  order_item_id uuid not null unique references public.order_items (id) on delete restrict,
  delivered_qty integer not null check (delivered_qty >= 0),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists delivery_items_delivery_idx
  on public.delivery_items (delivery_id);

alter table public.deliveries disable row level security;
alter table public.delivery_items disable row level security;

-- Immutable: бүртгэсний дараа өөрчлөгдөхгүй/устахгүй
create or replace function public.block_delivery_change()
returns trigger as $$
begin
  raise exception 'Хүргэлтийн бүртгэл өөрчлөгдөхгүй — залруулгыг тусдаа баримтаар хийнэ';
end;
$$ language plpgsql;

drop trigger if exists deliveries_immutable on public.deliveries;
create trigger deliveries_immutable
  before update or delete on public.deliveries
  for each row execute function public.block_delivery_change();

drop trigger if exists delivery_items_immutable on public.delivery_items;
create trigger delivery_items_immutable
  before update or delete on public.delivery_items
  for each row execute function public.block_delivery_change();

-- ---------------------------------------------------------------------------
-- Захиалгын trigger: confirmed → delivered шилжилтийг RPC-ийн флагаар нээнэ
-- (бусад бүх дүрэм 0006-ынхаараа хэвээр)
-- ---------------------------------------------------------------------------

create or replace function public.block_confirmed_order_change()
returns trigger as $$
begin
  -- record_delivery() RPC доторх шилжилт
  if old.status = 'confirmed'
     and new.status = 'delivered'
     and coalesce(current_setting('app.delivering', true), '') = 'on' then
    return new;
  end if;
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

-- Trigger нь 0006-ынхтай ижил нэртэй тул функцийг л сольход хангалттай

-- ---------------------------------------------------------------------------
-- Хүргэлт бүртгэх RPC — атомик
-- Frontend: supabase.rpc('record_delivery', { p_order_id, p_items, p_actor,
--   p_received_by, p_note })
-- p_items: [{"order_item_id": "...", "qty": 100, "note": null}, ...]
-- ---------------------------------------------------------------------------

create or replace function public.record_delivery(
  p_order_id uuid,
  p_items jsonb,
  p_actor text default null,
  p_received_by text default null,
  p_note text default null
)
returns void as $$
declare
  v_status text;
  v_prod_date date;
  v_delivery_id uuid;
  v_item record;
  v_count int;
  v_expected int;
  r record;
begin
  -- Давхар бүртгэх race-ээс хамгаалж захиалгыг түгжинэ
  select status, production_date into v_status, v_prod_date
    from public.orders
    where id = p_order_id
    for update;

  if v_status is null then
    raise exception 'Захиалга олдсонгүй';
  end if;
  if v_status <> 'confirmed' then
    raise exception 'Зөвхөн батлагдсан захиалгад хүргэлт бүртгэнэ (одоогийн төлөв: %)', v_status;
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'Хүргэлтийн мөрүүд хоосон байна';
  end if;

  insert into public.deliveries (order_id, delivered_by, received_by, note)
    values (p_order_id, p_actor, p_received_by, p_note)
    returning id into v_delivery_id;

  for v_item in
    select (e->>'order_item_id')::uuid as order_item_id,
           (e->>'qty')::numeric as qty,
           nullif(e->>'note', '') as note
    from jsonb_array_elements(p_items) e
  loop
    if v_item.order_item_id is null then
      raise exception 'Мөрөнд order_item_id дутуу байна';
    end if;
    if v_item.qty is null or v_item.qty < 0
       or v_item.qty <> floor(v_item.qty) then
      raise exception 'Хүргэсэн тоо 0 буюу түүнээс их бүхэл тоо байх ёстой';
    end if;
    perform 1 from public.order_items oi
      where oi.id = v_item.order_item_id and oi.order_id = p_order_id;
    if not found then
      raise exception 'Мөр энэ захиалгад хамаарахгүй байна (%)', v_item.order_item_id;
    end if;
    insert into public.delivery_items
        (delivery_id, order_item_id, delivered_qty, note)
      values (v_delivery_id, v_item.order_item_id, v_item.qty::int, v_item.note);
  end loop;

  -- Бүх мөр бүртгэгдсэн байх ёстой (хүргээгүй мөрөнд 0 гэж илэрхий бичнэ)
  select count(*) into v_count
    from public.delivery_items where delivery_id = v_delivery_id;
  select count(*) into v_expected
    from public.order_items where order_id = p_order_id;
  if v_count <> v_expected then
    raise exception 'Захиалгын бүх мөрийг бүртгэнэ: % мөрөөс % ирлээ (хүргээгүй мөрөнд 0 бичнэ)',
      v_expected, v_count;
  end if;

  -- Trigger-т "RPC дотроос байна" гэдгийг мэдэгдэнэ
  perform set_config('app.delivering', 'on', true);

  update public.orders
    set status = 'delivered'
    where id = p_order_id;

  -- Батчийн авто-дуусгалт (болгоомжтой дүрэм): өдөр+хоолны хүргэсэн Σ нь
  -- батчуудын Σ-д хүрсэн үед л тухайн хоолны in_production батчуудыг дуусгана
  for r in
    select oi.product_id
      from public.order_items oi
      where oi.order_id = p_order_id
      group by oi.product_id
  loop
    if (
      select coalesce(sum(di.delivered_qty), 0)
        from public.delivery_items di
        join public.order_items oi2 on oi2.id = di.order_item_id
        join public.orders o on o.id = oi2.order_id
        where o.production_date = v_prod_date
          and oi2.product_id = r.product_id
    ) >= (
      select coalesce(sum(b.total_qty), 0)
        from public.production_batches b
        where b.production_date = v_prod_date
          and b.product_id = r.product_id
    ) then
      perform public.finish_batch(b.id, p_actor)
        from public.production_batches b
        where b.production_date = v_prod_date
          and b.product_id = r.product_id
          and b.status = 'in_production';
    end if;
  end loop;
end;
$$ language plpgsql;
