import React, { useEffect, useMemo } from "react";
import { Download, FileText, Printer, X } from "lucide-react";
import { formatDateTime12Hour, formatTime12Hour } from "../../utils/timeFormat";

const baseColumns = [
  ["jobNumber", "Job #"],
  ["date", "Date"],
  ["time", "Time"],
  ["reference", "Reference #"],
  ["invoiceNumber", "Invoice #"],
  ["dispatch", "Dispatcher"],
  ["company", "Company"],
  ["technician", "Technician"],
  ["location", "Location"],
  ["status", "Job Status"],
  ["invoiceStatus", "Invoice Status"],
  ["paymentStatus", "Payment Status"],
];

const financialColumns = [
  ["totalBill", "Total Bill"],
  ["parts", "Parts"],
  ["techLabor", "Tech Labor"],
  ["profit", "Profit"],
];

export default function StatusJobsReport({
  statusKey,
  statusLabel,
  jobs,
  periodLabel,
  canViewFinancial,
  onClose,
  onOpenJob,
}) {
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const rows = useMemo(() => jobs.map(reportRow), [jobs]);
  const totals = useMemo(() => rows.reduce((result, row) => ({
    count: result.count + 1,
    totalBill: result.totalBill + row.totalBill,
    parts: result.parts + row.parts,
    techLabor: result.techLabor + row.techLabor,
    profit: result.profit + row.profit,
  }), { count: 0, totalBill: 0, parts: 0, techLabor: 0, profit: 0 }), [rows]);
  const showCancellationReason = statusKey === "cancelled" && rows.some((row) => row.cancellationReason);
  const columns = [
    ...baseColumns,
    ...(canViewFinancial ? financialColumns : []),
    ["updates", "Updates"],
    ...(showCancellationReason ? [["cancellationReason", "Cancellation Reason"]] : []),
  ];
  const title = `${statusLabel.toUpperCase()} JOBS REPORT`;

  function exportExcel() {
    const html = reportDocument({ title, periodLabel, rows, columns, totals, statusKey, canViewFinancial, forExcel: true });
    download(new Blob([`\ufeff${html}`], { type: "application/vnd.ms-excel;charset=utf-8" }), `${statusKey}-jobs-report-${today()}.xls`);
  }

  function openPrintable(mode) {
    const popup = window.open("", "_blank");
    if (!popup) return;
    popup.document.write(reportDocument({ title, periodLabel, rows, columns, totals, statusKey, canViewFinancial, autoPrint: true, mode }));
    popup.document.close();
  }

  return (
    <div className="fixed inset-0 z-[240] bg-black/80 p-0 backdrop-blur-sm md:p-5" role="presentation" onMouseDown={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="status-report-title"
        className="mx-auto flex h-full w-full max-w-[1700px] flex-col overflow-hidden bg-[#071525] text-white shadow-2xl md:rounded-[1.75rem] md:border md:border-white/10"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="border-b border-white/10 bg-[#0a1b31] p-4 md:p-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-300">NTTR / Dispatch Live</p>
              <h2 id="status-report-title" className="mt-2 text-2xl font-black md:text-3xl">{title}</h2>
              <p className="mt-2 text-sm font-semibold text-slate-400">Selected period: <span className="text-slate-200">{periodLabel}</span> · {rows.length} jobs</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <ActionButton icon={FileText} label="Export PDF" primary onClick={() => openPrintable("pdf")} />
              <ActionButton icon={Download} label="Export Excel" onClick={exportExcel} />
              <ActionButton icon={Printer} label="Print" onClick={() => openPrintable("print")} />
              <ActionButton icon={X} label="Back to Live Jobs" onClick={onClose} />
            </div>
          </div>
          <div className={`mt-5 grid gap-3 ${canViewFinancial ? "sm:grid-cols-2 xl:grid-cols-5" : "sm:grid-cols-1"}`}>
            <Summary label={`Total ${statusLabel}`} value={totals.count} />
            {canViewFinancial && <>
              <Summary label="Total Bill" value={money(totals.totalBill)} />
              <Summary label="Total Parts" value={money(totals.parts)} />
              <Summary label="Total Tech Labor" value={money(totals.techLabor)} />
              <Summary label={statusKey === "pending" ? "Estimated Profit" : "Total Profit"} value={money(totals.profit)} />
            </>}
          </div>
        </header>

        <div className="flex-1 overflow-auto">
          <table className="min-w-[1850px] border-collapse text-left text-xs">
            <thead className="sticky top-0 z-10 bg-[#0d213b] text-[10px] font-black uppercase tracking-wide text-blue-200">
              <tr>{columns.map(([, label]) => <th key={label} className="whitespace-nowrap border-b border-white/10 px-3 py-3">{label}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-white/[0.07] text-slate-200 transition hover:bg-white/[0.06]">
                  {columns.map(([key]) => (
                    <td key={key} className={`max-w-[300px] px-3 py-3 align-top ${key === "updates" ? "min-w-[260px] whitespace-normal" : "whitespace-nowrap"}`}>
                      {key === "jobNumber" || key === "invoiceNumber" ? (
                        <button type="button" onClick={() => onOpenJob(row.id)} className="font-black text-blue-300 underline-offset-2 hover:text-blue-200 hover:underline">
                          {display(row[key])}
                        </button>
                      ) : financialColumns.some(([field]) => field === key) ? money(row[key]) : display(row[key])}
                    </td>
                  ))}
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={columns.length} className="p-12 text-center text-sm font-bold text-slate-500">No jobs match this status in the selected period.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function ActionButton({ icon: Icon, label, onClick, primary = false }) {
  return <button type="button" onClick={onClick} className={`inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 text-sm font-black transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 ${primary ? "border-blue-300/40 bg-blue-500 text-white hover:bg-blue-400" : "border-white/10 bg-white/5 text-slate-100 hover:bg-white/10"}`}><Icon className="h-4 w-4" />{label}</button>;
}

function Summary({ label, value }) {
  return <div className="rounded-xl border border-white/10 bg-white/[0.05] p-3"><p className="text-[10px] font-black uppercase tracking-wide text-slate-400">{label}</p><p className="mt-1 text-xl font-black text-white">{value}</p></div>;
}

function reportRow(job) {
  const raw = job.raw || {};
  return {
    id: job.id,
    jobNumber: raw.display_number || raw.job_number || raw.job_no || String(job.id || "").slice(0, 8),
    date: job.date,
    time: formatTime12Hour(job.time),
    reference: job.reference,
    invoiceNumber: job.invoiceNumber,
    dispatch: job.dispatch,
    company: job.company,
    technician: job.technician,
    location: job.location,
    status: job.status,
    invoiceStatus: job.invoiceStatus,
    paymentStatus: paymentStatus(job.invoiceStatus),
    totalBill: number(job.totalBill),
    parts: number(job.parts),
    techLabor: number(job.techLabor),
    profit: number(job.profit),
    updates: String(job.updates || "").toUpperCase(),
    cancellationReason: raw.cancellation_reason || raw.cancelled_reason || raw.canceled_reason || "",
  };
}

function paymentStatus(invoiceStatus) {
  const value = String(invoiceStatus || "").toLowerCase();
  if (value.includes("paid")) return "Paid";
  if (value.includes("cancel") || value.includes("void")) return "Cancelled";
  return "Pending";
}

function reportDocument({ title, periodLabel, rows, columns, totals, statusKey, canViewFinancial, autoPrint = false, forExcel = false }) {
  const summary = canViewFinancial
    ? `<div class="summary"><b>Total ${escapeHtml(title.replace(" JOBS REPORT", ""))}: ${totals.count}</b><b>Total Bill: ${money(totals.totalBill)}</b><b>Total Parts: ${money(totals.parts)}</b><b>Total Tech Labor: ${money(totals.techLabor)}</b><b>${statusKey === "pending" ? "Estimated Profit" : "Total Profit"}: ${money(totals.profit)}</b></div>`
    : `<div class="summary"><b>Total ${escapeHtml(title.replace(" JOBS REPORT", ""))}: ${totals.count}</b></div>`;
  const bodyRows = rows.map((row) => `<tr>${columns.map(([key]) => `<td>${escapeHtml(financialColumns.some(([field]) => field === key) ? money(row[key]) : display(row[key]))}</td>`).join("")}</tr>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
    @page{size:landscape;margin:12mm 10mm 16mm;@bottom-right{content:"Page " counter(page) " of " counter(pages);font:9px Arial}}
    *{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#111827;margin:${forExcel ? "0" : "18px"}}
    h1{font-size:21px;margin:5px 0}.brand{font-size:11px;font-weight:800;color:#1d4ed8;letter-spacing:1px}.meta{color:#475569;font-size:10px;line-height:1.5}
    .summary{display:flex;flex-wrap:wrap;gap:14px;margin:14px 0;padding:10px;background:#eff6ff;border:1px solid #bfdbfe;font-size:10px}
    table{width:100%;border-collapse:collapse;font-size:7.5px}th,td{border:1px solid #cbd5e1;padding:4px;text-align:left;vertical-align:top}th{background:#dbeafe;font-size:7px;text-transform:uppercase}tr{break-inside:avoid}
    .footer{display:${forExcel ? "none" : "block"};position:fixed;bottom:-10mm;left:0;font-size:8px;color:#64748b}.page-number:after{content:counter(page)}
  </style></head><body><div class="brand">NTTR / DISPATCH LIVE</div><h1>${escapeHtml(title)}</h1><div class="meta">Selected date range: ${escapeHtml(periodLabel)}<br>Generated: ${escapeHtml(formatDateTime12Hour(new Date()))}<br>Total jobs: ${totals.count}</div>${summary}<table><thead><tr>${columns.map(([, label]) => `<th>${escapeHtml(label)}</th>`).join("")}</tr></thead><tbody>${bodyRows}</tbody></table><div class="footer">NTTR / Dispatch Live · ${escapeHtml(title)} · Page <span class="page-number"></span></div>${autoPrint ? `<script>window.onload=()=>{window.focus();window.print()}</script>` : ""}</body></html>`;
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function money(value) { return Number(value || 0).toLocaleString("en-US", { style: "currency", currency: "USD" }); }
function number(value) { const result = Number(value); return Number.isFinite(result) ? result : 0; }
function display(value) { return value === null || value === undefined || value === "" ? "—" : String(value); }
function today() { return new Date().toISOString().slice(0, 10); }
function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character])); }
