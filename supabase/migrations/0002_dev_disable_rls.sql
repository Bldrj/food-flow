-- ТЕСТ ГОРИМ: login-гүй хөгжүүлэлтийн үед RLS-ийг түр унтраана.
-- Ажиллуулах: Supabase Dashboard > SQL Editor дээр хуулж Run дарна.
--
-- Анхаар: Үе 6 (Auth & RLS)-д эргүүлж идэвхжүүлж, дүр тус бүрийн
-- policy нэмэх ёстой (docs/system-design.md §4).

alter table public.customers disable row level security;
alter table public.suppliers disable row level security;
