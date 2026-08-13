-- Нийлүүлэгчийн бүртгэлийг хялбарчлах (2026-08-14):
--   - category (ангилал), registration_no (регистрийн №), payment_terms (төлбөрийн нөхцөл) талбаруудыг хасав
--   - contact_person + phone -> contact нэг талбарт нэгтгэв
--   - code автоматаар үүсдэг болсон (UI талд)
-- Ажиллуулах: Supabase Dashboard > SQL Editor дээр хуулж Run дарна.

alter table public.suppliers add column if not exists contact text;

-- Хуучин утгуудыг нэгтгэж шилжүүлнэ
update public.suppliers
set contact = nullif(trim(concat_ws(', ', contact_person, phone)), '')
where contact is null;

alter table public.suppliers drop column if exists contact_person;
alter table public.suppliers drop column if exists phone;
alter table public.suppliers drop column if exists category;
alter table public.suppliers drop column if exists registration_no;
alter table public.suppliers drop column if exists payment_terms;
