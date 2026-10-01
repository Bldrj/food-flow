do $$ begin
insert into public.materials(id,code,name,base_unit,category_id,kind,source_station,loss_pct,is_active) select id,code,name,base_unit,category_id,kind,source_station,loss_pct,is_active from jsonb_populate_record(null::public.materials,'{"id":"84ac700d-1ffe-4208-a479-ebc6917462f2","code":"BLD-RICE-KIMBAP","name":"Агшаасан кимбаб будаа","base_unit":"kg","category_id":"14e17bb0-666f-4c47-ab33-7e61df891f45","kind":"intermediate","source_station":"hot_aux","loss_pct":0,"is_active":true}'::jsonb);
end $$;
do $$ begin
insert into public.materials(id,code,name,base_unit,category_id,kind,source_station,loss_pct,is_active) select id,code,name,base_unit,category_id,kind,source_station,loss_pct,is_active from jsonb_populate_record(null::public.materials,'{"id":"afa2cc88-44b4-415b-b64f-2aebd8148f8f","code":"BLD-RICE-BUCKWHEAT","name":"Агшаасан гурвалжин будаатай будаа","base_unit":"kg","category_id":"14e17bb0-666f-4c47-ab33-7e61df891f45","kind":"intermediate","source_station":"hot_aux","loss_pct":0,"is_active":true}'::jsonb);
end $$;
do $$ begin
insert into public.tech_card_groups(id,tech_card_id,name,sort_order,output_material_id,output_qty_per_portion) select id,tech_card_id,name,sort_order,output_material_id,output_qty_per_portion from jsonb_populate_record(null::public.tech_card_groups,'{"id":"5a9650ad-3559-42e9-bf14-d53f21c536d1","tech_card_id":"6d7e952d-5c79-4727-8254-74a9516ae148","name":"Будааны ус, амтлагч — порцын норм","sort_order":90,"output_material_id":null,"output_qty_per_portion":null}'::jsonb);
end $$;
do $$ begin
if not exists(select 1 from public.tech_card_items t where t.id='b204aeb5-ab89-4122-ad54-55d1b4ecbd85' and to_jsonb(t) @> '{"id":"b204aeb5-ab89-4122-ad54-55d1b4ecbd85","group_id":"672b9985-cdaa-4aed-aa43-fcbd21daa8ae","material_id":"4564942b-0c33-4d12-a549-0f067a1ae913","brutto_qty":0.112593,"netto_qty":0.112593,"sort_order":2,"created_at":"2026-09-29T03:03:02.189302+00:00","stations":["hot_aux"]}'::jsonb) then raise exception 'Rice preimage changed: b204aeb5-ab89-4122-ad54-55d1b4ecbd85'; end if;
update public.tech_card_items set (group_id)=(select group_id from jsonb_populate_record(null::public.tech_card_items,'{"group_id":"5a9650ad-3559-42e9-bf14-d53f21c536d1"}'::jsonb)) where id='b204aeb5-ab89-4122-ad54-55d1b4ecbd85';
end $$;
do $$ begin
if not exists(select 1 from public.tech_card_items t where t.id='2a329521-2254-45e1-ab35-0bb8948cac5a' and to_jsonb(t) @> '{"id":"2a329521-2254-45e1-ab35-0bb8948cac5a","group_id":"672b9985-cdaa-4aed-aa43-fcbd21daa8ae","material_id":"61db9c2e-60a3-45e2-9837-e793b25cdb28","brutto_qty":0.003519,"netto_qty":0.003519,"sort_order":3,"created_at":"2026-09-29T03:03:02.189302+00:00","stations":["hot_aux"]}'::jsonb) then raise exception 'Rice preimage changed: 2a329521-2254-45e1-ab35-0bb8948cac5a'; end if;
update public.tech_card_items set (group_id)=(select group_id from jsonb_populate_record(null::public.tech_card_items,'{"group_id":"5a9650ad-3559-42e9-bf14-d53f21c536d1"}'::jsonb)) where id='2a329521-2254-45e1-ab35-0bb8948cac5a';
end $$;
do $$ begin
if not exists(select 1 from public.tech_card_items t where t.id='49aa075f-53ae-4fb8-9082-e7675480af5f' and to_jsonb(t) @> '{"id":"49aa075f-53ae-4fb8-9082-e7675480af5f","group_id":"672b9985-cdaa-4aed-aa43-fcbd21daa8ae","material_id":"5adcc220-70d8-45e4-aec4-6ed889210c41","brutto_qty":0.000704,"netto_qty":0.000704,"sort_order":4,"created_at":"2026-09-29T03:03:02.189302+00:00","stations":["hot_aux"]}'::jsonb) then raise exception 'Rice preimage changed: 49aa075f-53ae-4fb8-9082-e7675480af5f'; end if;
update public.tech_card_items set (group_id)=(select group_id from jsonb_populate_record(null::public.tech_card_items,'{"group_id":"5a9650ad-3559-42e9-bf14-d53f21c536d1"}'::jsonb)) where id='49aa075f-53ae-4fb8-9082-e7675480af5f';
end $$;
do $$ begin
insert into public.tech_card_groups(id,tech_card_id,name,sort_order,output_material_id,output_qty_per_portion) select id,tech_card_id,name,sort_order,output_material_id,output_qty_per_portion from jsonb_populate_record(null::public.tech_card_groups,'{"id":"a938d8a0-6a57-4f4e-8957-a552c6af773e","tech_card_id":"2503c49d-221f-492b-96d3-22dd49f17c17","name":"Будааны ус, амтлагч — порцын норм","sort_order":90,"output_material_id":null,"output_qty_per_portion":null}'::jsonb);
end $$;
do $$ begin
insert into public.tech_card_items(id,group_id,material_id,netto_qty,brutto_qty,stations,sort_order) select id,group_id,material_id,netto_qty,brutto_qty,stations,sort_order from jsonb_populate_record(null::public.tech_card_items,'{"id":"fc1addbf-90f4-4453-ae5d-6ffd335ebdb9","group_id":"a938d8a0-6a57-4f4e-8957-a552c6af773e","material_id":"4564942b-0c33-4d12-a549-0f067a1ae913","netto_qty":0.118519,"brutto_qty":0.118519,"stations":["hot_aux"],"sort_order":0}'::jsonb);
end $$;
do $$ begin
insert into public.tech_card_items(id,group_id,material_id,netto_qty,brutto_qty,stations,sort_order) select id,group_id,material_id,netto_qty,brutto_qty,stations,sort_order from jsonb_populate_record(null::public.tech_card_items,'{"id":"eb7b3be2-cbcb-494b-8412-b4b66e4bfce9","group_id":"a938d8a0-6a57-4f4e-8957-a552c6af773e","material_id":"61db9c2e-60a3-45e2-9837-e793b25cdb28","netto_qty":0.003704,"brutto_qty":0.003704,"stations":["hot_aux"],"sort_order":0}'::jsonb);
end $$;
do $$ begin
insert into public.tech_card_items(id,group_id,material_id,netto_qty,brutto_qty,stations,sort_order) select id,group_id,material_id,netto_qty,brutto_qty,stations,sort_order from jsonb_populate_record(null::public.tech_card_items,'{"id":"4e0a1bf5-370a-4fe4-974f-30960612ae03","group_id":"a938d8a0-6a57-4f4e-8957-a552c6af773e","material_id":"5adcc220-70d8-45e4-aec4-6ed889210c41","netto_qty":0.000741,"brutto_qty":0.000741,"stations":["hot_aux"],"sort_order":0}'::jsonb);
end $$;
do $$ begin
insert into public.tech_card_groups(id,tech_card_id,name,sort_order,output_material_id,output_qty_per_portion) select id,tech_card_id,name,sort_order,output_material_id,output_qty_per_portion from jsonb_populate_record(null::public.tech_card_groups,'{"id":"ed53258e-e24f-4e3d-9638-1b4c7f5d6ba5","tech_card_id":"e64f88b2-bb38-40fe-a8bd-b3791cf95316","name":"Кимбаб будаа агшаалга — нийтлэг жор","sort_order":90,"output_material_id":"84ac700d-1ffe-4208-a479-ebc6917462f2","output_qty_per_portion":0.07}'::jsonb);
end $$;
do $$ begin
insert into public.tech_card_items(id,group_id,material_id,netto_qty,brutto_qty,stations,sort_order) select id,group_id,material_id,netto_qty,brutto_qty,stations,sort_order from jsonb_populate_record(null::public.tech_card_items,'{"id":"c7b468ad-7f1b-4bc6-a544-05c82eef4844","group_id":"ed53258e-e24f-4e3d-9638-1b4c7f5d6ba5","material_id":"697187fc-78a9-4cf4-b7d5-1327c7634d69","netto_qty":0.031111,"brutto_qty":0.031111,"stations":["hot_aux"],"sort_order":0}'::jsonb);
end $$;
do $$ begin
insert into public.tech_card_groups(id,tech_card_id,name,sort_order,output_material_id,output_qty_per_portion) select id,tech_card_id,name,sort_order,output_material_id,output_qty_per_portion from jsonb_populate_record(null::public.tech_card_groups,'{"id":"1f342a04-4cab-4afe-8e39-b647977fe573","tech_card_id":"733801c5-e89d-4b74-b229-2adc29953fdb","name":"Гурвалжин будаатай будаа агшаалга — нийтлэг жор","sort_order":90,"output_material_id":"afa2cc88-44b4-415b-b64f-2aebd8148f8f","output_qty_per_portion":0.18}'::jsonb);
end $$;
do $$ begin
insert into public.tech_card_items(id,group_id,material_id,netto_qty,brutto_qty,stations,sort_order) select id,group_id,material_id,netto_qty,brutto_qty,stations,sort_order from jsonb_populate_record(null::public.tech_card_items,'{"id":"54fd2e77-9305-403c-81fc-c8b6536ee49a","group_id":"1f342a04-4cab-4afe-8e39-b647977fe573","material_id":"697187fc-78a9-4cf4-b7d5-1327c7634d69","netto_qty":0.072,"brutto_qty":0.072,"stations":["hot_aux"],"sort_order":0}'::jsonb);
end $$;
do $$ begin
insert into public.tech_card_items(id,group_id,material_id,netto_qty,brutto_qty,stations,sort_order) select id,group_id,material_id,netto_qty,brutto_qty,stations,sort_order from jsonb_populate_record(null::public.tech_card_items,'{"id":"766f53fa-7481-4cca-a851-cbfeb434eb12","group_id":"1f342a04-4cab-4afe-8e39-b647977fe573","material_id":"0d4dbd8c-f446-432d-a1fb-33603c7a80e7","netto_qty":0.008,"brutto_qty":0.008,"stations":["hot_aux"],"sort_order":0}'::jsonb);
end $$;
do $$ begin
if not exists(select 1 from public.tech_card_items t where t.id='454eafaf-6afb-417d-8bea-3089a22a59de' and to_jsonb(t) @> '{"id":"454eafaf-6afb-417d-8bea-3089a22a59de","group_id":"0b6126bb-99c3-48c0-a6d0-718e56084fe6","material_id":"57022db4-55fc-4252-b454-4b7ec2af8f0f","brutto_qty":0.04712,"netto_qty":0.04712,"sort_order":3,"created_at":"2026-09-29T03:03:02.189302+00:00","stations":["prep","hot"]}'::jsonb) then raise exception 'Rice preimage changed: 454eafaf-6afb-417d-8bea-3089a22a59de'; end if;
update public.tech_card_items set (material_id,stations)=(select material_id,stations from jsonb_populate_record(null::public.tech_card_items,'{"material_id":"d7664b28-ff37-40cf-9a47-607c1b852581","stations":["hot"]}'::jsonb)) where id='454eafaf-6afb-417d-8bea-3089a22a59de';
end $$;
do $$ begin
if not exists(select 1 from public.tech_card_items t where t.id='16c6792b-5299-41ad-996b-9c02eb0df91b' and to_jsonb(t) @> '{"id":"16c6792b-5299-41ad-996b-9c02eb0df91b","group_id":"e55d6871-fcfd-4f52-baa2-1502c718cb2f","material_id":"57022db4-55fc-4252-b454-4b7ec2af8f0f","brutto_qty":0.32,"netto_qty":0.32,"sort_order":6,"created_at":"2026-08-21T07:27:49.885264+00:00","stations":["prep","hot"]}'::jsonb) then raise exception 'Rice preimage changed: 16c6792b-5299-41ad-996b-9c02eb0df91b'; end if;
update public.tech_card_items set (material_id,stations)=(select material_id,stations from jsonb_populate_record(null::public.tech_card_items,'{"material_id":"d7664b28-ff37-40cf-9a47-607c1b852581","stations":["hot"]}'::jsonb)) where id='16c6792b-5299-41ad-996b-9c02eb0df91b';
end $$;
do $$ begin
if not exists(select 1 from public.tech_card_items t where t.id='b5c6b791-11e2-4a73-af08-8b21b54684b7' and to_jsonb(t) @> '{"id":"b5c6b791-11e2-4a73-af08-8b21b54684b7","group_id":"1d789042-8e9c-44b0-8a0a-512da0ac840e","material_id":"697187fc-78a9-4cf4-b7d5-1327c7634d69","brutto_qty":0.066667,"netto_qty":0.066667,"sort_order":1,"created_at":"2026-08-21T07:28:02.315927+00:00","stations":["hot_aux","packaging"]}'::jsonb) then raise exception 'Rice preimage changed: b5c6b791-11e2-4a73-af08-8b21b54684b7'; end if;
update public.tech_card_items set (material_id,brutto_qty,netto_qty,stations)=(select material_id,brutto_qty,netto_qty,stations from jsonb_populate_record(null::public.tech_card_items,'{"material_id":"d7664b28-ff37-40cf-9a47-607c1b852581","brutto_qty":0.15,"netto_qty":0.15,"stations":["packaging"]}'::jsonb)) where id='b5c6b791-11e2-4a73-af08-8b21b54684b7';
end $$;
do $$ begin
if not exists(select 1 from public.tech_card_items t where t.id='ce5c6e63-255a-43ba-a52f-0e126f8a79b6' and to_jsonb(t) @> '{"id":"ce5c6e63-255a-43ba-a52f-0e126f8a79b6","group_id":"94c82fc7-49bf-4a1a-9b93-b252386aca71","material_id":"697187fc-78a9-4cf4-b7d5-1327c7634d69","brutto_qty":0.044444,"netto_qty":0.044444,"sort_order":1,"created_at":"2026-08-21T07:28:07.321977+00:00","stations":["hot_aux","packaging"]}'::jsonb) then raise exception 'Rice preimage changed: ce5c6e63-255a-43ba-a52f-0e126f8a79b6'; end if;
update public.tech_card_items set (material_id,brutto_qty,netto_qty,stations)=(select material_id,brutto_qty,netto_qty,stations from jsonb_populate_record(null::public.tech_card_items,'{"material_id":"d7664b28-ff37-40cf-9a47-607c1b852581","brutto_qty":0.1,"netto_qty":0.1,"stations":["packaging"]}'::jsonb)) where id='ce5c6e63-255a-43ba-a52f-0e126f8a79b6';
end $$;
do $$ begin
if not exists(select 1 from public.tech_card_items t where t.id='40d470b2-b5f1-41e4-855e-8a929cfc45f3' and to_jsonb(t) @> '{"id":"40d470b2-b5f1-41e4-855e-8a929cfc45f3","group_id":"a4b12c54-c2e2-41d9-b456-584c78b7453d","material_id":"697187fc-78a9-4cf4-b7d5-1327c7634d69","brutto_qty":0.08,"netto_qty":0.08,"sort_order":1,"created_at":"2026-08-21T07:28:12.012826+00:00","stations":["hot_aux","packaging"]}'::jsonb) then raise exception 'Rice preimage changed: 40d470b2-b5f1-41e4-855e-8a929cfc45f3'; end if;
update public.tech_card_items set (material_id,stations)=(select material_id,stations from jsonb_populate_record(null::public.tech_card_items,'{"material_id":"84ac700d-1ffe-4208-a479-ebc6917462f2","stations":["packaging"]}'::jsonb)) where id='40d470b2-b5f1-41e4-855e-8a929cfc45f3';
end $$;
do $$ begin
if not exists(select 1 from public.tech_card_items t where t.id='106d9ec4-e3d2-4d93-812d-109d10d308d8' and to_jsonb(t) @> '{"id":"106d9ec4-e3d2-4d93-812d-109d10d308d8","group_id":"c8719cec-fcaa-46c3-8b2f-a850d6dd3e04","material_id":"697187fc-78a9-4cf4-b7d5-1327c7634d69","brutto_qty":0.07,"netto_qty":0.07,"sort_order":1,"created_at":"2026-08-21T07:28:13.661966+00:00","stations":["hot_aux","packaging"]}'::jsonb) then raise exception 'Rice preimage changed: 106d9ec4-e3d2-4d93-812d-109d10d308d8'; end if;
update public.tech_card_items set (material_id,stations)=(select material_id,stations from jsonb_populate_record(null::public.tech_card_items,'{"material_id":"84ac700d-1ffe-4208-a479-ebc6917462f2","stations":["packaging"]}'::jsonb)) where id='106d9ec4-e3d2-4d93-812d-109d10d308d8';
end $$;
do $$ begin
insert into public.tech_card_groups(id,tech_card_id,name,sort_order,output_material_id,output_qty_per_portion) select id,tech_card_id,name,sort_order,output_material_id,output_qty_per_portion from jsonb_populate_record(null::public.tech_card_groups,'{"id":"c690c28e-1901-4be2-8d4b-0842e56f412e","tech_card_id":"57eff965-6e6a-4ce7-89d0-ef18529ed5c9","name":"Агшаасан будаа — Халуун туслахын норм","sort_order":90,"output_material_id":null,"output_qty_per_portion":null}'::jsonb);
end $$;
do $$ begin
insert into public.tech_card_items(id,group_id,material_id,netto_qty,brutto_qty,stations,sort_order) select id,group_id,material_id,netto_qty,brutto_qty,stations,sort_order from jsonb_populate_record(null::public.tech_card_items,'{"id":"d225bbde-38a3-438c-be80-f9587674c922","group_id":"c690c28e-1901-4be2-8d4b-0842e56f412e","material_id":"d7664b28-ff37-40cf-9a47-607c1b852581","netto_qty":0.235,"brutto_qty":0.235,"stations":["packaging"],"sort_order":0}'::jsonb);
end $$;
do $$ begin
insert into public.tech_card_groups(id,tech_card_id,name,sort_order,output_material_id,output_qty_per_portion) select id,tech_card_id,name,sort_order,output_material_id,output_qty_per_portion from jsonb_populate_record(null::public.tech_card_groups,'{"id":"27392ed7-28e2-4ca6-ad08-442700f6e072","tech_card_id":"9ad95106-5b13-4706-b813-00b3bff896c0","name":"Агшаасан будаа — Халуун туслахын норм","sort_order":90,"output_material_id":null,"output_qty_per_portion":null}'::jsonb);
end $$;
do $$ begin
insert into public.tech_card_items(id,group_id,material_id,netto_qty,brutto_qty,stations,sort_order) select id,group_id,material_id,netto_qty,brutto_qty,stations,sort_order from jsonb_populate_record(null::public.tech_card_items,'{"id":"75954d7c-3850-4764-9712-07e536565ad2","group_id":"27392ed7-28e2-4ca6-ad08-442700f6e072","material_id":"d7664b28-ff37-40cf-9a47-607c1b852581","netto_qty":0.18,"brutto_qty":0.18,"stations":["packaging"],"sort_order":0}'::jsonb);
end $$;
do $$ begin
insert into public.tech_card_groups(id,tech_card_id,name,sort_order,output_material_id,output_qty_per_portion) select id,tech_card_id,name,sort_order,output_material_id,output_qty_per_portion from jsonb_populate_record(null::public.tech_card_groups,'{"id":"43a3092d-2532-4a20-9397-9add8ad0630b","tech_card_id":"e33e96d4-44a4-46d8-9c4f-1b6860b0f787","name":"Агшаасан будаа — Халуун туслахын норм","sort_order":90,"output_material_id":null,"output_qty_per_portion":null}'::jsonb);
end $$;
do $$ begin
insert into public.tech_card_items(id,group_id,material_id,netto_qty,brutto_qty,stations,sort_order) select id,group_id,material_id,netto_qty,brutto_qty,stations,sort_order from jsonb_populate_record(null::public.tech_card_items,'{"id":"1285161b-c457-4772-839a-42a4ffd230b9","group_id":"43a3092d-2532-4a20-9397-9add8ad0630b","material_id":"d7664b28-ff37-40cf-9a47-607c1b852581","netto_qty":0.18,"brutto_qty":0.18,"stations":["hot","packaging"],"sort_order":0}'::jsonb);
end $$;
do $$ begin
insert into public.tech_card_groups(id,tech_card_id,name,sort_order,output_material_id,output_qty_per_portion) select id,tech_card_id,name,sort_order,output_material_id,output_qty_per_portion from jsonb_populate_record(null::public.tech_card_groups,'{"id":"7bc8bfe1-3958-41d7-8794-4a8c6a722bec","tech_card_id":"733801c5-e89d-4b74-b229-2adc29953fdb","name":"Агшаасан будаа — Халуун туслахын норм","sort_order":90,"output_material_id":null,"output_qty_per_portion":null}'::jsonb);
end $$;
do $$ begin
insert into public.tech_card_items(id,group_id,material_id,netto_qty,brutto_qty,stations,sort_order) select id,group_id,material_id,netto_qty,brutto_qty,stations,sort_order from jsonb_populate_record(null::public.tech_card_items,'{"id":"f2071595-3421-4958-a93a-cf7a805b255c","group_id":"7bc8bfe1-3958-41d7-8794-4a8c6a722bec","material_id":"afa2cc88-44b4-415b-b64f-2aebd8148f8f","netto_qty":0.18,"brutto_qty":0.18,"stations":["packaging"],"sort_order":0}'::jsonb);
end $$;
do $$ begin
if not exists(select 1 from public.tech_card_items t where t.id='f9911748-2c64-4157-a9d2-f86974162fb8' and to_jsonb(t) @> '{"id":"f9911748-2c64-4157-a9d2-f86974162fb8","group_id":"08d3ed64-40d4-44bf-a215-208189638ec2","material_id":"697187fc-78a9-4cf4-b7d5-1327c7634d69","brutto_qty":0.085,"netto_qty":0.085,"sort_order":1,"created_at":"2026-08-21T07:27:40.874979+00:00","stations":["hot_aux","packaging"]}'::jsonb) then raise exception 'Rice preimage changed: f9911748-2c64-4157-a9d2-f86974162fb8'; end if;
update public.tech_card_items set (material_id,brutto_qty,netto_qty,stations)=(select material_id,brutto_qty,netto_qty,stations from jsonb_populate_record(null::public.tech_card_items,'{"material_id":"84ac700d-1ffe-4208-a479-ebc6917462f2","brutto_qty":0.082831,"netto_qty":0.082831,"stations":["packaging"]}'::jsonb)) where id='f9911748-2c64-4157-a9d2-f86974162fb8';
end $$;
do $$ begin
if not exists(select 1 from public.tech_card_items t where t.id='f03c9ae7-152c-4848-9dd0-bd66f3600d7c' and to_jsonb(t) @> '{"id":"f03c9ae7-152c-4848-9dd0-bd66f3600d7c","group_id":"4b0b7c70-bcf5-48ee-97c6-219e32e078d5","material_id":"697187fc-78a9-4cf4-b7d5-1327c7634d69","brutto_qty":0.0874,"netto_qty":0.0874,"sort_order":1,"created_at":"2026-08-21T07:27:41.867138+00:00","stations":["hot_aux","packaging"]}'::jsonb) then raise exception 'Rice preimage changed: f03c9ae7-152c-4848-9dd0-bd66f3600d7c'; end if;
update public.tech_card_items set (material_id,brutto_qty,netto_qty,stations)=(select material_id,brutto_qty,netto_qty,stations from jsonb_populate_record(null::public.tech_card_items,'{"material_id":"84ac700d-1ffe-4208-a479-ebc6917462f2","brutto_qty":0.085169,"netto_qty":0.085169,"stations":["packaging"]}'::jsonb)) where id='f03c9ae7-152c-4848-9dd0-bd66f3600d7c';
end $$;
