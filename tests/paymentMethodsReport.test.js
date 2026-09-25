import test from "node:test";
import assert from "node:assert/strict";
import { buildPaymentMethodsReport, filterPaymentReportJobs, paymentMethodFinancialRows, paymentMethodTotalRows, paymentReportDateRange, paymentReportPeriods } from "../src/modules/executive/paymentMethodSummary.js";

const jobs = [
  { id: "1", invoiceStatus: "Paid", paymentMethod: "Card", paymentReceiver: "A", totalBill: 100, parts: 10, techLabor: 20 },
  { id: "2", invoiceStatus: "paid", paymentMethod: " card ", paymentReceiver: "b", totalBill: 200, parts: 20, techLabor: 30 },
  { id: "3", invoiceStatus: "Paid", paymentMethod: "Zelle", paymentReceiver: "B", totalBill: 50, parts: 0, techLabor: 10 },
  { id: "4", invoiceStatus: "Paid", paymentMethod: "Cash", paymentReceiver: "", totalBill: 30, parts: 5, techLabor: 5 },
  { id: "5", invoiceStatus: "Paid", paymentMethod: "", paymentReceiver: "A", totalBill: 40, parts: 0, techLabor: 10 },
  { id: "6", invoiceStatus: "Pending", paymentMethod: "Card", paymentReceiver: "A", totalBill: 70, parts: 0, techLabor: 0 },
];

test("payment method report counts paid jobs by Received A and B without attributing blanks to A", () => {
  const report = buildPaymentMethodsReport(jobs);
  assert.deepEqual([report.totals.a, report.totals.b, report.totals.unassigned, report.totals.total], [2, 2, 1, 5]);
  const card = report.rows.find((row) => row.method === "Card");
  assert.deepEqual([card.a, card.b, card.unassigned, card.total], [1, 1, 0, 2]);
  const cash = report.rows.find((row) => row.method === "Cash");
  assert.deepEqual([cash.a, cash.b, cash.unassigned, cash.total], [0, 0, 1, 1]);
  assert(report.rows.some((row) => row.method === "No registrado" && row.a === 1));
});

test("printed amount rows separate billed, recorded collections and estimated profit for each letter", () => {
  const paymentSummaries = [{ job_id: "1", amount_paid: 90, payment_count: 1 }, { job_id: "2", amount_paid: 200, payment_count: 1 }];
  const report = buildPaymentMethodsReport(jobs, { paymentSummaries });
  const detail = paymentMethodFinancialRows(report);
  assert.deepEqual(detail.find((row) => row.method === "Card" && row.letter === "A"), {
    method: "Card", letter: "A", jobs: 1, billed: 100, collected: 90, profit: 70, paidWithoutRecord: 0,
  });
  assert.deepEqual(detail.find((row) => row.method === "Card" && row.letter === "B"), {
    method: "Card", letter: "B", jobs: 1, billed: 200, collected: 200, profit: 150, paidWithoutRecord: 0,
  });
  assert.deepEqual(report.totals.financial.total, { billed: 420, collected: 290, profit: 310, paidWithoutRecord: 3 });
  assert.deepEqual(paymentMethodTotalRows(report).map(({ letter, jobs }) => [letter, jobs]), [["A", 2], ["B", 2], ["Sin letra", 1], ["", 5]]);
});

test("printed totals always include both letters, even when one has no invoices", () => {
  const report = buildPaymentMethodsReport([jobs[1]]);
  const totals = paymentMethodTotalRows(report);
  assert.deepEqual(totals.map(({ letter, jobs, billed, profit }) => [letter, jobs, billed, profit]), [["A", 0, 0, 0], ["B", 1, 200, 150], ["", 1, 200, 150]]);
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
