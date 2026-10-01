-- Run together with prod-rice-cards.sql in a transaction after reviewing the audit.
-- Nested intermediate demand: aggregate every parent's contribution BEFORE
-- subtracting a shared intermediate's previous-day stock exactly once.
create or replace function public.intermediate_demand_for_date(p_date date)
returns table(production_date date, material_id uuid, name text, base_unit text,
 source_station text, gross_qty numeric, leftover_qty numeric, net_qty numeric)
language plpgsql stable security invoker set search_path = '' as $$
declare
 amounts jsonb;
 node record;
 edge record;
 gross numeric;
 remaining numeric;
 stock numeric;
 last_count date;
 cycle_found boolean;
begin
 select coalesce(jsonb_object_agg(x.material_id::text,x.qty),'{}'::jsonb) into amounts
 from (
  select i.material_id, sum(i.netto_qty*b.total_qty) qty
  from public.production_batches b
  join public.tech_card_groups g on g.tech_card_id=b.tech_card_id and g.output_material_id is null
  join public.tech_card_items i on i.group_id=g.id
  join public.materials m on m.id=i.material_id and m.kind='intermediate'
  where b.production_date=p_date
  group by i.material_id
 ) x;
 with recursive paths(id,path,cycle) as (
  select k::uuid,array[k::uuid],false from jsonb_object_keys(amounts) k
  union all
  select r.component_id,p.path||r.component_id,r.component_id=any(p.path)
  from paths p join public.intermediate_recipes r on r.intermediate_id=p.id
  join public.materials m on m.id=r.component_id and m.kind='intermediate'
  where not p.cycle
 ) select coalesce(bool_or(cycle),false) into cycle_found from paths;
 if cycle_found then raise exception 'Intermediate recipe cycle on %',p_date; end if;
 select max(c.date) into last_count from public.station_stock_counts c
 where c.type='leftover' and c.date<p_date;
 for node in
  with recursive paths(id,depth) as (
   select k::uuid,0 from jsonb_object_keys(amounts) k
   union all
   select r.component_id,p.depth+1 from paths p
   join public.intermediate_recipes r on r.intermediate_id=p.id
   join public.materials m on m.id=r.component_id and m.kind='intermediate'
  ) select p.id,max(p.depth) depth from paths p group by p.id order by max(p.depth),p.id
 loop
  gross:=coalesce((amounts->>node.id::text)::numeric,0);
  select coalesce(sum(c.qty),0) into stock from public.station_stock_counts c
   where c.type='leftover' and c.date=last_count and c.material_id=node.id;
  remaining:=greatest(gross-stock,0);
  return query select p_date,m.id,m.name,m.base_unit,m.source_station,gross,stock,remaining
   from public.materials m where m.id=node.id;
  for edge in select r.component_id,sum(r.qty_per_output) qty
   from public.intermediate_recipes r join public.materials m on m.id=r.component_id and m.kind='intermediate'
   where r.intermediate_id=node.id group by r.component_id
  loop
   amounts:=jsonb_set(amounts,array[edge.component_id::text],to_jsonb(
    coalesce((amounts->>edge.component_id::text)::numeric,0)+remaining*edge.qty));
  end loop;
 end loop;
end $$;
create or replace view public.daily_intermediate_demand with (security_invoker=true) as
select d.* from (select distinct b.production_date from public.production_batches b) dates
cross join lateral public.intermediate_demand_for_date(dates.production_date) d;
