import ExcelJS from "exceljs";
import { createAccountingPdf } from "./accountingPdf.js";

const HEADERS = ["Invoice #", "Date", "Company", "Reference #", "Location", "Dispatcher", "Technician", "Invoice Status", "Payment Status", "Payment Method", "Total Bill", "Amount Paid", "Amount Due", "Days Outstanding", "Updates"];
const money = (value) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value) || 0);

export function outstandingInvoiceTable(rows, includeGrandTotal = true) {
  const data = rows.map((row) => [row.invoiceNumber, row.date, row.company, row.referenceNumber, row.location, row.dispatcher, row.technician, row.invoiceStatus, row.paymentStatus, row.paymentMethod, row.totalBill, row.amountPaid, row.balanceDue, row.daysOutstanding ?? "Not available", row.updates]);
  if (includeGrandTotal) data.push(["GRAND TOTAL", "", "", "", "", "", "", "", "", "", rows.reduce((sum, row) => sum + row.totalBill, 0), rows.reduce((sum, row) => sum + row.amountPaid, 0), rows.reduce((sum, row) => sum + row.balanceDue, 0), "", ""]);
  return { headers: HEADERS, rows: data };
}

export async function exportOutstandingInvoices({ rows, summary, filterLabel, generatedBy, footer }, format) {
  const generatedAt = new Date();
  const table = outstandingInvoiceTable(rows);
  const filename = `NTTR-Outstanding-Sent-Invoices-${generatedAt.toISOString().slice(0, 10)}`;
  if (format === "xlsx") {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = generatedBy || "NTTR Accounting Center";
    const sheet = workbook.addWorksheet("Outstanding Sent Invoices", { views: [{ state: "frozen", ySplit: 9 }] });
    sheet.mergeCells("A1:O1"); sheet.getCell("A1").value = "NTTR OUTSTANDING SENT INVOICES REPORT";
    sheet.mergeCells("A2:O2"); sheet.getCell("A2").value = `Report date: ${generatedAt.toLocaleString()} | Active filter: ${filterLabel}`;
    sheet.mergeCells("A3:O3"); sheet.getCell("A3").value = `Invoice count: ${summary.invoiceCount} | Total outstanding: ${money(summary.totalOutstanding)}`;
    sheet.getRow(1).font = { bold: true, size: 18, color: { argb: "FFFFFF" } }; sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "07182D" } };
    [["Total Sent / Unpaid Invoices", summary.invoiceCount], ["Total Outstanding Amount", summary.totalOutstanding], ["Average Invoice", summary.averageInvoice], ["Oldest Outstanding Invoice", summary.oldestOutstanding ?? "Not available"], ["Average Days Outstanding", summary.averageDaysOutstanding ?? "Not available"]].forEach(([label, value], index) => { sheet.getCell(5, index * 3 + 1).value = label; sheet.getCell(6, index * 3 + 1).value = value; sheet.getCell(5, index * 3 + 1).font = { bold: true }; });
    sheet.getRow(9).values = table.headers; sheet.getRow(9).font = { bold: true, color: { argb: "FFFFFF" } }; sheet.getRow(9).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "163A63" } };
    table.rows.forEach((values, index) => { const row = sheet.getRow(10 + index); row.values = values; [11, 12, 13].forEach((column) => { row.getCell(column).numFmt = '$#,##0.00;[Red]($#,##0.00)'; }); if (index === table.rows.length - 1) row.font = { bold: true }; });
    [16, 13, 24, 16, 28, 18, 18, 15, 16, 16, 14, 14, 14, 16, 40].forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
    sheet.autoFilter = { from: "A9", to: `O${Math.max(9, 9 + table.rows.length)}` };
    const buffer = await workbook.xlsx.writeBuffer();
    download(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${filename}.xlsx`);
    return;
  }
  const pdfRows = table.rows.map((row) => row.map((value, index) => [10, 11, 12].includes(index) ? money(value) : value));
  const blob = createAccountingPdf({ title: "Outstanding Sent Invoices Report", headers: table.headers, rows: pdfRows, generatedBy, filterLabel, footer, summaryCards: [["Sent / Unpaid", summary.invoiceCount], ["Outstanding", money(summary.totalOutstanding)], ["Average Invoice", money(summary.averageInvoice)], ["Oldest", summary.oldestOutstanding == null ? "Not available" : `${summary.oldestOutstanding} days`], ["Average Days", summary.averageDaysOutstanding == null ? "Not available" : summary.averageDaysOutstanding.toFixed(1)]] });
  if (format === "print") { const url = URL.createObjectURL(blob); window.open(url, "_blank", "noopener,noreferrer"); window.setTimeout(() => URL.revokeObjectURL(url), 60000); }
  else download(blob, `${filename}.pdf`);
}

function download(blob, name) { const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = name; document.body.appendChild(anchor); anchor.click(); anchor.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); }
