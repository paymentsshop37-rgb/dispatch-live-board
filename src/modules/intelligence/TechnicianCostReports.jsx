import React, { useEffect, useMemo, useRef, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useDataSync } from "../../lib/useDataSync.js";
import { intelligenceRange, validDate } from "./intelligenceModel.js";
import { buildTechnicianCosts, costSourceLabels, loadTechnicianCosts } from "./technicianCostReport.js";

const dollars = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const money = cents => dollars.format(cents / 100);
const pageSize = 50;
const summaryHeaders = ["Technician", "Payment transactions", "Marked Paid", "Total labor paid", "Parts recorded", "Labor + Parts Total"];
const detailHeaders = ["Date", "Technician", "Invoice #", "Reference #", "Source", "Amount", "Method", "Confirmation #", "Review", "Job ID"];

function yearRange(lastYear = false) {
  const { to } = intelligenceRange(1);
  const year = Number(to.slice(0, 4)) - Number(lastYear);
  return { from: `${year}-01-01`, to: lastYear ? `${year}-12-31` : to };
}

function summaryValues(group) {
  const laborPaid = group.transaction + group.paid_status;
  return [group.transaction, group.paid_status, laborPaid, group.job_parts, laborPaid + group.job_parts];
}

function detailRow(row, formatAmount) {
  return [row.movement_date, row.label, row.invoice_number, row.reference_number, costSourceLabels[row.source],
    row.cents == null ? null : formatAmount(row.cents), row.payment_method, row.confirmation_number, row.issue, row.job_id];
}

async function exportReport(report, from, to) {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  const summary = workbook.addWorksheet("By technician");
  summary.addRows([["Report period", from, to], ["Parts amounts come from job records. Transfer confirmation is unavailable."], [],
    summaryHeaders, ...report.groups.map(group => [group.label, ...summaryValues(group).map(value => value / 100)]),
    ["Total", ...summaryValues(report.totals).map(value => value / 100)]]);
  summary.mergeCells("A2:F2");

  const details = workbook.addWorksheet("Job and payment details");
  details.addRows([detailHeaders, ...report.rows.map(row => detailRow(row, value => value / 100))]);
  for (const [sheet, header, widths, moneyColumns] of [
    [summary, 4, [32, 24, 20, 22, 20, 24], [2, 3, 4, 5, 6]],
    [details, 1, [16, 32, 18, 22, 26, 16, 18, 24, 31, 40], [6]],
  ]) {
    sheet.views = [{ state: "frozen", ySplit: header }];
    sheet.getRow(header).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(header).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF142740" } };
    widths.forEach((width, i) => { sheet.getColumn(i + 1).width = width; });
    for (const column of moneyColumns) sheet.getColumn(column).numFmt = '"$"#,##0.00;[Red]("$"#,##0.00)';
  }
  const bytes = await workbook.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `cfo-technician-report-${from}-${to}.xlsx`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function TechnicianCostReports() {
  const [{ from, to }, setRange] = useState(yearRange);
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState(false);
  const [technician, setTechnician] = useState("");
  const [page, setPage] = useState(0);
  const request = useRef(0);
  const validRange = Boolean(validDate(from) && validDate(to) && from <= to);

  async function refresh() {
    if (!validRange) return;
    const id = ++request.current;
    setBusy(true);
    setError("");
    try {
      const movements = await loadTechnicianCosts(supabase, { from, to });
      if (id === request.current) setData({ from, to, movements });
    } catch {
      if (id === request.current) setError("Could not load the report. Refresh to try again.");
    } finally {
      if (id === request.current) setBusy(false);
    }
  }

  useEffect(() => {
    refresh();
    return () => { request.current++; };
  }, [from, to]);
  useDataSync(refresh, ["jobs", "technician_payment_transactions"], validRange, 120000);

  const report = useMemo(() => data?.from === from && data?.to === to ? buildTechnicianCosts(data.movements) : null, [data, from, to]);
  const selectedRows = report?.rows.filter(row => !technician || row.key === technician) || [];
  const pageCount = Math.ceil(selectedRows.length / pageSize);
  const currentPage = Math.min(page, Math.max(0, pageCount - 1));
  const choices = [...new Map(report?.rows.map(row => [row.key, row.label]) || [])].sort((a, b) => a[1].localeCompare(b[1]));

  function changeRange(next) {
    setRange(next);
    setPage(0);
    setTechnician("");
    setExportError(false);
  }

  async function download() {
    setExporting(true);
    setExportError(false);
    try {
      await exportReport(report, from, to);
    } catch {
      setExportError(true);
    } finally {
      setExporting(false);
    }
  }

  return <section aria-labelledby="technician-cost-title">
    <div className="intel-panel">
      <div className="intel-panel-heading">
        <div><h2 id="technician-cost-title">Technician Payments &amp; Parts</h2><p className="intel-muted">Review Live Board records for your tax year.</p></div>
        <button className="intel-button" type="button" onClick={download} disabled={!report || busy || !!error || exporting}>
          <Download size={16} /> {exporting ? "Exporting…" : "Export period to Excel"}
        </button>
      </div>
      <div className="intel-toolbar">
        <div className="intel-presets">
          <button type="button" onClick={() => changeRange(yearRange())}>This year</button>
          <button type="button" onClick={() => changeRange(yearRange(true))}>Last year</button>
        </div>
        <label>From<input type="date" value={from} onChange={event => changeRange({ from: event.target.value, to })} /></label>
        <label>To<input type="date" value={to} onChange={event => changeRange({ from, to: event.target.value })} /></label>
        <button className="intel-button" type="button" onClick={refresh} disabled={!validRange || busy}><RefreshCw size={15} /> Refresh report</button>
      </div>
      {!validRange && <p role="alert" className="intel-warning">Choose valid dates in chronological order.</p>}
      {validRange && busy && <p role="status" className="intel-muted">Refreshing technician costs…</p>}
      {validRange && error && <p role="alert" className="intel-warning">{error}</p>}
      {exportError && <p role="alert" className="intel-warning">Could not generate the Excel report. Try again.</p>}
    </div>
    {validRange && report && !error && <>
      <div className="intel-kpis">
        <CostTotal label="Total labor paid" cents={report.totals.transaction + report.totals.paid_status} />
        <CostTotal label="Payment transactions" cents={report.totals.transaction} />
        <CostTotal label="Jobs marked Paid" cents={report.totals.paid_status} />
        <CostTotal label="Parts recorded" cents={report.totals.job_parts} />
      </div>
      <p className="intel-footnote">Labor uses the payment date or the date the job was marked Paid. Voided payments are excluded. Parts use the job date and show the Parts amount saved in Live Board. The board does not confirm a transfer to the technician for that amount.</p>
      {report.reviewCount > 0 && <p className="intel-warning">{report.reviewCount} records need review and are excluded from totals. Records without a date appear in every period for review.</p>}
      <section className="intel-panel">
        <div className="intel-panel-heading"><h2>Totals by technician</h2></div>
        <div className="intel-table-scroll"><table>
          <thead><tr>{summaryHeaders.map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
          <tbody>{report.groups.map(group => <tr key={group.key}>
            <th scope="row">{group.label}</th>{summaryValues(group).map((value, index) => <td key={summaryHeaders[index + 1]}>{money(value)}</td>)}
          </tr>)}</tbody>
          {report.groups.length > 0 && <tfoot><tr>
            <th scope="row">Total</th>{summaryValues(report.totals).map((value, index) => <td key={summaryHeaders[index + 1]}><strong>{money(value)}</strong></td>)}
          </tr></tfoot>}
        </table></div>
        {!report.groups.length && <p className="intel-empty">No amounts with valid dates for this period.</p>}
      </section>
      <section className="intel-panel">
        <div className="intel-panel-heading"><h2>Job and payment details</h2>
          <select aria-label="Filter details by technician" value={technician} onChange={event => { setTechnician(event.target.value); setPage(0); }}>
            <option value="">All technicians</option>
            {choices.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </div>
        <div className="intel-table-scroll"><table>
          <thead><tr>{detailHeaders.slice(0, -1).map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
          <tbody>{selectedRows.slice(currentPage * pageSize, (currentPage + 1) * pageSize).map(row => <tr key={row.movement_key}>
            {detailRow(row, money).slice(0, -1).map((value, index) => <td key={detailHeaders[index]}>{value || "—"}</td>)}
          </tr>)}</tbody>
        </table></div>
        {!selectedRows.length && <p className="intel-empty">No records for this selection.</p>}
        {pageCount > 1 && <div className="intel-toolbar">
          <button className="intel-button" type="button" onClick={() => setPage(currentPage - 1)} disabled={currentPage === 0}>Previous</button>
          <span className="intel-muted">Page {currentPage + 1} of {pageCount} · {selectedRows.length} records</span>
          <button className="intel-button" type="button" onClick={() => setPage(currentPage + 1)} disabled={currentPage === pageCount - 1}>Next</button>
        </div>}
      </section>
    </>}
  </section>;
}

function CostTotal({ label, cents }) {
  return <div className="intel-kpi"><div><span>{label}</span></div><strong>{money(cents)}</strong></div>;
}
