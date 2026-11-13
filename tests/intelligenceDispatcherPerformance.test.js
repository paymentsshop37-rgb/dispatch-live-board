import test from "node:test";
import assert from "node:assert/strict";
import { normalizeAccountingJob } from "../src/modules/accounting/accountingData.js";
import { buildIntelligence } from "../src/modules/intelligence/intelligenceModel.js";
import { buildDispatcherPerformance, dispatcherExportRows, dispatcherJobProfit, dispatcherSummary, sourceAmount } from "../src/modules/intelligence/dispatcherPerformance.js";

const range = { from: "2026-11-01", to: "2026-11-07" };
const raw = (id, overrides = {}) => ({ id, job_date: "2026-11-03", dispatch: "Claudia", status: "Completed", company: "Fleet", job_city: "Dallas", job_state: "TX", total_bill: 100, parts: 10, tech_labor: 40, ...overrides });
const job = (id, overrides) => normalizeAccountingJob(raw(id, overrides));

test("groups dispatcher names consistently and never duplicates shared or unassigned work", () => {
  const rows = buildDispatcherPerformance([job(1, { dispatch: " claudia " }), job(2, { dispatch: "CLAUDIA" }), job(3, { dispatch: "Claudia / Victor" }), job(4, { dispatch: "" })]);
  assert.equal(rows.length, 3);
  assert.equal(rows.find(row => row.name === "CLAUDIA").total, 2);
  assert.equal(rows.find(row => row.name === "CLAUDIA / VICTOR").total, 1);
  const total = dispatcherSummary(rows);
  assert.equal(total.total, 4); assert.equal(total.profit, 200); assert.equal(total.unassigned, 1);
  assert.equal(rows.reduce((sum, row) => sum + row.profit, 0), total.profit);
});
test("financial metrics exclude noncompleted and incomplete rows while preserving explicit zeros", () => {
  const jobs = [job(1), job(2, { parts: null }), job(3, { tech_labor: "" }), job(4, { total_bill: 1000, status: "Cancelled" }), job(5, { total_bill: 0, parts: 0, tech_labor: 0 })];
  const [row] = buildDispatcherPerformance(jobs);
  assert.equal(row.total, 5); assert.equal(row.completed, 4); assert.equal(row.cancelled, 1);
  assert.equal(row.measured, 2); assert.equal(row.missing, 2); assert.equal(row.financialCoverage, 50);
  assert.equal(row.billed, 100); assert.equal(row.parts, 10); assert.equal(row.labor, 40); assert.equal(row.profit, 50);
  assert.equal(row.averageProfit, 25); assert.equal(row.margin, 50);
  assert.equal(row.completionRate, 80); assert.equal(row.cancellationRate, 20);
  assert.equal(dispatcherJobProfit(jobs[1]), null); assert.equal(dispatcherJobProfit(jobs[4]), 0);
  assert.equal(sourceAmount("bad"), null);
});
test("pooled weighted margins and distinct totals reconcile rather than averaging dispatcher percentages", () => {
  const rows = buildDispatcherPerformance([job(1, { dispatch: "A", parts: 0, tech_labor: 0 }), job(2, { dispatch: "B", total_bill: 900, parts: 0, tech_labor: 900 })]);
  const total = dispatcherSummary(rows);
  assert.equal(total.margin, 10); assert.equal(total.averageProfit, 50);
  assert.equal(total.customers, 1); assert.equal(total.cities, 1);
});
test("profit deltas handle previous losses, zero billing and previously active dispatchers", () => {
  const rows = buildDispatcherPerformance([job(1)], [job(2, { total_bill: 100, tech_labor: 200, parts: 0 }), job(3, { dispatch: "Prior only" })]);
  const claudia = rows.find(row => row.name === "CLAUDIA");
  assert.equal(claudia.previous.profit, -100); assert.equal(claudia.profitChange, 150); assert.equal(claudia.marginChange, 150);
  const prior = rows.find(row => row.name === "PRIOR ONLY"); assert.equal(prior.total, 0); assert.equal(prior.previous.total, 1); assert.equal(prior.profitChange, null);
  const [zero] = buildDispatcherPerformance([job(4, { total_bill: 0, parts: 5, tech_labor: 10 })]);
  assert.equal(zero.profit, -15); assert.equal(zero.margin, null); assert.equal(zero.losses, 1);
});
test("no completed financial basis stays unavailable and empty summaries are finite", () => {
  const [row] = buildDispatcherPerformance([job(1, { status: "In Progress" })]);
  assert.equal(row.measured, 0); assert.equal(row.averageProfit, null); assert.equal(row.margin, null);
  assert.equal(row.profitChange, null);
  const total = dispatcherSummary([]); assert.equal(total.total, 0); assert.equal(total.completionRate, null);
});
test("dispatcher report uses exactly the CFO date/state scope and financial totals", () => {
  const rawJobs = [raw(1), raw(2, { dispatch: "Victor", job_date: "2026-10-28" }), raw(3, { job_state: "CO" }), raw(4, { job_date: "2026-11-08" }), raw(5, { job_date: "2026-02-30" })];
  const model = buildIntelligence({ rawJobs, range, state: "TX" });
  const total = dispatcherSummary(buildDispatcherPerformance(model.jobs, model.priorJobs));
  assert.equal(total.total, model.summary.total); assert.equal(total.profit, model.summary.profit);
  assert.equal(total.previous.total, model.priorJobs.length); assert.equal(total.total, 1);
});
test("CSV rows and filtered totals use the same measured jobs, previous scope and column counts", () => {
  const rows = buildDispatcherPerformance([job(1), job(2, { dispatch: "Victor" }), job(3, { status: "Cancelled" })], [job(4)]);
  const filtered = rows.filter(row => row.name === "CLAUDIA");
  const csv = dispatcherExportRows(filtered, range), headers = csv[0], total = csv.at(-1);
  assert.ok(csv.every(row => row.length === headers.length));
  assert.equal(total[headers.indexOf("Job credits")], 2); assert.equal(total[headers.indexOf("Estimated profit USD")], "50.00");
  assert.equal(total[headers.indexOf("Previous job credits")], 1);
  assert.equal(total[headers.indexOf("Profit change USD")], "0.00");
});
