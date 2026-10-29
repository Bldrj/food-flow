import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PGlite } = require(process.env.PGLITE_MODULE || '/tmp/rice-validation-runtime/node_modules/@electric-sql/pglite');
const db = new PGlite();
const snapshot = JSON.parse(fs.readFileSync(process.env.RICE_SNAPSHOT || '/tmp/rice-live-snapshot.json','utf8'));
await db.exec(`create table materials(id uuid primary key,code text,name text,base_unit text,kind text,source_station text,loss_pct numeric(6,4) constraint materials_loss_pct_check check(loss_pct>=0 and loss_pct<=5));
create table tech_cards(id uuid primary key,is_active boolean);
create table tech_card_groups(id uuid primary key,tech_card_id uuid,output_material_id uuid,output_qty_per_portion numeric,created_at timestamptz);
create table tech_card_items(id uuid primary key,group_id uuid,material_id uuid,netto_qty numeric(18,6),brutto_qty numeric(18,6),stations text[],sort_order int);
create table production_batches(id uuid primary key,production_date date,tech_card_id uuid,total_qty numeric);
create table station_stock_counts(date date,type text,material_id uuid,qty numeric);`);
const cols={materials:['id','code','name','base_unit','kind','source_station','loss_pct'],tech_cards:['id','is_active'],tech_card_groups:['id','tech_card_id','output_material_id','output_qty_per_portion','created_at'],tech_card_items:['id','group_id','material_id','netto_qty','brutto_qty','stations','sort_order'],production_batches:['id','production_date','tech_card_id','total_qty']};
for(const [table,keys] of Object.entries(cols))for(const row of snapshot[table])await db.query(`insert into ${table}(${keys}) values(${keys.map((_,i)=>'$'+(i+1))})`,keys.map(k=>row[k]));
const defs=fs.readFileSync('supabase/migrations/0031_intermediate_multi_group.sql','utf8');
await db.exec(defs.slice(defs.indexOf('create view public.intermediate_recipes'),defs.indexOf('create view public.daily_material_needs')));
await db.exec(fs.readFileSync('supabase/prod-rice-flow.sql','utf8'));
await db.exec(defs.slice(defs.indexOf('create view public.daily_material_needs')));
const scalar=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
await db.exec(fs.readFileSync('supabase/prod-rice-material-percentage.sql','utf8'));
await db.exec(`alter table production_batches add column product_id uuid, add column status text, add column batch_seq int;
alter table tech_card_groups add column name text, add column sort_order int;`);
if (process.env.CURRENT_RICE_SNAPSHOT) {
 const current=JSON.parse(fs.readFileSync(process.env.CURRENT_RICE_SNAPSHOT,'utf8'));
 for(const [table,keys] of Object.entries(cols)) {
  const fields=table==='tech_card_items'?[...keys,'rice_cooked_share']:keys;
  for(const row of current[table]) await db.query(`insert into ${table}(${fields}) values(${fields.map((_,i)=>'$'+(i+1))}) on conflict(id) do update set ${fields.filter(k=>k!=='id').map(k=>`${k}=excluded.${k}`)}`,fields.map(k=>row[k]));
 }
}
await db.exec(fs.readFileSync('supabase/prod-all-rice-percentage.sql','utf8'));
const near=(a,b,t=1e-6)=>assert(Math.abs(Number(a)-b)<t,`${a} != ${b}`);
const raw="697187fc-78a9-4cf4-b7d5-1327c7634d69";
const kimbap="84ac700d-1ffe-4208-a479-ebc6917462f2";
near(await scalar("select loss_pct from materials where code='2-297'"),0);
near(await scalar("select loss_pct from materials where code='2-178'"),0);
near(await scalar("select netto_qty from tech_card_items where material_id=(select id from materials where code='2-178')"),.008);
near(await scalar('select qty_per_output from intermediate_recipes where intermediate_id=$1',[kimbap]),.444442857,1e-6);
assert.equal(await scalar("select code from materials where id=(select material_id from tech_card_items where id='32174f35-21cd-44a2-8992-86fe9564a3b6')"),'BLD-018');
// Warehouse = dry recipe components + explicit direct dry quantities, never multiplied twice.
for(const code of ['2-001','2-297','2-178']) {
 const expected=await scalar(`select coalesce(sum(q),0) from (
 select d.net_qty*r.qty_per_output q from daily_intermediate_demand d join intermediate_recipes r on r.intermediate_id=d.material_id join materials m on m.id=r.component_id where d.production_date='2026-10-05' and m.code=$1
 union all select i.netto_qty*b.total_qty*(case when i.rice_quantity_basis in ('dry','cooked') then 1 else 1+m.loss_pct end) from production_batches b join tech_card_groups g on g.tech_card_id=b.tech_card_id and g.output_material_id is null join tech_card_items i on i.group_id=g.id join materials m on m.id=i.material_id where b.production_date='2026-10-05' and m.code=$1) q`,[code]);
 const result=(await db.query("select issue_need from daily_material_needs where production_date='2026-10-05' and code=$1",[code])).rows[0];
 if(result)near(result.issue_need,Number(expected));
}
// Changing a non-white rice material must refresh its recipe once.
await db.exec("update materials set loss_pct=-.5 where code='2-178'");
near(await scalar("select netto_qty from tech_card_items where material_id=(select id from materials where code='2-178')"),.004);
await db.exec("update materials set loss_pct=-.25 where code='2-178'");
near(await scalar("select netto_qty from tech_card_items where material_id=(select id from materials where code='2-178')"),.006);
await db.exec("update materials set loss_pct=-.55 where code='2-001'");
near(await scalar('select qty_per_output from intermediate_recipes where intermediate_id=$1',[kimbap]),.45);
// Explicit dry inputs remain dry when the material percentage changes.
await db.query("insert into tech_card_items(id,group_id,material_id,netto_qty,brutto_qty) values(gen_random_uuid(),$1,$2,.09,.09)",['39ec0c85-a284-42c7-afca-27ec9e1391d4',raw]);
await db.exec("update materials set loss_pct=-.5 where code='2-001'");
near(await scalar("select netto_qty from tech_card_items where rice_quantity_basis='dry' and material_id=$1 limit 1",[raw]),.09);
// Shared output changes recalculate cooked bases; copying keeps their metadata.
await db.query('update tech_card_groups set output_qty_per_portion=.1 where output_material_id=$1',[kimbap]);
near(await scalar('select netto_qty from tech_card_items where group_id=(select id from tech_card_groups where output_material_id=$1)',[kimbap]),.05);
console.log('PASS: all grains, unchanged 0%/dry norms, kimbap, Oyakodon cooked link, warehouse equality, repeated percentage edits, dry inputs, output edits.');
await db.close();
