-- Зураг + цех тус бүрийн заавар (2026-10-07)
-- Ажиллуулах: Supabase Dashboard > SQL Editor дээр хуулж Run дарна.
--
-- 1) Материалын зураг: materials.image_url — Storage-ийн public URL.
--    Нэг материалд нэг зураг (цехийн ажилтан юу болохыг танихад хангалттай).
-- 2) Цехийн заавар: tech_card_station_instructions — ТК × цех бүрт нэг
--    мөр. Хуучин tech_cards.instructions («== Бүлэг» хэсэгтэй нэг текст)
--    ЕРӨНХИЙ заавар хэвээр үлдэнэ; цехийн дэлгэц эхлээд өөрийн цехийн
--    мөрийг, дараа нь ерөнхийг харуулна. Зургууд image_urls массив
--    (дараалалтай) — тусдаа хүснэгт шаардлагагүй: зураг зөвхөн энэ мөрөөр
--    л харагдана, хайлт/холбоос хэрэггүй.
-- 3) Storage: material-images, tech-card-images гэсэн 2 public bucket.
--    Public = URL-аар шууд үзнэ (img src), signed URL хэрэггүй. RLS-ийг
--    бусад хүснэгтийнхтэй адил нээлттэй (anon + authenticated) тавив —
--    апп anon key-гээр, dev no-auth горимд ажилладаг (0001-ээс хойш бүх
--    хүснэгтэд RLS унтраалттай).

alter table public.materials
  add column if not exists image_url text;

create table if not exists public.tech_card_station_instructions (
  id uuid primary key default gen_random_uuid(),
  tech_card_id uuid not null references public.tech_cards (id) on delete cascade,
  station text not null
    check (station in ('prep', 'hot', 'hot_aux', 'packaging')),
  instructions text,            -- олон мөрт заавар
  image_urls text[] not null default '{}', -- Storage public URL-ууд, дараалалтай
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tech_card_id, station)
);

create index if not exists tech_card_station_instructions_card_idx
  on public.tech_card_station_instructions (tech_card_id);

drop trigger if exists tech_card_station_instructions_updated_at
  on public.tech_card_station_instructions;
create trigger tech_card_station_instructions_updated_at
  before update on public.tech_card_station_instructions
  for each row execute function public.set_updated_at();

alter table public.tech_card_station_instructions disable row level security;

-- ---------------------------------------------------------------------------
-- Storage buckets
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('material-images', 'material-images', true, 5242880,
   array['image/jpeg', 'image/png', 'image/webp']),
  ('tech-card-images', 'tech-card-images', true, 5242880,
   array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- storage.objects дээр RLS Supabase-ийн default-аар асаалттай тул bucket
-- бүрт policy хэрэгтэй. Апп нэвтрэлтгүй (anon) ажилладаг тул anon-д ч
-- зөвшөөрнө — бусад хүснэгтийн RLS-гүй байдалтай нийцнэ.
drop policy if exists "images public read" on storage.objects;
create policy "images public read" on storage.objects
  for select to anon, authenticated
  using (bucket_id in ('material-images', 'tech-card-images'));

drop policy if exists "images app insert" on storage.objects;
create policy "images app insert" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id in ('material-images', 'tech-card-images'));

drop policy if exists "images app update" on storage.objects;
create policy "images app update" on storage.objects
  for update to anon, authenticated
  using (bucket_id in ('material-images', 'tech-card-images'));

drop policy if exists "images app delete" on storage.objects;
create policy "images app delete" on storage.objects
  for delete to anon, authenticated
  using (bucket_id in ('material-images', 'tech-card-images'));
