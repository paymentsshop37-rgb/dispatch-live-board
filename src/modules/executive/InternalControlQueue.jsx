import React, { forwardRef, useMemo, useState } from "react";
import { Download, FileText, Printer, Search } from "lucide-react";
import { formatDateTime12Hour, formatTime12Hour } from "../../utils/timeFormat";

const queueFilters = ["All Red Jobs", "Today", "This Week", "Last Week", "This Month", "Last Month", "Custom Range"];
const headers = ["Job #", "Date", "Time", "Reference #", "Invoice #", "Dispatcher", "Company", "Technician", "Location", "Job Status", "Invoice Status", "Payment Status", "Updates", "Internal Control Color", "Days Since Marked"];

export const InternalControlQueue = forwardRef(function InternalControlQueue({ jobs, onOpenJob }, ref) {
  const [search, setSearch] = useState("");
  const [filterMode, setFilterMode] = useState("All Red Jobs");
  const [customRange, setCustomRange] = useState({ from: "", to: "" });

  const redJobs = useMemo(
    () => jobs.map(normalizeQueueJob).filter((job) => job.internalControlColor === "red"),
    [jobs]
  );
  const visibleJobs = useMemo(() => {
    const query = search.trim().toLowerCase();
    const range = queueDateRange(filterMode, customRange);
    return redJobs
      .filter((job) => filterMode === "All Red Jobs" || isWithinRange(job.date, range))
      .filter((job) => !query || [
        job.company, job.invoiceNumber, job.reference, job.technician,
        job.dispatcher, job.location,
      ].some((value) => String(value || "").toLowerCase().includes(query)))
      .sort((a, b) => b.sortKey.localeCompare(a.sortKey));
  }, [customRange, filterMode, redJobs, search]);
  const summary = useMemo(() => {
    const days = visibleJobs.map((job) => job.daysSinceMarked);
    return {
      count: visibleJobs.length,
      totalBill: visibleJobs.reduce((sum, job) => sum + job.totalBill, 0),
      averageDays: days.length ? Math.round((days.reduce((sum, value) => sum + value, 0) / days.length) * 10) / 10 : 0,
      oldest: visibleJobs.reduce((oldest, job) => !oldest || job.markedAt < oldest.markedAt ? job : oldest, null),
      newest: visibleJobs.reduce((newest, job) => !newest || job.markedAt > newest.markedAt ? job : newest, null),
    };
  }, [visibleJobs]);

  const exportRows = () => visibleJobs.map((job) => [
    job.jobNumber, job.date, formatTime12Hour(job.time), job.reference, job.invoiceNumber,
    job.dispatcher, job.company, job.technician, job.location, job.jobStatus,
    job.invoiceStatus, job.paymentStatus, job.updates, "Red", job.daysSinceMarked,
  ]);
  const exportExcel = () => {
    const html = exportTableHtml(exportRows(), summary);
    download(new Blob([`\ufeff${html}`], { type: "application/vnd.ms-excel;charset=utf-8" }), `internal-control-queue-${today()}.xls`);
  };
  const printReport = (autoPrint = true) => {
    const report = window.open("", "_blank", "noopener,noreferrer");
    if (!report) return;
    report.document.write(reportHtml(exportRows(), summary, autoPrint));
    report.document.close();
  };

  return (
    <section ref={ref} className="scroll-mt-5 overflow-hidden rounded-[1.5rem] border border-red-500/40 bg-[#0b1728] shadow-[0_0_28px_rgba(239,68,68,0.12)]">
      <header className="border-b border-red-500/30 bg-red-500/10 p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-red-300">Internal Operations</p>
            <h2 className="mt-1 text-2xl font-black text-white">🔴 INTERNAL CONTROL QUEUE</h2>
            <p className="mt-1 text-sm font-semibold text-slate-400">Only jobs whose internal control color is currently red.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <QueueButton icon={Download} label="Export Excel" onClick={exportExcel} />
            <QueueButton icon={FileText} label="Export PDF" onClick={() => printReport(true)} />
            <QueueButton icon={Printer} label="Print" onClick={() => printReport(true)} />
          </div>
        </div>
      </header>

      <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-5">
        <QueueMetric label="Total Red Jobs" value={summary.count} />
        <QueueMetric label="Total Bill" value={money(summary.totalBill)} />
        <QueueMetric label="Average Days in Queue" value={summary.averageDays} />
        <QueueMetric label="Oldest Red Job" value={summary.oldest ? `${summary.oldest.jobNumber} · ${summary.oldest.daysSinceMarked}d` : "—"} />
        <QueueMetric label="Newest Red Job" value={summary.newest ? `${summary.newest.jobNumber} · ${summary.newest.daysSinceMarked}d` : "—"} />
      </div>

      <div className="grid gap-3 border-y border-white/10 px-5 py-4 xl:grid-cols-[minmax(260px,1fr)_auto_auto_auto] xl:items-center">
        <label className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Company, invoice, reference, technician, dispatcher, location" className="h-10 w-full rounded-xl border border-white/10 bg-[#111f33] pl-9 pr-3 text-sm font-semibold text-white outline-none focus:border-red-400" />
        </label>
        <select value={filterMode} onChange={(event) => setFilterMode(event.target.value)} className="h-10 rounded-xl border border-white/10 bg-[#111f33] px-3 text-sm font-bold text-white">
          {queueFilters.map((filter) => <option key={filter}>{filter}</option>)}
        </select>
        <input type="date" disabled={filterMode !== "Custom Range"} value={customRange.from} onChange={(event) => setCustomRange((current) => ({ ...current, from: event.target.value }))} className="h-10 rounded-xl border border-white/10 bg-[#111f33] px-3 text-sm text-white disabled:opacity-40" />
        <input type="date" disabled={filterMode !== "Custom Range"} value={customRange.to} onChange={(event) => setCustomRange((current) => ({ ...current, to: event.target.value }))} className="h-10 rounded-xl border border-white/10 bg-[#111f33] px-3 text-sm text-white disabled:opacity-40" />
      </div>

      <div className="max-h-[540px] overflow-auto">
        <table className="min-w-[1900px] w-full border-separate border-spacing-0 text-left text-xs text-white">
          <thead className="sticky top-0 z-10 bg-[#08111f] uppercase tracking-wide text-slate-300">
            <tr>{headers.map((header) => <th key={header} className="border-b border-white/10 px-3 py-3 font-black">{header}</th>)}</tr>
          </thead>
          <tbody>
            {visibleJobs.map((job) => (
              <tr key={job.id} className="text-white" style={{ backgroundColor: "rgba(255,0,0,0.75)", boxShadow: "inset 10px 0 0 #FF0000, 0 0 14px #FF000066" }}>
                <QueueCell><JobLink label={job.jobNumber} job={job} onOpenJob={onOpenJob} /></QueueCell>
                <QueueCell>{job.date || "—"}</QueueCell>
                <QueueCell>{formatTime12Hour(job.time) || "—"}</QueueCell>
                <QueueCell>{job.reference || "—"}</QueueCell>
                <QueueCell><JobLink label={job.invoiceNumber || "—"} job={job} onOpenJob={onOpenJob} /></QueueCell>
                <QueueCell>{job.dispatcher || "—"}</QueueCell>
                <QueueCell>{job.company || "—"}</QueueCell>
                <QueueCell>{job.technician || "—"}</QueueCell>
                <QueueCell>{job.location || "—"}</QueueCell>
                <QueueCell><StatusPill label={job.jobStatus} /></QueueCell>
                <QueueCell><StatusPill label={job.invoiceStatus} /></QueueCell>
                <QueueCell><StatusPill label={job.paymentStatus} /></QueueCell>
                <QueueCell><span className="block max-w-72 whitespace-pre-wrap">{job.updates || "—"}</span></QueueCell>
                <QueueCell><span className="inline-flex items-center gap-2 font-black"><span className="h-3 w-3 rounded-full bg-red-500" />Red</span></QueueCell>
                <QueueCell><strong>{job.daysSinceMarked}</strong></QueueCell>
              </tr>
            ))}
            {!visibleJobs.length && <tr><td colSpan={headers.length} className="p-10 text-center font-bold text-slate-500">No red Internal Control jobs match the current filters.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
});

function normalizeQueueJob(job) {
  const raw = job.raw || job;
  const date = dateOnly(job.date || raw.job_date || raw.created_at);
  const updatedAt = raw.internal_control_marked_at || raw.updated_at || raw.created_at || `${date}T00:00:00`;
  return {
    id: job.id || raw.id,
    raw,
    jobNumber: job.displayNumber || raw.display_number || raw.job_number || String(job.id || raw.id || "").slice(0, 8),
    date,
    time: job.time || raw.job_time || raw.created_at || "",
    reference: job.reference || raw.reference_number || "",
    invoiceNumber: job.invoiceNumber || raw.invoice_number || "",
    dispatcher: job.dispatch || job.dispatcher || raw.dispatch || "",
    company: job.company || raw.company || "",
    technician: job.technician || job.tech || raw.tech || "",
    location: job.location || raw.location || "",
    jobStatus: job.status || raw.status || "—",
    invoiceStatus: job.invoiceStatus || raw.invoice_status || "Pending",
    paymentStatus: paymentState(job.invoiceStatus || raw.invoice_status),
    updates: job.updates || raw.updates || "",
    internalControlColor: String(job.internalControlColor || raw.internal_control_color || "none").toLowerCase(),
    totalBill: Number(job.totalBill ?? raw.total_bill ?? 0),
    markedAt: updatedAt,
    updatedAt,
    sortKey: `${date} ${raw.job_time || job.time || ""} ${updatedAt}`,
    daysSinceMarked: daysBetween(updatedAt),
  };
}

function paymentState(invoiceStatus) {
  const status = String(invoiceStatus || "").toLowerCase();
  if (status.includes("paid")) return "Paid";
  if (status.includes("cancel") || status.includes("void")) return "Cancelled";
  return "Pending";
}

function queueDateRange(mode, customRange) {
  const now = new Date();
  const todayValue = today();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  if (mode === "Today") return { from: todayValue, to: todayValue };
  if (mode === "This Week") return { from: localDate(startOfWeek), to: todayValue };
  if (mode === "Last Week") {
    const from = new Date(startOfWeek); from.setDate(from.getDate() - 7);
    const to = new Date(startOfWeek); to.setDate(to.getDate() - 1);
    return { from: localDate(from), to: localDate(to) };
  }
  if (mode === "This Month") return { from: `${todayValue.slice(0, 7)}-01`, to: todayValue };
  if (mode === "Last Month") {
    return { from: localDate(new Date(now.getFullYear(), now.getMonth() - 1, 1)), to: localDate(new Date(now.getFullYear(), now.getMonth(), 0)) };
  }
  return { from: customRange.from || "1900-01-01", to: customRange.to || "2999-12-31" };
}

function isWithinRange(value, range) { return Boolean(value && value >= range.from && value <= range.to); }
function daysBetween(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 0;
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 86400000));
}
function dateOnly(value) { return String(value || "").slice(0, 10); }
function localDate(date) { return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
function today() { return localDate(new Date()); }
function money(value) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value || 0)); }
function QueueMetric({ label, value }) { return <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4"><p className="text-[10px] font-black uppercase tracking-wide text-red-200">{label}</p><p className="mt-2 text-xl font-black text-white">{value}</p></div>; }
function QueueButton({ icon: Icon, label, onClick }) { return <button type="button" onClick={onClick} className="inline-flex h-10 items-center gap-2 rounded-xl border border-red-400/30 bg-red-500/20 px-3 text-xs font-black text-white hover:bg-red-500/30"><Icon className="h-4 w-4" />{label}</button>; }
function QueueCell({ children }) { return <td className="border-b border-red-200/20 px-3 py-3 align-middle">{children}</td>; }
function JobLink({ label, job, onOpenJob }) { return <button type="button" onClick={() => onOpenJob?.(job.id)} className="font-black text-white underline decoration-white/50 underline-offset-4 hover:text-red-100">{label}</button>; }
function StatusPill({ label }) { return <span className="rounded-full border border-white/20 bg-[#0b1728] px-2 py-1 font-bold text-white">{label || "—"}</span>; }
function download(blob, filename) { const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url); }
function exportTableHtml(rows, summary) { return `<h1>INTERNAL CONTROL QUEUE</h1><p>${summary.count} red jobs · Total Bill ${escapeHtml(money(summary.totalBill))} · Average ${summary.averageDays} days</p><table><thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((value) => `<td>${escapeHtml(value)}</td>`).join("")}</tr>`).join("")}</tbody></table>`; }
function reportHtml(rows, summary, autoPrint) { return `<!doctype html><html><head><title>Internal Control Queue</title><style>body{font-family:Arial,sans-serif;padding:24px;color:#111}table{width:100%;border-collapse:collapse;font-size:9px}th,td{border:1px solid #bbb;padding:6px;text-align:left}th{background:#fee2e2}h1{color:#b91c1c}</style></head><body>${exportTableHtml(rows, summary)}${autoPrint ? "<script>window.onload=()=>window.print()</script>" : ""}</body></html>`; }
function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character])); }
