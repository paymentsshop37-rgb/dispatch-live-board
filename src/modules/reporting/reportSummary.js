import { estimatedProfit, numberValue } from "../accounting/accountingData.js";

// Pure calculations: callers supply the final report rows, never a database client.
const aliases = {
  totalBill: ["totalBill", "total_bill"], parts: ["parts"], techLabor: ["techLabor", "tech_labor"],
  status: ["jobStatus", "status"], invoiceStatus: ["invoiceStatus", "invoice_status", "invoice"],
  techPaymentStatus: ["techPaymentStatus", "tech_payment_status"],
  dispatcher: ["dispatcher", "dispatch"], technician: ["technician", "tech", "technician_name"], company: ["company", "customer"],
};
const text = value => String(value ?? "").trim();
const keys = field => aliases[field] || [field];
const present = (row, field) => keys(field).some(key => Object.hasOwn(row, key));
const read = (row, field) => keys(field).map(key => row[key]).find(value => value !== undefined && value !== null);
const sum = (rows, key) => rows.reduce((total, row) => total + numberValue(read(row, key)), 0);
export const CURRENCY_FORMAT = '$#,##0.00;[Red]($#,##0.00);$0.00';
export const formatReportMoney = value => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(numberValue(value));
export const formatReportPercent = value => `${numberValue(value).toFixed(2)}%`;

export function calculateFinancialSummary(rows) {
  const totalBill = sum(rows, "totalBill"), parts = sum(rows, "parts"), techLabor = sum(rows, "techLabor");
  // Use the existing business formula; round only when displaying/exporting.
  const profit = estimatedProfit({ totalBill, parts, techLabor });
  return { totalBill, parts, techLabor, profit, averageBill: rows.length ? totalBill / rows.length : 0,
    averageProfit: rows.length ? profit / rows.length : 0, profitMargin: totalBill ? profit / totalBill * 100 : 0 };
}

function statusName(value) {
  const key = text(value).toLowerCase().replace(/[-_]+/g, " ").replace(/\s+/g, " ");
  if (!key) return "Not recorded";
  if (key === "canceled") return "Cancelled";
  if (key === "dryrun") return "Dry Run";
  return key.replace(/\b\w/g, c => c.toUpperCase());
}
export function calculateStatusBreakdown(rows, field, expected = []) {
  const counts = new Map(expected.map(name => [name, 0]));
  for (const row of rows) { const name = statusName(read(row, field)); counts.set(name, (counts.get(name) || 0) + 1); }
  return [...counts].map(([name, count]) => ({ name, count, percentage: rows.length ? count / rows.length * 100 : 0 }));
}

function groupRows(rows, field) {
  const groups = new Map();
  for (const row of rows) {
    const name = text(read(row, field)) || "Unassigned", key = name.toLocaleLowerCase("en-US");
    if (!groups.has(key)) groups.set(key, { name, rows: [] });
    groups.get(key).rows.push(row);
  }
  return [...groups.values()].map(({ name, rows: records }) => ({ name, jobs: records.length,
    ...calculateFinancialSummary(records), completed: records.filter(row => statusName(read(row, "status")) === "Completed").length,
    dryRuns: records.filter(row => statusName(read(row, "status")) === "Dry Run").length,
  })).sort((a, b) => b.jobs - a.jobs || a.name.localeCompare(b.name));
}
export const calculateDispatcherSummary = rows => groupRows(rows, "dispatcher");
export const calculateTechnicianSummary = rows => groupRows(rows, "technician");

export function reportJobsFromGroups(groups, field = "jobs") {
  const seen = new Set();
  return groups.flatMap(group => Array.isArray(group[field]) ? group[field] : []).filter(job => {
    if (job.id == null) return true;
    const id = String(job.id);
    if (seen.has(id)) return false;
    seen.add(id); return true;
  });
}

export function selectReportTransactions(transactions, jobs) {
  const ids = new Set(jobs.map(job => String(job.id)));
  return transactions.filter(row => row.job_id != null && ids.has(String(row.job_id)));
}

export function calculateReportSummary(rows = [], options = {}) {
  const { includeFinancial = true, kind = "jobs", recordLabel = "Records" } = options;
  const has = field => rows.some(row => present(row, field));
  const fields = Object.fromEntries(["totalBill", "parts", "techLabor"].map(field => [field, includeFinancial && (!rows.length || has(field))]));
  const financial = kind === "jobs" && includeFinancial ? calculateFinancialSummary(rows) : null;
  const statuses = kind === "jobs" ? [
    ["JOB STATUS", "status", ["Completed", "Dry Run", "Cancelled"]],
    ["INVOICE STATUS", "invoiceStatus", ["Paid", "Pending", "Sent"]],
    ["TECH PAYMENT STATUS", "techPaymentStatus", ["Paid", "Pending", "Cancelled"]],
  ].filter(([, field]) => !rows.length || has(field)).map(([title, field, expected]) => ({ title, rows: calculateStatusBreakdown(rows, field, expected) })) : [];
  const metrics = [...(options.metrics || [])].filter(([, , format]) => includeFinancial || format !== "money");
  if (kind === "jobs" && includeFinancial) {
    for (const [field, label] of [["amountPaid", "Total Amount Paid"], ["balanceDue", "Total Balance Due"]]) {
      if (has(field)) metrics.push([label, sum(rows, field), "money"]);
    }
  }
  if (kind === "transactions") {
    metrics.push(["Total Amount", sum(rows, "amount"), "money"],
      ["Active Amount", sum(rows.filter(row => !row.voided_at), "amount"), "money"],
      ["Voided Amount", sum(rows.filter(row => row.voided_at), "amount"), "money"]);
    statuses.push({ title: "TRANSACTION STATUS", rows: calculateStatusBreakdown(rows.map(row => ({ status: row.voided_at ? "Voided" : "Active" })), "status") });
  }
  for (const [title, field] of options.statusFields || []) statuses.push({ title, rows: calculateStatusBreakdown(rows, field) });
  let companies = kind === "jobs" && has("company") ? groupRows(rows, "company") : [];
  if (companies.length > 10) {
    const rest = companies.slice(10);
    companies = [...companies.slice(0, 10), { name: `Other companies (${rest.length})`, ...Object.fromEntries(["jobs", "totalBill", "parts", "techLabor", "profit"].map(key => [key, rest.reduce((n, row) => n + row[key], 0)])) }];
  }
  return { count: rows.length, countLabel: kind === "jobs" ? "Total Jobs" : kind === "transactions" ? "Total Transactions" : `Total ${recordLabel}`,
    fields, financial, metrics, statuses,
    dispatchers: kind === "jobs" && has("dispatcher") ? calculateDispatcherSummary(rows) : [],
    technicians: kind === "jobs" && has("technician") ? calculateTechnicianSummary(rows) : [], companies,
  };
}

// One presentation model for every renderer; amounts remain typed until display.
export function reportSummarySections(summary) {
  const sections = [{ title: "SUMMARY & STATISTICS", headers: ["Metric", "Value"], rows: [[summary.countLabel, summary.count]], formats: ["text", "number"] }];
  const f = summary.financial, fields = summary.fields;
  if (f) {
    const rows = [];
    if (fields.totalBill) rows.push(["Total Bill", f.totalBill], ["Average Bill per Job", f.averageBill]);
    if (fields.parts) rows.push(["Total Parts", f.parts]);
    if (fields.techLabor) rows.push(["Total Tech Labor", f.techLabor]);
    if (fields.totalBill && fields.parts && fields.techLabor) rows.push(["Total Estimated Profit", f.profit], ["Average Profit per Job", f.averageProfit]);
    if (rows.length) sections.push({ title: "FINANCIAL SUMMARY", headers: ["Metric", "Amount"], rows, formats: ["text", "money"] });
    if (fields.totalBill && fields.parts && fields.techLabor) sections.push({ title: "PROFIT MARGIN", headers: ["Metric", "Value"], rows: [["Estimated Profit / Total Bill", f.profitMargin]], formats: ["text", "percent"] });
  }
  for (const [label, value, format = "number"] of summary.metrics) sections.push({ title: label.toUpperCase(), headers: ["Metric", "Value"], rows: [[label, value]], formats: ["text", format] });
  for (const status of summary.statuses) sections.push({ title: status.title, headers: ["Status", "Count", "% of total"], rows: status.rows.map(row => [row.name, row.count, row.percentage]), formats: ["text", "number", "percent"] });
  for (const [title, groups, type] of [["DISPATCHER SUMMARY", summary.dispatchers, "dispatcher"], ["TECHNICIAN SUMMARY", summary.technicians, "technician"], ["COMPANY SUMMARY", summary.companies, "company"]]) {
    if (!groups.length) continue;
    const columns = [["Name", "name", "text"], ["Jobs", "jobs", "number"]];
    if (f && fields.totalBill) columns.push(["Total Bill", "totalBill", "money"]);
    if (type === "technician" && f && fields.parts) columns.push(["Parts", "parts", "money"]);
    if (type === "technician" && f && fields.techLabor) columns.push(["Tech Labor", "techLabor", "money"]);
    if (f && fields.totalBill && fields.parts && fields.techLabor) columns.push(["Estimated Profit", "profit", "money"]);
    if (type === "dispatcher") columns.push(["Completed", "completed", "number"], ["Dry Runs", "dryRuns", "number"]);
    sections.push({ title, headers: columns.map(c => c[0]), rows: groups.map(row => columns.map(c => row[c[1]])), formats: columns.map(c => c[2]) });
  }
  return sections;
}

export function formatSummaryCell(value, format) {
  return format === "money" ? formatReportMoney(value) : format === "percent" ? formatReportPercent(value) : String(value ?? "");
}

// Explicit header matching avoids formatting job IDs, dates, percentages or counts as money.
export function isMoneyHeader(header) {
  return /^(total billed|billed|total bill|parts|total parts|parts expense|tech labor|total tech labor|tech labor expense|estimated (job )?profit|profit|total profit|revenue|amount|amount paid|amount due|balance due|total amount owed|average amount per job|vendor cost|average cost|core charge|estimated (low price|selling price|high price)|average job|average bill|average profit)$/i.test(String(header).replaceAll("_", " "));
}
export function formatReportRows(headers, rows) {
  return rows.map(row => row.map((value, i) => isMoneyHeader(headers[i]) && value !== "" && value != null && Number.isFinite(Number(value)) ? formatReportMoney(value) : value));
}
