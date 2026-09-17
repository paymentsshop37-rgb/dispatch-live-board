import { CURRENCY_FORMAT, formatSummaryCell, reportSummarySections, formatReportRows } from "./reportSummary.js";

const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export function summaryHtml(summary) {
  return `<section class="report-summary" style="margin-top:28px;border-top:3px solid #163a63;padding-top:16px;color:#172033;background:white">${reportSummarySections(summary).map(section => `<div style="margin:0 0 16px"><h2 style="font:700 13px Arial;break-after:avoid;color:#163a63">${escapeHtml(section.title)}</h2><table style="width:100%;border-collapse:collapse;font:11px Arial"><thead><tr>${section.headers.map(h => `<th style="text-align:left;padding:6px;border-bottom:1px solid #cbd5e1;background:#edf2f7">${escapeHtml(h)}</th>`).join("")}</tr></thead><tbody>${section.rows.map(row => `<tr style="break-inside:avoid">${row.map((v, i) => `<td style="padding:6px;border-bottom:1px solid #e2e8f0;text-align:${i ? "right" : "left"}">${escapeHtml(formatSummaryCell(v, section.formats[i]))}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`).join("")}</section>`;
}
export function summaryCsvRows(summary) {
  return reportSummarySections(summary).flatMap(section => [[], [section.title], section.headers, ...section.rows.map(row => row.map((v, i) => formatSummaryCell(v, section.formats[i])))]);
}
export function reportCsv(headers, rows, summary) {
  return [headers, ...formatReportRows(headers, rows), ...summaryCsvRows(summary)].map(row => row.map(value => `"${String(value ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
}
export function appendSummaryWorksheet(sheet, summary) {
  const sections = reportSummarySections(summary);
  const width = Math.max(sheet.columnCount, ...sections.map(s => s.headers.length), 2);
  for (const section of sections) {
    const start = sheet.rowCount + 2;
    sheet.mergeCells(start, 1, start, width);
    const title = sheet.getCell(start, 1); title.value = section.title;
    title.font = { name: "Calibri", bold: true, size: 12, color: { argb: "FFFFFF" } };
    title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "163A63" } };
    sheet.getRow(start).height = 24;
    // Spread the compact summary across the existing table width without changing
    // detail column widths or leaving narrow date/ID columns to clip metric names.
    for (let r = -1; r < section.rows.length; r++) {
      const row = sheet.getRow(start + 2 + r), values = r < 0 ? section.headers : section.rows[r];
      let lines = 1;
      values.forEach((value, i) => {
        const first = Math.floor(i * width / values.length) + 1;
        const last = Math.floor((i + 1) * width / values.length);
        if (last > first) sheet.mergeCells(row.number, first, row.number, last);
        const cell = row.getCell(first), format = section.formats[i];
        cell.value = r >= 0 && format === "percent" ? value / 100 : value;
        cell.font = { name: "Calibri", size: 10, bold: r < 0, color: { argb: "172033" } };
        cell.alignment = { vertical: "middle", wrapText: true, horizontal: i === 0 ? "left" : "right" };
        if (r >= 0) cell.numFmt = format === "money" ? CURRENCY_FORMAT : format === "percent" ? "0.00%" : "General";
        const chars = Array.from({ length: last - first + 1 }, (_, j) => sheet.getColumn(first + j).width || 10).reduce((a, b) => a + b, 0);
        lines = Math.max(lines, Math.ceil(String(r < 0 ? value : formatSummaryCell(value, format)).length / Math.max(5, chars - 2)));
      });
      row.height = Math.max(24, lines * 15);
    }
  }
  // Include summary rows in printing, but keep filters restricted to detail rows.
  const last = sheet.getColumn(width).letter;
  sheet.pageSetup.printArea = `A1:${last}${sheet.rowCount}`;
}
