-- PRODUCTION FIX: Тефтелийн ТК-г Excel-ээр бүрэн шинэчлэх + савлагаа тохируулах
-- Огноо: 2026-09-29
--
-- Эх сурвалж: docs/Master sheet ortsoor ni salgasan huvilbar (5) (1).xlsx
-- («2.Тефтель» хуудас мөр 5–64; «савлагаа» хуудас мөр 9–14 «Тефтель 530гр»)
--
-- Яагаад: PRD-017-ийн v1 ТК-д бүлгүүд бэлдэцийн гарцгүй, Тефтель соус / Омлет /
-- Будаа / Савлагаа бүлэг огт байхгүй байсан тул Савлагаа цехэд юу ч очдоггүй,
-- сав шошго тооцогддоггүй байв.
--
-- Юу хийдэг вэ (нэг transaction, алдаа гарвал бүгд буцна):
--   1. Тефтелийн 6 бэлдэцийг (байхгүй бол) үүсгэнэ — код BLD-дарааллаар.
--   2. PRD-017-ийн идэвхтэй ТК-г идэвхгүй болгоод ШИНЭ хувилбар үүсгэнэ:
--        1 Тефтель мах       → Тефтель мах /80гр/, 2ш/порц       (Бэлтгэл+Халуун)
--        2 Тефтель төмс      → Нухсан төмс, 80г/порц             (Бэлтгэл+Х.туслах)
--        3 Луувангийн салат  → Луувангийн салат /Тефтель/, 15г   (Бэлтгэл+Х.туслах)
--        4 Тефтель соус      → Тефтель соус, 100г/порц           (Бэлтгэл+Халуун)
--        5 Омлет             → Омлет /Тефтель/, 2ш/порц          (Х.туслах+Халуун)
--        6 Будаа             → Цагаан будаа /агшаасан/, 190г     (Халуун туслах)
--        7 Савлагаа          → 6 бэлдэц + сав, шошго             (Савлагаа)
--      Орцын норм нь Excel-ийн ЦЭВЭР ЖИН (E багана), 1 порцоор.
--   3. Зааврын хэсгийн гарчгийг Excel-ийн Q баганы дагуу засна (v1-д гарчиг
--      нэг мөрөөр шилжиж буруу бүлэгт наалдсан байсан).
--
-- v1-ээс ялгаатай нь:
--   • «Тефтель мах Бридж гуанз 80 гр» бүлэг ороогүй — Excel-ийн хуудсанд байхгүй,
--     порц тутамд махны орцыг давхар тооцож байсан.
--   • Тефтель соус: «Ус» 51.72г + «Гурил хутгах ус» 3.617г = 55.337мл нэг мөр
--     (нэг бүлэгт нэг материал давтагдах боломжгүй).
--   • Өндөг: Excel-д 12.5г/порц; материал 2-034 нь ширхгээр тул 0.25ш/порц
--     (50г/ш; Жэюүгийн хуудасны 45 порцын омлетын харьцаатай таарна).
--
-- Анхаар: хорогдлыг (materials.loss_pct) энэ скрипт ХӨНДӨХГҮЙ.
-- Дахин ажиллуулахад аюулгүй: «Савлагаа» бүлэгтэй идэвхтэй ТК байвал алгасна.

do $$
declare
  v_product_id uuid;
  v_old_tc uuid;
  v_new_tc uuid;
  v_version int;
  v_category uuid;
  v_missing text[];
  v_b jsonb;
  v_g jsonb;
  v_group_id uuid;
  v_bld jsonb := $BLD$
[
 {"name":"Тефтель мах /80гр/","unit":"pcs","src":"hot"},
 {"name":"Нухсан төмс","unit":"kg","src":"hot_aux"},
 {"name":"Луувангийн салат /Тефтель/","unit":"kg","src":"hot_aux"},
 {"name":"Тефтель соус","unit":"kg","src":"hot"},
 {"name":"Омлет /Тефтель/","unit":"pcs","src":"hot_aux"},
 {"name":"Цагаан будаа /агшаасан/","unit":"kg","src":"hot_aux"}
]
$BLD$::jsonb;
  -- items: [код эсвэл бэлдэцийн нэр, 1 порцын цэвэр норм, цехийн зам]
  v_data jsonb := $TEFTEL$
[
 {"name":"Тефтель мах","sort":1,"out":"Тефтель мах /80гр/","oqpp":2,
  "items":[["2-130",0.054974,["prep","hot"]],["2-129",0.054974,["prep","hot"]],
           ["MAT-028",0.04712,["prep","hot"]],["2-024",0.007853,["prep","hot"]],
           ["2-009",0.007853,["prep","hot"]],["MAT-024",0.005236,["prep","hot"]],
           ["2-072",0.003927,["prep","hot"]],["2-045",0.002618,["prep","hot"]],
           ["2-026",0.001309,["prep","hot"]],["2-020",0.000157,["prep","hot"]]]},
 {"name":"Тефтель төмс","sort":2,"out":"Нухсан төмс","oqpp":0.08,
  "items":[["2-003",0.085,["prep","hot_aux"]],["2-050",0.00037,["hot_aux"]],
           ["MAT-029",0.00378,["hot_aux"]],["MAT-023",0.00061,["hot_aux"]],
           ["2-026",0.0005,["hot_aux"]],["2-045",0.00046,["hot_aux"]]]},
 {"name":"Луувангийн салат","sort":3,"out":"Луувангийн салат /Тефтель/","oqpp":0.015,
  "items":[["2-053",0.01248,["prep","hot_aux"]],["2-027",0.00552,["hot_aux"]],
           ["MAT-023",0.000324,["hot_aux"]]]},
 {"name":"Тефтель соус","sort":4,"out":"Тефтель соус","oqpp":0.1,
  "items":[["MAT-024",0.055337,["hot"]],["MAT-042",0.032325,["hot"]],
           ["MAT-038",0.001448,["hot"]],["2-009",0.00181,["prep","hot"]],
           ["2-180",0.003372,["hot"]],["2-045",0.000647,["prep","hot"]],
           ["2-026",0.000453,["hot"]],["2-168",0.000323,["hot"]],
           ["2-007",0.000724,["hot"]],["2-004",0.000362,["hot"]],
           ["2-023",0.000259,["hot"]],["2-020",0.000065,["hot"]],
           ["2-061",0.000013,["hot"]],["2-133",0.000013,["hot"]],
           ["2-085",0.000724,["hot"]],["2-024",0.000724,["hot"]],
           ["2-198",0.000362,["hot"]],
           ["MAT-023",0.000337,["hot"]]]},
 {"name":"Омлет","sort":5,"out":"Омлет /Тефтель/","oqpp":2,
  "items":[["MAT-024",0.0062,["hot_aux"]],["2-034",0.25,["hot_aux"]],
           ["2-053",0.001233,["hot"]],["2-071",0.000667,["hot"]],
           ["2-050",0.000607,["hot_aux"]],["MAT-023",0.000111,["hot_aux"]],
           ["2-024",0.000367,["hot_aux"]],["2-026",0.000111,["hot_aux"]],
           ["2-020",0.00003,["hot_aux"]]]},
 {"name":"Будаа","sort":6,"out":"Цагаан будаа /агшаасан/","oqpp":0.19,
  "items":[["2-001",0.084444,["hot_aux"]],["MAT-024",0.112593,["hot_aux"]],
           ["2-023",0.003519,["hot_aux"]],["2-026",0.000704,["hot_aux"]]]},
 {"name":"Савлагаа","sort":7,"out":null,"oqpp":null,
  "items":[["Нухсан төмс",0.08,["packaging"]],["Цагаан будаа /агшаасан/",0.19,["packaging"]],
           ["Тефтель соус",0.1,["packaging"]],["Тефтель мах /80гр/",2,["packaging"]],
           ["Луувангийн салат /Тефтель/",0.015,["packaging"]],["Омлет /Тефтель/",2,["packaging"]],
           ["2-146",1,["packaging"]],["2-184",1,["packaging"]]]}
]
$TEFTEL$::jsonb;
begin
  select id into v_product_id from public.products where code = 'PRD-017';
  select id into v_old_tc from public.tech_cards
    where product_id = v_product_id and is_active;
  if v_old_tc is null then
    raise exception 'PRD-017-ийн идэвхтэй ТК олдсонгүй';
  end if;
  if exists (select 1 from public.tech_card_groups
             where tech_card_id = v_old_tc and name = 'Савлагаа') then
    raise notice 'Идэвхтэй ТК аль хэдийн савлагаатай — алгасав';
    return;
  end if;

  -- 1. Бэлдэцүүд (нэрээр хайж, байхгүйг нь үүсгэнэ; код trigger-ээр оноогдоно)
  select category_id into v_category from public.materials where code = 'BLD-004';
  for v_b in select * from jsonb_array_elements(v_bld) loop
    if not exists (select 1 from public.materials
                   where kind = 'intermediate' and name = v_b->>'name') then
      insert into public.materials (name, base_unit, kind, source_station, category_id)
        values (v_b->>'name', v_b->>'unit', 'intermediate', v_b->>'src', v_category);
    end if;
  end loop;

  -- Бүх материал (код эсвэл бэлдэцийн нэрээр) байгаа эсэх
  select array_agg(distinct c) into v_missing
  from (
    select (i->>0) c from jsonb_array_elements(v_data) g, jsonb_array_elements(g->'items') i
  ) x
  where not exists (select 1 from public.materials m
                    where m.code = x.c or (m.kind = 'intermediate' and m.name = x.c));
  if v_missing is not null then
    raise exception 'Материал олдсонгүй: %', array_to_string(v_missing, ', ');
  end if;

  -- 2. Шинэ хувилбар
  update public.tech_cards set is_active = false where id = v_old_tc;
  select coalesce(max(version), 0) + 1 into v_version
    from public.tech_cards where product_id = v_product_id;
  insert into public.tech_cards
      (product_id, version, portion_yield_g, instructions, is_active)
    select product_id, v_version, portion_yield_g,
      E'== Тефтель мах\nГэсгээсэн махан дээрээ амталгааны бүх орцоо нэмж зуурагч машинаар зуурна. Амталсан махаа 80-85гр-аар хувааж бөөрөнхийлөөд шарах шүүгээнд хийж 195°С-т 20 минут, 210 °С-т 5 минут болголт хийнэ. Бэлэн болсон бүтээгдэхүүнээ 0-4°С-ийн хөргүүрт оруулж доод тал 30минут хөргөнө.\n== Тефтель төмс\nТөмсөө жижиглэнэ. Жижиглэсэн төмсөө листэнд  хийгээд ус болон давсаа нэмж жигнүүрт 50 минут болгоно. Болсон төмсөө шүүж аваад гурил зуурагч машинд хийж дээрээс нь бусад бүх орцоо хийж нухаш болгоно.\n== Тефтель соус\n6. Бэлэн болсон соусаа листүүдэд хувааж хийгээд 0-4°С-ийн хөргүүрт оруулж доод тал нь 30 минут хөргөнө.',
      true
    from public.tech_cards where id = v_old_tc
    returning id into v_new_tc;

  for v_g in select * from jsonb_array_elements(v_data) loop
    insert into public.tech_card_groups
        (tech_card_id, name, sort_order, output_material_id, output_qty_per_portion)
      values (v_new_tc, v_g->>'name', (v_g->>'sort')::int,
              (select id from public.materials
                where kind = 'intermediate' and name = v_g->>'out'),
              (v_g->>'oqpp')::numeric)
      returning id into v_group_id;

    insert into public.tech_card_items
        (group_id, material_id, brutto_qty, netto_qty, sort_order, stations)
    select v_group_id, m.id, (i.val->>1)::numeric, (i.val->>1)::numeric, i.ord,
           (select array_agg(s)::text[] from jsonb_array_elements_text(i.val->2) s)
    from jsonb_array_elements(v_g->'items') with ordinality i(val, ord)
    join public.materials m
      on m.code = (i.val->>0)
      or (m.kind = 'intermediate' and m.name = (i.val->>0));
  end loop;

  raise notice 'АМЖИЛТТАЙ: Тефтель ТК v% үүсэв', v_version;
end $$;
