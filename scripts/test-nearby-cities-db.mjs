// Run with: node scripts/test-nearby-cities-db.mjs <path to @electric-sql/pglite/dist/index.js>
// Ephemeral PostgreSQL only; never connects to production.
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
const { PGlite } = await import(pathToFileURL(path.resolve(process.argv[2])).href);
const db = new PGlite();
const read = name => fs.readFileSync(`supabase/migrations/${name}`, 'utf8');
try {
await db.exec(`
  create role anon; create role authenticated;
  create table service_areas(id uuid primary key default gen_random_uuid(),area_name text,primary_city text,state text,normalized_primary_city text,normalized_state text,latitude numeric,longitude numeric,coverage_radius_miles numeric,is_active boolean default true);
  create table service_area_city_aliases(id uuid primary key default gen_random_uuid(),service_area_id uuid references service_areas,city text,state text,normalized_city text,normalized_state text,assignment_type text default 'manual',created_at timestamptz default now());
  create table jobs(id uuid,job_city text,job_state text,latitude numeric,longitude numeric,service_area_id uuid,service_area_assignment_method text,service_area_distance_miles numeric,service_area_assigned_at timestamptz);
  create table coverage_cities(id uuid, service_area_id uuid, normalized_city text,normalized_state text,is_active boolean);
  create function nttr_is_active_admin() returns boolean language sql as $$ select coalesce(current_setting('test.admin',true),'false') = 'true' $$;
  create function nttr_is_active_app_user() returns boolean language sql as $$ select coalesce(current_setting('test.active',true),'false') = 'true' $$;
  alter table service_area_city_aliases enable row level security;
  create policy "active users read service area aliases" on service_area_city_aliases for select to authenticated using (nttr_is_active_app_user());
  create policy "admins manage service area aliases" on service_area_city_aliases for all to authenticated using (nttr_is_active_admin()) with check (nttr_is_active_admin());
  grant usage on schema public to authenticated,anon;
  grant select,insert,update,delete on service_area_city_aliases to authenticated;
  grant select on service_areas to authenticated;
  create unique index service_area_alias_city_state_unique on service_area_city_aliases(upper(state),normalized_city);
  create unique index service_area_alias_normalized_city_state_uidx on service_area_city_aliases(normalized_city,normalized_state);
`);
const repair = read('20260725000200_repair_geographic_coverage_incremental.sql');
const extract = name => {
  const start = repair.indexOf(`create or replace function public.${name}`);
  return repair.slice(start, repair.indexOf('\n$$;', start) + 4);
};
await db.exec(extract('normalize_location_text'));
await db.exec(extract('distance_miles'));
await db.exec(read('20260816000200_normalize_service_area_alias_on_write.sql'));
await db.exec(read('20260816000300_set_service_area_radius_150.sql'));
await db.exec(read('20260909000100_us_nearby_city_catalog.sql'));
await db.exec(read('20260909000200_sync_nearby_cities.sql'));
await db.exec(read('20260909000300_optimize_alias_read_policies.sql'));
const areaId = '00000000-0000-4000-8000-000000000001';
const borderId = '00000000-0000-4000-8000-000000000002';
await db.query(`insert into service_areas(id,area_name,primary_city,state,latitude,longitude,coverage_radius_miles) values ($1,'College Station Area','College Station','TX',30.628,-96.3344,150),($2,'Shreveport test','Shreveport','LA',32.5252,-93.7502,50)`,[areaId,borderId]);
await db.exec(`set role authenticated; set test.admin = 'false'; set test.active = 'true';`);
await assert.rejects(() => db.query('select sync_nearby_cities($1)',[areaId]), /Administrator access/);
await assert.rejects(() => db.query(`insert into service_area_city_aliases(service_area_id,city,state) values($1,'Test','TX')`,[areaId]), /row-level security/);
await db.exec(`set test.admin = 'true';`);
await db.query(`insert into service_area_city_aliases(service_area_id,city,state) values ($1,'  college   station  ',' tx '), ($1,'Outside manual city','TX')`,[areaId]);
const sync = async id => (await db.query('select sync_nearby_cities($1) as result',[id])).rows[0].result;
const first = await sync(areaId);
assert(first.found > 100);
assert.equal(first.added, first.found - 1);
assert.equal(first.already_existed,1);
const second = await sync(areaId);
assert.equal(second.added,0);
assert.equal(second.already_existed,first.found);
const rows = (await db.query('select * from service_area_city_aliases where service_area_id=$1',[areaId])).rows;
assert(rows.some(c=>c.city === 'Houston' && c.state === 'TX'));
assert(!rows.some(c=>c.city === 'Dallas' && c.state === 'TX'));
assert(rows.some(c=>c.city === 'Outside manual city' && c.assignment_type === 'manual'));
assert.equal(rows.filter(c=>c.normalized_city==='COLLEGE STATION').length,1);
// Verify every automatically inserted row, not just example cities.
await db.exec('reset role');
const outside = await db.query(`select a.city from service_area_city_aliases a where a.service_area_id=$1 and a.assignment_type='nearby_sync'
  and not exists(select 1 from us_nearby_city_catalog() c where normalize_location_text(c.city)=a.normalized_city and c.state=a.state and distance_miles(30.628,-96.3344,c.latitude,c.longitude)<=150)`,[areaId]);
assert.equal(outside.rows.length,0);
const crossFromCollege = await db.query(`select count(*)::int as n from us_nearby_city_catalog() where state<>'TX' and distance_miles(30.628,-96.3344,latitude,longitude)<=150`);
assert.equal(crossFromCollege.rows[0].n,0); // nearest: Starks, LA, about 160.37 miles.
await db.exec('set role authenticated');
await assert.rejects(()=>db.query(`insert into service_area_city_aliases(service_area_id,city,state) values($1,' COLLEGE   STATION ','tx')`,[areaId]), /duplicate key/);
const crossState = await sync(borderId);
assert((await db.query(`select 1 from service_area_city_aliases where service_area_id=$1 and city='Marshall' and state='TX'`,[borderId])).rows.length);
// Overlapping city aliases can exist in both areas; manual writes still work.
await db.query(`insert into service_area_city_aliases(service_area_id,city,state) values($1,'College Station','TX')`,[borderId]);
assert.equal((await db.query(`select count(*)::int as n from service_area_city_aliases where normalized_city='COLLEGE STATION'`)).rows[0].n,2);
assert.equal((await db.query(`delete from service_area_city_aliases where service_area_id=$1 and city='College Station' returning id`,[borderId])).rows.length,1);
// Shrinking a radius must affect the next search without deleting previous aliases.
await db.exec('reset role');
await db.query('update service_areas set coverage_radius_miles=5 where id=$1',[areaId]);
await db.exec('set role authenticated');
const small = await sync(areaId);
assert(small.found < first.found);
assert.equal(small.added,0);
await db.query(`insert into service_area_city_aliases(service_area_id,city,state) values($1,'Manual after sync','tx')`,[areaId]);
await db.exec(`set test.admin = 'false'`);
assert((await db.query('select * from service_area_city_aliases order by created_at,id limit 500')).rows.length === 500);
await db.exec(`set test.active = 'false'`);
assert.equal((await db.query('select * from service_area_city_aliases')).rows.length,0);
await db.exec(`set test.active = 'true'`);
assert.equal((await db.query(`delete from service_area_city_aliases where city='Manual after sync' returning *`)).rows.length,0);
assert.equal((await db.query(`update service_area_city_aliases set city='Unauthorized' returning *`)).rows.length,0);
await db.exec('reset role');
assert.equal((await db.query(`select count(*)::int as n from service_area_city_aliases where city='Manual after sync'`)).rows[0].n,1);
await db.query('update service_areas set latitude=null where id=$1',[areaId]);
await db.exec(`set role authenticated; set test.admin = 'true'`);
await assert.rejects(()=>sync(areaId), /Valid latitude/);
await db.exec('reset role; set role anon');
await assert.rejects(()=>sync(areaId), /permission denied/);
console.log(JSON.stringify({first,second,crossState,small,checks:'PASS: actual SQL migrations, Haversine inclusion/exclusion, normalization, idempotency, manual preservation/add, per-area radius, cross-state, admin/dispatcher/anon permissions, invalid coordinates'},null,2));
} finally { await db.close(); }
