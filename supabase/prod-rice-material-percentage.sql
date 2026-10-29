-- Apply atomically. Only white-rice recipe conversion changes; cooked portions stay fixed.
begin;
create temporary table rice_needs_grants on commit drop as
select grantee,privilege_type,is_grantable from information_schema.role_table_grants
where table_schema='public' and table_name='daily_material_needs';
drop view public.daily_material_needs;
alter table public.materials drop constraint if exists materials_loss_pct_check;
alter table public.materials alter column loss_pct type numeric(12,8);
alter table public.materials add constraint materials_loss_pct_check check (loss_pct > -1 and loss_pct <= 5);
alter table public.tech_card_items add column if not exists rice_cooked_share numeric;
alter table public.tech_card_items add constraint rice_cooked_share_range check (rice_cooked_share > 0 and rice_cooked_share <= 1);

-- Preserve each blend's white-rice share; other grains and seasonings stay unchanged.
with grain_totals as (
 select g.id, sum(i.netto_qty) total
 from public.tech_card_groups g join public.materials o on o.id=g.output_material_id
 join public.tech_card_items i on i.group_id=g.id join public.materials m on m.id=i.material_id
 where o.code in ('BLD-018','BLD-RICE-KIMBAP','BLD-002','BLD-RICE-BUCKWHEAT')
 and m.code in ('2-001','2-297','2-178') group by g.id
)
update public.tech_card_items i set rice_cooked_share=i.netto_qty/t.total
from grain_totals t, public.materials m
where i.group_id=t.id and m.id=i.material_id and m.code='2-001';

create or replace function public.recalculate_rice_item()
returns trigger language plpgsql security invoker set search_path='' as $$
declare output_qty numeric; pct numeric;
begin
 if new.rice_cooked_share is not null then
  select g.output_qty_per_portion into output_qty from public.tech_card_groups g where g.id=new.group_id;
  select m.loss_pct into pct from public.materials m where m.id=new.material_id and m.code='2-001';
  if output_qty is null or pct is null then raise exception 'Rice conversion requires white rice and a group output'; end if;
  new.netto_qty := output_qty * new.rice_cooked_share * (1+pct);
  new.brutto_qty := new.netto_qty;
 end if;
 return new;
end $$;
create trigger recalculate_rice_item before insert or update on public.tech_card_items
for each row execute function public.recalculate_rice_item();
create or replace function public.refresh_rice_items()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_table_name='materials' then
  update public.tech_card_items set netto_qty=netto_qty where material_id=new.id and rice_cooked_share is not null;
 else
  update public.tech_card_items set netto_qty=netto_qty where group_id=new.id and rice_cooked_share is not null;
 end if;
 return new;
end $$;
create trigger refresh_rice_material after update of loss_pct on public.materials
for each row when (old.loss_pct is distinct from new.loss_pct) execute function public.refresh_rice_items();
create trigger refresh_rice_output after update of output_qty_per_portion on public.tech_card_groups
for each row when (old.output_qty_per_portion is distinct from new.output_qty_per_portion) execute function public.refresh_rice_items();
update public.materials set loss_pct=-0.555556 where code='2-001';
-- Ensure recalculation even if the material already had the desired percentage.
update public.tech_card_items set netto_qty=netto_qty where rice_cooked_share is not null;

create or replace view public.intermediate_recipes as
with def_card as (
  select distinct on (g.output_material_id)
    g.output_material_id, g.tech_card_id
  from public.tech_card_groups g
  join public.tech_cards tc on tc.id = g.tech_card_id and tc.is_active
  where g.output_material_id is not null
  order by g.output_material_id, g.created_at desc
),
def_group as (
  select g.id, g.output_material_id, g.output_qty_per_portion, g.tech_card_id
  from public.tech_card_groups g
  join def_card c on c.output_material_id = g.output_material_id
                 and c.tech_card_id = g.tech_card_id
)
select
  d.output_material_id as intermediate_id,
  d.id as group_id,
  d.tech_card_id,
  d.output_qty_per_portion,
  i.material_id as component_id,
  i.netto_qty / d.output_qty_per_portion as qty_per_output,
  i.stations,
  i.sort_order,
  (i.rice_cooked_share is not null) as loss_applied
from def_group d
join public.tech_card_items i on i.group_id = d.id;


-- The recipe's dry quantity already includes the percentage. Do not apply it again.
create or replace view public.daily_material_needs with (security_invoker=true) as
with direct as (
 select b.production_date,i.material_id,sum(i.brutto_qty*b.total_qty) brutto,
 sum(i.netto_qty*b.total_qty) netto,
 sum(i.netto_qty*b.total_qty*(case when i.rice_cooked_share is null then 1+m.loss_pct else 1 end)) issue
 from public.production_batches b join public.tech_card_groups g on g.tech_card_id=b.tech_card_id
 join public.tech_card_items i on i.group_id=g.id join public.materials m on m.id=i.material_id and m.kind='raw'
 where g.output_material_id is null
 group by b.production_date,i.material_id
), exploded as (
 select d.production_date,r.component_id material_id,
 sum(d.net_qty*r.qty_per_output) netto,
 sum(d.net_qty*r.qty_per_output*(case when r.loss_applied then 1 else 1+cm.loss_pct end)) issue
 from public.daily_intermediate_demand d join public.intermediate_recipes r on r.intermediate_id=d.material_id
 join public.materials cm on cm.id=r.component_id and cm.kind='raw'
 group by d.production_date,r.component_id
), combined as (
 select production_date,material_id,brutto,netto,issue from direct
 union all select production_date,material_id,netto,netto,issue from exploded
)
select c.production_date,c.material_id,m.code,m.name,m.base_unit,sum(c.brutto) brutto_need,
 sum(c.netto) netto_need,m.loss_pct,sum(c.issue) issue_need
from combined c join public.materials m on m.id=c.material_id
 group by c.production_date,c.material_id,m.code,m.name,m.base_unit,m.loss_pct;
do $$ declare r record; begin
 for r in select * from rice_needs_grants loop
  execute format('grant %s on public.daily_material_needs to %s%s',r.privilege_type,
   case when r.grantee='PUBLIC' then 'PUBLIC' else quote_ident(r.grantee) end,
   case when r.is_grantable='YES' then ' with grant option' else '' end);
 end loop;
end $$;
notify pgrst, 'reload schema';
commit;
