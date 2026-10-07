-- Цехийн заавар АЛХАМ тус бүрээр, алхам бүр өөрийн зурагтай (2026-10-07)
-- Ажиллуулах: 0034-ийн ДАРАА Supabase Dashboard > SQL Editor дээр Run дарна.
--
-- 0033-ын tech_card_station_instructions (цех бүрт нэг текст + зургийн
-- массив) хэрэглэгчийн хүсэлтээр алхмын хүснэгт болж өөрчлөгдөв: алхам
-- бүр тусдаа мөр, дараалалтай, өөрийн зургуудтай. Хуучин мөрүүдийг хоосон
-- мөрөөр (догол) алхам болгон хувааж шилжүүлнэ; зургууд нь 1-р алхамд очно.
-- Шилжүүлсний дараа хуучин хүснэгтийг устгана (нэг л эх сурвалж).

create table if not exists public.tech_card_station_steps (
  id uuid primary key default gen_random_uuid(),
  tech_card_id uuid not null references public.tech_cards (id) on delete cascade,
  station text not null
    check (station in ('prep', 'hot', 'hot_aux', 'packaging')),
  sort_order int not null default 0,
  text text not null default '',          -- алхмын тайлбар (хоосон байж болно: зөвхөн зурагтай алхам)
  image_urls text[] not null default '{}', -- Storage public URL-ууд, дараалалтай
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tech_card_station_steps_card_station_idx
  on public.tech_card_station_steps (tech_card_id, station, sort_order);

drop trigger if exists tech_card_station_steps_updated_at
  on public.tech_card_station_steps;
create trigger tech_card_station_steps_updated_at
  before update on public.tech_card_station_steps
  for each row execute function public.set_updated_at();

alter table public.tech_card_station_steps disable row level security;

-- Хуучин мөрүүдийг алхам болгон шилжүүлнэ (хүснэгт байгаа үед л)
do $$
begin
  if to_regclass('public.tech_card_station_instructions') is null then
    return;
  end if;

  -- Текстийг хоосон мөрөөр хувааж алхам болгоно; зургууд 1-р алхамд
  insert into public.tech_card_station_steps
    (tech_card_id, station, sort_order, text, image_urls)
  select i.tech_card_id, i.station, p.ord::int, btrim(p.chunk, E' \n\r\t'),
         case when p.ord = 1 then i.image_urls else '{}'::text[] end
  from public.tech_card_station_instructions i
  cross join lateral regexp_split_to_table(
    coalesce(i.instructions, ''), E'\n[ \t]*\r?\n') with ordinality as p(chunk, ord)
  where btrim(coalesce(p.chunk, '')) <> ''
    and not exists (
      select 1 from public.tech_card_station_steps s
      where s.tech_card_id = i.tech_card_id and s.station = i.station
    );

  -- Зөвхөн зурагтай (текстгүй) мөр → нэг алхам
  insert into public.tech_card_station_steps
    (tech_card_id, station, sort_order, text, image_urls)
  select i.tech_card_id, i.station, 1, '', i.image_urls
  from public.tech_card_station_instructions i
  where btrim(coalesce(i.instructions, '')) = ''
    and coalesce(array_length(i.image_urls, 1), 0) > 0
    and not exists (
      select 1 from public.tech_card_station_steps s
      where s.tech_card_id = i.tech_card_id and s.station = i.station
    );

  drop table public.tech_card_station_instructions;
end $$;
