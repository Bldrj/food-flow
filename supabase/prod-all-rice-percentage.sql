-- Extends the already applied prod-rice-material-percentage.sql. Atomic deployment.
begin;
alter table public.tech_card_items add column rice_quantity_basis text
  check (rice_quantity_basis in ('dry','cooked','unconfirmed'));
alter table public.tech_card_items add column rice_cooked_qty numeric
  check (rice_cooked_qty > 0);

-- Stored netto/brutto always mean dry grain. Source cooked quantities stay separate.
create or replace function public.recalculate_rice_item()
returns trigger language plpgsql security invoker set search_path='' as $$
declare output_qty numeric; pct numeric; material_code text; material_kind text;
begin
 select m.loss_pct,m.code,m.kind into pct,material_code,material_kind
 from public.materials m where m.id=new.material_id;
 if new.rice_quantity_basis is null and material_code in ('2-001','2-297','2-178') then
  new.rice_quantity_basis := 'dry';
 end if;
 if new.rice_cooked_share is not null then
  new.rice_quantity_basis := 'cooked';
  select g.output_qty_per_portion into output_qty from public.tech_card_groups g where g.id=new.group_id;
  if output_qty is null or output_qty <= 0 then raise exception 'Rice conversion requires positive cooked group output'; end if;
  new.rice_cooked_qty := output_qty * new.rice_cooked_share;
 end if;
 if new.rice_quantity_basis is not null and material_kind <> 'raw' then
  raise exception 'Rice input basis is only valid for raw ingredients';
 end if;
 if new.rice_quantity_basis = 'cooked' then
  if new.rice_cooked_qty is null or pct is null then raise exception 'Cooked rice input requires a cooked quantity and material percentage'; end if;
  new.netto_qty := new.rice_cooked_qty * (1+pct);
  new.brutto_qty := new.netto_qty;
 else
  new.rice_cooked_qty := null;
 end if;
 return new;
end $$;
create or replace function public.refresh_rice_items()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_table_name='materials' then
  update public.tech_card_items set netto_qty=netto_qty
  where material_id=new.id and rice_quantity_basis='cooked';
 else
  update public.tech_card_items set netto_qty=netto_qty
  where group_id=new.id and rice_cooked_share is not null;
 end if;
 return new;
end $$;

update public.tech_card_items i set rice_quantity_basis=case
 when i.rice_cooked_share is not null then 'cooked' else 'dry' end
from public.materials m where m.id=i.material_id and m.code in ('2-001','2-297','2-178');

-- Preserve existing black/buckwheat dry norms at the requested 0%.
-- Their equivalent cooked basis makes future percentage edits recalculate once.
update public.tech_card_items i set rice_quantity_basis='cooked',rice_cooked_qty=i.netto_qty/(1+m.loss_pct)
from public.materials m where m.id=i.material_id and m.code in ('2-297','2-178');

-- Excel Master-v2 sheet titled Oyakodon (tab named 16. Туна кимчижигэ):
-- E22=350 cooked grams; C22=E22/2.25. Link the cooked ingredient to its shared recipe.
update public.tech_card_items set material_id=(select id from public.materials where code='BLD-018'),
 rice_quantity_basis=null,rice_cooked_qty=null,rice_cooked_share=null
where id='32174f35-21cd-44a2-8992-86fe9564a3b6'
 and material_id=(select id from public.materials where code='2-001') and netto_qty=.35;

-- These recently entered recipes have no source Excel or separate cooked yield.
-- Retain their quantities, explicitly flag their basis rather than guessing a conversion.
update public.tech_card_items set rice_quantity_basis='unconfirmed'
where id in ('2862315c-0d78-4109-b9e9-ecdc15ca7f21','e19e178b-8e7f-488a-a589-3283cc40e6e0');

-- Kimbap uses white rice (confirmed in both handroll Excel recipes).
-- Preserve existing 70g output norm; derive its dry ingredient from the material percentage.
insert into public.tech_card_items(id,group_id,material_id,netto_qty,brutto_qty,stations,sort_order,rice_cooked_share,rice_quantity_basis)
select gen_random_uuid(),g.id,m.id,0,0,array['hot_aux'],1,1,'cooked'
from public.tech_card_groups g cross join public.materials m
where g.id='ed53258e-e24f-4e3d-9638-1b4c7f5d6ba5' and m.code='2-001'
and not exists(select 1 from public.tech_card_items i where i.group_id=g.id);

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
  coalesce(i.rice_quantity_basis in ('dry','cooked'),false) as loss_applied
from def_group d
join public.tech_card_items i on i.group_id = d.id;


-- The recipe's dry quantity already includes the percentage. Do not apply it again.
create or replace view public.daily_material_needs with (security_invoker=true) as
with direct as (
 select b.production_date,i.material_id,sum(i.brutto_qty*b.total_qty) brutto,
 sum(i.netto_qty*b.total_qty) netto,
 sum(i.netto_qty*b.total_qty*(case when i.rice_quantity_basis in ('dry','cooked') then 1 else 1+m.loss_pct end)) issue
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

create or replace view public.station_work as
select
  b.id as batch_id,
  b.production_date,
  b.product_id,
  b.status,
  b.total_qty,
  b.tech_card_id,
  b.batch_seq,
  g.id as group_id,
  g.name as group_name,
  g.sort_order as group_sort,
  i.material_id,
  m.name as material_name,
  m.code as material_code,
  m.base_unit,
  i.sort_order as item_sort,
  (i.netto_qty * b.total_qty) as qty,
  s.station,
  coalesce(i.rice_quantity_basis in ('dry','cooked'),false) as loss_applied,
  i.rice_quantity_basis
from public.production_batches b
join public.tech_card_groups g on g.tech_card_id = b.tech_card_id
join public.tech_card_items i on i.group_id = g.id
join public.materials m on m.id = i.material_id
cross join lateral unnest(coalesce(i.stations, array[]::text[])) as s(station)
where g.output_material_id is null;


notify pgrst, 'reload schema';
commit;
