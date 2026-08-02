import { performance } from "node:perf_hooks";
import { createReportXlsxBuffer } from "../src/modules/reporting/excelReport.js";

const rowCount = Number(process.env.REPORT_ROWS || 50000);
const statuses = ["Completed", "Cancelled", "Pending", "Dry Run", "In Progress"];
const invoiceStatuses = ["Paid", "Pending", "Sent", "Cancelled"];
const jobs = Array.from({ length: rowCount }, (_, index) => {
  const totalBill = 350 + (index % 1600);
  const parts = index % 275;
  const techLabor = 100 + (index % 425);
  const row = {
    id: `job-${index + 1}`,
    display_number: index + 1,
    job_date: `2026-${String((index % 12) + 1).padStart(2, "0")}-${String((index % 28) + 1).padStart(2, "0")}`,
    job_time: `${String(index % 24).padStart(2, "0")}:${String(index % 60).padStart(2, "0")}:00`,
    reference_number: `REF-${String(index + 1).padStart(7, "0")}`,
    invoice_number: `INV-${String(index + 1).padStart(7, "0")}`,
    dispatch: `Dispatcher ${index % 25}`,
    company: `Customer ${index % 400}`,
    tech: `Technician ${index % 175}`,
    location: `${100 + (index % 9000)} Service Road`,
    job_city: `City ${index % 120}`,
    job_state: "CO",
    status: statuses[index % statuses.length],
    row_flag: "Normal",
    internal_control_color: index % 97 === 0 ? "red" : "none",
    invoice_status: invoiceStatuses[index % invoiceStatuses.length],
    payment_method: "ACH",
    received: "A",
    updates: "Benchmark job record",
    total_bill: totalBill,
    parts,
    tech_labor: techLabor,
    tech_payment_status: index % 3 ? "Paid" : "Pending",
    tech_payment_method: "ACH",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-08-02T00:00:00Z",
  };
  return {
    id: row.id, displayNumber: row.display_number, date: row.job_date, time: row.job_time,
    jobReference: row.reference_number, reference: row.invoice_number, dispatch: row.dispatch,
    company: row.company, tech: row.tech, location: row.location, city: row.job_city,
    state: row.job_state, status: row.status, rowFlag: row.row_flag,
    internalControlColor: row.internal_control_color, invoice: row.invoice_status,
    paymentMethod: row.payment_method, paymentReceiver: row.received, updates: row.updates,
    totalBill, parts, techLabor, techPaymentStatus: row.tech_payment_status, raw: row,
  };
});

const startMemory = process.memoryUsage().heapUsed;
const start = performance.now();
const buffer = await createReportXlsxBuffer(jobs, {
  reportType: "database",
  generatedAt: "2026-08-02T12:00:00Z",
  generatedBy: "Performance Test",
  filterLabel: "All jobs",
});
const seconds = (performance.now() - start) / 1000;
const memoryMb = (process.memoryUsage().heapUsed - startMemory) / 1024 / 1024;
const bytes = new Uint8Array(buffer);
if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new Error("Generated file is not a valid OpenXML ZIP container.");
if (seconds > 120) throw new Error(`50,000-row export exceeded the 120-second performance budget (${seconds.toFixed(2)}s).`);
console.log(JSON.stringify({ rows: rowCount, seconds: Number(seconds.toFixed(2)), outputMb: Number((bytes.byteLength / 1024 / 1024).toFixed(2)), heapDeltaMb: Number(memoryMb.toFixed(1)), uiThread: "background Web Worker in production" }));
