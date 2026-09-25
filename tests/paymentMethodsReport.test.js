import test from "node:test";
import assert from "node:assert/strict";
import { buildPaymentMethodsReport, filterPaymentReportJobs, paymentReportDateRange, paymentReportPeriods } from "../src/modules/executive/paymentMethodSummary.js";

const jobs = [
  { invoiceStatus: "Paid", paymentMethod: "Card", paymentReceiver: "A" },
  { invoiceStatus: "paid", paymentMethod: " card ", paymentReceiver: "b" },
  { invoiceStatus: "Paid", paymentMethod: "Zelle", paymentReceiver: "B" },
  { invoiceStatus: "Paid", paymentMethod: "Cash", paymentReceiver: "" },
  { invoiceStatus: "Paid", paymentMethod: "", paymentReceiver: "A" },
  { invoiceStatus: "Pending", paymentMethod: "Card", paymentReceiver: "A" },
];

test("payment method report counts paid jobs by Received A and B without attributing blanks to A", () => {
  const report = buildPaymentMethodsReport(jobs);
  assert.deepEqual(report.totals, { a: 2, b: 2, unassigned: 1, total: 5 });
  assert.deepEqual(report.rows.find((row) => row.method === "Card"), { method: "Card", a: 1, b: 1, unassigned: 0, total: 2 });
  assert.deepEqual(report.rows.find((row) => row.method === "Cash"), { method: "Cash", a: 0, b: 0, unassigned: 1, total: 1 });
  assert(report.rows.some((row) => row.method === "No registrado" && row.a === 1));
});

test("all-jobs scope includes pending invoices and reconciles method totals", () => {
  const report = buildPaymentMethodsReport(jobs, { paidOnly: false });
  assert.equal(report.totals.total, 6);
  assert.equal(report.rows.find((row) => row.method === "Card").a, 2);
  assert.equal(report.rows.reduce((total, row) => total + row.total, 0), report.totals.total);
});

test("report period buttons cover the requested ranges and custom dates", () => {
  const now = new Date(2026, 8, 25, 12);
  assert.deepEqual(paymentReportPeriods.slice(0, 9), ["Today", "This Week", "Last Week", "This Month", "Last Month", "Last 30 Days", "Last 90 Days", "This Year", "Custom Range"]);
  assert.deepEqual(paymentReportDateRange("This Week", {}, now), { from: "2026-09-20", to: "2026-09-26" });
  assert.deepEqual(paymentReportDateRange("Last Month", {}, now), { from: "2026-08-01", to: "2026-08-31" });
  assert.deepEqual(paymentReportDateRange("Last 30 Days", {}, now), { from: "2026-08-27", to: "2026-09-25" });
  const dated = [{ date: "2026-09-20" }, { date: "2026-09-25" }, { date: "2026-09-26" }, { date: "2026-09-27" }, { date: "" }];
  assert.equal(filterPaymentReportJobs(dated, "This Week", {}, now).length, 3);
  assert.equal(filterPaymentReportJobs(dated, "Custom Range", { from: "2026-09-25", to: "2026-09-26" }, now).length, 2);
  assert.equal(filterPaymentReportJobs(dated, "All Time", {}, now).length, 5);
});
