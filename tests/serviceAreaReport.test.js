import assert from 'node:assert/strict';
import test from 'node:test';
import { buildServiceAreaReport } from '../src/modules/coverage/serviceAreaReportData.js';

const job=(id,city,status='Completed',extra={})=>({id,city,state:'TX',status,date:'2026-09-09',...extra});
test('report reconciles areas, real cities and status counts without counting aliases',()=>{
  const r=buildServiceAreaReport([{id:'a',area_name:'College Station Area',state:'TX',exactCities:['Unused alias'],total:999,jobs:[job('1','Bryan'),job('2',' bryan ','Pending')]},{id:'b',area_name:'Houston Area',state:'TX',jobs:[job('3','Houston','Dry Run')]}],[job('4','Unknown','Cancelled')]);
  assert.equal(r.total,4);assert.equal(r.assigned,3);assert.equal(r.unassigned,1);
  assert.equal(r.areasWithJobs,2);assert.equal(r.completionRate,25);
  assert.equal(r.cities.find(c=>c.city==='Bryan').total,2);
  assert.equal(r.cities.reduce((n,c)=>n+c.total,0),4);
  assert.equal(Object.values(r.status).reduce((a,b)=>a+b,0),4);
  assert.equal(r.areas.reduce((n,a)=>n+a.total,0)+r.unassigned,r.total);
  assert(!JSON.stringify(r).includes('Unused alias'));
});
test('report counts overlapping job IDs once and exports no financial data',()=>{
  const rows=[{id:'a',area_name:'A',jobs:[job('1','Austin','Completed',{totalBill:123456,parts:789,profit:10000})]},{id:'b',area_name:'B',jobs:[job('1','Austin')]}];
  const r=buildServiceAreaReport(rows,[job('1','Austin')]);
  assert.equal(r.total,1);assert.equal(r.unassigned,0);
  assert(!JSON.stringify(r).includes('123456'));assert(!('totalBill' in r.jobs[0]));
});
test('empty and filtered reports remain honest about scope',()=>{
  const empty=buildServiceAreaReport([{id:'a',area_name:'A',jobs:[]}],[],{periodLabel:'September 1–9',scopeLabel:'TX only'});
  assert.equal(empty.total,0);assert.equal(empty.completionRate,0);assert.equal(empty.areasWithJobs,0);
  assert.equal(empty.periodLabel,'September 1–9');assert.equal(empty.scopeLabel,'TX only');
  const r=buildServiceAreaReport([{id:'a',area_name:'A',jobs:[job('1','Paris','Completed'),job('2','Paris','Active',{state:'AR'})]}]);
  assert.equal(r.citiesWithJobs,2);
});
