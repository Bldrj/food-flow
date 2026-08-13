-- Захиалагчийн бүртгэлийг хялбарчлах (2026-08-14):
--   - customer_type (төрөл) талбарыг хасав
--   - contact_person + phone -> contact нэг талбарт нэгтгэв
--   - code автоматаар үүсдэг болсон (UI талд)
-- Ажиллуулах: Supabase Dashboard > SQL Editor дээр хуулж Run дарна.

alter table public.customers add column if not exists contact text;

-- Хуучин утгуудыг нэгтгэж шилжүүлнэ
update public.customers
set contact = nullif(trim(concat_ws(', ', contact_person, phone)), '')
where contact is null;

alter table public.customers drop column if exists contact_person;
alter table public.customers drop column if exists phone;
alter table public.customers drop column if exists customer_type;
