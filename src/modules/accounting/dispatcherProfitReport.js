import { estimatedProfit, numberValue, isCancelled } from "./accountingData.js";

export function buildDispatcherProfitReport(jobs = []) {
  const groups = new Map();
  for (const job of jobs) {
    const name = String(job.dispatcher || "").trim() || "Unassigned";
    const key = name.toLocaleLowerCase("en-US");
    if (!groups.has(key)) groups.set(key, { name, jobs: [] });
    groups.get(key).jobs.push(job);
  }
  const headers = ["Dispatcher", "Date / Total", "Invoice #", "Company", "Status", "Total Bill", "Parts", "Tech Labor", "Estimated Profit"];
  const rows = [], summary = [];
  const total = ["TOTAL", 0, 0, 0, 0, 0];
  for (const group of [...groups.values()].sort((a,b) => a.name.localeCompare(b.name))) {
    const sums = [group.name, group.jobs.length, 0, 0, 0, 0];
    for (const job of group.jobs.sort((a,b) => String(a.date).localeCompare(String(b.date)) || String(a.invoiceNumber).localeCompare(String(b.invoiceNumber)))) {
      const amounts = [numberValue(job.totalBill), numberValue(job.parts), numberValue(job.techLabor), estimatedProfit(job)];
      amounts.forEach((v,i) => sums[i+2] += v);
      rows.push([group.name, job.date, job.invoiceNumber, job.company, job.status, ...amounts]);
    }
    summary.push(sums);
    rows.push([group.name, "Subtotal", "", sums[1] + " jobs", "", ...sums.slice(2)]);
    for (let i=1; i<total.length; i++) total[i] += sums[i];
  }
  rows.push(["TOTAL", "", "", total[1] + " jobs", "", ...total.slice(2)]);
  return { headers, rows, summaryHeaders: ["Dispatcher", "Jobs", "Total Bill", "Parts", "Tech Labor", "Estimated Profit"], summary: [...summary, total] };
}

export function dispatcherStatistics(jobs = []) {
  const report = buildDispatcherProfitReport(jobs);
  const cancellations = new Map();
  for (const job of jobs) {
    if (!isCancelled(job)) continue;
    const key = (String(job.dispatcher || "").trim() || "Unassigned").toLocaleLowerCase("en-US");
    cancellations.set(key, (cancellations.get(key) || 0) + 1);
  }
  const convert = ([name, count, billed, parts, labor, profit], cancelled) => ({
    cancelled, cancellationRate: count ? cancelled / count : 0,
    name, count, billed, parts, labor, profit, expenses: parts + labor,
    margin: billed ? profit / billed : null,
    averageProfit: count ? profit / count : 0,
    averageBill: count ? billed / count : 0,
  });
  return { people: report.summary.slice(0, -1).map(row => convert(row, cancellations.get(row[0].toLocaleLowerCase("en-US")) || 0)), total: convert(report.summary.at(-1), jobs.filter(isCancelled).length) };
}
