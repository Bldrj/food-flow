-- Код олголтыг client талаас DB тал руу шилжүүлэх (2026-08-14).
-- Шалтгаан: client талд "хамгийн их код + 1" аргаар үүсгэхэд хоёр хэрэглэгч
-- зэрэг нэмбэл ижил код авах concurrency эрсдэлтэй. Sequence нь transaction-safe.
-- (code UNIQUE хязгаарлалт 0001 migration-д аль хэдийн бий.)
-- Ажиллуулах: Supabase Dashboard > SQL Editor дээр хуулж Run дарна.

create sequence if not exists public.customers_code_seq;
create sequence if not exists public.suppliers_code_seq;

-- Одоо байгаа хамгийн их дугаараас үргэлжлүүлнэ
select setval(
  'public.customers_code_seq',
  coalesce((select max(substring(code from 'CUS-(\d+)')::int) from public.customers), 0) + 1,
  false
);
select setval(
  'public.suppliers_code_seq',
  coalesce((select max(substring(code from 'SUP-(\d+)')::int) from public.suppliers), 0) + 1,
  false
);

create or replace function public.assign_customer_code()
returns trigger as $$
begin
  if new.code is null or new.code = '' then
    new.code := 'CUS-' || lpad(nextval('public.customers_code_seq')::text, 3, '0');
  end if;
  return new;
end;
$$ language plpgsql;

create or replace function public.assign_supplier_code()
returns trigger as $$
begin
  if new.code is null or new.code = '' then
    new.code := 'SUP-' || lpad(nextval('public.suppliers_code_seq')::text, 3, '0');
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists customers_assign_code on public.customers;
create trigger customers_assign_code
  before insert on public.customers
  for each row execute function public.assign_customer_code();

drop trigger if exists suppliers_assign_code on public.suppliers;
create trigger suppliers_assign_code
  before insert on public.suppliers
  for each row execute function public.assign_supplier_code();

-- Тайлбар: code-ийн NOT NULL + UNIQUE хэвээр — BEFORE INSERT trigger
-- нь constraint шалгагдахаас өмнө утгыг бөглөдөг тул insert дээр
-- code илгээх шаардлагагүй.
