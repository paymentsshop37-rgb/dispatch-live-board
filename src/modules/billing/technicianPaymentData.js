export function isPendingPayment(row) {
  return String(row?.tech_payment_status || "").trim().toLowerCase() === "pending";
}

export function normalizeTechnicianPayment(row, now = new Date()) {
  const date = dateOnly(row.job_date || row.date || row.created_at);
  const pendingDate = safeDate(date || row.created_at, now);
  const rawLabor = row.tech_labor;
  return {
    id: row.id,
    jobNumber: row.display_number || row.job_number || shortId(row.id),
    date,
    time: row.job_time || row.time || timeOnly(row.created_at),
    invoiceNumber: row.invoice_number || row.invoice || "",
    referenceNumber: row.reference_number || row.reference || "",
    company: row.company || row.company_name || "Unknown Company",
    technician: String(row.tech || row.technician || row.technician_name || "Unassigned").trim() || "Unassigned",
    location: row.location || "",
    jobStatus: row.status || row.job_status || "",
    amount: finiteNumber(rawLabor),
    missingLabor: rawLabor === null || rawLabor === undefined || String(rawLabor).trim() === "" || finiteNumber(rawLabor) === 0,
    techPaymentStatus: row.tech_payment_status || "",
    daysPending: daysBetween(pendingDate, now),
    dispatcher: row.dispatch || row.dispatcher || row.dispatcher_name || "",
    updates: row.updates || row.notes || "",
  };
}

export function oldestPaymentFirst(a, b) {
  return b.daysPending - a.daysPending || String(a.date).localeCompare(String(b.date));
}

export function groupPaymentsByTechnician(jobs) {
  return [...jobs.reduce((map, job) => {
    const list = map.get(job.technician) || [];
    list.push(job);
    map.set(job.technician, list);
    return map;
  }, new Map())].map(([technician, rows]) => {
    const totalAmount = rows.reduce((sum, row) => sum + row.amount, 0);
    const oldest = rows.reduce((current, row) => row.daysPending > current.daysPending ? row : current, rows[0]);
    return {
      technician,
      pendingJobs: rows.length,
      totalAmount,
      oldestPendingJob: oldest?.jobNumber || "—",
      averageAmount: rows.length ? totalAmount / rows.length : 0,
    };
  }).sort((a, b) => b.totalAmount - a.totalAmount || a.technician.localeCompare(b.technician));
}

export function summarizeTechnicianPayments(jobs) {
  const days = jobs.map((job) => job.daysPending);
  return {
    count: jobs.length,
    amount: jobs.reduce((sum, job) => sum + job.amount, 0),
    technicians: new Set(jobs.map((job) => job.technician)).size,
    missing: jobs.filter((job) => job.missingLabor).length,
    oldestDays: days.length ? Math.max(...days) : null,
    averageDays: days.length ? days.reduce((sum, value) => sum + value, 0) / days.length : 0,
    overdue: jobs.filter((job) => job.daysPending >= 8).length,
  };
}

export function paymentPresetRange(preset, custom, nowValue = new Date()) {
  const now = startOfDay(nowValue);
  if (preset === "All Pending") return null;
  if (preset === "Custom Range") return custom.from && custom.to ? { from: custom.from, to: custom.to } : null;
  let from = new Date(now);
  let to = new Date(now);
  if (preset === "This Week") {
    from.setDate(now.getDate() - now.getDay());
    to.setDate(from.getDate() + 6);
  } else if (preset === "Last Week") {
    from.setDate(now.getDate() - now.getDay() - 7);
    to = new Date(from);
    to.setDate(from.getDate() + 6);
  } else if (preset === "This Month") {
    from = new Date(now.getFullYear(), now.getMonth(), 1);
    to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  } else if (preset === "Last Month") {
    from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    to = new Date(now.getFullYear(), now.getMonth(), 0);
  } else if (preset === "Last 30 Days") from.setDate(now.getDate() - 29);
  else if (preset === "Last 90 Days") from.setDate(now.getDate() - 89);
  else if (preset === "This Year") {
    from = new Date(now.getFullYear(), 0, 1);
    to = new Date(now.getFullYear(), 11, 31);
  }
  return { from: localDateKey(from), to: localDateKey(to) };
}

function finiteNumber(value) { const number = Number(value); return Number.isFinite(number) ? number : 0; }
function safeDate(value, fallback) { const date = value ? new Date(String(value).length === 10 ? `${value}T00:00:00` : value) : new Date(fallback); return Number.isNaN(date.getTime()) ? new Date(fallback) : date; }
function daysBetween(from, to) { return Math.max(0, Math.floor((startOfDay(to) - startOfDay(from)) / 86400000)); }
function startOfDay(value) { const date = new Date(value); date.setHours(0, 0, 0, 0); return date; }
function localDateKey(value) { const date = new Date(value); const offset = date.getTimezoneOffset() * 60000; return new Date(date.getTime() - offset).toISOString().slice(0, 10); }
function dateOnly(value) { const match = String(value || "").match(/^\d{4}-\d{2}-\d{2}/); return match?.[0] || ""; }
function timeOnly(value) { const match = String(value || "").match(/T(\d{2}:\d{2})/); return match?.[1] || ""; }
function shortId(id) { return String(id || "").slice(0, 8).toUpperCase() || "—"; }
