import { coverageStatusBucket } from "../coverage/serviceAreaAssignment.js";

const nameKey = value => String(value || "").trim().replace(/\s+/g, " ").toUpperCase();
export function dispatcherNames(value) {
  const names = [...new Set(String(value || "").split(/[\/&+]/).map(nameKey).filter(Boolean))].sort();
  return names.length ? names : ["UNASSIGNED"];
}
export const dispatcherName = job => dispatcherNames(job.dispatcher).join(" / ");
export const jobCredit = job => job.dispatcherAllocation?.weight ?? 1;
const uniqueJobs = jobs => [...new Map(jobs.map(job => [job.id ?? job.raw ?? job, job])).values()];
export const cancelledDispatcherJobs = jobs => uniqueJobs(jobs.filter(job => coverageStatusBucket(job.status) === "cancelled"));

// Split cents deterministically; a one-cent remainder goes in name order.
function splitAmount(value, count, index) {
  const amount = sourceAmount(value);
  if (amount === null) return null;
  const cents = Math.round(amount * 100), base = Math.trunc(cents / count), remainder = cents - base * count;
  return (base + (index < Math.abs(remainder) ? Math.sign(remainder) : 0)) / 100;
}
export function dispatcherAmount(job, field) {
  return job.dispatcherAllocation ? job.dispatcherAllocation.amounts[field] : sourceAmount(job.raw?.[field]);
}
export function fullDispatcherJobProfit(job) {
  return isMeasuredDispatcherJob(job) ? Number(job.raw.total_bill) - Number(job.raw.parts) - Number(job.raw.tech_labor) : null;
}
export function sourceAmount(value) {
  return value !== null && value !== undefined && String(value).trim() !== "" && Number.isFinite(Number(value)) ? Number(value) : null;
}
export function isMeasuredDispatcherJob(job) {
  return coverageStatusBucket(job.status) === "completed"
    && [job.raw?.total_bill, job.raw?.parts, job.raw?.tech_labor].every(value => sourceAmount(value) !== null);
}
export function dispatcherJobProfit(job) {
  return isMeasuredDispatcherJob(job) ? dispatcherAmount(job, "total_bill") - dispatcherAmount(job, "parts") - dispatcherAmount(job, "tech_labor") : null;
}
export function dispatcherMetrics(jobs = []) {
  const measuredJobs = jobs.filter(isMeasuredDispatcherJob);
  const credits = rows => rows.reduce((total, job) => total + jobCredit(job), 0);
  const sum = field => measuredJobs.reduce((total, job) => total + dispatcherAmount(job, field), 0);
  const billed = sum("total_bill"), parts = sum("parts"), labor = sum("tech_labor");
  const profit = billed - parts - labor;
  const total = credits(jobs), measured = credits(measuredJobs);
  const completed = credits(jobs.filter(job => coverageStatusBucket(job.status) === "completed"));
  const cancelled = credits(jobs.filter(job => coverageStatusBucket(job.status) === "cancelled"));
  const dryRuns = credits(jobs.filter(job => coverageStatusBucket(job.status) === "dryRuns"));
  const participated = uniqueJobs(jobs).length, measuredParticipations = measuredJobs.length;
  return {
    total, participated, measuredParticipations, sharedParticipations: uniqueJobs(jobs.filter(job => dispatcherNames(job.dispatcher).length > 1)).length,
    completed, cancelled, dryRuns, cancelledParticipations: cancelledDispatcherJobs(jobs).length,
    other: total - completed - cancelled - dryRuns,
    measured, missing: Math.max(0, completed - measured),
    billed, parts, labor, expenses: parts + labor, profit,
    margin: billed > 0 ? profit / billed * 100 : null,
    averageProfit: measured ? profit / measured : null,
    profitPerParticipation: measuredParticipations ? profit / measuredParticipations : null,
    averageBill: measured ? billed / measured : null,
    completionRate: total ? completed / total * 100 : null,
    cancellationRate: total ? cancelled / total * 100 : null,
    financialCoverage: completed ? measured / completed * 100 : null,
    losses: credits(measuredJobs.filter(job => fullDispatcherJobProfit(job) < 0)),
    customers: new Set(jobs.map(job => nameKey(job.company)).filter(Boolean)).size,
    cities: new Set(jobs.filter(job => job.city && job.state).map(job => `${nameKey(job.city)}|${nameKey(job.state)}`)).size,
  };
}
export function buildDispatcherPerformance(jobs = [], previousJobs = [], { mode = "team" } = {}) {
  const groups = new Map();
  function assign(job, period) {
    const members = dispatcherNames(job.dispatcher);
    const names = mode === "individual" ? members : [members.join(" / ")];
    names.forEach((name, index) => {
      if (!groups.has(name)) groups.set(name, { name, mode, jobs: [], previousJobs: [] });
      const contribution = mode === "individual" ? { ...job, dispatcherAllocation: {
        weight: 1 / members.length, members, index,
        amounts: Object.fromEntries(["total_bill", "parts", "tech_labor"].map(field => [field, splitAmount(job.raw?.[field], members.length, index)])),
      } } : job;
      groups.get(name)[period].push(contribution);
    });
  }
  jobs.forEach(job => assign(job, "jobs"));
  previousJobs.forEach(job => assign(job, "previousJobs"));
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
  const headers = ["Dispatcher", "From", "To", "Job credits", "Completed credits", "Cancelled credits", "Dry run credits", "Completion %", "Cancellation %", "Measured completed credits", "Missing financial credits", "Billed USD", "Parts USD", "Technician labor USD", "Estimated profit USD", "Margin %", "Profit per measured credit USD", "Loss job credits", "Customers", "Cities", "Previous job credits", "Previous measured completed credits", "Previous profit USD", "Profit change USD", "Margin change pp", "View", "Jobs participated", "Shared jobs participated", "Measured participations", "Profit per measured participation USD"];
  const value = number => number === null || number === undefined ? "No data" : Number(number).toFixed(2);
  const amounts = row => row.measured ? [value(row.billed), value(row.parts), value(row.labor), value(row.profit)] : ["No data", "No data", "No data", "No data"];
  const body = rows.map(row => [row.name, range.from, range.to, row.total, row.completed, row.cancelled, row.dryRuns, value(row.completionRate), value(row.cancellationRate), row.measured, row.missing, ...amounts(row), value(row.margin), value(row.averageProfit), row.losses, row.customers, row.cities, row.previous.total, row.previous.measured, row.previous.measured ? value(row.previous.profit) : "No data", value(row.profitChange), value(row.marginChange)]);
  const total = dispatcherSummary(rows);
  body.push(["FILTERED TOTAL", range.from, range.to, total.total, total.completed, total.cancelled, total.dryRuns, value(total.completionRate), value(total.cancellationRate), total.measured, total.missing, ...amounts(total), value(total.margin), value(total.averageProfit), total.losses, total.customers, total.cities, total.previous.total, total.previous.measured, total.previous.measured ? value(total.previous.profit) : "No data", value(total.profitChange), total.margin !== null && total.previous.margin !== null ? value(total.margin - total.previous.margin) : "No data"]);
  headers.push("Cancelled jobs involved");
  rows.forEach((row, index) => body[index].push(row.mode || "team", row.participated, row.sharedParticipations, row.measuredParticipations, value(row.profitPerParticipation), row.cancelledParticipations));
  body.at(-1).push(rows[0]?.mode || "team", total.participated, total.sharedParticipations, total.measuredParticipations, value(total.profitPerParticipation), total.cancelledParticipations);
  return [headers, ...body];
}
