import { coverageStatusBucket } from "../coverage/serviceAreaAssignment.js";

const nameKey = value => String(value || "").trim().replace(/\s+/g, " ").toUpperCase();
export const dispatcherName = job => nameKey(job.dispatcher) || "UNASSIGNED";
export function sourceAmount(value) {
  return value !== null && value !== undefined && String(value).trim() !== "" && Number.isFinite(Number(value)) ? Number(value) : null;
}
export function isMeasuredDispatcherJob(job) {
  return coverageStatusBucket(job.status) === "completed"
    && [job.raw?.total_bill, job.raw?.parts, job.raw?.tech_labor].every(value => sourceAmount(value) !== null);
}
export function dispatcherJobProfit(job) {
  return isMeasuredDispatcherJob(job) ? Number(job.raw.total_bill) - Number(job.raw.parts) - Number(job.raw.tech_labor) : null;
}
export function dispatcherMetrics(jobs = []) {
  const measuredJobs = jobs.filter(isMeasuredDispatcherJob);
  const sum = field => measuredJobs.reduce((total, job) => total + Number(job.raw[field]), 0);
  const billed = sum("total_bill"), parts = sum("parts"), labor = sum("tech_labor");
  const profit = billed - parts - labor;
  const completed = jobs.filter(job => coverageStatusBucket(job.status) === "completed").length;
  const cancelled = jobs.filter(job => coverageStatusBucket(job.status) === "cancelled").length;
  const dryRuns = jobs.filter(job => coverageStatusBucket(job.status) === "dryRuns").length;
  return {
    total: jobs.length, completed, cancelled, dryRuns,
    other: jobs.length - completed - cancelled - dryRuns,
    measured: measuredJobs.length, missing: completed - measuredJobs.length,
    billed, parts, labor, expenses: parts + labor, profit,
    margin: billed > 0 ? profit / billed * 100 : null,
    averageProfit: measuredJobs.length ? profit / measuredJobs.length : null,
    averageBill: measuredJobs.length ? billed / measuredJobs.length : null,
    completionRate: jobs.length ? completed / jobs.length * 100 : null,
    cancellationRate: jobs.length ? cancelled / jobs.length * 100 : null,
    financialCoverage: completed ? measuredJobs.length / completed * 100 : null,
    losses: measuredJobs.filter(job => dispatcherJobProfit(job) < 0).length,
    customers: new Set(jobs.map(job => nameKey(job.company)).filter(Boolean)).size,
    cities: new Set(jobs.filter(job => job.city && job.state).map(job => `${nameKey(job.city)}|${nameKey(job.state)}`)).size,
  };
}
export function buildDispatcherPerformance(jobs = [], previousJobs = []) {
  const groups = new Map();
  for (const job of [...jobs, ...previousJobs]) {
    const name = dispatcherName(job);
    if (!groups.has(name)) groups.set(name, { name, jobs: [], previousJobs: [] });
  }
  for (const job of jobs) groups.get(dispatcherName(job)).jobs.push(job);
  for (const job of previousJobs) groups.get(dispatcherName(job)).previousJobs.push(job);
  return [...groups.values()].map(group => {
    const current = dispatcherMetrics(group.jobs), previous = dispatcherMetrics(group.previousJobs);
    return { ...group, ...current, previous,
      profitChange: current.measured && previous.measured ? current.profit - previous.profit : null,
      marginChange: current.margin !== null && previous.margin !== null ? current.margin - previous.margin : null,
      volumeChange: previous.total ? (current.total - previous.total) / previous.total * 100 : null,
    };
  });
}
export function dispatcherSummary(rows) {
  const jobs = rows.flatMap(row => row.jobs), priorJobs = rows.flatMap(row => row.previousJobs);
  const current = dispatcherMetrics(jobs), previous = dispatcherMetrics(priorJobs);
  return { ...current, previous, dispatchers: rows.filter(row => row.total > 0 && row.name !== "UNASSIGNED").length,
    unassigned: rows.find(row => row.name === "UNASSIGNED")?.total || 0,
    profitChange: current.measured && previous.measured ? current.profit - previous.profit : null };
}
export function dispatcherExportRows(rows, range) {
  const headers = ["Dispatcher", "From", "To", "Jobs", "Completed", "Cancelled", "Dry runs", "Completion %", "Cancellation %", "Measured completed jobs", "Missing financial data", "Billed USD", "Parts USD", "Technician labor USD", "Estimated profit USD", "Margin %", "Average profit USD", "Loss-making jobs", "Customers", "Cities", "Previous jobs", "Previous measured completed jobs", "Previous profit USD", "Profit change USD", "Margin change pp"];
  const value = number => number === null || number === undefined ? "No data" : Number(number).toFixed(2);
  const amounts = row => row.measured ? [value(row.billed), value(row.parts), value(row.labor), value(row.profit)] : ["No data", "No data", "No data", "No data"];
  const body = rows.map(row => [row.name, range.from, range.to, row.total, row.completed, row.cancelled, row.dryRuns, value(row.completionRate), value(row.cancellationRate), row.measured, row.missing, ...amounts(row), value(row.margin), value(row.averageProfit), row.losses, row.customers, row.cities, row.previous.total, row.previous.measured, row.previous.measured ? value(row.previous.profit) : "No data", value(row.profitChange), value(row.marginChange)]);
  const total = dispatcherSummary(rows);
  body.push(["FILTERED TOTAL", range.from, range.to, total.total, total.completed, total.cancelled, total.dryRuns, value(total.completionRate), value(total.cancellationRate), total.measured, total.missing, ...amounts(total), value(total.margin), value(total.averageProfit), total.losses, total.customers, total.cities, total.previous.total, total.previous.measured, total.previous.measured ? value(total.previous.profit) : "No data", value(total.profitChange), total.margin !== null && total.previous.margin !== null ? value(total.margin - total.previous.margin) : "No data"]);
  return [headers, ...body];
}
