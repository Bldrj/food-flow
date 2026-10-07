-- Хуучин ерөнхий зааврыг цехийн заавар руу шилжүүлэх (2026-10-07)
-- Ажиллуулах: Supabase Dashboard > SQL Editor дээр хуулж Run дарна.
--
-- Шийдвэр: «ерөнхий заавар» гэсэн ойлголт байхгүй — заавар зөвхөн цех тус
-- бүрээр (0033). tech_cards.instructions-ийн «== Бүлэг» хэсгүүдийг цехийн
-- дэлгэц ӨНӨӨДӨР ямар дүрмээр харуулж байсан, яг тэр дүрмээр хувааж
-- tech_card_station_instructions руу хуулна:
--   - гарчигтай хэсэг → тэр нэртэй бүлгийн орц дамждаг цех бүрт;
--   - гарчиггүй, эсвэл гарчиг нь ямар ч бүлэгтэй таарахгүй хэсэг → бүх цехэд
--     (хуучин дэлгэц мөн ингэж харуулдаг байсан).
-- Цех бүрт хэсгүүд анхны дарааллаараа, гарчиг нь эхний мөр болж нийлнэ.
-- Аль хэдийн цехийн заавартай (0033-оос хойш гараар бичсэн) ТК×цех мөрийг
-- дарж бичихгүй (on conflict do nothing). Давтан ажиллуулахад аюулгүй.
-- tech_cards.instructions баганыг УСТГАХГҮЙ — UI ашиглахаа больсон, лавлагаа
-- болгон үлдээв; дараагийн миграцид хасаж болно.

with lines as (
  select tc.id as tech_card_id, l.ord, l.line
  from public.tech_cards tc
  cross join lateral regexp_split_to_table(tc.instructions, E'\r?\n')
    with ordinality as l(line, ord)
  where tc.instructions is not null and btrim(tc.instructions) <> ''
),
marked as (
  select *,
    sum(case when line like '==%' then 1 else 0 end)
      over (partition by tech_card_id order by ord) as sec_no
  from lines
),
sections as (
  select tech_card_id, sec_no,
    max(case when line like '==%'
          then btrim(regexp_replace(line, '^=+\s*', '')) end) as title,
    string_agg(line, E'\n' order by ord)
      filter (where line not like '==%') as body
  from marked
  group by tech_card_id, sec_no
),
group_stations as (
  select distinct g.tech_card_id, lower(btrim(g.name)) as gname, s.station
  from public.tech_card_groups g
  join public.tech_card_items i on i.group_id = g.id
  cross join lateral unnest(i.stations) as s(station)
),
all_group_names as (
  select tech_card_id, lower(btrim(name)) as gname
  from public.tech_card_groups
),
stations as (
  select unnest(array['prep', 'hot_aux', 'hot', 'packaging']) as station
),
assigned as (
  select sec.tech_card_id, st.station, sec.sec_no, sec.title, sec.body
  from sections sec
  cross join stations st
  where btrim(coalesce(sec.body, '')) <> ''
    and (
      sec.title is null
      or exists (
        select 1 from group_stations gs
        where gs.tech_card_id = sec.tech_card_id
          and gs.gname = lower(btrim(sec.title))
          and gs.station = st.station
      )
      or not exists (
        select 1 from all_group_names an
        where an.tech_card_id = sec.tech_card_id
          and an.gname = lower(btrim(sec.title))
      )
    )
)
insert into public.tech_card_station_instructions (tech_card_id, station, instructions)
select tech_card_id, station,
  string_agg(
    case when title is not null and title <> ''
      then title || E'\n' || btrim(body, E'\n')
      else btrim(body, E'\n') end,
    E'\n\n' order by sec_no)
from assigned
group by tech_card_id, station
on conflict (tech_card_id, station) do nothing;
