import test from "node:test";
import assert from "node:assert/strict";
import { buildIntelligence, intelligenceRange, intelligenceCsv, validDate } from "../src/modules/intelligence/intelligenceModel.js";

const range = { from: "2026-11-01", to: "2026-11-07" };
const base = { range, coverageCities: [{ city: "Dallas", state: "TX", is_active: true }, { city: "Austin", state: "TX", is_active: true }], areas: [], aliases: [], technicians: [] };
const job = (id, overrides = {}) => ({ id, job_date: "2026-11-03", job_city: "Dallas", job_state: "TX", status: "Completed", company: "FLEET", total_bill: 100, parts: 10, tech_labor: 40, ...overrides });

test("compares equal inclusive periods and keeps zero-job configured cities", () => {
  const model = buildIntelligence({ ...base, rawJobs: [job(1), job(2, { job_date: "2026-10-25" }), job(3, { job_date: "2026-10-31" }), job(4, { job_date: "2026-11-07" }), job(5, { job_date: "2026-11-08" })] });
  assert.deepEqual(model.previous, { from: "2026-10-25", to: "2026-10-31" });
  assert.equal(model.summary.total, 2); assert.equal(model.priorJobs.length, 2);
  assert.equal(model.cities.find(c => c.city === "AUSTIN").total, 0);
  assert.equal(model.trend.length, 7); assert.equal(model.trend[0].trabajos, 0);
});
test("uses city and state exactly; nearby aliases are separate cities", () => {
  const model = buildIntelligence({ ...base, areas: [{ id: "dfw", primary_city: "Dallas", state: "TX" }], aliases: [{ service_area_id: "dfw", city: "Fort Worth", state: "TX" }], rawJobs: [job(1, { job_city: "Fort Worth" }), job(2, { job_state: "GA" })] });
  assert.equal(model.cities.find(c => c.key === "DALLAS|TX").total, 0);
  assert.equal(model.cities.find(c => c.key === "FORT WORTH|TX").total, 1);
  assert.equal(model.cities.find(c => c.key === "DALLAS|GA").total, 1);
});
test("last recorded job comes from history, not just the selected period or future", () => {
  const model = buildIntelligence({ ...base, rawJobs: [job(1, { job_date: "2026-09-01" }), job(2, { job_date: "2026-11-20" })] });
  const city = model.cities.find(c => c.city === "DALLAS");
  assert.equal(city.total, 0); assert.equal(city.lastDate, "2026-09-01"); assert.equal(city.lastCompletedDate, "2026-09-01");
});
test("only completed jobs with complete numeric sources contribute to estimated margin", () => {
  const model = buildIntelligence({ ...base, rawJobs: [job(1), job(2, { parts: null }), job(3, { tech_labor: "" }), job(4, { status: "Cancelled", total_bill: 1000 }), job(5, { total_bill: "bad" }), job(6, { total_bill: 0, parts: 0, tech_labor: 0 })] });
  assert.equal(model.summary.billed, 100); assert.equal(model.summary.profit, 50);
  assert.equal(model.summary.measured, 2); assert.equal(model.summary.missing, 3);
});
test("missing geography and invalid dates are counted without silently classifying them as cities", () => {
  const model = buildIntelligence({ ...base, rawJobs: [job(1, { job_city: "", job_state: "", location: "" }), job(2, { job_date: "2026-02-30" }), job(3, { job_date: null }), job(4, { job_city: "", job_state: "", location: "Austin, TX" })] });
  assert.equal(model.quality.missingGeography, 1); assert.equal(model.quality.invalidDates, 2);
  assert.equal(model.cities.find(c => c.city === "AUSTIN").total, 1);
});
test("requires minimum baseline for decline; cancellations still count as registered requests", () => {
  const rawJobs = [job(1, { status: "Cancelled" }), ...[2, 3, 4, 5].map(id => job(id, { job_date: "2026-10-28" }))];
  const model = buildIntelligence({ ...base, rawJobs }); const city = model.cities.find(c => c.city === "DALLAS");
  assert.equal(city.total, 1); assert.equal(city.change, -75);
  assert.ok(city.signals.some(s => s.type === "decline")); assert.ok(!city.signals.some(s => s.type === "silent"));
});
test("failed technician reads do not create false no-technician conclusions", () => {
  const model = buildIntelligence({ ...base, rawJobs: [job(1)], techniciansAvailable: false });
  const city = model.cities.find(c => c.city === "DALLAS"); assert.equal(city.technicianCount, null);
  assert.ok(!city.signals.some(s => s.type === "technician"));
});
test("only approved or active, nondeleted local technicians count", () => {
  const technicians = ["Approved", "Pending", "Rejected", "Missing Documents", "Active"].map((status, id) => ({ id, city: "Dallas", state: "TX", status }));
  technicians.push({ city: "Dallas", state: "TX", status: "Approved", deleted_at: "2026-11-01" });
  const model = buildIntelligence({ ...base, rawJobs: [], technicians }); assert.equal(model.cities.find(c => c.city === "DALLAS").technicianCount, 2);
});
test("retains lost customers and all available fields in the quality audit", () => {
  const model = buildIntelligence({ ...base, rawJobs: [job(1, { company: "FLEET", reference_number: "", received: "A" }), job(2, { company: "OLD FLEET", job_date: "2026-10-28" })] });
  const lost = model.customers.find(row => row.name === "OLD FLEET"); assert.equal(lost.total, 0); assert.equal(lost.previousCount, 1);
  assert.equal(model.fieldAudit.find(field => field.name === "reference_number").filled, 0);
  assert.equal(model.fieldAudit.find(field => field.name === "received").filled, 1);
});
test("state filter applies to both periods and the configured universe", () => {
  const model = buildIntelligence({ ...base, state: "TX", rawJobs: [job(1), job(2, { job_state: "GA" }), job(3, { job_state: "GA", job_date: "2026-10-27" })] });
  assert.equal(model.summary.total, 1); assert.equal(model.priorJobs.length, 0); assert.ok(model.cities.every(c => c.state === "TX"));
  assert.deepEqual(model.states, ["GA", "TX"]);
});
test("inactive configuration is excluded and CSV escapes formulas and quotes", () => {
  const model = buildIntelligence({ ...base, coverageCities: [{ city: "Inactive", state: "TX", is_active: false }], areas: [{ id: "old", primary_city: "OLD", state: "TX", is_active: false }], aliases: [{ city: "Alias", state: "TX", service_area_id: "old" }] });
  assert.equal(model.cities.length, 0);
  assert.equal(intelligenceCsv([["=SUM(1)", 'a"b', "line\nline"]]), '\uFEFF"\'=SUM(1)","a""b","line\nline"');
});
test("rejects impossible dates and reverse ranges", () => {
  assert.equal(validDate("2026-02-30"), ""); assert.equal(validDate("2026-02-28"), "2026-02-28");
  assert.throws(() => buildIntelligence({ ...base, range: { from: "2026-11-08", to: "2026-11-01" } }));
  assert.deepEqual(intelligenceRange(7, new Date(2026, 10, 13)), { from: "2026-11-07", to: "2026-11-13" });
});
