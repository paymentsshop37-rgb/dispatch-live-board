const label = (value) => String(value ?? "").trim();

export const paymentReportPeriods = ["Today", "This Week", "Last Week", "This Month", "Last Month", "Last 30 Days", "Last 90 Days", "This Year", "Custom Range", "All Time"];

const localDate = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export function paymentReportDateRange(mode, customRange = {}, now = new Date()) {
  const today = localDate(now);
  const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
  if (mode === "All Time") return null;
  if (mode === "Today") return { from: today, to: today };
  if (mode === "This Week") return { from: localDate(startOfWeek), to: localDate(new Date(startOfWeek.getFullYear(), startOfWeek.getMonth(), startOfWeek.getDate() + 6)) };
  if (mode === "Last Week") return { from: localDate(new Date(startOfWeek.getFullYear(), startOfWeek.getMonth(), startOfWeek.getDate() - 7)), to: localDate(new Date(startOfWeek.getFullYear(), startOfWeek.getMonth(), startOfWeek.getDate() - 1)) };
  if (mode === "This Month") return { from: `${today.slice(0, 7)}-01`, to: today };
  if (mode === "Last Month") return { from: localDate(new Date(now.getFullYear(), now.getMonth() - 1, 1)), to: localDate(new Date(now.getFullYear(), now.getMonth(), 0)) };
  if (mode === "Last 30 Days" || mode === "Last 90 Days") {
    const days = mode === "Last 30 Days" ? 30 : 90;
    return { from: localDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - days + 1)), to: today };
  }
  if (mode === "This Year") return { from: `${now.getFullYear()}-01-01`, to: today };
  return { from: customRange.from || "1900-01-01", to: customRange.to || "2999-12-31" };
}

export function filterPaymentReportJobs(jobs, mode, customRange = {}, now = new Date()) {
  const range = paymentReportDateRange(mode, customRange, now);
  if (!range) return jobs;
  return jobs.filter((job) => {
    const date = label(job.date).slice(0, 10);
    return date && date >= range.from && date <= range.to;
  });
}

export function buildPaymentMethodsReport(jobs = [], { paidOnly = true } = {}) {
  const groups = new Map();
  const totals = { a: 0, b: 0, unassigned: 0, total: 0 };

  for (const job of jobs) {
    if (paidOnly && label(job.invoiceStatus).toLowerCase() !== "paid") continue;

    const rawMethod = label(job.paymentMethod);
    const method = rawMethod || "No registrado";
    const key = method.toLocaleLowerCase("en-US");
    if (!groups.has(key)) groups.set(key, { method, a: 0, b: 0, unassigned: 0, total: 0 });

    const group = groups.get(key);
    const receiver = label(job.paymentReceiver).toUpperCase();
    const column = receiver === "A" ? "a" : receiver === "B" ? "b" : "unassigned";
    group[column] += 1;
    group.total += 1;
    totals[column] += 1;
    totals.total += 1;
  }

  return {
    rows: [...groups.values()].sort((a, b) => a.method.localeCompare(b.method)),
    totals,
  };
}
