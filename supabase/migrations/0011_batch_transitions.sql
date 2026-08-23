-- Батчийн статус шилжилт (docs/system-design.md §5)
-- Ажиллуулах: Supabase Dashboard > SQL Editor дээр хуулж Run дарна.
--
-- Шийдвэрүүд (2026-08-23):
--   - Батч үүсэх = төлөвлөлт, Эхлүүлэх = гүйцэтгэл. Төлөвлөсөн үед нэмэлт
--     захиалга generate_batches-ээр чөлөөтэй нийлнэ; «Эхлүүлэх» дарсан мөчөөс
--     тоо хөлдөж, зөрүү зөвхөн ⚠ анхааруулгаар харагдана (хүн шийднэ).
--   - Зөвшөөрөгдөх шилжилт ГУРАВХАН: planned → in_production → done, мөн
--     in_production → planned (андуурч эхлүүлснийг буцаах — гаж нөлөөгүй тул
--     аюулгүй). done эцсийнх, буцахгүй.
--   - Шилжилт зөвхөн RPC-ээр (app.batch_transition флаг) — confirm_order,
--     confirm_stock_issue-тэй ижил загвар.
--   - started_at/by, finished_at/by цагийн тэмдэглэгээ — «хэдэн цагт эхэлж
--     хэдэн цагт дуусав» гэсэн түүх (хожмын тайлангийн түүхий эд).
--   - «Дуусгах»-д материал бүрэн олгогдсоныг ШААРДАХГҮЙ — дутуу олголт
--     улаанаар харагдсаар байх тул мартагдахгүй (зарлагын хасах үлдэгдэлтэй
--     ижил зарчим: хатуу хориг бодит ажлыг гацаана).
--   - Захиалгын статусыг батчаас автоматаар дагуулахгүй (нэг захиалга олон
--     хоолтой, батчууд өөр цагт эхэлдэг тул нэгтгэл тодорхойгүй) — захиалгын
--     үлдсэн шилжилтүүд Үе 4-ийн хүргэлтийн урсгалд шийдэгдэнэ.

-- ---------------------------------------------------------------------------
-- Цагийн тэмдэглэгээний баганууд + статустай нийцэх CHECK
-- ---------------------------------------------------------------------------

alter table public.production_batches
  add column if not exists started_at timestamptz,
  add column if not exists started_by text,
  add column if not exists finished_at timestamptz,
  add column if not exists finished_by text;

alter table public.production_batches
  drop constraint if exists production_batches_status_times_check;
alter table public.production_batches
  add constraint production_batches_status_times_check check (
    (status = 'planned' and started_at is null and finished_at is null)
    or (status = 'in_production' and started_at is not null and finished_at is null)
    or (status = 'done' and started_at is not null and finished_at is not null)
  );

-- ---------------------------------------------------------------------------
-- Trigger-ийн хатуужилт: статусын шилжилтийг шалгадаг болгоно
-- (0008-ын хувилбар статусыг огт шалгадаггүй цоорхойтой байсан)
-- ---------------------------------------------------------------------------

create or replace function public.block_batch_change()
returns trigger as $$
begin
  if new.production_date <> old.production_date
     or new.product_id <> old.product_id
     or new.tech_card_id <> old.tech_card_id then
    raise exception 'Батчийн огноо/хоол/ТК snapshot-ийг өөрчлөх боломжгүй';
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

-- Trigger нь 0008-ынхтай ижил нэртэй тул функцийг л сольход хангалттай

-- ---------------------------------------------------------------------------
-- Шилжилтийн RPC-ууд
-- Frontend: supabase.rpc('start_batch' | 'finish_batch' | 'revert_batch', ...)
-- ---------------------------------------------------------------------------

create or replace function public.start_batch(
  p_batch_id uuid,
  p_actor text default null
)
returns void as $$
declare
  v_status text;
begin
  select status into v_status
    from public.production_batches
    where id = p_batch_id
    for update;

  if v_status is null then
    raise exception 'Батч олдсонгүй';
  end if;
  if v_status <> 'planned' then
    raise exception 'Зөвхөн төлөвлөсөн батчийг эхлүүлнэ (одоогийн төлөв: %)', v_status;
  end if;

  perform set_config('app.batch_transition', 'on', true);

  update public.production_batches
    set status = 'in_production',
        started_at = now(),
        started_by = p_actor
    where id = p_batch_id;
end;
$$ language plpgsql;

create or replace function public.finish_batch(
  p_batch_id uuid,
  p_actor text default null
)
returns void as $$
declare
  v_status text;
begin
  select status into v_status
    from public.production_batches
    where id = p_batch_id
    for update;

  if v_status is null then
    raise exception 'Батч олдсонгүй';
  end if;
  if v_status <> 'in_production' then
    raise exception 'Зөвхөн үйлдвэрлэлд буй батчийг дуусгана (одоогийн төлөв: %)', v_status;
  end if;

  perform set_config('app.batch_transition', 'on', true);

  update public.production_batches
    set status = 'done',
        finished_at = now(),
        finished_by = p_actor
    where id = p_batch_id;
end;
$$ language plpgsql;

-- Андуурч эхлүүлснийг буцаана — ямар ч гаж нөлөөгүй тул цагийг цэвэрлээд
-- planned руу буцаахад аюулгүй. Дууссан батч буцахгүй.
create or replace function public.revert_batch(
  p_batch_id uuid
)
returns void as $$
declare
  v_status text;
begin
  select status into v_status
    from public.production_batches
    where id = p_batch_id
    for update;

  if v_status is null then
    raise exception 'Батч олдсонгүй';
  end if;
  if v_status <> 'in_production' then
    raise exception 'Зөвхөн үйлдвэрлэлд буй батчийг буцаана (одоогийн төлөв: %)', v_status;
  end if;

  perform set_config('app.batch_transition', 'on', true);

  update public.production_batches
    set status = 'planned',
        started_at = null,
        started_by = null
    where id = p_batch_id;
end;
$$ language plpgsql;
