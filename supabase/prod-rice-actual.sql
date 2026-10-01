begin;
-- Reuse the existing daily station-count record and its access model.
-- Production is a daily TOTAL (not an increment); zero is a valid correction.
alter table public.station_stock_counts drop constraint station_stock_counts_type_check;
alter table public.station_stock_counts add constraint station_stock_counts_type_check check(type in ('leftover','waste','production'));
alter table public.station_stock_counts drop constraint station_stock_counts_qty_check;
alter table public.station_stock_counts add constraint station_stock_counts_qty_check check(qty>0 or (type='production' and qty=0));

create or replace function public.rice_actual_balance(p_date date,p_material uuid)
returns table(opening_kg numeric,produced_kg numeric,returned_kg numeric,sent_kg numeric,waste_kg numeric,available_kg numeric)
language sql stable security invoker set search_path='' as $$
 with cutoff as (
 select greatest(coalesce(max(c.date),'2026-09-30'::date),'2026-09-30'::date) as day,
 max(c.date) as counted_day from public.station_stock_counts c where c.type='leftover' and c.date<p_date
 ), counts as (
 select coalesce(sum(c.qty) filter(where c.type='leftover' and c.date=k.counted_day),0) initial,
 coalesce(sum(c.qty) filter(where c.type='production' and c.date>k.day and c.date<p_date),0)-coalesce(sum(c.qty) filter(where c.type='waste' and c.date>k.day and c.date<p_date),0) previous,
 coalesce(sum(c.qty) filter(where c.type='production' and c.date=p_date),0) made,
 coalesce(sum(c.qty) filter(where c.type='waste' and c.date=p_date),0) wasted
 from cutoff k left join public.station_stock_counts c on c.material_id=p_material and c.station='hot_aux'
 ), moves as (
 select coalesce(sum(case when t.to_station='hot_aux' and t.received_at is not null then t.qty when t.from_station='hot_aux' then -t.qty else 0 end) filter(where t.transfer_date<p_date),0) previous,
 coalesce(sum(t.qty) filter(where t.to_station='hot_aux' and t.received_at is not null and t.transfer_date=p_date),0) returned,
 coalesce(sum(t.qty) filter(where t.from_station='hot_aux' and t.transfer_date=p_date),0) sent
 from cutoff k left join public.station_transfers t on t.material_id=p_material and t.transfer_date>k.day and t.transfer_date<=p_date
 ) select c.initial+c.previous+m.previous,c.made,m.returned,m.sent,c.wasted,
 c.initial+c.previous+m.previous+c.made+m.returned-m.sent-c.wasted from counts c cross join moves m;
$$;
create or replace function public.rice_production_state(p_date date)
returns table(material_id uuid,opening_kg numeric,produced_kg numeric,returned_kg numeric,sent_kg numeric,waste_kg numeric,available_kg numeric,production_updated_at timestamptz)
language sql stable security invoker set search_path='' as $$
 select m.id,b.*,c.updated_at from public.materials m
 cross join lateral public.rice_actual_balance(p_date,m.id) b
 left join public.station_stock_counts c on c.material_id=m.id and c.station='hot_aux' and c.type='production' and c.date=p_date
 where m.code in ('BLD-018','BLD-002','BLD-RICE-KIMBAP','BLD-RICE-BUCKWHEAT');
$$;
-- Do not invent historical production to cover existing transfers.
do $$ declare r record; begin
 for r in select distinct t.transfer_date,m.id from public.station_transfers t join public.materials m on m.id=t.material_id where t.transfer_date>='2026-10-01' and (t.from_station='hot_aux' or t.to_station='hot_aux') and m.code in ('BLD-018','BLD-002','BLD-RICE-KIMBAP','BLD-RICE-BUCKWHEAT') loop
  if (select b.available_kg from public.rice_actual_balance(r.transfer_date,r.id) b)<0 then raise exception 'Existing rice transfers need a verified opening count before activating actual stock checks';end if;
 end loop;
end $$;
-- A shared row lock serializes all rice stock-affecting statements, including
-- generic transfer dialogs and multi-row requests. No client-only stock check.
create or replace function public.lock_rice_stock() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 perform m.id from public.materials m where m.code in ('BLD-018','BLD-002','BLD-RICE-KIMBAP','BLD-RICE-BUCKWHEAT') order by m.id for update;
 return null;
end $$;
create trigger rice_stock_transfer_lock before insert or update or delete on public.station_transfers for each statement execute function public.lock_rice_stock();
create trigger rice_stock_count_lock before insert or update or delete on public.station_stock_counts for each statement execute function public.lock_rice_stock();

create or replace function public.validate_rice_stock() returns trigger
language plpgsql security invoker set search_path='' as $$
declare mid uuid; d date; available numeric; affected uuid[]:=array[]::uuid[];
begin
 if tg_op<>'DELETE' then affected:=array_append(affected,new.material_id); end if;
 if tg_op<>'INSERT' then affected:=array_append(affected,old.material_id); end if;
 if tg_op<>'DELETE' and new.qty::text in ('NaN','Infinity','-Infinity') and exists(select 1 from public.materials m where m.id=new.material_id and m.code in ('BLD-018','BLD-002','BLD-RICE-KIMBAP','BLD-RICE-BUCKWHEAT')) then raise exception 'Будааны кг нь бодит тоо байна';end if;
 if tg_table_name='station_stock_counts' then
 if tg_op<>'DELETE' and new.type='production' then
  if new.station<>'hot_aux' or new.date<'2026-10-01' or not exists(select 1 from public.materials m where m.id=new.material_id and m.kind='intermediate' and m.base_unit='kg' and m.source_station='hot_aux' and m.code in ('BLD-018','BLD-002','BLD-RICE-KIMBAP','BLD-RICE-BUCKWHEAT')) then
   raise exception 'Агшаасан будааг зөвхөн халуун туслах цехэд 2026-10-01-ээс бүртгэнэ';
  end if;
 end if;
 end if;
 -- A leftover snapshot can change the global carryover date for every rice.
 if tg_table_name='station_stock_counts' then
  select array_agg(m.id) into affected from public.materials m where m.code in ('BLD-018','BLD-002','BLD-RICE-KIMBAP','BLD-RICE-BUCKWHEAT');
 end if;
 for mid in select m.id from public.materials m where m.id=any(affected) and m.code in ('BLD-018','BLD-002','BLD-RICE-KIMBAP','BLD-RICE-BUCKWHEAT') loop
  for d in select x.day from (
   select t.transfer_date as day from public.station_transfers t where t.material_id=mid and (t.from_station='hot_aux' or t.to_station='hot_aux')
   union select c.date from public.station_stock_counts c where c.material_id=mid and c.station='hot_aux'
  ) x where x.day>='2026-10-01' order by x.day loop
   select b.available_kg into available from public.rice_actual_balance(d,mid) b;
   if available<0 then raise exception 'Будааны бодит үлдэгдэл хүрэлцэхгүй (%): % кг дутуу. Агшаасан нийт кг болон өгсөн жинг шалгана уу.',d,-available; end if;
  end loop;
 end loop;
 return null;
end $$;
create trigger rice_stock_transfer_check after insert or update or delete on public.station_transfers for each row execute function public.validate_rice_stock();
create trigger rice_stock_count_check after insert or update or delete on public.station_stock_counts for each row execute function public.validate_rice_stock();

create or replace function public.set_rice_production(p_date date,p_material uuid,p_qty numeric,p_expected_updated_at timestamptz,p_actor text)
returns void language plpgsql security invoker set search_path='' as $$
declare current_row public.station_stock_counts;
begin
 if p_qty is null or p_qty<0 or p_qty::text in ('NaN','Infinity','-Infinity') then raise exception 'Агшаасан кг нь 0 буюу түүнээс их бодит тоо байна'; end if;
 perform m.id from public.materials m where m.code in ('BLD-018','BLD-002','BLD-RICE-KIMBAP','BLD-RICE-BUCKWHEAT') order by m.id for update;
 select * into current_row from public.station_stock_counts c where c.date=p_date and c.material_id=p_material and c.station='hot_aux' and c.type='production';
 if found and current_row.qty=round(p_qty,6) then return; end if;
 if current_row.updated_at is distinct from p_expected_updated_at then raise exception 'Бүртгэлийг өөр хүн өөрчилсөн байна. Дахин ачаалаад нийт кг-ыг шалгана уу.';end if;
 insert into public.station_stock_counts(date,station,material_id,qty,type,created_by)
 values(p_date,'hot_aux',p_material,p_qty,'production',p_actor)
 on conflict(date,station,material_id,type) do update set qty=excluded.qty,created_by=excluded.created_by;
end $$;
notify pgrst,'reload schema';
commit;
