import test from "node:test";
import assert from "node:assert/strict";
import { buildInternalControlPdfData, createInternalControlQueuePdf } from "../src/modules/executive/internalControlQueuePdf.js";

const jobs = Array.from({ length: 22 }, (_, index) => ({
  id: `job-${index + 1}`, jobNumber: `J-${index + 1}`, date: `2026-08-${String((index % 10) + 1).padStart(2, "0")}`,
  time: "08:30 AM", reference: `FULL-REFERENCE-${index + 1}`, invoiceNumber: `INV-${index + 1}`,
  dispatcher: "Dispatch Name", company: `Company ${index % 4}`, technician: "Technician Full Name",
  location: "1234 Full Service Location, Denver, Colorado 80202", jobStatus: "Completed", invoiceStatus: "Sent",
  paymentStatus: "Pending", techPaymentStatus: "Pending", totalBill: 1000 + index, parts: 100, techLabor: 250,
  profit: 650 + index, updates: `Long update ${index + 1}: ${"Detailed operational context must wrap without truncation. ".repeat(12)}`,
  daysSinceMarked: 22 - index, markedRedBy: index === 0 ? "Admin User" : "", markedRedAt: index === 0 ? "2026-08-01T12:00:00Z" : "",
}));

const summary = {
  count: jobs.length, totalBill: jobs.reduce((sum, job) => sum + job.totalBill, 0),
  totalParts: 2200, totalTechLabor: 5500, totalProfit: jobs.reduce((sum, job) => sum + job.profit, 0),
  averageDays: 11.5, oldest: jobs[0], newest: jobs.at(-1),
};

test("internal-control PDF data contains every visible job, full details, and reconciled totals", () => {
  const data = buildInternalControlPdfData(jobs, { canViewFinancial: true });
  assert.equal(data.rows.length, 22);
  for (const header of ["Job #", "Reference #", "Invoice #", "Company", "Technician", "Location", "Payment Status", "Tech Payment", "Total Bill", "Parts", "Tech Labor", "Profit", "Updates", "Days in Queue", "Marked Red By", "Marked Red At"]) assert.ok(data.headers.includes(header));
  assert.equal(data.rows[0][data.headers.indexOf("Updates")], jobs[0].updates);
  assert.equal(data.totals.totalBill, summary.totalBill);
  assert.equal(data.totals.totalParts, summary.totalParts);
  assert.equal(data.totals.totalTechLabor, summary.totalTechLabor);
  assert.equal(data.totals.totalProfit, summary.totalProfit);
});

test("internal-control PDF omits restricted financial columns", () => {
  const data = buildInternalControlPdfData(jobs, { canViewFinancial: false });
  for (const header of ["Total Bill", "Parts", "Tech Labor", "Profit"]) assert.ok(!data.headers.includes(header));
});

test("internal-control PDF is a valid multi-page printable document", async () => {
  const blob = createInternalControlQueuePdf({ jobs, summary, generatedBy: "Test Admin", activeFilter: "All Red Jobs", dateRange: "All dates", searchText: "", canViewFinancial: true });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const text = new TextDecoder("latin1").decode(bytes);
  assert.equal(text.slice(0, 5), "%PDF-");
  assert.ok(bytes.length > 10000);
  assert.ok((text.match(/\/Type \/Page\b/g) || []).length > 1);
});

test("internal-control PDF refuses an empty filtered dataset", () => {
  assert.throws(() => createInternalControlQueuePdf({ jobs: [], summary: { count: 0 }, canViewFinancial: true }), /No Internal Control jobs match/);
});
