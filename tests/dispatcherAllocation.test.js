import test from "node:test";
import assert from "node:assert/strict";
import { normalizeAccountingJob } from "../src/modules/accounting/accountingData.js";
import { buildDispatcherPerformance, dispatcherNames, dispatcherSummary, dispatcherExportRows, dispatcherJobProfit, fullDispatcherJobProfit, jobCredit, cancelledDispatcherJobs, completedDispatcherJobs } from "../src/modules/intelligence/dispatcherPerformance.js";

const job=(id,overrides={})=>normalizeAccountingJob({id,job_date:"2026-11-13",dispatch:"MARIANA/MICHELLE",status:"Completed",company:"FLEET",job_city:"Dallas",job_state:"TX",total_bill:500,parts:50,tech_labor:50,...overrides});
const individual=(jobs,prior=[])=>buildDispatcherPerformance(jobs,prior,{mode:"individual"});
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);

test("completed counts include shared and financially incomplete jobs without duplicating company totals",()=>{
  const rows=individual([job(1,{dispatch:"A/B"}),job(2,{dispatch:"A",parts:null}),job(3,{dispatch:"A",status:"Cancelled"})]);
  const a=rows.find(row=>row.name==="A"),b=rows.find(row=>row.name==="B");
  assert.equal(a.completedParticipations,2);assert.equal(a.completed,1.5);assert.equal(a.measured,.5);
  assert.equal(b.completedParticipations,1);assert.equal(b.completed,.5);
  assert.equal(dispatcherSummary(rows).completedParticipations,2);
  assert.deepEqual(completedDispatcherJobs(rows.flatMap(row=>row.jobs)).map(job=>job.id),[1,2]);
  const csv=dispatcherExportRows([b],{from:"2026-11-01",to:"2026-11-13"});
  assert.equal(csv.at(-1)[csv[0].indexOf("Completed jobs involved")],1);
  assert.equal(csv.at(-1)[csv[0].indexOf("Completed credits")],.5);
});

test("completed status aliases follow board normalization and previous completions stay in their period",()=>{
  const rows=individual([job(1,{status:"Complete"}),job(2,{status:"In Progress"})],[job(3)]);
  assert.equal(dispatcherSummary(rows).completedParticipations,1);
  assert.equal(dispatcherSummary(rows).previous.completedParticipations,1);
  assert.equal(completedDispatcherJobs([]).length,0);
});

test("visible cancellation counts show actual jobs per person and unique company cancellations",()=>{
  const rows=individual([job(1,{dispatch:"A/B",status:"Cancelled"}),job(2,{dispatch:"A",status:"Canceled"}),job(3,{dispatch:"A"})]);
  const a=rows.find(row=>row.name==="A"), b=rows.find(row=>row.name==="B");
  assert.equal(a.cancelledParticipations,2);assert.equal(a.cancelled,1.5);
  assert.equal(b.cancelledParticipations,1);assert.equal(b.cancelled,.5);
  assert.equal(dispatcherSummary(rows).cancelledParticipations,2);
  assert.equal(dispatcherSummary([b]).cancelledParticipations,1);
  assert.deepEqual(cancelledDispatcherJobs(rows.flatMap(row=>row.jobs)).map(job=>job.id),[1,2]);
  const csv=dispatcherExportRows([b],{from:"2026-11-01",to:"2026-11-13"});
  assert.equal(csv.at(-1)[csv[0].indexOf("Cancelled jobs involved")],1);
  assert.equal(csv.at(-1)[csv[0].indexOf("Cancelled credits")],.5);
});

test("prior-period cancellations and completed current jobs do not inflate current cancellation totals",()=>{
  const rows=individual([job(1)],[job(2,{status:"Cancelled"})]);
  assert.equal(dispatcherSummary(rows).cancelledParticipations,0);
  assert.equal(dispatcherSummary(rows).previous.cancelledParticipations,1);
  assert.deepEqual(cancelledDispatcherJobs(rows.flatMap(row=>row.jobs)),[]);
});

test("two dispatchers each receive half a job and $200 of a $400 job profit",()=>{
  const rows=individual([job(1)]);
  assert.deepEqual(rows.map(row=>row.name),["MARIANA","MICHELLE"]);
  for(const row of rows){assert.equal(row.total,.5);assert.equal(row.participated,1);assert.equal(row.profit,200);assert.equal(row.measured,.5);assert.equal(row.profitPerParticipation,200);assert.equal(row.sharedParticipations,1);}
  const total=dispatcherSummary(rows);assert.equal(total.total,1);assert.equal(total.participated,1);assert.equal(total.profit,400);assert.equal(total.billed,500);assert.equal(total.completed,1);assert.equal(total.measuredParticipations,2);assert.equal(total.profitPerParticipation,200);
});
test("a filtered individual keeps their original share instead of receiving the whole job",()=>{
  const rows=individual([job(1)]).filter(row=>row.name==="MICHELLE");
  const total=dispatcherSummary(rows);assert.equal(total.total,.5);assert.equal(total.profit,200);assert.equal(total.participated,1);assert.equal(total.profitPerParticipation,200);
});
test("three-person contributions conserve cents, credits and source records",()=>{
  const source=job(1,{dispatch:"C / A / B",total_bill:1.01,parts:0,tech_labor:0});
  const before=JSON.stringify(source);
  const rows=individual([source]);
  assert.deepEqual(rows.map(row=>row.profit),[.34,.34,.33]);
  rows.forEach(row=>near(row.total,1/3));
  const total=dispatcherSummary(rows);near(total.total,1);near(total.profit,1.01);assert.equal(total.participated,1);
  assert.equal(JSON.stringify(source),before);assert.equal(fullDispatcherJobProfit(rows[0].jobs[0]),1.01);assert.equal(dispatcherJobProfit(rows[0].jobs[0]),.34);
});
test("team mode canonicalizes name order and spacing without combining distinct people",()=>{
  const rows=buildDispatcherPerformance([job(1),job(2,{dispatch:" michelle / Mariana "})]);
  assert.equal(rows.length,1);assert.equal(rows[0].name,"MARIANA / MICHELLE");assert.equal(rows[0].total,2);assert.equal(rows[0].profit,800);assert.equal(rows[0].participated,2);
  assert.deepEqual(dispatcherNames("ANNA-MARIA / O'NEILL"),["ANNA-MARIA","O'NEILL"]);
});
test("duplicate and empty names never create extra credits or fake people",()=>{
  assert.deepEqual(dispatcherNames("A / a // B /"),["A","B"]);
  assert.deepEqual(dispatcherNames(" / "),["UNASSIGNED"]);
  assert.deepEqual(dispatcherNames("A & B + A"),["A","B"]);
  const rows=individual([job(1,{dispatch:"A/A"}),job(2,{dispatch:""})]);
  assert.equal(rows.find(row=>row.name==="A").total,1);assert.equal(dispatcherSummary(rows).unassigned,1);assert.equal(dispatcherSummary(rows).total,2);
});
test("shared completion, cancellations, missing amounts and losses use the same credited denominator",()=>{
  const rows=individual([job(1),job(2,{status:"Cancelled"}),job(3,{parts:null}),job(4,{tech_labor:600})]);
  const row=rows[0];assert.equal(row.participated,4);assert.equal(row.total,2);assert.equal(row.completed,1.5);assert.equal(row.cancelled,.5);assert.equal(row.measured,1);assert.equal(row.missing,.5);assert.equal(row.losses,.5);assert.equal(row.completionRate,75);assert.equal(row.cancellationRate,25);
  const total=dispatcherSummary(rows);assert.equal(total.total,4);assert.equal(total.completed,3);assert.equal(total.missing,1);assert.equal(total.losses,1);assert.equal(total.participated,4);
});
test("previous-period team combinations are allocated to the same individual identities",()=>{
  const rows=individual([job(1,{dispatch:"MARIANA"})],[job(2,{dispatch:"MICHELLE / MARIANA"})]);
  const mariana=rows.find(row=>row.name==="MARIANA");assert.equal(mariana.total,1);assert.equal(mariana.previous.total,.5);assert.equal(mariana.profitChange,200);assert.equal(mariana.volumeChange,100);
  const michelle=rows.find(row=>row.name==="MICHELLE");assert.equal(michelle.total,0);assert.equal(michelle.previous.profit,200);
});
test("mixed solo/shared reports and CSVs reconcile both modes without duplicated company totals",()=>{
  const jobs=[job(1),job(2,{dispatch:"MARIANA"}),job(3,{dispatch:"A/B/C",total_bill:100,parts:10,tech_labor:20})];
  const people=individual(jobs),teams=buildDispatcherPerformance(jobs);
  const p=dispatcherSummary(people),t=dispatcherSummary(teams);near(p.total,t.total);near(p.billed,t.billed);near(p.parts,t.parts);near(p.labor,t.labor);near(p.profit,t.profit);assert.equal(p.participated,3);assert.equal(p.measuredParticipations,6);near(p.profitPerParticipation,145);
  const csv=dispatcherExportRows(people,{from:"2026-11-01",to:"2026-11-13"}),headers=csv[0];assert.ok(csv.every(row=>row.length===headers.length));assert.equal(csv.at(-1)[headers.indexOf("View")],"individual");assert.equal(csv.at(-1)[headers.indexOf("Jobs participated")],3);assert.equal(csv.at(-1)[headers.indexOf("Estimated profit USD")],"870.00");near(csv.at(-1)[headers.indexOf("Job credits")],3);
  assert.equal(jobCredit(people[0].jobs[0]),.5);
});
