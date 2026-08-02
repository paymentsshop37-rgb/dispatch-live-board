const CANCELLED_STATUSES = new Set(["cancelled", "canceled"]);
const OPEN_INVOICE_STATUSES = new Set(["pending", "sent", "need review", ""]);

export const REPORT_VERSION = "2.0";

export function numberValue(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function normalizedText(value) {
  return String(value ?? "").trim();
}

export function normalizedStatus(value) {
  return normalizedText(value).toLowerCase();
}

export function jobProfit(job) {
  return numberValue(job?.totalBill) - numberValue(job?.parts) - numberValue(job?.techLabor);
}

export function isCancelled(job) {
  return CANCELLED_STATUSES.has(normalizedStatus(job?.status));
}

export function isInvoiceOpen(job) {
  return OPEN_INVOICE_STATUSES.has(normalizedStatus(job?.invoice));
}

export function isTechPaymentPending(job) {
  return normalizedStatus(job?.techPaymentStatus) === "pending";
}

export function aggregateBy(jobs, key) {
  const groups = new Map();
  for (const job of jobs) {
    const name = normalizedText(job?.[key]) || "Unassigned";
    const current = groups.get(name) || {
      name, jobs: 0, completed: 0, cancelled: 0, dryRuns: 0, revenue: 0, techLabor: 0, profit: 0,
    };
    current.jobs += 1;
    current.completed += normalizedStatus(job.status) === "completed" ? 1 : 0;
    current.cancelled += isCancelled(job) ? 1 : 0;
    current.dryRuns += normalizedStatus(job.status) === "dry run" ? 1 : 0;
    current.revenue += numberValue(job.totalBill);
    current.techLabor += numberValue(job.techLabor);
    current.profit += jobProfit(job);
    groups.set(name, current);
  }
  return [...groups.values()].sort((a, b) => b.jobs - a.jobs || b.revenue - a.revenue || a.name.localeCompare(b.name));
}

export function buildReportData(jobs = [], { generatedAt = new Date() } = {}) {
  const rows = Array.isArray(jobs) ? jobs : [];
  const revenue = rows.reduce((sum, job) => sum + numberValue(job.totalBill), 0);
  const parts = rows.reduce((sum, job) => sum + numberValue(job.parts), 0);
  const techLabor = rows.reduce((sum, job) => sum + numberValue(job.techLabor), 0);
  const completed = rows.filter((job) => normalizedStatus(job.status) === "completed").length;
  const cancelled = rows.filter(isCancelled).length;
  const pending = rows.filter((job) => ["new", "pending"].includes(normalizedStatus(job.status))).length;
  const dryRuns = rows.filter((job) => normalizedStatus(job.status) === "dry run").length;
  const openInvoices = rows.filter(isInvoiceOpen);
  const techPaymentsPending = rows.filter(isTechPaymentPending);
  const internalControls = rows.filter((job) => normalizedStatus(job.internalControlColor) === "red");
  const dispatchers = aggregateBy(rows, "dispatch");
  const technicians = aggregateBy(rows, "tech");
  const customers = aggregateBy(rows, "company");
  const cities = aggregateBy(rows, "city");
  const profit = revenue - parts - techLabor;
  const averageInvoice = rows.length ? revenue / rows.length : 0;
  const averageProfit = rows.length ? profit / rows.length : 0;

  const summary = {
    totalJobs: rows.length,
    completed,
    cancelled,
    pending,
    dryRuns,
    revenue,
    parts,
    techLabor,
    profit,
    averageInvoice,
    averageProfit,
    customersPendingPayment: new Set(openInvoices.map((job) => normalizedText(job.company)).filter(Boolean)).size,
    techPaymentsPending: techPaymentsPending.length,
    outstandingInvoices: openInvoices.length,
    outstandingRevenue: openInvoices.reduce((sum, job) => sum + numberValue(job.totalBill), 0),
    internalControlFlags: internalControls.length,
    citiesCovered: new Set(rows.map((job) => normalizedText(job.city)).filter(Boolean)).size,
    topDispatcher: dispatchers[0]?.name || "-",
    topTechnician: technicians[0]?.name || "-",
    topCustomer: customers[0]?.name || "-",
    topCity: cities[0]?.name || "-",
  };

  const invoiceValues = rows.map((job) => numberValue(job.totalBill));
  const invoicesByStatus = ["Sent", "Pending", "Paid", "Cancelled"].map((status) => {
    const matches = rows.filter((job) => normalizedStatus(job.invoice) === status.toLowerCase());
    return { status, jobs: matches.length, total: matches.reduce((sum, job) => sum + numberValue(job.totalBill), 0), rows: matches };
  });

  return {
    jobs: rows,
    generatedAt,
    summary,
    financial: {
      revenue, parts, techLabor, profit, averageInvoice, averageProfit,
      highestInvoice: invoiceValues.length ? Math.max(...invoiceValues) : 0,
      lowestInvoice: invoiceValues.length ? Math.min(...invoiceValues) : 0,
      totalCustomers: new Set(rows.map((job) => normalizedText(job.company)).filter(Boolean)).size,
      openInvoices: openInvoices.length,
      outstandingRevenue: summary.outstandingRevenue,
      topInvoices: [...rows].sort((a, b) => numberValue(b.totalBill) - numberValue(a.totalBill)).slice(0, 20),
    },
    technicians: technicians.map((row, index) => ({ ...row, completionRate: row.jobs ? row.completed / row.jobs : 0, ranking: index + 1 })),
    techPaymentsPending,
    invoicesByStatus,
    internalControls,
    cities,
    dispatchers: dispatchers.map((row) => ({ ...row, averageJob: row.jobs ? row.revenue / row.jobs : 0 })),
    openInvoices,
  };
}

export function daysPending(job, generatedAt = new Date()) {
  const created = new Date(job?.date || job?.createdAt || "");
  if (Number.isNaN(created.getTime())) return 0;
  return Math.max(0, Math.floor((generatedAt.getTime() - created.getTime()) / 86400000));
}

export function databaseColumns(jobs) {
  const preferred = [
    "id", "display_number", "job_date", "job_time", "reference_number", "invoice_number", "dispatch", "company", "tech",
    "location", "job_city", "job_state", "status", "row_flag", "internal_control_color", "invoice_status", "payment_method",
    "received", "updates", "total_bill", "parts", "tech_labor", "tech_payment_status", "tech_payment_method",
    "tech_payment_paid_at", "tech_payment_paid_by", "tech_payment_reference", "tech_payment_notes", "created_at", "updated_at",
  ];
  const keys = new Set();
  for (const job of jobs) Object.keys(job?.raw || {}).forEach((key) => keys.add(key));
  const extras = [...keys].filter((key) => !preferred.includes(key)).sort();
  return [...preferred.filter((key) => keys.has(key)), ...extras];
}

export function safeCellValue(value) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date || ["string", "number", "boolean"].includes(typeof value)) return value;
  return JSON.stringify(value);
}
