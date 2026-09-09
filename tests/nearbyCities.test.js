import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { haversineMiles, assignServiceArea } from '../src/modules/coverage/serviceAreaAssignment.js';
import { loadAllAliases } from '../src/modules/coverage/loadAllAliases.js';
import { validateServiceArea } from '../src/modules/coverage/serviceAreaPayload.js';

const migration = fs.readFileSync(new URL('../supabase/migrations/20260909000100_us_nearby_city_catalog.sql', import.meta.url), 'utf8');
const cities = JSON.parse(migration.split('$places$')[1]);
const nearby = cities.filter(c => haversineMiles(30.628, -96.3344, c.latitude, c.longitude) <= 150);
test('official national dataset includes College Station and excludes distant Dallas', () => {
  assert.equal(cities.length, 32058);
  assert(nearby.some(c => c.city === 'College Station' && c.state === 'TX'));
  assert(nearby.some(c => c.city === 'Houston' && c.state === 'TX'));
  assert(!nearby.some(c => c.city === 'Dallas' && c.state === 'TX'));
});
test('Haversine includes border-state cities without filtering state', () => {
  const border = cities.filter(c => haversineMiles(32.5252, -93.7502, c.latitude, c.longitude) <= 50);
  assert(border.some(c => c.city === 'Marshall' && c.state === 'TX'));
  assert(border.some(c => c.city === 'Shreveport' && c.state === 'LA'));
  assert.equal(haversineMiles(0, 0, 0, 0), 0);
  assert(Number.isFinite(haversineMiles(0, 0, 0, 180)));
});
test('aliases load beyond the Supabase response cap and propagate failures', async () => {
  const rows = Array.from({length: 1201}, (_,id) => ({id}));
  const client = {from() { return {select() {return this;}, order() {return this;}, range(a,b) {return {data: rows.slice(a,b+1)};} }; }};
  assert.equal((await loadAllAliases(client)).length,1201);
  const broken = {from() { return {select() {return this;}, order() {return this;}, range() {return {error: new Error('offline')};} }; }};
  await assert.rejects(() => loadAllAliases(broken), /offline/);
});
test('manual alias takes precedence over overlapping synced aliases', () => {
  const areas = [{id:'a', primary_city:'A', state:'TX'}, {id:'b', primary_city:'B', state:'TX'}];
  const aliases = [{id:'1',service_area_id:'a',city:'Example',state:'TX',assignment_type:'nearby_sync'}, {id:'2',service_area_id:'b',city:'Example',state:'TX',assignment_type:'manual'}];
  assert.equal(assignServiceArea({city:'Example',state:'TX'},areas,aliases).area.id,'b');
});

test('large alias lists report incremental progress with at most four requests in flight', async () => {
  const rows = Array.from({length:20304}, (_,id)=>({id}));
  let active=0, peak=0;
  const progress=[];
  const client={from() { return {select(){return this;},order(){return this;},async range(a,b){
    active++; peak=Math.max(peak,active);
    await new Promise(resolve=>setTimeout(resolve,1));
    active--; return {data:rows.slice(a,b+1)};
  }}; }};
  const result=await loadAllAliases(client, page=>progress.push(page.length));
  assert.equal(result.length,20304);
  assert.equal(new Set(result.map(r=>r.id)).size,20304);
  assert.equal(peak,4);
  assert.equal(progress[0],2000);
  assert.equal(progress.at(-1),20304);
  assert(progress.length>1);
});
test('invalid radiuses are rejected before saving', () => {
  for (const coverage_radius_miles of [null, '', 0, -1, Infinity, 'NaN']) {
    assert.match(validateServiceArea({area_name:'Test',primary_city:'Test',state:'TX',coverage_radius_miles}), /Radius/);
  }
});
