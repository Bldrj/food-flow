-- Бэлдэцийн тусдаа кодын цуврал (0026-ийн үргэлжлэл)
-- Ажиллуулах: 0026-ийн ДАРАА Supabase Dashboard > SQL Editor дээр Run дарна.
--
-- Шийдвэрүүд (2026-08-27):
--   - Бэлдэц түүхий эдийн MAT- цувралыг эзлэхгүй, өөрийн BLD- цувралтай
--     (BLD-001, BLD-002 …) — жагсаалтад нэг харцаар ялгарна.
--   - Бэлдэцүүд «Бэлдэц» нэртэй ангилалд (material_categories) орно —
--     ангилал өгөгдөл тул seed талд үүсгэгдэнэ, энд зөвхөн кодын логик.

create sequence if not exists public.materials_bld_code_seq;

create or replace function public.assign_material_code()
returns trigger as $$
begin
  if new.code is null or new.code = '' then
    if new.kind = 'intermediate' then
      new.code := 'BLD-'
        || lpad(nextval('public.materials_bld_code_seq')::text, 3, '0');
    else
      new.code := 'MAT-'
        || lpad(nextval('public.materials_code_seq')::text, 3, '0');
    end if;
  end if;
  return new;
end;
$$ language plpgsql;
