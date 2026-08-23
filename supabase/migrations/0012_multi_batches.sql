-- Нэг өдөр нэг хоолонд ОЛОН батч (docs/system-design.md §5)
-- Ажиллуулах: 0011-ийн ДАРАА Supabase Dashboard > SQL Editor дээр Run дарна.
--
-- Шийдвэрийн өөрчлөлт (2026-08-23):
--   - 0008-ын «нэг өдөр нэг хоол нэг батч» (unique(production_date, product_id))
--     дүрмийг ХҮЧИНГҮЙ болгов. Шалтгаан: үйлдвэрлэл эхэлснээс хойш нэмэлт
--     захиалга БАЙНГА ирдэг бөгөөд түүнийг тусдаа батчаар (№2, №3...) хийх нь
--     бэлтгэгч, няравт ойлгомжтой — батч бүр өөрийн ТК snapshot, хэрэгцээ,
--     олголттой бүрэн бие даасан нэгж болно.
--   - batch_seq: өдөр+хоолын доторх дугаар (№1, №2...). unique(өдөр, хоол, seq).
--   - Инвариант: нэг өдөр нэг хоолонд ТӨЛӨВЛӨСӨН батч ЯМАГТ НЭГ Л байна
--     (partial unique index) — нэмэлт захиалгууд тухайн ганц planned батч руу
--     нийлдэг хэвээр; эхлүүлсэн батчид хүрэхгүй.
--   - generate_batches шинэ семантик: хоол бүрд
--       locked = Σ(in_production/done батчийн порц)   ← хөлдсөн гүйцэтгэл
--       remaining = захиалгын Σ − locked              ← хараахан хийгдээгүй
--     remaining > 0 бол planned батчийг remaining-д тааруулна (байхгүй бол
--     шинээр үүсгэж ОДООГИЙН идэвхтэй ТК-г хөлдөөнө); remaining ≤ 0 бол
--     planned батчийг устгана (locked нь захиалгаас их бол ⚠ UI-д харагдана).
--     Идэвхтэй ТК-гүй хоолны шалгалт зөвхөн ШИНЭ батч үүсгэх шаардлагатай
--     хоолд тавигдана.
--   - daily_material_needs өөрчлөгдөхгүй — батчуудын нийлбэр хэвээр зөв.

-- ---------------------------------------------------------------------------
-- batch_seq + unique дүрмийн өөрчлөлт
-- ---------------------------------------------------------------------------

alter table public.production_batches
  add column if not exists batch_seq integer not null default 1
    check (batch_seq >= 1);

-- Хуучин "нэг өдөр нэг хоол" unique-ийг хасна (inline unique-ийн автомат нэр)
alter table public.production_batches
  drop constraint if exists production_batches_production_date_product_id_key;

-- Шинэ дүрэм: дугаар нь өдөр+хоол дотроо давхардахгүй
alter table public.production_batches
  drop constraint if exists production_batches_date_product_seq_key;
alter table public.production_batches
  add constraint production_batches_date_product_seq_key
  unique (production_date, product_id, batch_seq);

-- Инвариант: нэг өдөр нэг хоолонд төлөвлөсөн батч ганц л байна
create unique index if not exists production_batches_one_planned_idx
  on public.production_batches (production_date, product_id)
  where status = 'planned';

-- ---------------------------------------------------------------------------
-- Trigger: batch_seq мөн identity-ийн нэг хэсэг (0011-ийн статус дүрэм хэвээр)
-- ---------------------------------------------------------------------------

create or replace function public.block_batch_change()
returns trigger as $$
begin
  if new.production_date <> old.production_date
     or new.product_id <> old.product_id
     or new.tech_card_id <> old.tech_card_id
     or new.batch_seq <> old.batch_seq then
    raise exception 'Батчийн огноо/хоол/ТК snapshot/дугаарыг өөрчлөх боломжгүй';
  end if;
  if new.total_qty <> old.total_qty then
    if coalesce(current_setting('app.batching', true), '') <> 'on' then
      raise exception 'Батчийн тоог зөвхөн generate_batches() функцээр шинэчилнэ';
    end if;
    if old.status <> 'planned' then
      raise exception 'Үйлдвэрлэлд орсон батчийн тоог өөрчлөх боломжгүй';
    end if;
  end if;
  if new.status <> old.status then
    if coalesce(current_setting('app.batch_transition', true), '') <> 'on' then
      raise exception 'Батчийн статусыг зөвхөн start/finish/revert_batch() функцээр солино';
    end if;
    if not (
      (old.status = 'planned' and new.status = 'in_production')
      or (old.status = 'in_production' and new.status = 'done')
      or (old.status = 'in_production' and new.status = 'planned')
    ) then
      raise exception 'Зөвшөөрөгдөөгүй шилжилт: % → %', old.status, new.status;
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

-- ---------------------------------------------------------------------------
-- generate_batches: олон батчийн семантик
-- ---------------------------------------------------------------------------

create or replace function public.generate_batches(
  p_date date,
  p_actor text default null
)
returns void as $$
declare
  v_missing text;
  r record;
  v_locked integer;
  v_remaining integer;
  v_planned_id uuid;
  v_planned_qty integer;
  v_tc uuid;
  v_seq integer;
begin
  -- Нэг өдрийн батчийг зэрэг үүсгэх race-ээс хамгаална
  perform pg_advisory_xact_lock(hashtext('generate_batches:' || p_date::text));

  -- Идэвхтэй ТК-гүй хоолны шалгалт: зөвхөн ШИНЭ батч үүсгэх шаардлагатай
  -- (planned батчгүй бөгөөд locked нь захиалгыг бүрэн нөхөхгүй) хоолд
  select string_agg(p.name, ', ') into v_missing
    from public.daily_order_totals t
    join public.products p on p.id = t.product_id
    where t.production_date = p_date
      and not exists (
        select 1 from public.tech_cards tc
        where tc.product_id = t.product_id and tc.is_active
      )
      and not exists (
        select 1 from public.production_batches b
        where b.production_date = p_date
          and b.product_id = t.product_id
          and b.status = 'planned'
      )
      and t.total_qty > (
        select coalesce(sum(b.total_qty), 0)
        from public.production_batches b
        where b.production_date = p_date
          and b.product_id = t.product_id
          and b.status <> 'planned'
      );
  if v_missing is not null then
    raise exception 'Идэвхтэй технологийн картгүй хоол: %', v_missing;
  end if;

  perform set_config('app.batching', 'on', true);

  -- Захиалгагүй болсон хоолны planned батчийг цэвэрлэнэ
  delete from public.production_batches b
    where b.production_date = p_date
      and b.status = 'planned'
      and not exists (
        select 1 from public.daily_order_totals t
        where t.production_date = p_date and t.product_id = b.product_id
      );

  for r in
    select t.product_id, t.total_qty
      from public.daily_order_totals t
      where t.production_date = p_date
  loop
    -- Хөлдсөн гүйцэтгэл (эхэлсэн/дууссан батчуудын Σ)
    select coalesce(sum(total_qty), 0)::int into v_locked
      from public.production_batches
      where production_date = p_date
        and product_id = r.product_id
        and status <> 'planned';

    v_remaining := r.total_qty - v_locked;

    v_planned_id := null;
    v_planned_qty := null;
    select id, total_qty into v_planned_id, v_planned_qty
      from public.production_batches
      where production_date = p_date
        and product_id = r.product_id
        and status = 'planned';

    if v_remaining <= 0 then
      -- Захиалга хөлдсөн батчуудаар бүрэн (илүү) нөхөгдсөн — planned хэрэггүй
      if v_planned_id is not null then
        delete from public.production_batches where id = v_planned_id;
      end if;
      continue;
    end if;

    if v_planned_id is not null then
      if v_planned_qty <> v_remaining then
        update public.production_batches
          set total_qty = v_remaining
          where id = v_planned_id;
      end if;
    else
      -- Шинэ батч: одоогийн идэвхтэй ТК-г хөлдөөж, дараагийн дугаар олгоно
      select tc.id into v_tc
        from public.tech_cards tc
        where tc.product_id = r.product_id and tc.is_active;
      select coalesce(max(batch_seq), 0) + 1 into v_seq
        from public.production_batches
        where production_date = p_date and product_id = r.product_id;
      insert into public.production_batches
          (production_date, product_id, tech_card_id, total_qty, batch_seq, created_by)
        values (p_date, r.product_id, v_tc, v_remaining, v_seq, p_actor);
    end if;
  end loop;
end;
$$ language plpgsql;
