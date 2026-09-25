import React, { useMemo, useState } from "react";
import { Download, FileText, Printer } from "lucide-react";
import { buildPaymentMethodsReport, filterPaymentReportJobs, paymentMethodFinancialRows, paymentMethodTotalRows, paymentReportPeriods } from "./paymentMethodSummary.js";

const columns = ["Método de pago", "Letra A", "Letra B", "Sin letra", "Total"];
const financialColumns = ["Método de pago", "Letra", "Facturas", "Total Bill", "Cobrado registrado", "Profit estimado"];
const money = (value) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);

export default function PaymentMethodsReport({ jobs, paymentSummaries = [], paymentsLoaded = false, generatedBy }) {
  const [paidOnly, setPaidOnly] = useState(true);
  const [periodMode, setPeriodMode] = useState("This Week");
  const [customRange, setCustomRange] = useState({ from: "", to: "" });
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const reportJobs = useMemo(() => filterPaymentReportJobs(jobs, periodMode, customRange), [jobs, periodMode, customRange]);
  const reportPeriod = periodMode === "Custom Range" ? `Custom Range · ${customRange.from || "Inicio"} – ${customRange.to || "Sin límite"}` : periodMode;
  const report = useMemo(() => buildPaymentMethodsReport(reportJobs, { paidOnly, paymentSummaries }), [reportJobs, paidOnly, paymentSummaries]);
  const { rows, totals } = report;
  const financialRows = useMemo(() => paymentMethodFinancialRows(report), [report]);
  const financialTotalsRows = useMemo(() => paymentMethodTotalRows(report), [report]);
  const financialTableRows = [...financialRows, ...financialTotalsRows];
  const scope = paidOnly ? "Facturas pagadas" : "Todos los trabajos";
  const paymentNote = paymentsLoaded
    ? `Facturas pagadas sin cobro registrado: ${totals.financial.total.paidWithoutRecord}. El periodo usa la fecha del trabajo; cobrado suma sus pagos no anulados, aunque se hayan recibido en otra fecha. Profit estimado = Total Bill - Parts - Tech Labor.`
    : "Cobros registrados no disponibles. El periodo usa la fecha del trabajo. Profit estimado = Total Bill - Parts - Tech Labor.";

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
      sheet.addRow([]);
      const detailTitle = sheet.addRow(["MONTOS POR MÉTODO Y LETRA"]);
      sheet.mergeCells(detailTitle.number, 1, detailTitle.number, 6);
      detailTitle.font = { bold: true, color: { argb: "FFFFFFFF" } };
      detailTitle.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "163A63" } };
      sheet.addRow(financialColumns).font = { bold: true };
      sheet.getColumn(6).width = 20;
      for (const entry of financialTableRows) {
        const row = sheet.addRow([entry.method, entry.letter, entry.jobs, entry.billed, paymentsLoaded ? entry.collected : "No disponible", entry.profit]);
        for (const column of [4, 5, 6]) row.getCell(column).numFmt = '$#,##0.00;[Red]($#,##0.00);$0.00';
        if (entry.method.startsWith("TOTAL")) row.font = { bold: true };
      }
      sheet.addRow([]);
      const noteRow = sheet.addRow([paymentNote]);
      sheet.mergeCells(noteRow.number, 1, noteRow.number, 6);
      noteRow.getCell(1).alignment = { wrapText: true, vertical: "middle" };
      noteRow.height = 32;
      sheet.views = [{ state: "frozen", ySplit: 4 }];
      sheet.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
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
      let detailY = doc.lastAutoTable.finalY + 28;
      if (detailY > 730) { doc.addPage(); detailY = 44; }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text("Montos por metodo y letra", 36, detailY);
      autoTable(doc, {
        startY: detailY + 10,
        margin: { left: 36, right: 36 },
        head: [financialColumns],
        body: financialRows.map((entry) => [entry.method, entry.letter, entry.jobs, money(entry.billed), paymentsLoaded ? money(entry.collected) : "No disponible", money(entry.profit)]),
        theme: "striped",
        styles: { fontSize: 8 },
        headStyles: { fillColor: [22, 58, 99] },
        didParseCell: ({ cell, column }) => { cell.styles.halign = column.index >= 2 ? "right" : "left"; },
      });
      let totalsY = doc.lastAutoTable.finalY + 12;
      if (totalsY + 30 + financialTotalsRows.length * 28 > 755) { doc.addPage(); totalsY = 44; }
      autoTable(doc, {
        startY: totalsY,
        margin: { left: 36, right: 36 },
        head: [financialColumns],
        body: financialTotalsRows.map((entry) => [entry.method, entry.letter, entry.jobs, money(entry.billed), paymentsLoaded ? money(entry.collected) : "No disponible", money(entry.profit)]),
        theme: "striped",
        pageBreak: "avoid",
        styles: { fontSize: 8, fontStyle: "bold" },
        headStyles: { fillColor: [22, 58, 99] },
        didParseCell: ({ cell, column }) => { cell.styles.halign = column.index >= 2 ? "right" : "left"; },
      });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      const noteY = doc.lastAutoTable.finalY + 18;
      const noteLines = doc.splitTextToSize(paymentNote, 540);
      if (noteY + noteLines.length * 10 > 755) { doc.addPage(); doc.text(noteLines, 36, 42); }
      else doc.text(noteLines, 36, noteY);
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
    const amountRow = (entry) => `<tr>${[entry.method, entry.letter, entry.jobs, money(entry.billed), paymentsLoaded ? money(entry.collected) : "No disponible", money(entry.profit)].map((value) => `<td>${escapeHtml(value)}</td>`).join("")}</tr>`;
    const amounts = financialRows.map(amountRow).join("");
    const amountTotals = financialTotalsRows.map(amountRow).join("");
    const financialHead = `<thead><tr>${financialColumns.map((column) => `<th>${escapeHtml(column)}</th>`).join("")}</tr></thead>`;
    printWindow.document.write(`<!doctype html><html><head><title>Métodos de pago A/B</title><style>body{font:12px Arial,sans-serif;color:#172033;padding:24px}h1{font-size:20px;margin:0 0 8px}h2{font-size:15px;margin:28px 0 0}h3{font-size:13px;margin:20px 0 0}p{color:#475569}table{width:100%;border-collapse:collapse;margin-top:18px}th,td{padding:9px;border-bottom:1px solid #cbd5e1}th{background:#163a63;color:white;text-align:right}th:first-child,td:first-child,.financial th:nth-child(2),.financial td:nth-child(2){text-align:left}td{text-align:right}.count-table tbody tr:last-child,.totals-table tbody tr{font-weight:bold;background:#edf2f7}tr,.totals-block{break-inside:avoid;page-break-inside:avoid}.totals-table{margin-top:8px}@media print{body{padding:0}@page{margin:14mm}}</style></head><body><h1>Métodos de pago por letra A y B</h1><p>${escapeHtml(scope)} · ${escapeHtml(reportPeriod)} · ${totals.total} registros</p><table class="count-table"><thead><tr>${columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table><h2>Montos por método y letra</h2><table class="financial">${financialHead}<tbody>${amounts}</tbody></table><section class="totals-block"><h3>Totales por letra</h3><table class="financial totals-table">${financialHead}<tbody>${amountTotals}</tbody></table></section><p>${escapeHtml(paymentNote)}</p><script>window.onload=()=>{window.focus();window.print()}</script></body></html>`);
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
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <AmountCard label="Total Bill" value={money(totals.financial.total.billed)} />
        <AmountCard label="Cobrado registrado" value={paymentsLoaded ? money(totals.financial.total.collected) : "No disponible"} />
        <AmountCard label="Profit estimado" value={money(totals.financial.total.profit)} />
      </div>
      {paymentsLoaded && paidOnly && totals.financial.total.paidWithoutRecord > 0 && <p className="mt-3 text-xs font-semibold text-amber-300">{totals.financial.total.paidWithoutRecord} facturas marcadas Paid no tienen una transacción de cobro registrada.</p>}
      <p className="mt-3 text-xs text-slate-400">A y B corresponden al campo “Received” del trabajo. Los registros sin letra válida se muestran por separado.</p>
    </section>
  );
}

function AmountCard({ label, value }) {
  return <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3"><p className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</p><p className="mt-1 text-lg font-black text-white">{value}</p></div>;
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
