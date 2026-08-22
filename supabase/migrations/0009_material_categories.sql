-- Түүхий эдийн ангиллын мод (docs/system-design.md §5)
-- Ажиллуулах: Supabase Dashboard > SQL Editor дээр хуулж Run дарна.
-- Дараа нь material_categories-ийн RLS унтарсан эсэхийг шалгаарай.
--
-- Шийдвэрүүд (2026-08-22):
--   - Хуучин materials.category enum (food|packaging|other)-ийг хязгааргүй
--     гүнтэй ангиллын модоор (material_categories, parent_id) БҮРЭН орлуулна.
--     Ангиллыг хэрэглэгч UI дээрээс өөрөө зохион байгуулна: нэмэх, нэр солих,
--     зөөх, устгах, дурын гүнтэй дэд ангилал.
--   - Adjacency list (parent_id) загвар: мөр цөөн тул модыг фронтенд дээр
--     бүтнээр нь уншиж угсарна; рекурсив CTE шаардлагагүй.
--   - Цикл хориглох trigger: ангиллыг өөрийнх нь дэд мод руу зөөж болохгүй.
--   - Устгах хамгаалалт FK restrict-ээр: дэд ангилалтай эсвэл материалтай
--     ангилал устгагдахгүй — эхлээд хоослох шаардлагатай.
--   - Өгөгдөл шилжүүлэлт: хуучин 3 enum утгыг үндсэн түвшний ангилал болгож
--     үүсгээд материал бүрийг харгалзуулна, дараа нь enum баганыг хасна.

-- ---------------------------------------------------------------------------
-- Ангиллын мод
-- ---------------------------------------------------------------------------

create table if not exists public.material_categories (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.material_categories (id) on delete restrict,
  name text not null check (length(trim(name)) > 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Нэг эцгийн доор нэр давхардахгүй (том/жижиг үсэг ялгахгүй)
create unique index if not exists material_categories_root_name_idx
  on public.material_categories (lower(name))
  where parent_id is null;
create unique index if not exists material_categories_child_name_idx
  on public.material_categories (parent_id, lower(name))
  where parent_id is not null;

create index if not exists material_categories_parent_idx
  on public.material_categories (parent_id);

drop trigger if exists material_categories_updated_at on public.material_categories;
create trigger material_categories_updated_at
  before update on public.material_categories
  for each row execute function public.set_updated_at();

alter table public.material_categories disable row level security;

-- Цикл хориглоно: parent гинжийг дээш нь мөшгөж өөр дээрээ буцаж ирвэл алдаа
create or replace function public.check_category_cycle()
returns trigger as $$
declare
  v_id uuid := new.parent_id;
  v_depth int := 0;
begin
  while v_id is not null loop
    if v_id = new.id then
      raise exception 'Ангиллыг өөрийнх нь дэд ангилал руу зөөх боломжгүй (цикл үүснэ)';
    end if;
    select parent_id into v_id from public.material_categories where id = v_id;
    v_depth := v_depth + 1;
    if v_depth > 100 then
      raise exception 'Ангиллын мод хэт гүн байна';
    end if;
  end loop;
  return new;
end;
$$ language plpgsql;

drop trigger if exists material_categories_no_cycle on public.material_categories;
create trigger material_categories_no_cycle
  before insert or update of parent_id on public.material_categories
  for each row execute function public.check_category_cycle();

-- ---------------------------------------------------------------------------
-- materials: enum ангиллыг модны FK-ээр солино
-- ---------------------------------------------------------------------------

alter table public.materials
  add column if not exists category_id uuid
    references public.material_categories (id) on delete restrict;

create index if not exists materials_category_idx
  on public.materials (category_id);

-- Хуучин 3 enum утгыг үндсэн түвшний ангилал болгож үүсгэнэ (дахин
-- ажиллуулахад давхардуулахгүй)
insert into public.material_categories (name, sort_order)
select v.name, v.ord
from (values ('Хүнс', 0), ('Сав баглаа', 1), ('Бусад', 2)) as v(name, ord)
where not exists (
  select 1 from public.material_categories c
  where c.parent_id is null and lower(c.name) = lower(v.name)
);

-- Хуучин enum багана байгаа л бол өгөгдлийг шилжүүлнэ (дахин ажиллахад алгасна)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'materials'
      and column_name = 'category'
  ) then
    update public.materials m
      set category_id = c.id
      from public.material_categories c
      where c.parent_id is null
        and m.category_id is null
        and c.name = case m.category
              when 'food' then 'Хүнс'
              when 'packaging' then 'Сав баглаа'
              else 'Бусад'
            end;
  end if;
end $$;

-- stock_balances view хуучин category баганыг ашигладаг тул category_id-гаар
-- дахин үүсгэнэ (view-ийн багана хасагдах тул create or replace болохгүй)
drop view if exists public.stock_balances;
create view public.stock_balances as
select
  m.id as material_id,
  m.code,
  m.name,
  m.base_unit,
  m.category_id,
  m.min_stock,
  m.is_active,
  coalesce(sum(
    case sm.type
      when 'in' then sm.qty
      when 'out' then -sm.qty
      else sm.qty              -- adjust: тэмдэгтэй хадгалагдсан
    end
  ), 0) as balance
from public.materials m
left join public.stock_movements sm on sm.material_id = m.id
group by m.id;

-- Эцэст нь хуучин enum баганыг хасна
alter table public.materials drop column if exists category;
