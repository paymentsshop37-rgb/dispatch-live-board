import ExcelJS from "exceljs";
import {
  REPORT_VERSION,
  buildReportData,
  databaseColumns,
  daysPending,
  jobProfit,
  numberValue,
  safeCellValue,
} from "./reportData.js";

const COLORS = {
  navy: "0B1F3A", blue: "163A63", royal: "2563EB", white: "FFFFFF", silver: "CBD5E1",
  light: "F1F5F9", lighter: "F8FAFC", green: "16A34A", greenLight: "DCFCE7",
  red: "DC2626", redLight: "FEE2E2", orange: "F97316", orangeLight: "FFEDD5",
  purple: "7C3AED", purpleLight: "EDE9FE", text: "172033", muted: "64748B",
};
const MONEY = '$#,##0.00;[Red]($#,##0.00);-';
const INTEGER = '#,##0';
const PERCENT = '0.0%';
const THIN_BORDER = { style: "thin", color: { argb: "D8E0EA" } };

const reportSheetMap = {
  financial: ["FINANCIAL REPORT"],
  "technician-payments": ["TECH PAYMENTS PENDING"],
  "outstanding-invoices": ["OUTSTANDING INVOICES"],
  "internal-control": ["INTERNAL CONTROL REPORT"],
  "dispatcher-performance": ["DISPATCHER PERFORMANCE"],
  "city-performance": ["CITY PERFORMANCE"],
  database: ["DATABASE EXPORT"],
};

export async function createReportWorkbook(jobs, options = {}) {
  const generatedAt = options.generatedAt ? new Date(options.generatedAt) : new Date();
  const data = buildReportData(jobs, { generatedAt });
  const workbook = new ExcelJS.Workbook();
  workbook.creator = options.generatedBy || "NTTR Dispatch Live";
  workbook.company = "NTTR - National Truck Trailer Repair";
  workbook.subject = "NTTR Dispatch Live Executive Operations Report";
  workbook.title = "NTTR Dispatch Live - Executive Operations Report";
  workbook.description = `Generated from Dispatch Live ${options.filterLabel || "All jobs"}`;
  workbook.created = generatedAt;
  workbook.modified = generatedAt;
  workbook.calcProperties.fullCalcOnLoad = true;

  const reportType = options.reportType || "executive-excel";
  const requested = reportSheetMap[reportType];
  const shouldBuild = (sheetName) => !requested || requested.includes(sheetName);
  const context = { workbook, data, options: { ...options, generatedAt, reportVersion: options.reportVersion || REPORT_VERSION } };

  if (shouldBuild("EXECUTIVE SUMMARY")) addExecutiveSummary(context);
  if (shouldBuild("LIVE JOBS")) addLiveJobs(context);
  if (shouldBuild("FINANCIAL REPORT")) addFinancial(context);
  if (shouldBuild("TECHNICIAN PERFORMANCE")) addTechnicians(context);
  if (shouldBuild("TECH PAYMENTS PENDING")) addTechPayments(context);
  if (shouldBuild("CUSTOMER INVOICES")) addCustomerInvoices(context, false);
  if (shouldBuild("OUTSTANDING INVOICES")) addCustomerInvoices(context, true);
  if (shouldBuild("INTERNAL CONTROL REPORT")) addInternalControls(context);
  if (shouldBuild("CITY PERFORMANCE")) addCityPerformance(context);
  if (shouldBuild("DISPATCHER PERFORMANCE")) addDispatcherPerformance(context);
  if (shouldBuild("DATABASE EXPORT")) addDatabaseExport(context);

  return workbook;
}

export async function createReportXlsxBuffer(jobs, options = {}) {
  const workbook = await createReportWorkbook(jobs, options);
  return workbook.xlsx.writeBuffer();
}

function createSheet(context, name, columnCount, subtitle) {
  const { workbook, options } = context;
  const sheet = workbook.addWorksheet(name, {
    properties: { defaultRowHeight: 18 },
    pageSetup: { orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.25, right: 0.25, top: 0.6, bottom: 0.55, header: 0.2, footer: 0.25 } },
    views: [{ state: "frozen", ySplit: 6, showGridLines: false }],
  });
  const lastColumn = columnLetter(columnCount);
  sheet.mergeCells(`A1:${lastColumn}1`);
  sheet.mergeCells(`A2:${lastColumn}2`);
  sheet.mergeCells(`A3:${lastColumn}3`);
  sheet.mergeCells(`A4:${lastColumn}4`);
  sheet.getCell("A1").value = "NTTR DISPATCH LIVE";
  sheet.getCell("A2").value = subtitle;
  sheet.getCell("A3").value = "NTTR | National Truck Trailer Repair";
  sheet.getCell("A4").value = `Generated: ${formatTimestamp(options.generatedAt)}   |   By: ${options.generatedBy || "Dispatch Live User"}   |   Filter: ${options.filterLabel || "All jobs"}`;
  sheet.getCell("A5").value = `Version ${options.reportVersion}   |   Total pages: calculated on print`;
  sheet.mergeCells(`A5:${lastColumn}5`);
  sheet.getRow(1).height = 34;
  sheet.getRow(2).height = 25;
  sheet.getRow(3).height = 20;
  sheet.getRow(4).height = 20;
  sheet.getRow(5).height = 18;
  styleBand(sheet.getCell("A1"), COLORS.navy, 20, COLORS.white, true);
  styleBand(sheet.getCell("A2"), COLORS.blue, 14, COLORS.white, true);
  styleBand(sheet.getCell("A3"), COLORS.light, 11, COLORS.blue, true);
  styleBand(sheet.getCell("A4"), COLORS.lighter, 9, COLORS.muted, false);
  styleBand(sheet.getCell("A5"), COLORS.lighter, 9, COLORS.muted, false);
  sheet.getCell("A1").alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  sheet.getCell("A2").alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  sheet.getCell("A3").alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  sheet.headerFooter.oddHeader = "&LNTTR DISPATCH LIVE&CExecutive Operations Report&R&P of &N";
  sheet.headerFooter.oddFooter = `&L${options.filterLabel || "All jobs"}&CConfidential - NTTR&RGenerated ${formatTimestamp(options.generatedAt)}`;
  sheet.pageSetup.printTitlesRow = "1:6";
  return sheet;
}

function addExecutiveSummary(context) {
  const { data } = context;
  const sheet = createSheet(context, "EXECUTIVE SUMMARY", 12, "Executive Operations Report");
  sheet.views = [{ state: "frozen", ySplit: 5, showGridLines: false }];
  const s = data.summary;
  const cards = [
    ["Total Jobs", s.totalJobs, "count"], ["Completed", s.completed, "count"], ["Cancelled", s.cancelled, "count"], ["Pending", s.pending, "count"],
    ["Dry Runs", s.dryRuns, "count"], ["Revenue", s.revenue, "money"], ["Parts", s.parts, "money"], ["Tech Labor", s.techLabor, "money"],
    ["Profit", s.profit, "money"], ["Average Invoice", s.averageInvoice, "money"], ["Average Profit", s.averageProfit, "money"], ["Customers Pending Payment", s.customersPendingPayment, "count"],
    ["Tech Payments Pending", s.techPaymentsPending, "count"], ["Outstanding Invoices", s.outstandingInvoices, "count"], ["Internal Control Flags", s.internalControlFlags, "count"], ["Cities Covered", s.citiesCovered, "count"],
    ["Top Dispatcher", s.topDispatcher, "text"], ["Top Technician", s.topTechnician, "text"], ["Top Customer", s.topCustomer, "text"], ["Top City", s.topCity, "text"],
  ];
  cards.forEach(([label, value, type], index) => {
    const cardRow = 7 + Math.floor(index / 4) * 3;
    const col = (index % 4) * 3 + 1;
    const start = `${columnLetter(col)}${cardRow}`;
    const end = `${columnLetter(col + 2)}${cardRow}`;
    const valueStart = `${columnLetter(col)}${cardRow + 1}`;
    const valueEnd = `${columnLetter(col + 2)}${cardRow + 2}`;
    sheet.mergeCells(`${start}:${end}`);
    sheet.mergeCells(`${valueStart}:${valueEnd}`);
    const labelCell = sheet.getCell(start);
    const valueCell = sheet.getCell(valueStart);
    labelCell.value = label.toUpperCase();
    valueCell.value = value;
    labelCell.fill = solid(COLORS.blue);
    labelCell.font = { name: "Calibri", size: 9, bold: true, color: { argb: COLORS.white } };
    labelCell.alignment = { horizontal: "center", vertical: "middle" };
    valueCell.fill = solid(index === 8 ? COLORS.greenLight : index === 2 || index === 14 ? COLORS.redLight : COLORS.lighter);
    valueCell.font = { name: "Calibri", size: type === "text" ? 14 : 18, bold: true, color: { argb: index === 8 ? COLORS.green : COLORS.navy } };
    valueCell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    valueCell.numFmt = type === "money" ? MONEY : type === "count" ? INTEGER : "@";
    [labelCell, valueCell].forEach((cell) => { cell.border = { top: THIN_BORDER, left: THIN_BORDER, bottom: THIN_BORDER, right: THIN_BORDER }; });
    sheet.getRow(cardRow).height = 19;
    sheet.getRow(cardRow + 1).height = 23;
    sheet.getRow(cardRow + 2).height = 23;
  });
  for (let col = 1; col <= 12; col += 1) sheet.getColumn(col).width = 14;
  sheet.pageSetup.printArea = "A1:L21";
}

function addLiveJobs(context) {
  const headers = ["Date", "Time", "Reference #", "Invoice #", "Dispatcher", "Company", "Technician", "Location", "City", "State", "Status", "Invoice Status", "Payment Method", "Received", "Updates", "Total Bill", "Parts", "Tech Labor", "Profit", "Internal Control"];
  const sheet = createSheet(context, "LIVE JOBS", headers.length, "Live Jobs - Oldest to Newest");
  const jobs = [...context.data.jobs].sort(compareJobs);
  addDataTable(sheet, headers, jobs.map((job, index) => {
    const rowNumber = index + 7;
    return [asDate(job.date), job.time || "", job.jobReference || "", job.reference || "", job.dispatch || "", job.company || "", job.tech || "", job.location || "", job.city || "", job.state || "", job.status || "", job.invoice || "", job.paymentMethod || "", job.paymentReceiver || "", job.updates || "", numberValue(job.totalBill), numberValue(job.parts), numberValue(job.techLabor), { formula: `P${rowNumber}-Q${rowNumber}-R${rowNumber}`, result: jobProfit(job) }, job.internalControlColor || "none"];
  }), { dateColumns: [1], moneyColumns: [16, 17, 18, 19], statusColumn: 11, widths: [12, 11, 16, 16, 18, 24, 20, 30, 18, 9, 15, 16, 16, 10, 42, 14, 14, 14, 14, 16] });
}

function addFinancial(context) {
  const { financial } = context.data;
  const sheet = createSheet(context, "FINANCIAL REPORT", 8, "Financial Report");
  const metrics = [
    ["Revenue", financial.revenue], ["Parts", financial.parts], ["Tech Labor", financial.techLabor], ["Profit", financial.profit],
    ["Average Invoice", financial.averageInvoice], ["Average Profit", financial.averageProfit], ["Highest Invoice", financial.highestInvoice], ["Lowest Invoice", financial.lowestInvoice],
    ["Total Customers", financial.totalCustomers], ["Open Invoices", financial.openInvoices], ["Outstanding Revenue", financial.outstandingRevenue],
  ];
  sheet.getCell("A7").value = "FINANCIAL SUMMARY";
  sheet.mergeCells("A7:D7");
  styleSection(sheet.getCell("A7"));
  metrics.forEach(([label, value], index) => {
    const row = 8 + Math.floor(index / 2);
    const col = index % 2 === 0 ? 1 : 3;
    sheet.getCell(row, col).value = label;
    sheet.getCell(row, col + 1).value = value;
    sheet.getCell(row, col).font = { name: "Calibri", bold: true, color: { argb: COLORS.muted } };
    sheet.getCell(row, col + 1).font = { name: "Calibri", bold: true, color: { argb: COLORS.navy } };
    sheet.getCell(row, col + 1).numFmt = label.includes("Customers") || label.includes("Invoices") ? INTEGER : MONEY;
  });
  const startRow = 15;
  addDataTable(sheet, ["Rank", "Date", "Invoice #", "Reference #", "Company", "Technician", "Total Bill", "Profit"], financial.topInvoices.map((job, index) => [index + 1, asDate(job.date), job.reference || "", job.jobReference || "", job.company || "", job.tech || "", numberValue(job.totalBill), jobProfit(job)]), { headerRow: startRow, dateColumns: [2], moneyColumns: [7, 8], widths: [9, 12, 16, 16, 25, 22, 15, 15] });
  sheet.getColumn(1).width = 22;
  sheet.getColumn(2).width = 16;
  sheet.getColumn(3).width = 22;
  sheet.getColumn(4).width = 18;
}

function addTechnicians(context) {
  const headers = ["Technician", "Jobs", "Completed", "Cancelled", "Dry Runs", "Revenue", "Tech Labor", "Profit", "Completion %", "Ranking"];
  const sheet = createSheet(context, "TECHNICIAN PERFORMANCE", headers.length, "Technician Performance");
  addDataTable(sheet, headers, context.data.technicians.map((row) => [row.name, row.jobs, row.completed, row.cancelled, row.dryRuns, row.revenue, row.techLabor, row.profit, row.completionRate, row.ranking]), { moneyColumns: [6, 7, 8], percentColumns: [9], widths: [25, 10, 12, 12, 11, 15, 15, 15, 15, 10] });
}

function addTechPayments(context) {
  const sheet = createSheet(context, "TECH PAYMENTS PENDING", 9, "Technician Payments Pending");
  const headers = ["Technician", "Date", "Invoice", "Reference #", "Company", "Location", "Tech Labor", "Dispatcher", "Days Pending"];
  const jobs = [...context.data.techPaymentsPending].sort(compareJobs);
  addDataTable(sheet, headers, jobs.map((job) => [job.tech || "Unassigned", asDate(job.date), job.reference || "", job.jobReference || "", job.company || "", job.location || "", numberValue(job.techLabor), job.dispatch || "", daysPending(job, context.options.generatedAt)]), { dateColumns: [2], moneyColumns: [7], widths: [24, 12, 16, 16, 25, 32, 15, 20, 14] });
  const totalRow = 8 + jobs.length;
  sheet.mergeCells(`A${totalRow}:F${totalRow}`);
  sheet.getCell(`A${totalRow}`).value = "TOTAL AMOUNT OWED TO TECHNICIANS";
  sheet.getCell(`G${totalRow}`).value = jobs.reduce((sum, job) => sum + numberValue(job.techLabor), 0);
  sheet.mergeCells(`G${totalRow}:I${totalRow}`);
  [sheet.getCell(`A${totalRow}`), sheet.getCell(`G${totalRow}`)].forEach((cell) => {
    cell.fill = solid(COLORS.greenLight); cell.font = { name: "Calibri", size: 14, bold: true, color: { argb: "166534" } }; cell.alignment = { horizontal: "center", vertical: "middle" }; cell.border = { top: { style: "medium", color: { argb: COLORS.green } }, bottom: { style: "medium", color: { argb: COLORS.green } } };
  });
  sheet.getCell(`G${totalRow}`).numFmt = MONEY;
  sheet.getRow(totalRow).height = 34;
}

function addCustomerInvoices(context, outstandingOnly) {
  const name = outstandingOnly ? "OUTSTANDING INVOICES" : "CUSTOMER INVOICES";
  const sheet = createSheet(context, name, 8, outstandingOnly ? "Outstanding Customer Invoices" : "Customer Invoices by Status");
  const sourceGroups = outstandingOnly
    ? [{ status: "Outstanding", rows: context.data.openInvoices, total: context.data.summary.outstandingRevenue }]
    : context.data.invoicesByStatus;
  let row = 7;
  for (const group of sourceGroups) {
    sheet.mergeCells(`A${row}:H${row}`);
    sheet.getCell(`A${row}`).value = `${group.status.toUpperCase()} - ${group.rows.length} INVOICES - ${formatMoney(group.total)}`;
    styleSection(sheet.getCell(`A${row}`));
    row += 1;
    const headers = ["Date", "Invoice #", "Reference #", "Company", "Status", "Payment Method", "Total Bill", "Dispatcher"];
    addDataTable(sheet, headers, group.rows.map((job) => [asDate(job.date), job.reference || "", job.jobReference || "", job.company || "", job.invoice || "", job.paymentMethod || "", numberValue(job.totalBill), job.dispatch || ""]), { headerRow: row, dateColumns: [1], moneyColumns: [7], widths: [12, 16, 16, 26, 16, 16, 15, 20], resetFilter: false });
    row += group.rows.length + 2;
  }
  sheet.autoFilter = undefined;
}

function addInternalControls(context) {
  const headers = ["Date", "Reference #", "Invoice", "Company", "Dispatcher", "Technician", "Amount", "Notes", "Reason"];
  const sheet = createSheet(context, "INTERNAL CONTROL REPORT", headers.length, "Internal Control Exceptions - Red Flags Only");
  addDataTable(sheet, headers, context.data.internalControls.map((job) => [asDate(job.date), job.jobReference || "", job.reference || "", job.company || "", job.dispatch || "", job.tech || "", numberValue(job.totalBill), job.updates || "", internalControlReason(job)]), { dateColumns: [1], moneyColumns: [7], widths: [12, 16, 16, 25, 20, 20, 15, 40, 28], highlightRows: COLORS.redLight });
}

function addCityPerformance(context) {
  const includeFinancial = context.options.includeFinancial !== false;
  const headers = includeFinancial ? ["City", "Jobs", "Completed", "Cancelled", "Revenue", "Profit"] : ["City", "Jobs", "Completed", "Cancelled"];
  const rows = context.data.cities.map((row) => includeFinancial ? [row.name, row.jobs, row.completed, row.cancelled, row.revenue, row.profit] : [row.name, row.jobs, row.completed, row.cancelled]);
  const sheet = createSheet(context, "CITY PERFORMANCE", headers.length, includeFinancial ? "City Performance" : "City Performance - Operational View");
  addDataTable(sheet, headers, rows, { moneyColumns: includeFinancial ? [5, 6] : [], widths: includeFinancial ? [24, 10, 12, 12, 16, 16] : [28, 12, 14, 14] });
}

function addDispatcherPerformance(context) {
  const includeFinancial = context.options.includeFinancial !== false;
  const headers = includeFinancial ? ["Dispatcher", "Jobs", "Completed", "Cancelled", "Revenue", "Profit", "Average Job"] : ["Dispatcher", "Jobs", "Completed", "Cancelled"];
  const rows = context.data.dispatchers.map((row) => includeFinancial ? [row.name, row.jobs, row.completed, row.cancelled, row.revenue, row.profit, row.averageJob] : [row.name, row.jobs, row.completed, row.cancelled]);
  const sheet = createSheet(context, "DISPATCHER PERFORMANCE", headers.length, includeFinancial ? "Dispatcher Performance" : "Dispatcher Performance - Operational View");
  addDataTable(sheet, headers, rows, { moneyColumns: includeFinancial ? [5, 6, 7] : [], widths: includeFinancial ? [24, 10, 12, 12, 16, 16, 16] : [28, 12, 14, 14] });
}

function addDatabaseExport(context) {
  const columns = databaseColumns(context.data.jobs);
  const headers = columns.map(titleFromKey);
  const sheet = createSheet(context, "DATABASE EXPORT", Math.max(headers.length, 1), "Complete Database Export");
  const rows = context.data.jobs.map((job) => columns.map((column) => safeCellValue(job.raw?.[column])));
  addDataTable(sheet, headers.length ? headers : ["No database columns"], headers.length ? rows : [], { widths: headers.map(() => 18) });
}

function addDataTable(sheet, headers, rows, options = {}) {
  const headerRow = options.headerRow || 6;
  const header = sheet.getRow(headerRow);
  header.values = headers;
  header.height = 28;
  header.eachCell((cell) => {
    cell.fill = solid(COLORS.navy);
    cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: COLORS.white } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = { top: THIN_BORDER, left: THIN_BORDER, bottom: THIN_BORDER, right: THIN_BORDER };
  });
  rows.forEach((values, rowIndex) => {
    const row = sheet.getRow(headerRow + rowIndex + 1);
    row.values = values;
    row.height = 20;
    row.eachCell({ includeEmpty: true }, (cell, colIndex) => {
      cell.font = { name: "Calibri", size: 11, color: { argb: COLORS.text } };
      cell.fill = solid(options.highlightRows || (rowIndex % 2 ? COLORS.light : COLORS.white));
      cell.border = { bottom: THIN_BORDER };
      cell.alignment = { vertical: "middle", horizontal: isNumericCell(cell.value) ? "right" : "left", wrapText: colIndex === 8 || colIndex === 15 };
    });
    for (const column of options.dateColumns || []) row.getCell(column).numFmt = "mm/dd/yyyy";
    for (const column of options.moneyColumns || []) row.getCell(column).numFmt = MONEY;
    for (const column of options.percentColumns || []) row.getCell(column).numFmt = PERCENT;
    if (options.statusColumn) styleStatusCell(row.getCell(options.statusColumn));
  });
  headers.forEach((_, index) => { sheet.getColumn(index + 1).width = Math.min(45, Math.max(9, options.widths?.[index] || autoWidth(headers[index], rows, index))); });
  if (options.resetFilter !== false && rows.length) sheet.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: headerRow + rows.length, column: headers.length } };
  sheet.pageSetup.printArea = `A1:${columnLetter(headers.length)}${Math.max(headerRow, headerRow + rows.length)}`;
}

function autoWidth(header, rows, index) {
  let width = String(header || "").length + 2;
  for (const row of rows) {
    const value = row[index];
    const comparable = value?.formula ? value.result : value;
    width = Math.max(width, String(comparable ?? "").split(/\r?\n/)[0].length + 2);
  }
  return width;
}

function styleStatusCell(cell) {
  const key = String(cell.value || "").toLowerCase();
  const colors = key === "completed" ? [COLORS.greenLight, "166534"]
    : ["cancelled", "canceled"].includes(key) ? [COLORS.redLight, "991B1B"]
      : key === "pending" ? [COLORS.orangeLight, "9A3412"]
        : key === "dry run" ? [COLORS.purpleLight, "5B21B6"]
          : key === "in progress" ? ["DBEAFE", "1D4ED8"] : null;
  if (!colors) return;
  cell.fill = solid(colors[0]);
  cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: colors[1] } };
  cell.alignment = { horizontal: "center", vertical: "middle" };
}

function internalControlReason(job) {
  return job.internalControlReason || job.reason || job.rowFlag || "Red internal control flag";
}

function asDate(value) {
  if (!value) return "";
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date;
}

function compareJobs(a, b) {
  return `${a.date || "9999-99-99"}T${a.time || "23:59:59"}`.localeCompare(`${b.date || "9999-99-99"}T${b.time || "23:59:59"}`);
}

function styleBand(cell, fill, size, color, bold) {
  cell.fill = solid(fill);
  cell.font = { name: "Calibri", size, bold, color: { argb: color } };
  cell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
}

function styleSection(cell) {
  cell.fill = solid(COLORS.blue);
  cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: COLORS.white } };
  cell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
}

function solid(argb) { return { type: "pattern", pattern: "solid", fgColor: { argb } }; }
function isNumericCell(value) { return typeof value === "number" || Boolean(value?.formula); }
function formatMoney(value) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(numberValue(value)); }
function formatTimestamp(value) { return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(value); }
function titleFromKey(key) { return String(key).replaceAll("_", " ").replace(/\b\w/g, (match) => match.toUpperCase()); }
function columnLetter(number) { let result = ""; let value = number; while (value > 0) { const mod = (value - 1) % 26; result = String.fromCharCode(65 + mod) + result; value = Math.floor((value - 1) / 26); } return result || "A"; }
