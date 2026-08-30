-- Нэхэмжлэлийн шалтгаан + бэлдэцийн задаргаа (docs/system-design.md §5)
-- Ажиллуулах: 0031-ийн ДАРАА Supabase Dashboard > SQL Editor дээр Run дарна.
--
-- Шийдвэрүүд (2026-08-31):
--   - БҮХ НЭХЭМЖЛЭЛ ШУУД НЯРАВТ: 0022-ын цех-цех чиглүүлэлт (замын өмнөх
--     цех рүү) хасагдаж target үргэлж 'warehouse' болов. Хуучин мөрүүдийн
--     цехийн target түүхэнд хэвээр тул CHECK өөрчлөгдөхгүй.
--   - reason: 'shortage' (дутуу) | 'defect' (асуудалтай бараа — муудсан,
--     гэмтсэн г.м. солиулах). Хуучин мөрүүд автоматаар shortage.
--   - deliver_station: барааг хүлээн авах цех. Энгийн материалд нэхэмжилсэн
--     цех өөрөө; бэлдэцийн орцод бэлдэцийг үйлдвэрлэдэг эхний цех
--     (materials.source_station) — савлагаа бэлдэц дутууг мэдэгдэхэд бараа
--     эхний цехэд очиж, тэндээс бэлдэц болж ирнэ. Няравын зарлагын мөрийн
--     station (0019) энэ утгаар prefill хийгдэнэ.
--   - БЭЛДЭЦ ЗАДАРНА: бэлдэц нэхэмжлэхэд эцэг мөр (бэлдэц өөрөө, түүхэнд юу
--     хэд дутсаныг үлдээнэ, зарлагад орохгүй) + хүү мөрүүд (жорын орц бүр,
--     qty = бэлдэцийн qty × intermediate_recipes.qty_per_output) UI талд
--     үүснэ, parent_request_id-аар холбогдоно. Нярав зөвхөн хүү/энгийн
--     мөрүүдээс ноорог үүсгэнэ; эцэг нь бүх хүү нь биелэхэд RPC-ээр хаагдана.
--   - АСУУДАЛТАЙ БАРАА НЯРАВ БАТЛАХАД ХАЯГДАЛД: солиулах зарлага батлагдахад
--     reason='defect' нэхэмжлэлийн хэмжээ нэхэмжилсэн цехийн тухайн өдрийн
--     waste тоололд (station_stock_counts, 0017) нэмэгдэнэ — цехийн тэнцэл
--     (авсан − үлдэгдэл − хаягдал = хэрэглэсэн) солиулсныг давхар
--     «хэрэглэсэн» гэж харуулахгүй. Бэлдэцийн задаргаатай бол эцэг мөрийн
--     бэлдэц/qty-гаар (орц бүрээр давхардуулахгүй).
--   - Агуулах руу физик буцаалт — одоогоор загварчлаагүй (нээлттэй).

alter table public.material_requests
  add column if not exists reason text not null default 'shortage'
    check (reason in ('shortage', 'defect')),
  add column if not exists deliver_station text
    check (deliver_station in ('prep', 'hot', 'hot_aux', 'packaging')),
  add column if not exists parent_request_id uuid
    references public.material_requests (id) on delete cascade;

create index if not exists material_requests_parent_idx
  on public.material_requests (parent_request_id)
  where parent_request_id is not null;

-- ---------------------------------------------------------------------------
-- confirm_stock_issue v3 (0022-ын хувилбар дээр):
--   ① холбогдсон нэхэмжлэлүүдийг хаана (хуучин)
--   ② бүх хүү нь биелсэн эцэг (бэлдэцийн) мөрүүдийг хаана
--   ③ defect нэхэмжлэлийн хэмжээг цехийн waste тоололд нэмнэ
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

  -- ① Энэ баримтаар биелүүлж буй цехийн нэхэмжлэлүүдийг хаана
  update public.material_requests
    set status = 'fulfilled',
        fulfilled_at = now(),
        fulfilled_by = p_actor
    where stock_issue_id = p_issue_id
      and status = 'pending';

  -- ② Бэлдэцийн эцэг мөр: хамгийн сүүлийн хүү нь энэ баримтаар биелсэн бол
  --    (pending хүү үлдээгүй) эцгийг мөн хаана
  update public.material_requests p
    set status = 'fulfilled',
        fulfilled_at = now(),
        fulfilled_by = p_actor
    where p.status = 'pending'
      and exists (
        select 1 from public.material_requests c
        where c.parent_request_id = p.id
          and c.stock_issue_id = p_issue_id
      )
      and not exists (
        select 1 from public.material_requests c
        where c.parent_request_id = p.id
          and c.status = 'pending'
      );

  -- ③ Асуудалтай бараа: солиулах зарлага батлагдмагц хуучин барааны хэмжээ
  --    нэхэмжилсэн цехийн waste тоололд орно. Эцэг/энгийн мөрөөр л тоолно —
  --    бэлдэцийн орц бүрээр давхардуулахгүй. Нэг баримт нэг л удаа
  --    батлагддаг тул давхар нэмэгдэх эрсдэлгүй.
  insert into public.station_stock_counts as ssc
      (date, station, material_id, qty, type, note, created_by)
  select
      r.request_date,
      r.station,
      r.material_id,
      sum(r.qty),
      'waste',
      'Асуудалтай бараа — нэхэмжлэлээр',
      p_actor
    from public.material_requests r
    where r.reason = 'defect'
      and r.status = 'fulfilled'
      and r.parent_request_id is null
      and (
        r.stock_issue_id = p_issue_id
        or exists (
          select 1 from public.material_requests c
          where c.parent_request_id = r.id
            and c.stock_issue_id = p_issue_id
        )
      )
    group by r.request_date, r.station, r.material_id
  on conflict (date, station, material_id, type)
    do update set qty = ssc.qty + excluded.qty;
end;
$$ language plpgsql;
