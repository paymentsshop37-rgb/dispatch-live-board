import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Download,
  Eye,
  FileText,
  Printer,
  RefreshCw,
  Search,
  Users,
} from "lucide-react";
import { supabase } from "../../lib/supabase";
import { formatDateTime12Hour, formatTime12Hour } from "../../utils/timeFormat";
import {
  groupPaymentsByTechnician,
  isPendingPayment,
  normalizeTechnicianPayment,
  oldestPaymentFirst,
  paymentPresetRange,
  summarizeTechnicianPayments,
} from "./technicianPaymentData";

const datePresets = [
  "All Pending",
  "Today",
  "This Week",
  "Last Week",
  "This Month",
  "Last Month",
  "Last 30 Days",
  "Last 90 Days",
  "This Year",
  "Custom Range",
];

export default function TechnicianPaymentsReport({
  session,
  role,
  canViewFinancial,
  canMarkPaid,
  canExport,
  onBack,
  onOpenJob,
}) {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [view, setView] = useState("jobs");
  const [datePreset, setDatePreset] = useState("All Pending");
  const [customRange, setCustomRange] = useState({ from: "", to: "" });
  const [search, setSearch] = useState("");
  const [technicianFilter, setTechnicianFilter] = useState("All Technicians");
  const [selected, setSelected] = useState([]);
  const [allowMultipleTechnicians, setAllowMultipleTechnicians] = useState(false);
  const [confirmation, setConfirmation] = useState(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    loadPendingPayments();
    const channel = supabase
      .channel("technician-payments-pending-report")
      .on("postgres_changes", { event: "*", schema: "public", table: "jobs" }, loadPendingPayments)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  async function loadPendingPayments() {
    setLoading(true);
    const { data, error: loadError } = await supabase
      .from("jobs")
      .select("*")
      .ilike("tech_payment_status", "Pending");
    if (loadError) {
      setError(`Unable to load pending technician payments: ${loadError.message}`);
      setJobs([]);
    } else {
      setError("");
      setJobs((data || []).filter(isPendingPayment).map((row) => normalizeTechnicianPayment(row)).sort(oldestPaymentFirst));
    }
    setLoading(false);
  }

  const dateRange = useMemo(() => paymentPresetRange(datePreset, customRange), [datePreset, customRange]);
  const filteredJobs = useMemo(() => jobs.filter((job) => {
    const query = search.trim().toLowerCase();
    const matchesSearch = !query || [job.jobNumber, job.invoiceNumber, job.referenceNumber, job.company, job.technician, job.location, job.dispatcher]
      .some((value) => String(value || "").toLowerCase().includes(query));
    const matchesTechnician = technicianFilter === "All Technicians" || job.technician === technicianFilter;
    const matchesDate = !dateRange || (job.date && job.date >= dateRange.from && job.date <= dateRange.to);
    return matchesSearch && matchesTechnician && matchesDate;
  }), [dateRange, jobs, search, technicianFilter]);

  const groups = useMemo(() => groupPaymentsByTechnician(filteredJobs), [filteredJobs]);
  const totals = useMemo(() => summarizeTechnicianPayments(filteredJobs), [filteredJobs]);
  const technicians = useMemo(() => [...new Set(jobs.map((job) => job.technician))].sort(), [jobs]);
  const selectedJobs = useMemo(() => filteredJobs.filter((job) => selected.includes(job.id)), [filteredJobs, selected]);
  const selectedTechnicians = useMemo(() => [...new Set(selectedJobs.map((job) => job.technician))], [selectedJobs]);
  const selectedTotal = selectedJobs.reduce((sum, job) => sum + job.amount, 0);
  const hasMixedTechnicians = selectedTechnicians.length > 1;

  useEffect(() => {
    setSelected((current) => current.filter((id) => filteredJobs.some((job) => job.id === id)));
  }, [filteredJobs]);

  function openTechnician(technician) {
    setTechnicianFilter(technician);
    setView("jobs");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function requestSinglePayment(job) {
    setConfirmation({ jobs: [job], allowMultiple: false });
  }

  function requestBulkPayment() {
    if (!selectedJobs.length || (hasMixedTechnicians && !allowMultipleTechnicians)) return;
    setConfirmation({ jobs: selectedJobs, allowMultiple: hasMixedTechnicians && allowMultipleTechnicians });
  }

  async function confirmPayment() {
    if (!confirmation?.jobs?.length || saving) return;
    setSaving(true);
    const ids = confirmation.jobs.map((job) => job.id);
    const { error: saveError } = await supabase.rpc("mark_technician_payments_paid", {
      p_job_ids: ids,
      p_allow_multiple_technicians: Boolean(confirmation.allowMultiple),
    });
    if (saveError) {
      setError(saveError.message || "Unable to mark the selected payments paid.");
    } else {
      setJobs((current) => current.filter((job) => !ids.includes(job.id)));
      setSelected((current) => current.filter((id) => !ids.includes(id)));
      setNotice(`${ids.length} technician payment${ids.length === 1 ? "" : "s"} marked paid by ${session?.name || session?.username || "the current user"}.`);
      window.setTimeout(() => setNotice(""), 4500);
    }
    setSaving(false);
    setConfirmation(null);
  }

  function exportExcel() {
    const generated = formatDateTime12Hour(new Date());
    const filterLabel = reportFilterLabel(datePreset, customRange, technicianFilter, search);
    const detailRows = filteredJobs.map((job) => [
      job.jobNumber, job.date, formatTime12Hour(job.time), job.invoiceNumber, job.referenceNumber,
      job.company, job.technician, job.location, job.jobStatus, job.amount, job.techPaymentStatus,
      job.daysPending, job.dispatcher, job.updates,
    ]);
    const groupRows = groups.map((group) => [group.technician, group.pendingJobs, group.totalAmount, group.oldestPendingJob, group.averageAmount]);
    const rows = [
      ["TECHNICIAN PAYMENTS PENDING REPORT"],
      ["Generated", generated],
      ["Filters", filterLabel],
      [],
      ["Job #", "Date", "Time", "Invoice #", "Reference #", "Company", "Technician", "Location", "Job Status", "Tech Labor", "Tech Payment Status", "Days Pending", "Dispatcher", "Updates"],
      ...detailRows,
      [],
      ["TOTALS BY TECHNICIAN"],
      ["Technician", "Pending Jobs", "Total Amount Owed", "Oldest Pending Job", "Average Amount per Job"],
      ...groupRows,
      ["GRAND TOTAL", totals.count, totals.amount],
    ];
    downloadDelimited(rows, `technician-payments-pending-${todayKey()}.xls`);
  }

  function printReport() {
    const reportWindow = window.open("", "_blank", "width=1400,height=900");
    if (!reportWindow) return;
    reportWindow.document.write(buildPrintableReport({ filteredJobs, groups, totals, datePreset, customRange, technicianFilter, search }));
    reportWindow.document.close();
  }

  const warning = totals.overdue > 0 || totals.missing > 0;

  return (
    <div className="min-h-screen bg-slate-100 p-3 sm:p-5 xl:p-8">
      <div className="mx-auto max-w-[1800px] space-y-5">
        <header className="rounded-3xl bg-[#0b1628] p-5 text-white shadow-xl sm:p-7">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <button type="button" onClick={onBack} className="mb-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-white/10 px-4 text-sm font-bold text-slate-200 hover:bg-white/15">
                <ArrowLeft className="h-4 w-4" /> Back
              </button>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-300">Admin Financial Control</p>
              <h1 className="mt-2 text-2xl font-black sm:text-4xl">Technician Payments Pending Report</h1>
              <p className="mt-2 max-w-3xl text-sm font-semibold text-slate-400">Every job whose Tech Payment Status is Pending. All Pending ignores the original job date.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={loadPendingPayments} className="action-button"><RefreshCw className="h-4 w-4" /> Refresh</button>
              {canExport && <button type="button" onClick={exportExcel} className="action-button"><Download className="h-4 w-4" /> Export Excel</button>}
              {canExport && <button type="button" onClick={printReport} className="action-button"><FileText className="h-4 w-4" /> Export PDF</button>}
              {canExport && <button type="button" onClick={printReport} className="action-button"><Printer className="h-4 w-4" /> Print</button>}
            </div>
          </div>
        </header>

        {notice && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 font-bold text-emerald-800"><CheckCircle2 className="mr-2 inline h-5 w-5" />{notice}</div>}
        {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 font-bold text-red-800">{error}</div>}
        {warning && <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 font-bold text-amber-900"><AlertTriangle className="mr-2 inline h-5 w-5" />{totals.overdue > 0 ? `${totals.overdue} payment${totals.overdue === 1 ? " is" : "s are"} 8+ days pending. ` : ""}{totals.missing > 0 ? `${totals.missing} pending job${totals.missing === 1 ? " has" : "s have"} missing or zero Tech Labor.` : ""}</div>}

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <SummaryCard label="Total Pending Payments" value={totals.count} />
          <SummaryCard label="Total Amount Owed" value={canViewFinancial ? money(totals.amount) : "Restricted"} accent />
          <SummaryCard label="Technicians Owed" value={totals.technicians} />
          <SummaryCard label="Jobs Missing Tech Labor" value={totals.missing} warning={totals.missing > 0} />
          <SummaryCard label="Oldest Pending Payment" value={totals.oldestDays == null ? "—" : `${totals.oldestDays} days`} />
          <SummaryCard label="Average Days Pending" value={`${totals.averageDays.toFixed(1)} days`} />
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(220px,1fr)_220px_220px_160px_160px]">
            <label className="relative">
              <span className="sr-only">Search payments</span>
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search job, invoice, company, technician…" className="report-control pl-10" />
            </label>
            <select value={datePreset} onChange={(event) => setDatePreset(event.target.value)} className="report-control" aria-label="Date filter">
              {datePresets.map((preset) => <option key={preset}>{preset}</option>)}
            </select>
            <select value={technicianFilter} onChange={(event) => setTechnicianFilter(event.target.value)} className="report-control" aria-label="Technician filter">
              <option>All Technicians</option>
              {technicians.map((technician) => <option key={technician}>{technician}</option>)}
            </select>
            <input type="date" value={customRange.from} disabled={datePreset !== "Custom Range"} onChange={(event) => setCustomRange((current) => ({ ...current, from: event.target.value }))} className="report-control disabled:bg-slate-100" aria-label="Custom range start" />
            <input type="date" value={customRange.to} disabled={datePreset !== "Custom Range"} onChange={(event) => setCustomRange((current) => ({ ...current, to: event.target.value }))} className="report-control disabled:bg-slate-100" aria-label="Custom range end" />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <ViewButton active={view === "jobs"} onClick={() => setView("jobs")}>Pending Jobs</ViewButton>
            <ViewButton active={view === "technicians"} onClick={() => setView("technicians")}><Users className="h-4 w-4" /> By Technician</ViewButton>
            <span className="ml-auto self-center text-xs font-bold uppercase tracking-wide text-slate-500">{filteredJobs.length} matching jobs</span>
          </div>
        </section>

        {view === "technicians" ? (
          <TechnicianView groups={groups} totals={totals} canViewFinancial={canViewFinancial} onOpen={openTechnician} />
        ) : (
          <JobsView
            jobs={filteredJobs}
            loading={loading}
            selected={selected}
            setSelected={setSelected}
            canViewFinancial={canViewFinancial}
            canMarkPaid={canMarkPaid}
            onOpenJob={onOpenJob}
            onMarkPaid={requestSinglePayment}
          />
        )}

        {view === "jobs" && canMarkPaid && selectedJobs.length > 0 && (
          <div className="sticky bottom-3 z-30 rounded-3xl border border-blue-200 bg-white p-4 shadow-2xl sm:p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap gap-6">
                <div><p className="text-xs font-black uppercase text-slate-500">Selected Jobs</p><p className="text-2xl font-black text-slate-950">{selectedJobs.length}</p></div>
                <div><p className="text-xs font-black uppercase text-slate-500">Total to Pay</p><p className="text-2xl font-black text-blue-700">{money(selectedTotal)}</p></div>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                {hasMixedTechnicians && <label className="flex min-h-11 items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 text-sm font-bold text-amber-900"><input type="checkbox" checked={allowMultipleTechnicians} onChange={(event) => setAllowMultipleTechnicians(event.target.checked)} /> Allow Multiple Technicians</label>}
                <button type="button" disabled={hasMixedTechnicians && !allowMultipleTechnicians} onClick={requestBulkPayment} className="min-h-11 rounded-xl bg-blue-600 px-5 font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300">Mark Selected as Paid</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {confirmation && (
        <ConfirmationModal
          jobs={confirmation.jobs}
          saving={saving}
          onCancel={() => setConfirmation(null)}
          onConfirm={confirmPayment}
        />
      )}
    </div>
  );
}

function JobsView({ jobs, loading, selected, setSelected, canViewFinancial, canMarkPaid, onOpenJob, onMarkPaid }) {
  const allSelected = jobs.length > 0 && jobs.every((job) => selected.includes(job.id));
  const toggleAll = () => setSelected(allSelected ? [] : jobs.map((job) => job.id));
  const toggle = (id) => setSelected((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  if (loading) return <EmptyState label="Loading pending technician payments…" />;
  if (!jobs.length) return <EmptyState label="No pending technician payments match the current filters." />;
  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full min-w-[1800px] text-left text-sm">
          <thead className="bg-slate-900 text-xs uppercase tracking-wide text-slate-300"><tr>
            {canMarkPaid && <th className="px-3 py-4"><input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all visible payments" /></th>}
            {['Job #','Date','Time','Invoice #','Reference #','Company','Technician','Location','Job Status','Tech Labor','Tech Payment Status','Days Pending','Dispatcher','Updates','Actions'].map((header) => <th key={header} className="whitespace-nowrap px-3 py-4 font-black">{header}</th>)}
          </tr></thead>
          <tbody>{jobs.map((job) => <tr key={job.id} className="border-t border-slate-200 align-top hover:bg-slate-50">
            {canMarkPaid && <td className="px-3 py-4"><input type="checkbox" checked={selected.includes(job.id)} onChange={() => toggle(job.id)} aria-label={`Select job ${job.jobNumber}`} /></td>}
            <td className="px-3 py-4 font-black text-blue-700">{job.jobNumber}</td><td className="whitespace-nowrap px-3 py-4">{display(job.date)}</td><td className="whitespace-nowrap px-3 py-4">{formatTime12Hour(job.time) || '—'}</td>
            <td className="px-3 py-4">{display(job.invoiceNumber)}</td><td className="px-3 py-4">{display(job.referenceNumber)}</td><td className="px-3 py-4 font-bold">{display(job.company)}</td><td className="px-3 py-4 font-bold">{job.technician}</td>
            <td className="max-w-[240px] px-3 py-4">{display(job.location)}</td><td className="px-3 py-4">{display(job.jobStatus)}</td>
            <td className="px-3 py-4 font-black">{canViewFinancial ? money(job.amount) : 'Restricted'}{job.missingLabor && <span className="mt-1 block whitespace-nowrap text-[10px] font-black uppercase text-red-600">Missing Tech Labor</span>}</td>
            <td className="px-3 py-4"><span className="rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-black text-orange-700">Pending</span></td>
            <td className="px-3 py-4"><DaysBadge days={job.daysPending} /></td><td className="px-3 py-4">{display(job.dispatcher)}</td><td className="max-w-[300px] px-3 py-4"><p className="line-clamp-3 whitespace-pre-wrap">{display(job.updates)}</p></td>
            <td className="px-3 py-4"><div className="flex gap-2"><button type="button" onClick={() => onOpenJob?.(job.id)} className="table-button"><Eye className="h-4 w-4" /> View</button>{canMarkPaid && <button type="button" onClick={() => onMarkPaid(job)} className="table-button border-emerald-200 text-emerald-700"><CheckCircle2 className="h-4 w-4" /> Mark Paid</button>}</div></td>
          </tr>)}</tbody>
        </table>
      </div>
      <div className="grid gap-3 p-3 lg:hidden">{jobs.map((job) => <article key={job.id} className="rounded-2xl border border-slate-200 p-4">
        <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black uppercase text-slate-500">Job #{job.jobNumber}</p><h3 className="mt-1 text-lg font-black text-slate-950">{job.technician}</h3><p className="text-sm font-semibold text-slate-500">{job.company}</p></div>{canMarkPaid && <input type="checkbox" checked={selected.includes(job.id)} onChange={() => toggle(job.id)} aria-label={`Select job ${job.jobNumber}`} />}</div>
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm"><MobileField label="Date" value={job.date} /><MobileField label="Invoice" value={job.invoiceNumber} /><MobileField label="Tech Labor" value={canViewFinancial ? money(job.amount) : 'Restricted'} warning={job.missingLabor} /><MobileField label="Days Pending" value={<DaysBadge days={job.daysPending} />} /><MobileField label="Location" value={job.location} wide /><MobileField label="Dispatcher" value={job.dispatcher} /></div>
        <div className="mt-4 flex gap-2"><button type="button" onClick={() => onOpenJob?.(job.id)} className="table-button flex-1 justify-center"><Eye className="h-4 w-4" /> View Job</button>{canMarkPaid && <button type="button" onClick={() => onMarkPaid(job)} className="table-button flex-1 justify-center border-emerald-200 text-emerald-700">Mark Paid</button>}</div>
      </article>)}</div>
    </section>
  );
}

function TechnicianView({ groups, totals, canViewFinancial, onOpen }) {
  if (!groups.length) return <EmptyState label="No technicians match the current filters." />;
  return <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"><div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead className="bg-slate-900 text-xs uppercase tracking-wide text-slate-300"><tr>{['Technician','Pending Jobs','Total Amount Owed','Oldest Pending Job','Average Amount per Job',''].map((header, index) => <th key={`${header}-${index}`} className="px-5 py-4 font-black">{header}</th>)}</tr></thead><tbody>
    {groups.map((group) => <tr key={group.technician} className="border-t border-slate-200"><td className="px-5 py-4 font-black text-slate-950">{group.technician}</td><td className="px-5 py-4">{group.pendingJobs}</td><td className="px-5 py-4 font-black text-blue-700">{canViewFinancial ? money(group.totalAmount) : 'Restricted'}</td><td className="px-5 py-4">{group.oldestPendingJob}</td><td className="px-5 py-4">{canViewFinancial ? money(group.averageAmount) : 'Restricted'}</td><td className="px-5 py-4"><button type="button" onClick={() => onOpen(group.technician)} className="table-button"><Eye className="h-4 w-4" /> Open Jobs</button></td></tr>)}
    <tr className="border-t-2 border-slate-900 bg-slate-100 font-black"><td className="px-5 py-5">Grand Total</td><td className="px-5 py-5">{totals.count}</td><td className="px-5 py-5 text-blue-800">{canViewFinancial ? money(totals.amount) : 'Restricted'}</td><td className="px-5 py-5">{totals.oldestDays == null ? '—' : `${totals.oldestDays} days`}</td><td className="px-5 py-5">{canViewFinancial && totals.count ? money(totals.amount / totals.count) : canViewFinancial ? money(0) : 'Restricted'}</td><td /></tr>
  </tbody></table></div></section>;
}

function ConfirmationModal({ jobs, saving, onCancel, onConfirm }) {
  const total = jobs.reduce((sum, job) => sum + job.amount, 0);
  return <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-950/70 p-4"><div role="dialog" aria-modal="true" className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700"><CheckCircle2 className="h-6 w-6" /></div><h2 className="mt-4 text-2xl font-black text-slate-950">Confirm Technician Payment</h2><p className="mt-3 text-base font-semibold text-slate-600">Confirm technician payment of <strong className="text-slate-950">{money(total)}</strong> for {jobs.length === 1 ? 'this job' : `${jobs.length} selected jobs`}?</p><p className="mt-2 text-sm text-slate-500">This records the paid date and current user and removes the jobs from the pending report.</p><div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button type="button" disabled={saving} onClick={onCancel} className="min-h-11 rounded-xl border border-slate-300 px-5 font-bold text-slate-700">Cancel</button><button type="button" disabled={saving} onClick={onConfirm} className="min-h-11 rounded-xl bg-emerald-600 px-5 font-black text-white disabled:bg-slate-400">{saving ? 'Saving…' : 'Mark Paid'}</button></div></div></div>;
}

function SummaryCard({ label, value, accent = false, warning = false }) { return <article className={`rounded-2xl border p-4 shadow-sm ${warning ? 'border-red-200 bg-red-50' : accent ? 'border-blue-200 bg-blue-50' : 'border-slate-200 bg-white'}`}><p className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</p><p className={`mt-2 text-2xl font-black ${warning ? 'text-red-700' : accent ? 'text-blue-800' : 'text-slate-950'}`}>{value}</p></article>; }
function ViewButton({ active, onClick, children }) { return <button type="button" onClick={onClick} className={`inline-flex min-h-11 items-center gap-2 rounded-xl px-4 text-sm font-black ${active ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}>{children}</button>; }
function EmptyState({ label }) { return <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center font-bold text-slate-500">{label}</div>; }
function MobileField({ label, value, wide = false, warning = false }) { return <div className={wide ? 'col-span-2' : ''}><p className="text-[10px] font-black uppercase text-slate-400">{label}</p><div className={`mt-1 font-bold ${warning ? 'text-red-700' : 'text-slate-800'}`}>{display(value)}{warning && <span className="block text-[10px] uppercase">Missing Tech Labor</span>}</div></div>; }
function DaysBadge({ days }) { const level = days >= 15 ? 'critical' : days >= 8 ? 'overdue' : days >= 4 ? 'attention' : 'normal'; const styles = { normal: 'border-emerald-200 bg-emerald-50 text-emerald-700', attention: 'border-amber-200 bg-amber-50 text-amber-700', overdue: 'border-orange-200 bg-orange-50 text-orange-700', critical: 'border-red-200 bg-red-50 text-red-700' }; return <span className={`inline-flex whitespace-nowrap rounded-full border px-3 py-1 text-xs font-black ${styles[level]}`}>{days} days · {level}</span>; }

function reportFilterLabel(preset, custom, technician, search) { return [preset === 'Custom Range' ? `${custom.from || '…'} to ${custom.to || '…'}` : preset, technician, search ? `Search: ${search}` : ''].filter(Boolean).join(' · '); }
function money(value) { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(finiteNumber(value)); }
function finiteNumber(value) { const number = Number(value); return Number.isFinite(number) ? number : 0; }
function safeDate(value) { const date = value ? new Date(String(value).length === 10 ? `${value}T00:00:00` : value) : new Date(); return Number.isNaN(date.getTime()) ? new Date() : date; }
function daysBetween(from, to) { return Math.max(0, Math.floor((startOfDay(to) - startOfDay(from)) / 86400000)); }
function startOfDay(value) { const date = new Date(value); date.setHours(0, 0, 0, 0); return date; }
function localDateKey(value) { const date = new Date(value); const offset = date.getTimezoneOffset() * 60000; return new Date(date.getTime() - offset).toISOString().slice(0, 10); }
function todayKey() { return localDateKey(new Date()); }
function dateOnly(value) { const match = String(value || '').match(/^\d{4}-\d{2}-\d{2}/); return match?.[0] || ''; }
function timeOnly(value) { const match = String(value || '').match(/T(\d{2}:\d{2})/); return match?.[1] || ''; }
function shortId(id) { return String(id || '').slice(0, 8).toUpperCase() || '—'; }
function display(value) { return value === null || value === undefined || value === '' ? '—' : value; }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]); }

function downloadDelimited(rows, filename) { const content = rows.map((row) => row.map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`).join('\t')).join('\n'); const blob = new Blob([`\uFEFF${content}`], { type: 'application/vnd.ms-excel;charset=utf-8;' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url); }
function buildPrintableReport({ filteredJobs, groups, totals, datePreset, customRange, technicianFilter, search }) { const detailRows = filteredJobs.map((job) => `<tr>${[job.jobNumber,job.date,formatTime12Hour(job.time),job.invoiceNumber,job.referenceNumber,job.company,job.technician,job.location,job.jobStatus,money(job.amount),job.techPaymentStatus,job.daysPending,job.dispatcher,job.updates].map((value) => `<td>${escapeHtml(value)}</td>`).join('')}</tr>`).join(''); const groupRows = groups.map((group) => `<tr><td>${escapeHtml(group.technician)}</td><td>${group.pendingJobs}</td><td>${money(group.totalAmount)}</td><td>${escapeHtml(group.oldestPendingJob)}</td><td>${money(group.averageAmount)}</td></tr>`).join(''); return `<!doctype html><html><head><title>Technician Payments Pending Report</title><style>body{font-family:Arial,sans-serif;padding:24px;color:#0f172a}h1{margin:0}.meta{color:#475569;margin:8px 0 18px}.summary{display:flex;gap:18px;margin:15px 0;font-weight:bold}table{border-collapse:collapse;width:100%;font-size:9px;margin-bottom:24px}th,td{border:1px solid #cbd5e1;padding:5px;text-align:left;vertical-align:top}th{background:#0f172a;color:white}h2{margin-top:26px}@media print{body{padding:0}@page{size:landscape;margin:10mm}}</style></head><body><h1>Technician Payments Pending Report</h1><p class="meta">Generated ${escapeHtml(formatDateTime12Hour(new Date()))} · Filters: ${escapeHtml(reportFilterLabel(datePreset, customRange, technicianFilter, search))}</p><div class="summary"><span>Pending: ${totals.count}</span><span>Technicians: ${totals.technicians}</span><span>Missing amounts: ${totals.missing}</span><span>Grand total: ${money(totals.amount)}</span></div><table><thead><tr>${['Job #','Date','Time','Invoice #','Reference #','Company','Technician','Location','Job Status','Tech Labor','Tech Payment Status','Days Pending','Dispatcher','Updates'].map((value) => `<th>${value}</th>`).join('')}</tr></thead><tbody>${detailRows}</tbody></table><h2>Totals by Technician</h2><table><thead><tr><th>Technician</th><th>Pending Jobs</th><th>Total Amount Owed</th><th>Oldest Pending Job</th><th>Average Amount per Job</th></tr></thead><tbody>${groupRows}<tr><td><b>Grand Total</b></td><td><b>${totals.count}</b></td><td><b>${money(totals.amount)}</b></td><td></td><td></td></tr></tbody></table><script>window.onload=()=>window.print()</script></body></html>`; }
