const DAY_MS = 86400000;
export const ACCOUNTING_DATE_PRESETS = ["Today", "This Week", "Last Week", "This Month", "Last Month", "Last 30 Days", "Last 90 Days", "This Year", "Last Year", "Custom Range", "All Time"];
export const INVOICE_STATUSES = ["Sent", "Pending", "Paid", "Cancelled"];
export const TECH_PAYMENT_STATUSES = ["Pending", "Paid", "Cancelled"];
export const OUTSTANDING_DATE_PRESETS = ["Today", "This Week", "Last Week", "This Month", "Last Month", "Last 30 Days", "Last 90 Days", "This Year", "Custom Range"];

export function numberValue(value) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
export function textValue(value) { return String(value ?? "").trim(); }
export function lower(value) { return textValue(value).toLowerCase(); }
export function isCompleted(job) { return lower(job.status) === "completed"; }
export function isCancelled(job) { return ["cancelled", "canceled"].includes(lower(job.status)); }
export function isDryRun(job) { return lower(job.status) === "dry run"; }
export function isOpenInvoice(job) { return ["pending", "sent"].includes(lower(job.invoiceStatus)); }
export function isPendingTechPayment(job) { return lower(job.techPaymentStatus) === "pending"; }
export function estimatedProfit(job) { return numberValue(job.totalBill) - numberValue(job.parts) - numberValue(job.techLabor); }
export function profitMargin(job) { const total = numberValue(job.totalBill); return total ? estimatedProfit(job) / total : 0; }

export function normalizeAccountingJob(row) {
  return {
    raw: row, id: row.id, jobNumber: row.display_number || row.job_number || textValue(row.id).slice(0, 8).toUpperCase(),
    date: row.job_date || "", time: row.job_time || "", invoiceNumber: row.invoice_number || "", referenceNumber: row.reference_number || "",
    company: row.company || "", dispatcher: row.dispatch || "", technician: row.tech || "", technicianId: row.technician_id || null,
    location: row.location || "", city: row.job_city || "", state: row.job_state || "", serviceAreaId: row.service_area_id || null,
    status: row.status || "", invoiceStatus: row.invoice_status || "", paymentMethod: row.payment_method || "",
    techPaymentStatus: row.tech_payment_status || "", techPaymentPaidAt: row.tech_payment_paid_at || row.tech_paid_date || null,
    techPaymentPaidBy: row.tech_payment_paid_by || row.tech_paid_by || null, internalControlColor: row.internal_control_color || "none",
    invoiceDate: row.invoice_date || null, invoiceDueDate: row.invoice_due_date || null, paymentTermsDays: row.payment_terms_days ?? null,
    customerPaymentStatus: row.customer_payment_status || null, totalBill: numberValue(row.total_bill), parts: numberValue(row.parts),
    techLabor: numberValue(row.tech_labor), updates: row.updates || "", createdAt: row.created_at || null, updatedAt: row.updated_at || null,
  };
}

export function accountingDateRange(preset, custom = {}, nowValue = new Date()) {
  if (preset === "All Time") return null;
  if (preset === "Custom Range") return custom.from || custom.to ? { from: custom.from || null, to: custom.to || null } : null;
  const now = startOfDay(nowValue);
  let from = new Date(now); let to = new Date(now);
  if (preset === "Today") {}
  else if (preset === "This Week") { from.setDate(now.getDate() - now.getDay()); to = new Date(from); to.setDate(from.getDate() + 6); }
  else if (preset === "Last Week") { from.setDate(now.getDate() - now.getDay() - 7); to = new Date(from); to.setDate(from.getDate() + 6); }
  else if (preset === "This Month") { from = new Date(now.getFullYear(), now.getMonth(), 1); to = new Date(now.getFullYear(), now.getMonth() + 1, 0); }
  else if (preset === "Last Month") { from = new Date(now.getFullYear(), now.getMonth() - 1, 1); to = new Date(now.getFullYear(), now.getMonth(), 0); }
  else if (preset === "Last 30 Days") from.setDate(now.getDate() - 29);
  else if (preset === "Last 90 Days") from.setDate(now.getDate() - 89);
  else if (preset === "This Year") { from = new Date(now.getFullYear(), 0, 1); to = new Date(now.getFullYear(), 11, 31); }
  else if (preset === "Last Year") { from = new Date(now.getFullYear() - 1, 0, 1); to = new Date(now.getFullYear() - 1, 11, 31); }
  return { from: dateKey(from), to: dateKey(to) };
}

export function buildAccountingModel(jobs, paymentSummaries = [], now = new Date()) {
  const summaryByJob = new Map(paymentSummaries.map((row) => [row.job_id, row]));
  const receivables = jobs.map((job) => buildReceivable(job, summaryByJob.get(job.id), now));
  const totalBilled = sum(jobs, "totalBill"); const partsExpense = sum(jobs, "parts"); const techLaborExpense = sum(jobs, "techLabor");
  const techDueJobs = jobs.filter(isPendingTechPayment); const redJobs = jobs.filter((job) => lower(job.internalControlColor) === "red");
  const kpis = {
    totalBilled, partsExpense, techLaborExpense, estimatedProfit: totalBilled - partsExpense - techLaborExpense,
    totalJobs: jobs.length, completedJobs: jobs.filter(isCompleted).length, cancelledJobs: jobs.filter(isCancelled).length,
    dryRuns: jobs.filter(isDryRun).length, techPaymentsDue: sum(techDueJobs, "techLabor"), pendingTechPaymentJobs: techDueJobs.length,
    redInternalControlJobs: redJobs.length, openCustomerInvoices: jobs.filter(isOpenInvoice).length,
  };
  const activeReceivables = receivables.filter((row) => row.balanceDue > 0 && row.paymentStatus !== "Cancelled");
  const aging = activeReceivables.reduce((acc, row) => { acc[row.agingBucket] = (acc[row.agingBucket] || 0) + row.balanceDue; return acc; }, {});
  return {
    jobs, kpis, receivables, techDueJobs, redJobs,
    accountsReceivable: activeReceivables.reduce((sumValue, row) => sumValue + row.balanceDue, 0),
    aging, partialInvoices: receivables.filter((row) => row.paymentStatus === "Partially Paid").length,
    unpaidInvoices: receivables.filter((row) => row.paymentStatus === "Unpaid").length,
    statusBreakdown: countBy(jobs, (job) => job.status || "Unknown"), invoiceBreakdown: countBy(jobs, (job) => job.invoiceStatus || "Unknown"),
    topCustomers: aggregatePerformance(jobs, "company"), topTechnicians: aggregatePerformance(jobs, "technician"),
    topCities: aggregatePerformance(jobs, "city"), topDispatchers: aggregatePerformance(jobs, "dispatcher"),
    warnings: buildWarnings(jobs, receivables, now),
  };
}

export function buildProfitReconciliation(jobs) {
  const totalBilled = sum(jobs, "totalBill");
  const totalParts = sum(jobs, "parts");
  const totalTechLabor = sum(jobs, "techLabor");
  return {
    rows: jobs,
    totalBilled,
    totalParts,
    totalTechLabor,
    estimatedProfit: totalBilled - totalParts - totalTechLabor,
    jobsIncluded: jobs.length,
    negativeProfitJobs: jobs.filter((job) => estimatedProfit(job) < 0).length,
    missingPartsJobs: jobs.filter((job) => isMissingSourceValue(job.raw?.parts)).length,
    missingTechLaborJobs: jobs.filter((job) => isMissingSourceValue(job.raw?.tech_labor)).length,
  };
}

export function buildOutstandingSentInvoices(jobs, paymentSummaries = [], now = new Date()) {
  const summaryByJob = new Map(paymentSummaries.map((row) => [row.job_id, row]));
  const rows = jobs
    .map((job) => {
      const receivable = buildReceivable(job, summaryByJob.get(job.id), now);
      const outstandingFrom = job.invoiceDate || job.date || job.createdAt;
      return { ...receivable, daysOutstanding: outstandingFrom ? Math.max(0, daysBetween(outstandingFrom, now)) : null };
    })
    .filter((row) => lower(row.invoiceStatus) === "sent"
      && lower(row.customerPaymentStatus) !== "paid"
      && !["paid", "overpaid", "cancelled"].includes(lower(row.paymentStatus))
      && row.balanceDue > 0)
    .sort((a, b) => (b.daysOutstanding ?? -1) - (a.daysOutstanding ?? -1) || textValue(a.invoiceNumber).localeCompare(textValue(b.invoiceNumber)));
  return summarizeOutstandingInvoices(rows);
}

export function filterOutstandingInvoices(rows, preset, custom = {}, now = new Date()) {
  if (!preset || preset === "All Outstanding") return rows;
  const range = accountingDateRange(preset, custom, now);
  if (!range) return rows;
  return rows.filter((row) => (!range.from || row.date >= range.from) && (!range.to || row.date <= range.to));
}

export function summarizeOutstandingInvoices(rows) {
  const totalOutstanding = rows.reduce((total, row) => total + numberValue(row.balanceDue), 0);
  const trackedDays = rows.map((row) => row.daysOutstanding).filter((value) => value !== null && value !== undefined);
  return {
    rows,
    invoiceCount: rows.length,
    totalOutstanding,
    averageInvoice: rows.length ? totalOutstanding / rows.length : 0,
    oldestOutstanding: trackedDays.length ? Math.max(...trackedDays) : null,
    averageDaysOutstanding: trackedDays.length ? trackedDays.reduce((total, value) => total + value, 0) / trackedDays.length : null,
  };
}

export function rankOutstandingCustomers(rows, limit = 10) {
  const groups = new Map();
  for (const row of rows) {
    const company = textValue(row.company) || "Unassigned";
    const current = groups.get(company) || { company, amount: 0, invoiceCount: 0, oldestDays: null, oldestInvoice: "" };
    current.amount += numberValue(row.balanceDue);
    current.invoiceCount += 1;
    if (row.daysOutstanding != null && (current.oldestDays == null || row.daysOutstanding > current.oldestDays)) {
      current.oldestDays = row.daysOutstanding;
      current.oldestInvoice = row.invoiceNumber || "-";
    }
    groups.set(company, current);
  }
  return [...groups.values()].sort((a, b) => b.amount - a.amount || b.invoiceCount - a.invoiceCount || a.company.localeCompare(b.company)).slice(0, limit);
}

export function oldestOutstandingInvoices(rows, limit = 10) { return [...rows].sort((a, b) => (b.daysOutstanding ?? -1) - (a.daysOutstanding ?? -1)).slice(0, limit); }
export function largestOutstandingInvoices(rows, limit = 10) { return [...rows].sort((a, b) => numberValue(b.balanceDue) - numberValue(a.balanceDue)).slice(0, limit); }

export function buildReceivable(job, paymentSummary = {}, now = new Date()) {
  const amountPaid = numberValue(paymentSummary?.amount_paid);
  const rawBalance = numberValue(job.totalBill) - amountPaid;
  const balanceDue = Math.max(rawBalance, 0);
  const cancelled = lower(job.invoiceStatus) === "cancelled";
  const paymentStatus = cancelled ? "Cancelled" : amountPaid > numberValue(job.totalBill) ? "Overpaid" : amountPaid >= numberValue(job.totalBill) && numberValue(job.totalBill) > 0 ? "Paid" : amountPaid > 0 ? "Partially Paid" : "Unpaid";
  const dueDate = job.invoiceDueDate || null;
  const daysOutstanding = dueDate ? Math.max(0, daysBetween(dueDate, now)) : null;
  return { ...job, amountPaid, balanceDue, paymentStatus, lastPaymentDate: paymentSummary?.last_payment_date || null, paymentCount: numberValue(paymentSummary?.payment_count), daysOutstanding, agingBucket: agingBucket(daysOutstanding, dueDate), dueDateLabel: dueDate || "DUE DATE NOT SET" };
}

export function agingBucket(days, dueDate) {
  if (!dueDate || days === null) return "Due Date Not Set";
  if (days <= 0) return "Current";
  if (days <= 30) return "1-30 Days";
  if (days <= 60) return "31-60 Days";
  if (days <= 90) return "61-90 Days";
  return "91+ Days";
}

export function buildWarnings(jobs, receivables, now = new Date(), redThreshold = 7) {
  const duplicateInvoices = countBy(jobs.filter((job) => job.invoiceNumber), (job) => job.invoiceNumber);
  const warnings = [];
  for (const row of receivables) {
    if (lower(row.invoiceStatus) === "paid" && row.amountPaid === 0) warnings.push(warning("Invoice marked Paid but no payment transaction exists", row));
    if (row.amountPaid > row.totalBill) warnings.push(warning("Payment transactions exceed Total Bill", row));
    if (!row.invoiceDueDate && !["cancelled"].includes(lower(row.invoiceStatus))) warnings.push(warning("Invoice due date missing", row));
  }
  for (const job of jobs) {
    if (isPendingTechPayment(job) && job.techLabor === 0) warnings.push(warning("Pending technician payment with Tech Labor = 0", job));
    if (isCompleted(job) && !job.invoiceNumber) warnings.push(warning("Completed job with no Invoice #", job));
    if (lower(job.techPaymentStatus) === "paid" && !job.techPaymentPaidAt) warnings.push(warning("Paid technician payment with no paid date", job));
    if (estimatedProfit(job) < 0) warnings.push(warning("Negative Estimated Profit", job));
    if (!job.referenceNumber) warnings.push(warning("Missing Reference #", job));
    if (job.invoiceNumber && duplicateInvoices[job.invoiceNumber] > 1) warnings.push(warning("Duplicate invoice number", job));
    if (lower(job.internalControlColor) === "red" && daysBetween(job.updatedAt || job.createdAt || job.date, now) > redThreshold) warnings.push(warning("Red internal-control job exceeds review threshold", job));
  }
  return warnings;
}

export function detailRowsForKpi(model, key) {
  if (key === "totalBilled" || key === "partsExpense" || key === "techLaborExpense" || key === "estimatedProfit" || key === "totalJobs") return model.jobs;
  if (key === "completedJobs") return model.jobs.filter(isCompleted);
  if (key === "cancelledJobs") return model.jobs.filter(isCancelled);
  if (key === "dryRuns") return model.jobs.filter(isDryRun);
  if (["techPaymentsDue", "pendingTechPaymentJobs"].includes(key)) return model.techDueJobs;
  if (key === "redInternalControlJobs") return model.redJobs;
  if (key === "openCustomerInvoices") return model.jobs.filter(isOpenInvoice);
  return [];
}

export function aggregatePerformance(jobs, key) {
  const groups = new Map();
  for (const job of jobs) { const name = textValue(job[key]) || "Unassigned"; const row = groups.get(name) || { name, jobs: 0, billed: 0, parts: 0, techLabor: 0, estimatedProfit: 0 }; row.jobs += 1; row.billed += job.totalBill; row.parts += job.parts; row.techLabor += job.techLabor; row.estimatedProfit += estimatedProfit(job); groups.set(name, row); }
  return [...groups.values()].sort((a, b) => b.billed - a.billed || b.jobs - a.jobs || a.name.localeCompare(b.name));
}

function warning(type, job) { return { type, jobId: job.id, invoiceNumber: job.invoiceNumber, referenceNumber: job.referenceNumber, company: job.company }; }
function isMissingSourceValue(value) { return value === null || value === undefined || textValue(value) === ""; }
function countBy(rows, picker) { return rows.reduce((acc, row) => { const key = picker(row); acc[key] = (acc[key] || 0) + 1; return acc; }, {}); }
function sum(rows, key) { return rows.reduce((total, row) => total + numberValue(row[key]), 0); }
function daysBetween(from, to) { const date = new Date(String(from).length === 10 ? `${from}T00:00:00` : from); if (Number.isNaN(date.getTime())) return 0; return Math.floor((startOfDay(to) - startOfDay(date)) / DAY_MS); }
function startOfDay(value) { const date = new Date(value); date.setHours(0,0,0,0); return date; }
function dateKey(value) { const date = new Date(value); const offset = date.getTimezoneOffset() * 60000; return new Date(date.getTime() - offset).toISOString().slice(0,10); }
