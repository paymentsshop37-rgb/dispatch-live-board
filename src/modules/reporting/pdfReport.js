import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { buildReportData, numberValue } from "./reportData.js";

const NAVY = [11, 31, 58];
const BLUE = [22, 58, 99];
const LIGHT = [241, 245, 249];
const SILVER = [203, 213, 225];
const GREEN = [22, 163, 74];
const RED = [220, 38, 38];
const MUTED = [100, 116, 139];

export function createExecutivePdf(jobs, options = {}) {
  const generatedAt = options.generatedAt ? new Date(options.generatedAt) : new Date();
  const data = buildReportData(jobs, { generatedAt });
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "letter", compress: true });
  doc.setProperties({
    title: "NTTR Dispatch Live - Executive Operations Report",
    subject: options.filterLabel || "All jobs",
    author: options.generatedBy || "NTTR Dispatch Live",
    creator: "NTTR Reporting System",
  });

  drawHeader(doc, "Executive Operations Report", options, generatedAt);
  drawKpiCards(doc, data.summary);
  drawHighlights(doc, data);

  doc.addPage("letter", "landscape");
  drawHeader(doc, "Executive Operations Detail", options, generatedAt);
  drawPerformanceTables(doc, data);
  drawHeader(doc, "Executive Operations Detail", options, generatedAt);

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(...SILVER);
    doc.line(30, 574, 762, 574);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(`Confidential - NTTR | Generated ${formatTimestamp(generatedAt)}`, 30, 589);
    doc.text(`Page ${page} of ${pages} | Version ${options.reportVersion || "2.0"}`, 762, 589, { align: "right" });
  }
  return doc.output("blob");
}

function drawHeader(doc, title, options, generatedAt) {
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, 792, 68, "F");
  doc.setFillColor(...BLUE);
  doc.rect(0, 68, 792, 14, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text("NTTR DISPATCH LIVE", 30, 31);
  doc.setFontSize(13);
  doc.text(title, 30, 52);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text("National Truck Trailer Repair", 762, 25, { align: "right" });
  doc.text(`Generated ${formatTimestamp(generatedAt)} | By ${options.generatedBy || "Dispatch Live User"}`, 762, 42, { align: "right" });
  doc.text(`Filter: ${truncate(options.filterLabel || "All jobs", 92)}`, 762, 56, { align: "right" });
}

function drawKpiCards(doc, summary) {
  const cards = [
    ["TOTAL JOBS", summary.totalJobs, "count"], ["COMPLETED", summary.completed, "count"], ["CANCELLED", summary.cancelled, "count"], ["PENDING", summary.pending, "count"],
    ["DRY RUNS", summary.dryRuns, "count"], ["REVENUE", summary.revenue, "money"], ["PARTS", summary.parts, "money"], ["TECH LABOR", summary.techLabor, "money"],
    ["PROFIT", summary.profit, "money"], ["AVG INVOICE", summary.averageInvoice, "money"], ["AVG PROFIT", summary.averageProfit, "money"], ["CUSTOMERS PENDING", summary.customersPendingPayment, "count"],
    ["TECH PAYMENTS PENDING", summary.techPaymentsPending, "count"], ["OUTSTANDING INVOICES", summary.outstandingInvoices, "count"], ["CONTROL FLAGS", summary.internalControlFlags, "count"], ["CITIES COVERED", summary.citiesCovered, "count"],
  ];
  const startX = 30;
  const startY = 100;
  const gap = 10;
  const width = (732 - gap * 3) / 4;
  const height = 66;
  cards.forEach(([label, value, type], index) => {
    const col = index % 4;
    const row = Math.floor(index / 4);
    const x = startX + col * (width + gap);
    const y = startY + row * (height + gap);
    doc.setFillColor(...(label === "PROFIT" ? [220, 252, 231] : label.includes("CANCELLED") || label.includes("FLAGS") ? [254, 226, 226] : LIGHT));
    doc.setDrawColor(...SILVER);
    doc.roundedRect(x, y, width, height, 5, 5, "FD");
    doc.setTextColor(...MUTED);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.text(label, x + 10, y + 17);
    doc.setTextColor(...(label === "PROFIT" ? GREEN : label.includes("CANCELLED") || label.includes("FLAGS") ? RED : NAVY));
    doc.setFontSize(17);
    doc.text(type === "money" ? compactMoney(value) : String(value), x + 10, y + 45);
  });
}

function drawHighlights(doc, data) {
  const top = [
    ["Top Dispatcher", data.summary.topDispatcher], ["Top Technician", data.summary.topTechnician],
    ["Top Customer", data.summary.topCustomer], ["Top City", data.summary.topCity],
  ];
  const y = 414;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...NAVY);
  doc.text("LEADERSHIP HIGHLIGHTS", 30, y);
  top.forEach(([label, value], index) => {
    const x = 30 + index * 183;
    doc.setFillColor(...BLUE);
    doc.roundedRect(x, y + 10, 173, 60, 4, 4, "F");
    doc.setTextColor(205, 220, 238);
    doc.setFontSize(7.5);
    doc.text(label.toUpperCase(), x + 9, y + 28);
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(12);
    doc.text(truncate(value, 24), x + 9, y + 50);
  });
  doc.setFillColor(255, 237, 213);
  doc.roundedRect(30, 500, 732, 38, 4, 4, "F");
  doc.setTextColor(154, 52, 18);
  doc.setFontSize(9);
  doc.text(`Outstanding revenue: ${money(data.summary.outstandingRevenue)}   |   Open invoices: ${data.summary.outstandingInvoices}   |   Technician payments pending: ${data.summary.techPaymentsPending}`, 45, 524);
}

function drawPerformanceTables(doc, data) {
  autoTable(doc, {
    startY: 98,
    margin: { left: 30 },
    tableWidth: 352,
    head: [["Dispatcher", "Jobs", "Completed", "Revenue", "Profit"]],
    body: data.dispatchers.slice(0, 10).map((row) => [row.name, row.jobs, row.completed, compactMoney(row.revenue), compactMoney(row.profit)]),
    styles: { font: "helvetica", fontSize: 7.5, cellPadding: 4, lineColor: SILVER, lineWidth: 0.3 },
    headStyles: { fillColor: NAVY, textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: LIGHT },
  });
  autoTable(doc, {
    startY: 98,
    margin: { left: 410 },
    tableWidth: 352,
    head: [["Technician", "Jobs", "Completed", "Completion", "Profit"]],
    body: data.technicians.slice(0, 10).map((row) => [row.name, row.jobs, row.completed, `${(row.completionRate * 100).toFixed(1)}%`, compactMoney(row.profit)]),
    styles: { font: "helvetica", fontSize: 7.5, cellPadding: 4, lineColor: SILVER, lineWidth: 0.3 },
    headStyles: { fillColor: NAVY, textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: LIGHT },
  });
  autoTable(doc, {
    startY: 340,
    margin: { left: 30, right: 30 },
    head: [["Invoice", "Reference", "Company", "Technician", "Status", "Total Bill", "Profit"]],
    body: data.financial.topInvoices.slice(0, 10).map((job) => [job.reference || "-", job.jobReference || "-", job.company || "-", job.tech || "-", job.invoice || "-", money(job.totalBill), money(numberValue(job.totalBill) - numberValue(job.parts) - numberValue(job.techLabor))]),
    styles: { font: "helvetica", fontSize: 7.5, cellPadding: 4, lineColor: SILVER, lineWidth: 0.3 },
    headStyles: { fillColor: BLUE, textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: LIGHT },
  });
}

function money(value) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(numberValue(value)); }
function compactMoney(value) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 }).format(numberValue(value)); }
function formatTimestamp(value) { return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(value); }
function truncate(value, length) { const text = String(value || "-"); return text.length > length ? `${text.slice(0, length - 3)}...` : text; }
