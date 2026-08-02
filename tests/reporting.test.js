import assert from "node:assert/strict";
import test from "node:test";
import { buildReportData, databaseColumns, daysPending, jobProfit } from "../src/modules/reporting/reportData.js";
import { availableReports, getReportExportAccess } from "../src/modules/reporting/reportPermissions.js";

const jobs = [
  { date: "2026-07-01", status: "Completed", invoice: "Paid", techPaymentStatus: "Paid", company: "Alpha", dispatch: "Dana", tech: "Terry", city: "Denver", totalBill: 1000, parts: 200, techLabor: 300, internalControlColor: "none", raw: { id: 1, total_bill: 1000, custom_field: "A" } },
  { date: "2026-07-02", status: "Cancelled", invoice: "Pending", techPaymentStatus: "Pending", company: "Beta", dispatch: "Dana", tech: "Taylor", city: "Aurora", totalBill: 500, parts: 50, techLabor: 150, internalControlColor: "red", raw: { id: 2, total_bill: 500, reference_number: "R-2" } },
  { date: "2026-07-03", status: "Dry Run", invoice: "Sent", techPaymentStatus: "Pending", company: "Beta", dispatch: "Sam", tech: "Terry", city: "Denver", totalBill: 250, parts: 25, techLabor: 75, internalControlColor: "none", raw: { id: 3, total_bill: 250 } },
];

test("executive KPIs and financial totals reconcile", () => {
  const report = buildReportData(jobs, { generatedAt: new Date("2026-08-02T12:00:00Z") });
  assert.equal(report.summary.totalJobs, 3);
  assert.equal(report.summary.completed, 1);
  assert.equal(report.summary.cancelled, 1);
  assert.equal(report.summary.dryRuns, 1);
  assert.equal(report.summary.revenue, 1750);
  assert.equal(report.summary.parts, 275);
  assert.equal(report.summary.techLabor, 525);
  assert.equal(report.summary.profit, 950);
  assert.equal(report.summary.outstandingInvoices, 2);
  assert.equal(report.summary.outstandingRevenue, 750);
  assert.equal(report.summary.customersPendingPayment, 1);
  assert.equal(report.summary.techPaymentsPending, 2);
  assert.equal(report.summary.internalControlFlags, 1);
  assert.equal(report.summary.topDispatcher, "Dana");
});

test("job profit and technician pending age are deterministic", () => {
  assert.equal(jobProfit(jobs[0]), 500);
  assert.equal(daysPending(jobs[1], new Date("2026-07-12T00:00:00Z")), 10);
});

test("database export includes the union of real raw columns", () => {
  assert.deepEqual(databaseColumns(jobs), ["id", "reference_number", "total_bill", "custom_field"]);
});

test("dispatchers receive operational exports without financial access", () => {
  const access = getReportExportAccess("dispatcher");
  assert.equal(access.canExportOperational, true);
  assert.equal(access.canExportFinancial, false);
  assert.deepEqual(availableReports("dispatcher").map((report) => report.id), ["dispatcher-performance", "city-performance"]);
});

test("administrator gets every report and Technician Manager requires explicit permission", () => {
  assert.equal(availableReports("admin").length, 9);
  assert.deepEqual(availableReports("technician_manager"), []);
  assert.deepEqual(availableReports("technician_manager", { canViewTechPayments: true }).map((report) => report.id), ["technician-payments"]);
  assert.equal(availableReports("technician_manager", { canExportFinancialReports: true }).length, 7);
});
