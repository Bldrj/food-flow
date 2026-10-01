-- PRODUCTION FIX: Жэюүгийн ТК-г Excel-ээр бүрэн шинэчлэх + нэгжийн засвар
-- Огноо: 2026-09-24
--
-- Эх сурвалж: docs/Master sheet ortsoor ni salgasan huvilbar (5) (1).xlsx
-- («1. Жэюүг» хуудас, 2026-09-18-ны хувилбар; мөр 5–61)
--
-- Юу хийдэг вэ (нэг transaction, алдаа гарвал бүгд буцна):
--   1. PRD-016-ийн идэвхтэй ТК-г идэвхгүй болгоод ШИНЭ хувилбар үүсгэнэ
--      (хуучин хувилбарт 2026-09-01-ний багц холбогдсон тул засахгүй).
--      Бүх бүлэг, орцыг Excel-ийн ЦЭВЭР ЖИН-гээр бүрдүүлнэ:
--        1 Жэюүг мах /Үндсэн орц/  → BLD-004, 140г/порц   (Бэлтгэл+Халуун)
--        2 Соус                    → BLD-004, 140г/порц   (Халуун)
--        3 Омлет /45 порц/         → бэлдэцгүй            (Халуун)
--        4 Үдэн чанах              → BLD-001, 40г/порц    (Халуун туслах)
--        5 Үдэн амтлах             → BLD-001, 40г/порц    (Халуун туслах)
--        6 Шар манжин /хачир/      → BLD-003, 10г/порц    (Бэлтгэл)
--        7 Амталсан цагаан лууван  → BLD-005, 20г/порц    (Бэлтгэл+Х.туслах)
--        8 Ягаан будаа             → BLD-002, 180г/порц   (Халуун туслах)
--        9 Савлагаа                → бэлдэц + сав, шошго  (Савлагаа)
--      Өмнөх датаас ялгаатай нь: Цагаан гаа буцаж орсон, мах/ногооны жин
--      Excel-ийн хэмжээнд (81.9г, 24.6г …), цагаан лууван 15г, савлагаанд
--      Жэюүг мах 140г буцаж орсон, ягаан будаа түүхий эд биш бэлдэц боллоо.
--   2. BLD-002-ийн нэрийг «Ягаан будаа /бэлдэц/» болгоно (өөр ТК ашигладаггүй;
--      MAT-059 түүхий эд «ягаан будаа» нэрийг эзэлсэн тул ялгаж нэрлэв).
--   3. 2-168 Гуляш амтлагч, 2-133 Лаврын навч: base_unit pcs → kg.
--      ТК-д хадгалсан тоо аль хэдийн кг-аар (0.000368 = 0.37г) тул зөвхөн
--      нэгжийг засна. Агуулахын хөдөлгөөн байвал зогсоно.
--
-- Анхаар: хорогдлыг (materials.loss_pct) энэ скрипт ХӨНДӨХГҮЙ. Excel-ийн
-- бохир жин = цэвэр ÷ (1 − хорогдол) бол систем нь цэвэр × (1 + loss_pct)
-- гэж тооцдог тул агуулахаас гаргах тоо Excel-ээс бага гарсаар байна.

do $$
declare
  v_product_id uuid;
  v_old_tc uuid;
  v_new_tc uuid;
  v_version int;
  v_missing text[];
  v_g jsonb;
  v_group_id uuid;
  v_data jsonb := $JEYUG$
[
 {"name":"Жэюүг мах /Үндсэн орц/","sort":1,"out":"BLD-004","oqpp":0.14,"st":["prep","hot"],
  "items":[["2-013",0.0819],["2-009",0.0246],["2-053",0.0246],["2-031",0.00164],["2-045",0.00118]]},
 {"name":"Соус","sort":2,"out":"BLD-004","oqpp":0.14,"st":["hot"],
  "items":[["2-002",0.00576],["MAT-023",0.00633],["2-037",0.00437],["2-114",0.00319],["2-010",0.00329],
           ["2-040",0.001646],["2-056",0.001646],["2-020",0.000548],["2-057",0.000457]]},
 {"name":"Омлет /1листний орц ба 45порц гарна/","sort":3,"out":null,"oqpp":null,"st":["hot"],
  "items":[["MAT-024",0.008267],["2-034",0.333333],["2-053",0.001644],["2-071",0.000889],["2-050",0.000809],
           ["MAT-023",0.000148],["2-024",0.000489],["2-026",0.000148],["2-020",0.00004]]},
 {"name":"Үдэн чанах","sort":4,"out":"BLD-001","oqpp":0.04,"st":["hot_aux"],
  "items":[["MAT-024",0.07],["2-026",0.00045],["2-002",0.000625],["2-115",0.000156]]},
 {"name":"Үдэн амтлах","sort":5,"out":"BLD-001","oqpp":0.04,"st":["hot_aux"],
  "items":[["2-191",0.032],["2-002",0.002157],["2-037",0.00151],["2-010",0.000863],["MAT-023",0.001079],
           ["2-057",0.000216],["2-023",0.001079],["2-053",0.001604],["2-009",0.001604],["2-045",0.000642]]},
 {"name":"Шар манжин /хачир/","sort":6,"out":"BLD-003","oqpp":0.01,"st":["prep"],
  "items":[["2-058",0.01]]},
 {"name":"Амталсан цагаан лууван /хачир/","sort":7,"out":"BLD-005","oqpp":0.02,"st":["hot_aux"],
  "items":[["2-301",0.015],["2-056",0.003],["2-026",0.0002],["MAT-023",0.001]]},
 {"name":"Ягаан будаа","sort":8,"out":"BLD-002","oqpp":0.18,"st":["hot_aux"],
  "items":[["2-001",0.075],["2-297",0.0025],["2-023",0.00333],["MAT-024",0.10667],["2-026",0.000666]]},
 {"name":"Савлагаа","sort":9,"out":null,"oqpp":null,"st":["packaging"],
  "items":[["BLD-004",0.14],["BLD-001",0.04],["BLD-002",0.18],["BLD-005",0.02],["BLD-003",0.01],
           ["2-146",1],["2-181",1]]}
]
$JEYUG$::jsonb;
begin
  -- Бүх материалын код байгаа эсэх
  select array_agg(distinct c) into v_missing
  from (
    select (i->>0) c from jsonb_array_elements(v_data) g, jsonb_array_elements(g->'items') i
  ) x
  where not exists (select 1 from public.materials m where m.code = x.c);
  if v_missing is not null then
    raise exception 'Материалын код олдсонгүй: %', array_to_string(v_missing, ', ');
  end if;

  -- Нэгж солих материалд агуулахын хөдөлгөөн байх ёсгүй
  if exists (select 1 from public.stock_movements s join public.materials m on m.id = s.material_id
             where m.code in ('2-168', '2-133'))
     or exists (select 1 from public.goods_receipt_items r join public.materials m on m.id = r.material_id
                where m.code in ('2-168', '2-133')) then
    raise exception 'Гуляш/Лаврын навчинд агуулахын хөдөлгөөн байна — нэгжийг гараар шилжүүлнэ үү';
  end if;

  select id into v_product_id from public.products where code = 'PRD-016';
  select id into v_old_tc from public.tech_cards
    where product_id = v_product_id and is_active;
  if v_old_tc is null then
    raise exception 'PRD-016-ийн идэвхтэй ТК олдсонгүй';
  end if;

  update public.tech_cards set is_active = false where id = v_old_tc;
  select coalesce(max(version), 0) + 1 into v_version
    from public.tech_cards where product_id = v_product_id;
  insert into public.tech_cards
      (product_id, version, portion_yield_g, instructions, is_active)
    select product_id, v_version, portion_yield_g, instructions, true
    from public.tech_cards where id = v_old_tc
    returning id into v_new_tc;

  for v_g in select * from jsonb_array_elements(v_data) loop
    insert into public.tech_card_groups
        (tech_card_id, name, sort_order, output_material_id, output_qty_per_portion)
      values (v_new_tc, v_g->>'name', (v_g->>'sort')::int,
              (select id from public.materials where code = v_g->>'out'),
              (v_g->>'oqpp')::numeric)
      returning id into v_group_id;

    insert into public.tech_card_items
        (group_id, material_id, brutto_qty, netto_qty, sort_order, stations)
    select v_group_id, m.id, (i.val->>1)::numeric, (i.val->>1)::numeric, i.ord,
           (select array_agg(s)::text[] from jsonb_array_elements_text(v_g->'st') s)
    from jsonb_array_elements(v_g->'items') with ordinality i(val, ord)
    join public.materials m on m.code = (i.val->>0);
  end loop;

  -- MAT-059 «ягаан будаа» (түүхий эд) нэрийг эзэлсэн тул бэлдэцийг ялгаж нэрлэв
  update public.materials set name = 'Ягаан будаа /бэлдэц/' where code = 'BLD-002';

  update public.materials set base_unit = 'kg'
    where code in ('2-168', '2-133') and base_unit = 'pcs';

  raise notice 'АМЖИЛТТАЙ: Жэюүг ТК v% үүсэв', v_version;
end $$;
