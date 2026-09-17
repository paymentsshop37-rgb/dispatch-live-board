import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { calculateReportSummary, calculateFinancialSummary, calculateStatusBreakdown, reportSummarySections, formatReportMoney, reportJobsFromGroups, selectReportTransactions } from "../src/modules/reporting/reportSummary.js";
import { reportCsv, summaryHtml } from "../src/modules/reporting/summaryRenderers.js";
import { createReportWorkbook } from "../src/modules/reporting/excelReport.js";
import { createAccountingWorkbookBuffer } from "../src/modules/accounting/accountingWorkbook.js";
import { normalizeAccountingJob, buildAccountingModel, accountingDateRange } from "../src/modules/accounting/accountingData.js";

const raw = [
  { id: "1", job_date: "2026-09-01", dispatch: "CRISTINA", tech: "Tech A", company: "Acme", status: "Completed", invoice_status: "Paid", tech_payment_status: "Paid", total_bill: 2051.84, parts: 108.69, tech_labor: 500 },
  { id: "2", job_date: "2026-09-02", dispatch: " cristina ", tech: "Tech B", company: "Beta", status: "Dry Run", invoice_status: "Sent", tech_payment_status: "Pending", total_bill: 200, parts: 0, tech_labor: 50 },
  { id: "3", job_date: "2026-08-01", dispatch: "IAN", tech: "Tech A", company: "Acme", status: "Canceled", invoice_status: "Cancelled", tech_payment_status: "Cancelled", total_bill: 0, parts: 20, tech_labor: 30 },
  { id: "4", job_date: "2026-09-03", dispatch: null, tech: null, company: null, status: "In Progress", invoice_status: "Pending", tech_payment_status: "Pending", total_bill: null, parts: null, tech_labor: null },
];
const jobs = raw.map(normalizeAccountingJob);
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
const summaryRows = summary => reportSummarySections(summary).flatMap(s => s.rows);

test("All Time uses the existing financial formula and reconciles every grouping", () => {
  assert.equal(accountingDateRange("All Time"), null);
  const s = calculateReportSummary(jobs), expected = buildAccountingModel(jobs).kpis;
  assert.equal(s.count, 4);
  close(s.financial.totalBill, expected.totalBilled);
  close(s.financial.profit, expected.estimatedProfit);
  close(s.financial.profitMargin, expected.estimatedProfit / expected.totalBilled * 100);
  assert.equal(s.dispatchers.find(r => r.name === "CRISTINA").jobs, 2);
  for (const grouping of [s.dispatchers, s.technicians, s.companies]) {
    assert.equal(grouping.reduce((n, r) => n + r.jobs, 0), 4);
    close(grouping.reduce((n, r) => n + r.profit, 0), s.financial.profit);
  }
  for (const status of s.statuses) {
    assert.equal(status.rows.reduce((n, r) => n + r.count, 0), 4);
    close(status.rows.reduce((n, r) => n + r.percentage, 0), 100);
  }
});

test("custom date range, dispatcher, technician, company and payment filters use only passed rows", () => {
  const range = accountingDateRange("Custom Range", { from: "2026-09-01", to: "2026-09-02" });
  const cases = [
    [jobs.filter(j => j.date >= range.from && j.date <= range.to), 2, 2251.84],
    [jobs.filter(j => j.dispatcher.trim().toLowerCase() === "cristina"), 2, 2251.84],
    [jobs.filter(j => j.technician === "Tech A"), 2, 2051.84],
    [jobs.filter(j => j.company === "Beta"), 1, 200],
    [jobs.filter(j => j.invoiceStatus === "Sent" && j.techPaymentStatus === "Pending"), 1, 200],
  ];
  for (const [rows, count, bill] of cases) {
    const summary = calculateReportSummary(rows);
    assert.equal(summary.count, count); close(summary.financial.totalBill, bill);
  }
});

test("empty, one-job, zero-bill, cancelled and null financial records stay finite", () => {
  const empty = calculateReportSummary([]);
  assert.equal(empty.count, 0); assert.equal(empty.financial.profitMargin, 0);
  const one = calculateFinancialSummary([jobs[0]]);
  close(one.averageProfit, 1443.15); assert.equal(formatReportMoney(one.averageProfit), "$1,443.15");
  const zero = calculateReportSummary([jobs[2]]);
  assert.equal(zero.financial.profit, -50); assert.equal(zero.financial.profitMargin, 0);
  assert.equal(zero.statuses[0].rows.find(r => r.name === "Cancelled").percentage, 100);
  assert.equal(calculateFinancialSummary([jobs[3]]).profit, 0);
  assert.equal(formatReportMoney(NaN), "$0.00");
});

test("raw and normalized aliases agree; unknown statuses and missing assignments are preserved", () => {
  assert.deepEqual(calculateFinancialSummary(raw), calculateFinancialSummary(jobs));
  assert.equal(calculateStatusBreakdown([{ status: "awaiting approval" }, { status: null }], "status")[1].name, "Not recorded");
  const partial = calculateReportSummary([{ techLabor: 50, technician: "A" }]);
  assert(!summaryRows(partial).some(r => r[0] === "Total Estimated Profit"));
  assert.equal(summaryRows(partial).find(r => r[0] === "Total Tech Labor")[1], 50);
});

test("operational outputs never expose financial fields, including group summaries", async () => {
  const s = calculateReportSummary(jobs, { includeFinancial: false });
  const html = summaryHtml(s);
  assert.doesNotMatch(html, /FINANCIAL|Total Bill|Estimated Profit|\$/);
  const reportJobs = jobs.map(j => ({ ...j, dispatch: j.dispatcher, tech: j.technician, invoice: j.invoiceStatus }));
  const workbook = await createReportWorkbook(reportJobs, { reportType: "city-performance", includeFinancial: false });
  const text = JSON.stringify(workbook.worksheets[0].getSheetValues());
  assert.match(text, /SUMMARY & STATISTICS/); assert.doesNotMatch(text, /Total Bill|Estimated Profit|2051\.84/);
});

test("company summary is bounded while preserving the full totals", () => {
  const s = calculateReportSummary(Array.from({ length: 30 }, (_, i) => ({ ...jobs[0], company: `Company ${i}` })));
  assert.equal(s.companies.length, 11);
  assert.equal(s.companies.at(-1).jobs, 20);
  close(s.companies.reduce((n, r) => n + r.totalBill, 0), s.financial.totalBill);
});

test("HTML escapes names; CSV formats every financial detail and summary value", () => {
  const s = calculateReportSummary([{ ...jobs[0], dispatcher: '<img src=x onerror="alert(1)">' }]);
  assert.doesNotMatch(summaryHtml(s), /<img/);
  const csv = reportCsv(["Invoice #", "Total Bill", "Profit"], [[1234, 2051.8400000000001, 1443.1499999999999]], s);
  assert.match(csv, /"1234","\$2,051\.84","\$1,443\.15"/);
  assert.match(csv, /SUMMARY & STATISTICS/); assert.doesNotMatch(csv, /0000001|9999999/);
});

test("transaction and directory reports do not fabricate job counts or profit", () => {
  const s = calculateReportSummary([{ amount: 10 }, { amount: 5, voided_at: "2026-09-01" }], { kind: "transactions" });
  assert.equal(s.countLabel, "Total Transactions");
  assert.equal(s.metrics.find(r => r[0] === "Active Amount")[1], 10);
  assert.equal(s.financial, null);
  const directory = calculateReportSummary([{ status: "Active" }], { kind: "records", recordLabel: "Technicians", statusFields: [["STATUS", "status"]] });
  assert.equal(directory.countLabel, "Total Technicians"); assert.equal(directory.statuses[0].rows[0].count, 1);
});

test("grouped reports count source job IDs once, not totals or pagination rows", () => {
  assert.equal(reportJobsFromGroups([{ jobs: jobs.slice(0, 2) }, { jobs: jobs.slice(1) }]).length, 4);
  assert.equal(reportJobsFromGroups([{ jobs: 42 }]).length, 0);
});

test("transaction exports use the selected job scope and preserve voided records as history", () => {
  const transactions = [{ job_id: "1", amount: 10 }, { job_id: "2", amount: 20 }, { job_id: "1", amount: 5, voided_at: "2026-09-01" }, { job_id: null, amount: 999 }];
  const selected = selectReportTransactions(transactions, jobs.slice(0, 1));
  assert.equal(selected.length, 2);
  assert.equal(calculateReportSummary(selected, { kind: "transactions" }).metrics.find(row => row[0] === "Total Amount")[1], 15);
  assert.deepEqual(selectReportTransactions(transactions, []), []);
});

test("unrecognized invoice statuses remain in detail and summary", async () => {
  const rows = [{ ...jobs[0], invoice: "Need Review" }, { ...jobs[1], invoice: "" }];
  const workbook = await createReportWorkbook(rows);
  const sheet = workbook.getWorksheet("CUSTOMER INVOICES");
  assert.equal(findSummaryCount(sheet), 2);
  assert.match(JSON.stringify(sheet.getSheetValues()), /NEED REVIEW/);
});

function findSummaryCount(sheet) {
  let started = false, count;
  sheet.eachRow(row => {
    const cells = []; row.eachCell(cell => { if (!cell.isMerged || cell.master === cell) cells.push(cell.value); });
    if (cells.includes("SUMMARY & STATISTICS")) started = true;
    if (started && ["Total Jobs", "Total Transactions"].includes(cells[0])) count = cells[1];
  });
  return count;
}

test("every accounting worksheet summarizes its own filtered detail dataset and prints the footer", async () => {
  const model = buildAccountingModel(jobs);
  const buffer = await createAccountingWorkbookBuffer({ model, pendingTechJobs: model.techDueJobs, invoicePayments: [{ amount: 10, job_id: "1" }], techTransactions: [] });
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(buffer);
  for (const sheet of workbook.worksheets) {
    const expected = { "Completed Jobs": 1, "Cancelled Jobs": 1, "Dry Runs": 1, "Red Internal Control": 0, "Payment Transactions": 1, "Technician Payment History": 0, "Technician Payments Due": 2 }[sheet.name] ?? 4;
    assert.equal(findSummaryCount(sheet), expected, sheet.name);
    assert.match(sheet.pageSetup.printArea, new RegExp(`${sheet.rowCount}$`));
  }
});

test("general report worksheets summarize report subsets, retain typed money, and exclude summary rows from filters", async () => {
  const reportJobs = jobs.map(j => ({ ...j, dispatch: j.dispatcher, tech: j.technician, invoice: j.invoiceStatus }));
  const workbook = await createReportWorkbook(reportJobs);
  for (const sheet of workbook.worksheets) {
    const expected = { "TECH PAYMENTS PENDING": 2, "OUTSTANDING INVOICES": 2, "INTERNAL CONTROL REPORT": 0 }[sheet.name] ?? 4;
    assert.equal(findSummaryCount(sheet), expected, sheet.name);
  }
  const live = workbook.getWorksheet("LIVE JOBS");
  assert(live.autoFilter.to.row < live.rowCount);
});
