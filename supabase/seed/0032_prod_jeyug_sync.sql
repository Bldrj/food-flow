-- PRODUCTION SYNC: Жэюүгийн ТК + бэлдэцүүдийг dev-ээс production руу (2026-08-31)
--
-- ЗААВАЛ ДАРААХ ДАРААЛЛААР:
--   1. Эхлээд schema migration 0020–0032-ыг (0024-ийг АЛГАСАЖ — dev хэрэгсэл)
--      production SQL Editor дээр дэс дарааллаар нь ажиллуулсан байх ёстой.
--   2. Дараа нь энэ скриптийг ажиллуулна.
--
-- Юу хийдэг вэ (нэг transaction, алдаа гарвал бүгд буцна):
--   - «Бэлдэц» ангилал + BLD-001..005 бэлдэц материалуудыг кодоор нь үүсгэнэ
--     (байвал алгасна — бусад лавлагаанд халдахгүй)
--   - PRD-016 «Савтай хоол - Жэюүг»-ийн одоогийн идэвхтэй ТК-г идэвхгүй
--     болгоод dev-ийн бүтэцтэй ШИНЭ хувилбар (version max+1) үүсгэнэ —
--     бусад хоолны ТК-д огт халдахгүй
--   - Орц бүрийг МАТЕРИАЛЫН КОДООР тааруулна; олдоогүй код байвал жагсаагаад
--     зогсоно (юу ч өөрчлөгдөхгүй)
--
-- Хуучин supabase/seed/0027_intermediates_seed.sql-ийг production дээр
-- БҮҮ ажиллуул — бүх хоолны картад халддаг, dev дата түүнээс хойш өөрчлөгдсөн.

do $$
declare
  v_data jsonb := $JEYUG$
{"card":{"product_code":"PRD-016","portion_yield_g":430,"instructions":"== Жэюүг\n2-р хоолны тогооны хэмийг 300дээр тааруулан сайтар халаана. Дараа нь ургамлын тосоо хийгээд сонгино, саримсаа хийж гүйцэд болтол хуурна.\n== Жэюүг мах /Үндсэн орц/\nДараа нь гахайн махаа хийж хутгаад тагийг таглаж 20 минут болгоно. Дараа нь урьдчилж бэлдсэн соус болон цагаан гаагаа хийж хутгаад тагийг таглан дахин 20-25минут болгоно.\n== Соус\nДараа нь луувангаа хийж хутгаад тогоогоо унтрааж тагийг таглана.\n5минут хүлээгээд бэлэн болсон бүтээгдэхүүнээ листэнд хувааж хийгээд 0-4° С-ийн хөргүүрт хийнэ.\n== Үдэн чанах\nУсан дээр амтлагчаа хийж буцалгана. Ус буцалмагц үдэнээ хийж 2-3минут чанаад гаргана.\n== Үдэн амтлах\nБолгосон үдэнээ 1*5см хэмжээтэй хэрчиж бэлтгэнэ.\n2-р хоолны тогооны хэмийг 300дээр тааруулан сайтар халаана. Дараа нь ургамлын тосоо хийгээд сонгино, саримсаа хийж хагас болтол хуураад дээрээс нь үдэнээ хийж хутгана.\n== Шар манжин /хачир/\nДараа нь бэлдсэн соусаа хийж сайтар хутгаад тогоогоо унтраана.\n== Амталсан цагаан лууван /хачир/\nБэлэн болсон бүтээгдэхүүнээ сайтар хутгаж холиод листэнд гаргаж 0-4°С -ийн хөргүүрт оруулж хөргөнө."},
"materials":[{"src":"hot_aux","code":"BLD-001","loss":0,"name":"Амталсан үдэн","unit":"kg"},{"src":"hot_aux","code":"BLD-002","loss":0,"name":"Будаа","unit":"kg"},{"src":"prep","code":"BLD-003","loss":0,"name":"Шар манжин /шоо дөрвөлжин/","unit":"kg"},{"src":"hot","code":"BLD-004","loss":0,"name":"Жэюүг мах","unit":"kg"},{"src":"hot_aux","code":"BLD-005","loss":0.2,"name":"Цагаан лууван /нимгэн зорсон/","unit":"kg"}],
"groups":[
{"name":"Жэюүг мах /Үндсэн орц/","oqpp":0.14,"sort":1,"out_code":"BLD-004","items":[{"code":"2-013","sort":1,"netto":0.0819,"brutto":0.0819,"stations":["prep","hot"]},{"code":"2-009","sort":2,"netto":0.0246,"brutto":0.0246,"stations":["prep","hot"]},{"code":"2-053","sort":3,"netto":0.0246,"brutto":0.0246,"stations":["prep","hot"]},{"code":"2-031","sort":4,"netto":0.00164,"brutto":0.00164,"stations":["prep","hot"]},{"code":"2-045","sort":5,"netto":0.00118,"brutto":0.00118,"stations":["prep","hot"]}]},
{"name":"Соус","oqpp":0.14,"sort":2,"out_code":"BLD-004","items":[{"code":"2-002","sort":1,"netto":0.00576,"brutto":0.00576,"stations":["hot"]},{"code":"MAT-023","sort":2,"netto":0.00633,"brutto":0.00633,"stations":["hot"]},{"code":"2-037","sort":3,"netto":0.00437,"brutto":0.00437,"stations":["hot"]},{"code":"2-114","sort":4,"netto":0.00319,"brutto":0.00319,"stations":["hot"]},{"code":"2-010","sort":5,"netto":0.00329,"brutto":0.00329,"stations":["hot"]},{"code":"2-040","sort":6,"netto":0.001646,"brutto":0.001646,"stations":["hot"]},{"code":"2-056","sort":7,"netto":0.001646,"brutto":0.001646,"stations":["hot"]},{"code":"2-020","sort":8,"netto":0.000548,"brutto":0.000548,"stations":["hot"]},{"code":"2-057","sort":9,"netto":0.000457,"brutto":0.000457,"stations":["hot"]}]},
{"name":"Үдэн чанах","oqpp":0.04,"sort":4,"out_code":"BLD-001","items":[{"code":"MAT-024","sort":1,"netto":0.07,"brutto":0.07,"stations":["hot_aux"]},{"code":"2-026","sort":2,"netto":0.00045,"brutto":0.00045,"stations":["hot_aux"]},{"code":"2-002","sort":3,"netto":0.000625,"brutto":0.000625,"stations":["hot_aux"]},{"code":"2-115","sort":4,"netto":0.000156,"brutto":0.000156,"stations":["hot_aux"]}]},
{"name":"Үдэн амтлах","oqpp":0.04,"sort":5,"out_code":"BLD-001","items":[{"code":"2-191","sort":1,"netto":0.032,"brutto":0.032,"stations":["hot_aux"]},{"code":"2-002","sort":2,"netto":0.002157,"brutto":0.002157,"stations":["hot_aux"]},{"code":"2-037","sort":3,"netto":0.00151,"brutto":0.00151,"stations":["hot_aux"]},{"code":"2-010","sort":4,"netto":0.000863,"brutto":0.000863,"stations":["hot_aux"]},{"code":"MAT-023","sort":5,"netto":0.001079,"brutto":0.001079,"stations":["hot_aux"]},{"code":"2-057","sort":6,"netto":0.000216,"brutto":0.000216,"stations":["hot_aux"]},{"code":"2-023","sort":7,"netto":0.001079,"brutto":0.001079,"stations":["hot_aux"]},{"code":"2-053","sort":8,"netto":0.001604,"brutto":0.001604,"stations":["hot_aux"]},{"code":"2-009","sort":9,"netto":0.001604,"brutto":0.001604,"stations":["hot_aux"]},{"code":"2-045","sort":10,"netto":0.000642,"brutto":0.000642,"stations":["hot_aux"]}]},
{"name":"Шар манжин /хачир/","oqpp":0.01,"sort":6,"out_code":"BLD-003","items":[{"code":"2-058","sort":1,"netto":0.01,"brutto":0.01,"stations":["prep"]}]},
{"name":"Амталсан цагаан лууван /хачир/","oqpp":0.02,"sort":7,"out_code":"BLD-005","items":[{"code":"2-301","sort":1,"netto":0.02,"brutto":0.02,"stations":["hot_aux"]},{"code":"2-056","sort":2,"netto":0.003,"brutto":0.003,"stations":["hot_aux"]},{"code":"2-026","sort":3,"netto":0.0002,"brutto":0.0002,"stations":["hot_aux"]},{"code":"MAT-023","sort":4,"netto":0.001,"brutto":0.001,"stations":["hot_aux"]}]},
{"name":"Савлагаа","oqpp":null,"sort":8,"out_code":null,"items":[{"code":"BLD-001","sort":1,"netto":0.04,"brutto":0.04,"stations":["packaging"]},{"code":"BLD-002","sort":2,"netto":0.18,"brutto":0.18,"stations":["packaging"]},{"code":"BLD-004","sort":3,"netto":0.14,"brutto":0.14,"stations":["packaging"]},{"code":"BLD-005","sort":4,"netto":0.02,"brutto":0.02,"stations":["packaging"]},{"code":"BLD-003","sort":5,"netto":0.01,"brutto":0.01,"stations":["packaging"]}]}
]}
$JEYUG$::jsonb;
  v_product_id uuid;
  v_cat_id uuid;
  v_tc_id uuid;
  v_version int;
  v_group_id uuid;
  v_mat_id uuid;
  v_out_id uuid;
  v_missing text[];
  v_g jsonb;
  v_i jsonb;
  v_groups int := 0;
  v_items int := 0;
begin
  -- 0. Урьдчилсан шалгалт: 0026-ийн kind багана байгаа эсэх (schema бэлэн үү)
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'materials'
      and column_name = 'kind'
  ) then
    raise exception 'Schema бэлэн биш — эхлээд migration 0020–0032-ыг ажиллуулна уу';
  end if;

  -- 1. Хоол кодоор олдох ёстой
  select id into v_product_id from public.products
    where code = v_data->'card'->>'product_code';
  if v_product_id is null then
    raise exception 'Бүтээгдэхүүн % олдсонгүй — products хүснэгтээ шалгана уу',
      v_data->'card'->>'product_code';
  end if;

  -- 2. Орцын бүх түүхий эдийн код production-д байгаа эсэхийг ЭХЭЛЖ шалгана
  select array_agg(distinct c) into v_missing
  from (
    select i->>'code' as c
    from jsonb_array_elements(v_data->'groups') g,
         jsonb_array_elements(g->'items') i
    where i->>'code' not like 'BLD-%'
  ) x
  where not exists (select 1 from public.materials m where m.code = x.c);
  if v_missing is not null then
    raise exception 'Production-д дараах материалын кодууд алга: % — лавлагаагаа тааруулаад дахин ажиллуулна уу',
      array_to_string(v_missing, ', ');
  end if;

  -- 3. «Бэлдэц» ангилал
  select id into v_cat_id from public.material_categories
    where name = 'Бэлдэц' and parent_id is null;
  if v_cat_id is null then
    insert into public.material_categories (name, sort_order)
      values ('Бэлдэц', 99) returning id into v_cat_id;
  end if;

  -- 4. Бэлдэц материалууд (кодоор; байвал алгасна)
  insert into public.materials
      (code, name, base_unit, kind, source_station, category_id, loss_pct)
  select m->>'code', m->>'name', m->>'unit', 'intermediate',
         m->>'src', v_cat_id, (m->>'loss')::numeric
  from jsonb_array_elements(v_data->'materials') m
  where not exists (
    select 1 from public.materials x where x.code = m->>'code'
  );
  -- Дараагийн шинэ бэлдэц BLD-006-аас үргэлжлэхээр цувралыг тааруулна
  perform setval('public.materials_bld_code_seq',
    greatest(1, (select coalesce(max(substring(code from 5)::int), 1)
                 from public.materials where code like 'BLD-%')));

  -- 5. Хуучин идэвхтэй ТК-г идэвхгүй болгож шинэ хувилбар үүсгэнэ
  update public.tech_cards
    set is_active = false
    where product_id = v_product_id and is_active;
  select coalesce(max(version), 0) + 1 into v_version
    from public.tech_cards where product_id = v_product_id;
  insert into public.tech_cards
      (product_id, version, portion_yield_g, instructions, is_active)
    values (v_product_id, v_version,
            (v_data->'card'->>'portion_yield_g')::numeric,
            v_data->'card'->>'instructions', true)
    returning id into v_tc_id;

  -- 6. Бүлгүүд + орцын мөрүүд (материал бүр кодоор тааруулагдана)
  for v_g in select * from jsonb_array_elements(v_data->'groups') loop
    v_out_id := null;
    if v_g->>'out_code' is not null then
      select id into v_out_id from public.materials
        where code = v_g->>'out_code';
    end if;
    insert into public.tech_card_groups
        (tech_card_id, name, sort_order, output_material_id,
         output_qty_per_portion)
      values (v_tc_id, v_g->>'name', (v_g->>'sort')::int, v_out_id,
              (v_g->>'oqpp')::numeric)
      returning id into v_group_id;
    v_groups := v_groups + 1;

    for v_i in select * from jsonb_array_elements(v_g->'items') loop
      select id into v_mat_id from public.materials
        where code = v_i->>'code';
      insert into public.tech_card_items
          (group_id, material_id, brutto_qty, netto_qty, sort_order, stations)
        values (v_group_id, v_mat_id,
                (v_i->>'brutto')::numeric, (v_i->>'netto')::numeric,
                (v_i->>'sort')::int,
                (select array_agg(s)::text[]
                 from jsonb_array_elements_text(v_i->'stations') s));
      v_items := v_items + 1;
    end loop;
  end loop;

  raise notice 'АМЖИЛТТАЙ: ТК v% үүсэв — % бүлэг, % орцын мөр',
    v_version, v_groups, v_items;
end $$;
