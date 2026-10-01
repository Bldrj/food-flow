begin;
set local statement_timeout='90s';
create temporary table rice_flow_test_results(code text,portions numeric,cooked_kg numeric,dry_kg numeric);
do $$
declare c uuid; o uuid; bid uuid; datum date; n integer:=0; portions integer; r record; cooked numeric; dry numeric; child uuid;
begin
 if exists(select 1 from public.orders where production_date between '2070-01-01' and '2070-02-02') or exists(select 1 from public.production_batches where production_date between '2070-01-01' and '2070-02-02') then raise exception 'Audit dates occupied'; end if;
 insert into public.customers(code,name) values('RICE-AUDIT-'||to_char(clock_timestamp(),'YYYYMMDDHH24MISSUS'),'Temporary rollback-only rice audit') returning id into c;
 insert into public.station_stock_counts(date,station,material_id,qty,type) select '2069-12-31','hot_aux',id,1,'leftover' from public.materials where code='2-001';
 foreach portions in array array[1,100] loop
 for r in select * from (values
 ('PRD-016','BLD-002',.18::numeric),('PRD-017','BLD-018',.23712),('PRD-021','BLD-018',.32),
 ('PRD-023','BLD-018',.2),('PRD-024','BLD-018',.235),('PRD-025','BLD-018',.18),
 ('PRD-027','BLD-018',.15),('PRD-029','BLD-018',.1),('PRD-032','BLD-RICE-KIMBAP',.08),
 ('PRD-033','BLD-RICE-KIMBAP',.07),('PRD-034','BLD-018',.18),('PRD-036','BLD-RICE-BUCKWHEAT',.18),('PRD-038','BLD-RICE-KIMBAP',.168)
 ) x(code,rice,kg) loop
 datum:='2070-01-01'::date+n;n:=n+1;
 insert into public.orders(customer_id,production_date) values(c,datum) returning id into o;
 insert into public.order_items(order_id,product_id,qty) select o,id,portions from public.products where code=r.code;
 perform public.confirm_order(o,'RICE-ROLLBACK-TEST');perform public.generate_batches(datum,'RICE-ROLLBACK-TEST');
 select id into child from public.materials where code=r.rice;
 select d.gross_qty into cooked from public.daily_intermediate_demand d where d.production_date=datum and d.material_id=child;
 if cooked is null or abs(cooked-r.kg*portions)>0.00000001 then raise exception 'Cooked mismatch % %: %',r.code,portions,cooked;end if;
 select sum(issue_need) into dry from public.daily_material_needs where production_date=datum and code in ('2-001','2-178','2-297');
 if dry is null or abs(dry-r.kg*portions/2.25)>.0002 then raise exception 'Warehouse dry mismatch % %: %',r.code,portions,dry;end if;
 if exists(select 1 from public.daily_material_needs where production_date=datum and code='MAT-028') then raise exception 'Cooked rice issued as raw';end if;
 insert into rice_flow_test_results values(r.code,portions,cooked,dry);
 select id into bid from public.production_batches where production_date=datum;
 perform public.start_batch(bid,'RICE-ROLLBACK-TEST');perform public.finish_batch(bid,'RICE-ROLLBACK-TEST');
 if not exists(select 1 from public.daily_intermediate_demand d where d.production_date=datum and d.material_id=child and abs(d.gross_qty-cooked)<.00000001) then raise exception 'Completed demand disappeared';end if;
 perform public.set_rice_production(datum,child,cooked,null,'RICE-ROLLBACK-TEST');
 insert into public.station_transfers(transfer_date,from_station,to_station,material_id,qty) values(datum,'hot_aux','packaging',child,cooked/2);
 if not exists(select 1 from public.daily_intermediate_demand d where d.production_date=datum and d.material_id=child and abs(d.gross_qty-cooked)<.00000001) then raise exception 'Transfer changed production demand';end if;
 end loop;end loop;
end $$;
select count(*) as passed_scenarios, count(distinct code) as foods, min(portions) as min_portions,max(portions) as max_portions,'PASS: cooked, warehouse dry, completed batch, partial transfer; all test data rolled back' as result from rice_flow_test_results;
rollback;