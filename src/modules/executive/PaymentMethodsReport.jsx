import React, { useMemo, useState } from "react";
import { Download, FileText, Printer } from "lucide-react";
import { buildPaymentMethodsReport, filterPaymentReportJobs, paymentReportPeriods } from "./paymentMethodSummary.js";

const columns = ["Método de pago", "Letra A", "Letra B", "Sin letra", "Total"];

export default function PaymentMethodsReport({ jobs, generatedBy }) {
  const [paidOnly, setPaidOnly] = useState(true);
  const [periodMode, setPeriodMode] = useState("This Week");
  const [customRange, setCustomRange] = useState({ from: "", to: "" });
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const reportJobs = useMemo(() => filterPaymentReportJobs(jobs, periodMode, customRange), [jobs, periodMode, customRange]);
  const reportPeriod = periodMode === "Custom Range" ? `Custom Range · ${customRange.from || "Inicio"} – ${customRange.to || "Sin límite"}` : periodMode;
  const { rows, totals } = useMemo(() => buildPaymentMethodsReport(reportJobs, { paidOnly }), [reportJobs, paidOnly]);
  const scope = paidOnly ? "Facturas pagadas" : "Todos los trabajos";

  async function exportExcel() {
    setExporting(true);
    setExportError("");
    try {
      const { default: ExcelJS } = await import("exceljs");
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("Métodos de pago A-B");
      sheet.columns = [
        { header: columns[0], key: "method", width: 27 },
        { header: columns[1], key: "a", width: 14 },
        { header: columns[2], key: "b", width: 14 },
        { header: columns[3], key: "unassigned", width: 16 },
        { header: columns[4], key: "total", width: 14 },
      ];
      sheet.spliceRows(1, 0, ["MÉTODOS DE PAGO POR LETRA"], [`${scope} · ${reportPeriod}`], []);
      sheet.mergeCells("A1:E1");
      sheet.mergeCells("A2:E2");
      sheet.getRow(4).font = { bold: true, color: { argb: "FFFFFFFF" } };
      sheet.getRow(4).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "163A63" } };
      rows.forEach((row) => sheet.addRow(row));
      sheet.addRow({ method: "TOTAL", ...totals }).font = { bold: true };
      sheet.views = [{ state: "frozen", ySplit: 4 }];
      sheet.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 1 };
      const buffer = await workbook.xlsx.writeBuffer();
      download(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), "metodos-de-pago-a-b.xlsx");
    } catch {
      setExportError("No se pudo generar el archivo Excel.");
    } finally {
      setExporting(false);
    }
  }

  async function exportPdf() {
    setExporting(true);
    setExportError("");
    try {
      const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
      const doc = new jsPDF({ unit: "pt", format: "letter" });
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text("Metodos de pago por letra A y B", 36, 44);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.text(`${scope} | ${reportPeriod} | ${generatedBy || "NTTR"}`, 36, 62);
      autoTable(doc, {
        startY: 78,
        margin: { left: 36, right: 36 },
        head: [columns],
        body: [...rows.map((row) => [row.method, row.a, row.b, row.unassigned, row.total]), ["TOTAL", totals.a, totals.b, totals.unassigned, totals.total]],
        theme: "striped",
        headStyles: { fillColor: [22, 58, 99] },
        didParseCell: ({ cell, column }) => { cell.styles.halign = column.index ? "right" : "left"; },
      });
      download(doc.output("blob"), "metodos-de-pago-a-b.pdf");
    } catch {
      setExportError("No se pudo generar el archivo PDF.");
    } finally {
      setExporting(false);
    }
  }

  function printReport() {
    const printWindow = window.open("", "_blank", "width=900,height=700");
    if (!printWindow) {
      setExportError("Permite las ventanas emergentes para imprimir el reporte.");
      return;
    }
    setExportError("");
    const body = [...rows.map((row) => [row.method, row.a, row.b, row.unassigned, row.total]), ["TOTAL", totals.a, totals.b, totals.unassigned, totals.total]]
      .map((row) => `<tr>${row.map((value) => `<td>${escapeHtml(value)}</td>`).join("")}</tr>`).join("");
    printWindow.document.write(`<!doctype html><html><head><title>Métodos de pago A/B</title><style>body{font:12px Arial,sans-serif;color:#172033;padding:24px}h1{font-size:20px;margin:0 0 8px}p{color:#475569}table{width:100%;border-collapse:collapse;margin-top:18px}th,td{padding:9px;border-bottom:1px solid #cbd5e1}th{background:#163a63;color:white;text-align:right}th:first-child,td:first-child{text-align:left}td{text-align:right}tbody tr:last-child{font-weight:bold;background:#edf2f7}@media print{body{padding:0}@page{margin:14mm}}</style></head><body><h1>Métodos de pago por letra A y B</h1><p>${escapeHtml(scope)} · ${escapeHtml(reportPeriod)} · ${totals.total} registros</p><table><thead><tr>${columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table><script>window.onload=()=>{window.focus();window.print()}</script></body></html>`);
    printWindow.document.close();
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-[#0b1728] p-5 text-slate-100">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-black">Métodos de pago por letra A y B</h2>
          <p className="mt-1 text-sm text-slate-400">{reportPeriod} · {scope} · {totals.total} registros</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={exporting} onClick={exportExcel} className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-sm font-bold hover:bg-white/10 disabled:opacity-50"><Download className="h-4 w-4" /> Excel</button>
          <button type="button" disabled={exporting} onClick={exportPdf} className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-sm font-bold hover:bg-white/10 disabled:opacity-50"><FileText className="h-4 w-4" /> PDF</button>
          <button type="button" onClick={printReport} className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-sm font-bold hover:bg-white/10"><Printer className="h-4 w-4" /> Imprimir</button>
        </div>
      </div>
      <div className="mt-5 flex flex-nowrap gap-2 overflow-x-auto pb-2">
        {paymentReportPeriods.map((period) => <button key={period} type="button" aria-pressed={periodMode === period} onClick={() => setPeriodMode(period)} className={`min-h-11 shrink-0 rounded-xl px-3.5 py-2 text-xs font-black uppercase tracking-wide transition ${periodMode === period ? "bg-blue-500 text-white shadow-lg shadow-blue-950/30" : "border border-white/10 bg-white/[0.04] text-slate-400 hover:bg-white/10 hover:text-slate-100"}`}>{period}</button>)}
      </div>
      {periodMode === "Custom Range" && <div className="mt-3 flex flex-wrap gap-3">
        <label className="grid gap-1 text-xs font-bold text-slate-300">Start<input type="date" value={customRange.from} onChange={(event) => setCustomRange((current) => ({ ...current, from: event.target.value }))} className="rounded-lg border border-white/15 bg-[#111f33] px-3 py-2 text-white" /></label>
        <label className="grid gap-1 text-xs font-bold text-slate-300">End<input type="date" value={customRange.to} onChange={(event) => setCustomRange((current) => ({ ...current, to: event.target.value }))} className="rounded-lg border border-white/15 bg-[#111f33] px-3 py-2 text-white" /></label>
      </div>}
      <div className="mt-3 flex flex-wrap items-center gap-4">
        <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-300"><input type="checkbox" checked={paidOnly} onChange={(event) => setPaidOnly(event.target.checked)} className="h-4 w-4 accent-blue-500" /> Solo facturas pagadas</label>
      </div>
      {exportError && <p role="alert" className="mt-3 text-sm font-semibold text-red-300">{exportError}</p>}
      <div className="mt-4 overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full min-w-[550px] text-sm">
          <thead className="bg-[#163a63] text-white"><tr>{columns.map((column, index) => <th key={column} scope="col" className={`px-4 py-3 font-bold ${index ? "text-right" : "text-left"}`}>{column}</th>)}</tr></thead>
          <tbody>{rows.map((row) => <tr key={row.method} className="border-t border-white/10 even:bg-white/[0.04]"><th scope="row" className="px-4 py-3 text-left font-semibold">{row.method}</th><td className="px-4 py-3 text-right">{row.a}</td><td className="px-4 py-3 text-right">{row.b}</td><td className="px-4 py-3 text-right">{row.unassigned}</td><td className="px-4 py-3 text-right font-bold">{row.total}</td></tr>)}</tbody>
          <tfoot><tr className="border-t border-white/20 bg-white/10 font-black"><th scope="row" className="px-4 py-3 text-left">TOTAL</th><td className="px-4 py-3 text-right">{totals.a}</td><td className="px-4 py-3 text-right">{totals.b}</td><td className="px-4 py-3 text-right">{totals.unassigned}</td><td className="px-4 py-3 text-right">{totals.total}</td></tr></tfoot>
        </table>
      </div>
      <p className="mt-3 text-xs text-slate-400">A y B corresponden al campo “Received” del trabajo. Los registros sin letra válida se muestran por separado.</p>
    </section>
  );
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}
