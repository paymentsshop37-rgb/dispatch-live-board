import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

const RED = [127, 29, 29];
const DARK_RED = [69, 10, 10];
const LIGHT_RED = [254, 226, 226];
const LIGHT = [248, 250, 252];
const BORDER = [203, 213, 225];
const TEXT = [15, 23, 42];
const MUTED = [71, 85, 105];

export function buildInternalControlPdfData(jobs, { canViewFinancial = false } = {}) {
  const includeMarked = jobs.some((job) => job.markedRedBy || job.markedRedAt);
  const columns = [
    ["Job #", (job) => job.jobNumber], ["Date", (job) => job.date], ["Time", (job) => job.time],
    ["Reference #", (job) => job.reference], ["Invoice #", (job) => job.invoiceNumber], ["Dispatcher", (job) => job.dispatcher],
    ["Company", (job) => job.company], ["Technician", (job) => job.technician], ["Location", (job) => job.location],
    ["Job Status", (job) => job.jobStatus], ["Invoice Status", (job) => job.invoiceStatus], ["Payment Status", (job) => job.paymentStatus],
    ["Tech Payment", (job) => job.techPaymentStatus],
  ];
  if (canViewFinancial) columns.push(
    ["Total Bill", (job) => money(job.totalBill)], ["Parts", (job) => money(job.parts)],
    ["Tech Labor", (job) => money(job.techLabor)], ["Profit", (job) => money(job.profit)],
  );
  columns.push(["Updates", (job) => job.updates], ["Days in Queue", (job) => job.daysSinceMarked]);
  if (includeMarked) columns.push(["Marked Red By", (job) => job.markedRedBy], ["Marked Red At", (job) => formatDateTime(job.markedRedAt)]);
  const rows = jobs.map((job) => columns.map(([, read]) => full(read(job))));
  const totals = {
    count: jobs.length,
    totalBill: sum(jobs, "totalBill"), totalParts: sum(jobs, "parts"),
    totalTechLabor: sum(jobs, "techLabor"), totalProfit: sum(jobs, "profit"),
    averageDays: jobs.length ? jobs.reduce((total, job) => total + number(job.daysSinceMarked), 0) / jobs.length : 0,
  };
  return { headers: columns.map(([header]) => header), rows, totals, includeMarked };
}

export function createInternalControlQueuePdf({ jobs, summary, generatedBy, activeFilter, dateRange, searchText, canViewFinancial = false }) {
  if (!jobs.length) throw new Error("No Internal Control jobs match the current filters.");
  const data = buildInternalControlPdfData(jobs, { canViewFinancial });
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a3", compress: false });
  const generatedAt = new Date();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  doc.setProperties({ title: "NTTR Internal Control Queue Report", author: generatedBy || "NTTR", subject: activeFilter || "All Red Jobs", creator: "NTTR Dispatch Live Board" });

  drawHeader(doc, { generatedAt, generatedBy, activeFilter, dateRange, searchText, pageWidth, compact: false });
  drawSummary(doc, summary, pageWidth, canViewFinancial);
  autoTable(doc, {
    startY: 176,
    head: [data.headers], body: data.rows,
    margin: { left: 22, right: 22, top: 105, bottom: 40 },
    theme: "grid", showHead: "everyPage", rowPageBreak: "avoid",
    styles: { font: "helvetica", fontSize: data.headers.length > 19 ? 4.5 : 5.2, textColor: TEXT, lineColor: BORDER, lineWidth: 0.35, cellPadding: 2.2, valign: "top", overflow: "linebreak" },
    headStyles: { fillColor: RED, textColor: 255, fontStyle: "bold", fontSize: 5.3, halign: "left", valign: "middle" },
    alternateRowStyles: { fillColor: LIGHT },
    columnStyles: columnWidths(data.headers, pageWidth - 44),
    didParseCell: (hook) => { if (hook.section === "body" && hook.column.index === 0) { hook.cell.styles.fillColor = LIGHT_RED; hook.cell.styles.textColor = RED; hook.cell.styles.fontStyle = "bold"; } },
    didDrawPage: (hook) => { if (hook.pageNumber > 1) drawHeader(doc, { generatedAt, generatedBy, activeFilter, dateRange, searchText, pageWidth, compact: true }); },
  });

  let totalsY = (doc.lastAutoTable?.finalY || 176) + 14;
  if (totalsY > pageHeight - 105) { doc.addPage(); drawHeader(doc, { generatedAt, generatedBy, activeFilter, dateRange, searchText, pageWidth, compact: true }); totalsY = 116; }
  drawTotals(doc, data.totals, canViewFinancial, totalsY, pageWidth);
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page); doc.setDrawColor(...BORDER); doc.line(22, pageHeight - 28, pageWidth - 22, pageHeight - 28);
    doc.setTextColor(...MUTED); doc.setFont("helvetica", "normal"); doc.setFontSize(7);
    doc.text("Confidential - NTTR Internal Control", 22, pageHeight - 15);
    doc.text(`Page ${page} of ${pages}`, pageWidth - 22, pageHeight - 15, { align: "right" });
  }
  return doc.output("blob");
}

function drawHeader(doc, context) {
  const height = context.compact ? 76 : 82;
  doc.setFillColor(...DARK_RED); doc.rect(0, 0, context.pageWidth, height, "F");
  doc.setFillColor(...RED); doc.rect(0, height, context.pageWidth, 7, "F");
  doc.setTextColor(255); doc.setFont("helvetica", "bold"); doc.setFontSize(22); doc.text("NTTR", 22, 28);
  doc.setFontSize(9); doc.text("National Truck Trailer Repair", 22, 44);
  doc.setFontSize(17); doc.text("INTERNAL CONTROL QUEUE REPORT", 22, 65);
  doc.setFont("helvetica", "normal"); doc.setFontSize(7.5);
  const date = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(context.generatedAt);
  const time = new Intl.DateTimeFormat("en-US", { timeStyle: "medium" }).format(context.generatedAt);
  const lines = [`Generated: ${date} at ${time}`, `Generated by: ${context.generatedBy || "Administrator"}`, `Active filter: ${context.activeFilter || "All Red Jobs"}`, `Date range: ${context.dateRange || "All dates"}`, `Search: ${context.searchText?.trim() || "None"}`];
  lines.forEach((line, index) => doc.text(line, context.pageWidth - 22, 20 + index * 11, { align: "right" }));
}

function drawSummary(doc, summary, pageWidth, canViewFinancial) {
  const cards = [["Total Red Jobs", String(summary.count)], [canViewFinancial?"Total Bill":"Financial Columns", canViewFinancial?money(summary.totalBill):"Restricted"], ["Average Days", number(summary.averageDays).toFixed(1)], ["Oldest Red Job", summary.oldest ? `${summary.oldest.jobNumber} (${summary.oldest.daysSinceMarked}d)` : "Not available"], ["Newest Red Job", summary.newest ? `${summary.newest.jobNumber} (${summary.newest.daysSinceMarked}d)` : "Not available"]];
  const gap = 8; const width = (pageWidth - 44 - gap * 4) / 5;
  cards.forEach(([label, value], index) => { const x = 22 + index * (width + gap); doc.setFillColor(255); doc.setDrawColor(...BORDER); doc.roundedRect(x, 101, width, 55, 4, 4, "FD"); doc.setTextColor(...MUTED); doc.setFont("helvetica", "bold"); doc.setFontSize(7); doc.text(label.toUpperCase(), x + 8, 118); doc.setTextColor(...RED); doc.setFontSize(12); doc.text(String(value), x + 8, 141, { maxWidth: width - 16 }); });
}

function drawTotals(doc, totals, canViewFinancial, y, pageWidth) {
  const entries = [["TOTAL RED JOBS", String(totals.count)]];
  if (canViewFinancial) entries.push(["TOTAL BILL", money(totals.totalBill)], ["TOTAL PARTS", money(totals.totalParts)], ["TOTAL TECH LABOR", money(totals.totalTechLabor)], ["TOTAL PROFIT", money(totals.totalProfit)]);
  entries.push(["AVERAGE DAYS IN QUEUE", number(totals.averageDays).toFixed(1)]);
  doc.setFillColor(...LIGHT_RED); doc.setDrawColor(...RED); doc.roundedRect(22, y, pageWidth - 44, 62, 4, 4, "FD");
  const width = (pageWidth - 60) / entries.length;
  entries.forEach(([label, value], index) => { const x = 30 + index * width; doc.setTextColor(...MUTED); doc.setFont("helvetica", "bold"); doc.setFontSize(7); doc.text(label, x, y + 20); doc.setTextColor(...TEXT); doc.setFontSize(11); doc.text(value, x, y + 43, { maxWidth: width - 8 }); });
}

function columnWidths(headers, availableWidth) {
  const widths = { "Job #": 42, Date: 45, Time: 38, "Reference #": 58, "Invoice #": 58, Dispatcher: 55, Company: 78, Technician: 62, Location: 100, "Job Status": 52, "Invoice Status": 52, "Payment Status": 52, "Tech Payment": 50, "Total Bill": 50, Parts: 46, "Tech Labor": 48, Profit: 50, Updates: 145, "Days in Queue": 38, "Marked Red By": 65, "Marked Red At": 68 };
  const requested = headers.map((header) => widths[header] || 55); const scale = Math.min(1, availableWidth / requested.reduce((total, width) => total + width, 0));
  return Object.fromEntries(headers.map((header, index) => [index, { cellWidth: requested[index] * scale }]));
}
function full(value) { return value === null || value === undefined || value === "" ? "-" : String(value); }
function number(value) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function sum(rows, key) { return rows.reduce((total, row) => total + number(row[key]), 0); }
function money(value) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(number(value)); }
function formatDateTime(value) { if (!value) return "-"; const date = new Date(value); return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat("en-US", { dateStyle: "short", timeStyle: "short" }).format(date); }
