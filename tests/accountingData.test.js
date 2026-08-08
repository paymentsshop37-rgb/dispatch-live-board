import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { readFile } from "node:fs/promises";
import {
  accountingDateRange,
  agingBucket,
  buildAccountingModel,
  buildOutstandingSentInvoices,
  buildProfitReconciliation,
  buildReceivable,
  detailRowsForKpi,
  estimatedProfit,
  filterOutstandingInvoices,
  largestOutstandingInvoices,
  normalizeAccountingJob,
  oldestOutstandingInvoices,
  rankOutstandingCustomers,
  summarizeOutstandingInvoices,
} from "../src/modules/accounting/accountingData.js";
import { createAccountingWorkbookBuffer } from "../src/modules/accounting/accountingWorkbook.js";
import { outstandingInvoiceTable } from "../src/modules/accounting/outstandingInvoiceExports.js";

const rawJobs = [
  { id: "1", display_number: "J-1", job_date: "2026-07-01", invoice_number: "INV-1", reference_number: "REF-1", company: "Acme", status: "Completed", invoice_status: "Paid", tech_payment_status: "Paid", tech_payment_paid_at: "2026-07-03", total_bill: 1000, parts: 200, tech_labor: 300, internal_control_color: "red", invoice_due_date: "2026-07-15", tech: "Taylor", dispatch: "Dana", job_city: "Denver" },
  { id: "2", display_number: "J-2", job_date: "2026-07-10", invoice_number: "INV-2", reference_number: "REF-2", company: "Acme", status: "Dry Run", invoice_status: "Sent", tech_payment_status: "Pending", total_bill: 500, parts: 50, tech_labor: 100, invoice_due_date: null, tech: "Morgan", dispatch: "Dana", job_city: "Aurora" },
  { id: "3", display_number: "J-3", job_date: "2026-07-12", invoice_number: "INV-3", reference_number: "REF-3", company: "Beta", status: "Canceled", invoice_status: "Cancelled", tech_payment_status: "Cancelled", total_bill: 200, parts: 25, tech_labor: 50, tech: "Taylor", dispatch: "Sam", job_city: "Denver" },
];
const jobs = rawJobs.map(normalizeAccountingJob);
const payments = [{ job_id: "1", amount_paid: 1000, last_payment_date: "2026-07-03", payment_count: 1 }, { job_id: "2", amount_paid: 125, last_payment_date: "2026-07-15", payment_count: 1 }];

test("normalizes production fields and calculates estimated job profit", () => {
  assert.equal(jobs[0].invoiceNumber, "INV-1");
  assert.equal(jobs[0].referenceNumber, "REF-1");
  assert.equal(estimatedProfit(jobs[0]), 500);
});

test("reconciles all twelve headline KPIs from filtered job rows", () => {
  const model = buildAccountingModel(jobs, payments, new Date("2026-08-02T12:00:00"));
  assert.deepEqual(model.kpis, { totalBilled: 1700, partsExpense: 275, techLaborExpense: 450, estimatedProfit: 975, totalJobs: 3, completedJobs: 1, cancelledJobs: 1, dryRuns: 1, techPaymentsDue: 100, pendingTechPaymentJobs: 1, redInternalControlJobs: 1, openCustomerInvoices: 1 });
  for (const key of Object.keys(model.kpis)) assert.ok(Array.isArray(detailRowsForKpi(model, key)));
});

test("estimated-profit reconciliation uses the exact KPI formula and source rows", () => {
  const reconciliation = buildProfitReconciliation(jobs);
  assert.equal(reconciliation.totalBilled, 1700);
  assert.equal(reconciliation.totalParts, 275);
  assert.equal(reconciliation.totalTechLabor, 450);
  assert.equal(reconciliation.estimatedProfit, 975);
  assert.equal(reconciliation.estimatedProfit, buildAccountingModel(jobs, payments).kpis.estimatedProfit);
  assert.equal(reconciliation.jobsIncluded, 3);
});

test("outstanding sent invoices include sent unpaid balances and exclude paid and cancelled invoices", () => {
  const report = buildOutstandingSentInvoices(jobs, payments, new Date("2026-08-02T12:00:00"));
  assert.equal(report.invoiceCount, 1);
  assert.equal(report.rows[0].invoiceNumber, "INV-2");
  assert.equal(report.rows[0].amountPaid, 125);
  assert.equal(report.rows[0].balanceDue, 375);
  assert.equal(report.totalOutstanding, 375);
  assert.ok(!report.rows.some((row) => ["INV-1", "INV-3"].includes(row.invoiceNumber)));
});

test("all outstanding ignores job date while current date presets filter the same report rows", () => {
  const report = buildOutstandingSentInvoices(jobs, payments, new Date("2026-08-02T12:00:00"));
  assert.equal(filterOutstandingInvoices(report.rows, "All Outstanding", {}, new Date("2026-08-02T12:00:00")).length, 1);
  assert.equal(filterOutstandingInvoices(report.rows, "Today", {}, new Date("2026-08-02T12:00:00")).length, 0);
  const visibleRows = filterOutstandingInvoices(report.rows, "Last 30 Days", {}, new Date("2026-08-02T12:00:00"));
  assert.equal(visibleRows.length, 1);
  assert.equal(summarizeOutstandingInvoices(visibleRows).totalOutstanding, buildOutstandingSentInvoices(jobs.filter((job) => job.date >= "2026-07-04"), payments, new Date("2026-08-02T12:00:00")).totalOutstanding);
});

test("outstanding export grand total matches the visible report sum", () => {
  const report = buildOutstandingSentInvoices(jobs, payments, new Date("2026-08-02T12:00:00"));
  const table = outstandingInvoiceTable(report.rows);
  assert.equal(table.rows.at(-1)[0], "GRAND TOTAL");
  assert.equal(table.rows.at(-1)[12], report.totalOutstanding);
});

test("financial-priority customer, oldest, and largest rankings reconcile and sort correctly", () => {
  const rows = [
    { id: "a", company: "Alpha", invoiceNumber: "INV-A", balanceDue: 400, daysOutstanding: 20 },
    { id: "b", company: "Alpha", invoiceNumber: "INV-B", balanceDue: 100, daysOutstanding: 45 },
    { id: "c", company: "Beta", invoiceNumber: "INV-C", balanceDue: 700, daysOutstanding: 10 },
  ];
  const customers = rankOutstandingCustomers(rows);
  assert.deepEqual(customers.map((row) => [row.company, row.amount, row.invoiceCount]), [["Beta", 700, 1], ["Alpha", 500, 2]]);
  assert.equal(customers.reduce((sum, row) => sum + row.amount, 0), rows.reduce((sum, row) => sum + row.balanceDue, 0));
  assert.equal(customers[1].oldestInvoice, "INV-B");
  assert.deepEqual(oldestOutstandingInvoices(rows).map((row) => row.id), ["b", "a", "c"]);
  assert.deepEqual(largestOutstandingInvoices(rows).map((row) => row.id), ["c", "a", "b"]);
});

test("accounts receivable uses non-voided transaction summaries and never shows a negative balance", () => {
  const partial = buildReceivable(jobs[1], payments[1], new Date("2026-08-02T12:00:00"));
  const overpaid = buildReceivable(jobs[1], { amount_paid: 900 }, new Date("2026-08-02T12:00:00"));
  assert.equal(partial.balanceDue, 375);
  assert.equal(partial.paymentStatus, "Partially Paid");
  assert.equal(overpaid.balanceDue, 0);
  assert.equal(overpaid.paymentStatus, "Overpaid");
});

test("missing due dates stay explicit and do not receive invented aging", () => {
  const row = buildReceivable(jobs[1], payments[1], new Date("2026-08-02T12:00:00"));
  assert.equal(row.daysOutstanding, null);
  assert.equal(row.agingBucket, "Due Date Not Set");
  assert.equal(agingBucket(92, "2026-05-01"), "91+ Days");
});

test("date presets are deterministic and inclusive", () => {
  const now = new Date("2026-08-02T12:00:00");
  assert.deepEqual(accountingDateRange("Today", {}, now), { from: "2026-08-02", to: "2026-08-02" });
  assert.deepEqual(accountingDateRange("Last 30 Days", {}, now), { from: "2026-07-04", to: "2026-08-02" });
  assert.equal(accountingDateRange("All Time", {}, now), null);
});

test("warnings identify source-data reconciliation issues", () => {
  const model = buildAccountingModel(jobs, payments, new Date("2026-08-02T12:00:00"));
  assert.ok(model.warnings.some((item) => item.type === "Invoice due date missing"));
  assert.ok(model.warnings.some((item) => item.type === "Red internal-control job exceeds review threshold"));
});

test("complete accounting workbook contains exactly the required twelve sheets and live formulas", async () => {
  const model = buildAccountingModel(jobs, payments, new Date("2026-08-02T12:00:00"));
  const buffer = await createAccountingWorkbookBuffer({ model, pendingTechJobs: [jobs[1]], invoicePayments: [], techTransactions: [] }, { reportId: "complete-workbook", generatedAt: "2026-08-02T12:00:00Z", generatedBy: "Test Admin", filterLabel: "All Time" });
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(buffer);
  assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), ["Executive Summary","Customer Invoices","Accounts Receivable","Payment Transactions","Technician Payments Due","Technician Payment History","Profitability","Completed Jobs","Cancelled Jobs","Dry Runs","Red Internal Control","Raw Data"]);
  assert.equal(workbook.getWorksheet("Profitability").getCell("J7").formula, "G7-H7-I7");
  assert.equal(workbook.getWorksheet("Executive Summary").getCell("A8").value, 1700);
});

test("migration exposes authenticated-only accounting APIs, immutable ledgers, and audited voids", async () => {
  const sql = await readFile(new URL("../supabase/migrations/20260802000200_create_accounting_center.sql", import.meta.url), "utf8");
  for (const needle of ["enable row level security", "prevent_accounting_transaction_mutation", "void_invoice_payment", "void_technician_payment_transaction", "audit_accounting_settings_change", "get_red_internal_control_jobs", "Payment exceeds the remaining invoice balance", "Use the Accounting Center payment action"]) assert.match(sql, new RegExp(needle, "i"));
  assert.match(sql, /revoke all on public\.invoice_payments[\s\S]*from anon/i);
});
