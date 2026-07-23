import React, { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  Clock,
  Download,
  FileText,
  Filter,
  MapPin,
  RefreshCw,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
  Truck,
  UserCheck,
  Users,
  XCircle,
} from "lucide-react";
import { supabase } from "../../lib/supabase";
import { getRecentActivity, SYSTEM_ACTIVITY_ACTIONS } from "../activity";

const columnAliases = {
  id: ["id"],
  date: ["job_date", "date", "created_at"],
  time: ["job_time", "time", "created_at"],
  invoiceNumber: ["invoice_number", "invoice", "invoice_no", "reference"],
  reference: ["reference", "reference_number", "po_number"],
  company: ["company", "company_name", "customer"],
  location: ["location", "address", "service_location"],
  city: ["city", "service_city"],
  state: ["state", "service_state"],
  status: ["status", "job_status"],
  dispatch: ["dispatch", "dispatcher", "dispatcher_name", "assigned_by"],
  technician: ["tech", "technician", "technician_name"],
  paymentMethod: ["payment_method", "paymentMethod"],
  invoiceStatus: ["invoice_status", "billing_status"],
  totalBill: ["total_bill", "totalBill", "amount", "invoice_total"],
  parts: ["parts", "parts_cost", "partsCost"],
  techLabor: ["tech_labor", "techLabor", "labor", "labor_cost"],
  updates: ["updates", "notes", "job_notes"],
  techPaymentStatus: ["tech_payment_status"],
};

const filterPresets = ["Today", "This Week", "Last Week", "This Month", "Last Month", "This Year", "Custom Range"];
const defaultFilterMode = "This Week";

const importantActivityActions = new Set([
  ...SYSTEM_ACTIVITY_ACTIONS,
  "Status Changed",
  "Invoice Sent",
  "Tech Assigned",
  "Dispatcher Updated Notes",
  "Photo Uploaded",
  "Delete Job",
  "Delete Technician",
]);

const activityIconMap = {
  "Job Created": Activity,
  "Job Deleted": XCircle,
  "Delete Job": XCircle,
  "Technician Invited": Users,
  "Technician Registered": UserCheck,
  "Technician Approved": CheckCircle2,
  "Technician Deleted": XCircle,
  "Delete Technician": XCircle,
  "Invoice Paid": CircleDollarSign,
  "Invoice Sent": FileText,
  "Technician Paid": CircleDollarSign,
  "Tech Payment Paid": CircleDollarSign,
  "Status Changed": Activity,
  "Invoice Status changed": FileText,
  "Tech Assigned": Truck,
  "Dispatcher Updated Notes": FileText,
  "Photo Uploaded": FileText,
  "Smart Alert triggered": AlertTriangle,
  "Login Success": UserCheck,
  "Login Failure": ShieldAlert,
};

export default function ExecutiveDashboard({ onOpenActivity, onOpenJob }) {
  const [jobs, setJobs] = useState([]);
  const [activityRows, setActivityRows] = useState([]);
  const [warnings, setWarnings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastSync, setLastSync] = useState(null);
  const [filterMode, setFilterMode] = useState(defaultFilterMode);
  const [customRange, setCustomRange] = useState({ from: "", to: "" });

  useEffect(() => {
    loadDashboard();
  }, []);

  async function loadDashboard() {
    setLoading(true);
    const [{ data, error }, recentActivity] = await Promise.all([
      supabase.from("jobs").select("*"),
      getRecentActivity({ limit: 100 }),
    ]);

    const nextWarnings = [];

    if (error) {
      nextWarnings.push("Unable to load dashboard data. Dispatch Board is still available.");
      setJobs([]);
    } else {
      const rows = data || [];
      setJobs(rows.map(normalizeJob).sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`)));
    }

    setActivityRows(normalizeActivity(recentActivity || []));
    setWarnings(nextWarnings);
    setLastSync(new Date());
    setLoading(false);
  }

  const dateRange = useMemo(() => getDateRange(filterMode, customRange), [filterMode, customRange]);
  const filteredJobs = useMemo(() => jobs.filter((job) => isWithinRange(job.date, dateRange)), [jobs, dateRange]);
  const analytics = useMemo(() => buildAnalytics(filteredJobs), [filteredJobs]);
  const cityRows = useMemo(() => groupJobs(filteredJobs, (job) => job.city || "Unknown").slice(0, 10), [filteredJobs]);
  const dispatcherRows = useMemo(() => buildDispatcherRows(filteredJobs), [filteredJobs]);
  const technicianRows = useMemo(() => buildTechnicianRows(filteredJobs), [filteredJobs]);
  const activityFeed = useMemo(() => activityRows.slice(0, 15), [activityRows]);

  function exportCsv() {
    const headers = ["Date", "Invoice #", "Company", "City", "Status", "Dispatcher", "Technician", "Payment Method", "Invoice Status", "Total Bill", "Parts", "Tech Labor", "Profit"];
    const rows = filteredJobs.map((job) => [
      job.date,
      job.invoiceNumber,
      job.company,
      job.city,
      job.status,
      job.dispatch,
      job.technician,
      job.paymentMethod,
      job.invoiceStatus,
      job.totalBill,
      job.parts,
      job.techLabor,
      job.profit,
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `nttr-executive-dashboard-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen w-full max-w-none bg-[#06111f] p-4 text-slate-100 md:p-6 xl:p-8">
      <div className="mx-auto w-full max-w-none space-y-6">
        <ExecutiveHeader
          loading={loading}
          lastSync={lastSync}
          filterMode={filterMode}
          customRange={customRange}
          onRefresh={loadDashboard}
          onExport={exportCsv}
          onFilterMode={setFilterMode}
          onCustomRange={setCustomRange}
        />

        {warnings.map((warning) => (
          <div key={warning} className="rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm font-semibold text-amber-100">
            {warning}
          </div>
        ))}

        {!loading && warnings.length === 0 && filteredJobs.length === 0 && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-slate-200">
            No jobs found for this date range.
          </div>
        )}

        <section className="executive-kpi-grid grid gap-4 lg:grid-cols-3 2xl:grid-cols-6">
          <KpiCard title="Revenue" value={money(analytics.revenue)} detail="Today's trend" icon={CircleDollarSign} tone="blue" trend={analytics.todayRevenue} />
          <KpiCard title="Expenses" value={money(analytics.expenses)} detail="Parts + labor" icon={TrendingDown} tone="orange" trend={analytics.todayExpenses} />
          <KpiCard title="Profit" value={money(analytics.profit)} detail={`${analytics.profitMargin.toFixed(1)}% margin`} icon={TrendingUp} tone="green" trend={analytics.todayProfit} />
          <KpiCard title="Total Jobs" value={analytics.totalJobs} detail="Filtered range" icon={Truck} tone="purple" trend={analytics.jobsToday} suffix="today" />
          <KpiCard title="Open Invoices" value={analytics.openInvoices} detail="Not paid/cancelled" icon={FileText} tone="orange" trend={analytics.needReviewInvoices} suffix="need review" />
          <KpiCard title="Average ETA" value={`${analytics.averageEta} min`} detail="Operational estimate" icon={Clock} tone="cyan" trend={analytics.jobsWaitingEta} suffix="waiting ETA" />
        </section>

        <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_500px]">
          <main className="space-y-6">
            <section className="executive-chart-grid grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
              <Panel title="Jobs Status" subtitle="Completed, active, cancelled, pending and dry runs" icon={BarChart3}>
                <div className="grid gap-6 lg:grid-cols-[230px_minmax(0,1fr)] lg:items-center">
                  <DonutChart segments={analytics.statusSegments} total={analytics.totalJobs} />
                  <div className="space-y-3">
                    {analytics.statusSegments.map((segment) => (
                      <MetricBar key={segment.label} label={segment.label} value={segment.value} total={analytics.totalJobs} tone={segment.tone} />
                    ))}
                  </div>
                </div>
              </Panel>

              <Panel title="Financial Performance" subtitle="Revenue, expenses and profit" icon={CircleDollarSign}>
                <FinancialBars revenue={analytics.revenue} expenses={analytics.expenses} profit={analytics.profit} />
              </Panel>
            </section>

            <section className="executive-chart-grid grid gap-6 xl:grid-cols-2">
              <Panel title="Dispatcher Performance" subtitle="Completion rate and ranking" icon={Users}>
                <PerformanceTable type="dispatcher" rows={dispatcherRows} />
              </Panel>
              <Panel title="Technician Performance" subtitle="Production and average ETA" icon={UserCheck}>
                <PerformanceTable type="technician" rows={technicianRows} />
              </Panel>
            </section>

            <section className="executive-chart-grid grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
              <Panel title="Jobs by City" subtitle="Top 10 service markets" icon={MapPin}>
                <HorizontalBars rows={cityRows} emptyLabel="No city data yet." />
              </Panel>
              <Panel title="Invoice Center" subtitle="Invoice workflow summary" icon={FileText}>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                  {analytics.invoiceSegments.map((item) => (
                    <InvoiceTile key={item.label} item={item} />
                  ))}
                </div>
              </Panel>
            </section>
          </main>

          <aside className="space-y-6">
            <Panel title="Recent Activity" subtitle="Important events only" icon={Activity}>
              <div className="max-h-[820px] space-y-3 overflow-y-auto pr-1">
                {activityFeed.map((item) => (
                  <ActivityItem key={item.id} item={item} jobs={jobs} onOpenJob={onOpenJob} />
                ))}
                {!activityFeed.length && <EmptyState label="No important activity yet." />}
              </div>
              {onOpenActivity && (
                <button type="button" onClick={onOpenActivity} className="mt-4 w-full rounded-xl bg-blue-500 px-4 py-3 text-sm font-black text-white shadow-lg shadow-blue-950/30 transition hover:bg-blue-400">
                  View Full Activity Log
                </button>
              )}
            </Panel>
          </aside>
        </div>
      </div>
    </div>
  );
}

function ExecutiveHeader({ loading, lastSync, filterMode, customRange, onRefresh, onExport, onFilterMode, onCustomRange }) {
  return (
    <header className="overflow-hidden rounded-[1.75rem] border border-blue-300/10 bg-[#0a1830] shadow-2xl shadow-blue-950/25">
      <div className="border-b border-white/10 bg-gradient-to-r from-[#0c2140] via-[#0a1830] to-[#091426] px-5 py-5 md:px-7">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs font-black uppercase tracking-[0.24em] text-blue-300">NTTR Command Center</span>
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-black uppercase tracking-wide text-emerald-300">
                <span className="h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_14px_rgba(110,231,183,0.9)]" />
                LIVE
              </span>
            </div>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-white md:text-4xl">Executive Dashboard</h1>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm font-semibold text-slate-400">
              <span className="inline-flex items-center gap-2"><CalendarDays className="h-4 w-4 text-blue-300" />{new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</span>
              <span className="hidden h-1 w-1 rounded-full bg-slate-600 md:block" />
              <span>Last Sync: {lastSync ? lastSync.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Waiting"}</span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={onRefresh} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-black text-slate-100 transition hover:bg-white/10">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <button type="button" onClick={onExport} className="inline-flex items-center gap-2 rounded-xl border border-blue-400/30 bg-blue-500 px-4 py-2.5 text-sm font-black text-white shadow-lg shadow-blue-950/30 transition hover:bg-blue-400">
              <Download className="h-4 w-4" />
              Export
            </button>
            <button type="button" className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-black text-slate-100 transition hover:bg-white/10">
              <Filter className="h-4 w-4" />
              Date Filter
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-3 px-5 py-4 md:px-7 xl:grid-cols-[1fr_auto_auto] xl:items-end">
        <div className="flex flex-nowrap gap-2 overflow-x-auto pb-1">
          {filterPresets.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => onFilterMode(preset)}
              className={`min-h-11 shrink-0 rounded-xl px-3.5 py-2 text-xs font-black uppercase tracking-wide transition ${
                filterMode === preset ? "bg-blue-500 text-white shadow-lg shadow-blue-950/30" : "border border-white/10 bg-white/[0.04] text-slate-400 hover:bg-white/10 hover:text-slate-100"
              }`}
            >
              {preset}
            </button>
          ))}
        </div>
        <DateInput label="Start" value={customRange.from} disabled={filterMode !== "Custom Range"} onChange={(value) => onCustomRange((current) => ({ ...current, from: value }))} />
        <DateInput label="End" value={customRange.to} disabled={filterMode !== "Custom Range"} onChange={(value) => onCustomRange((current) => ({ ...current, to: value }))} />
      </div>
    </header>
  );
}

function KpiCard({ title, value, detail, icon: Icon, tone, trend, suffix }) {
  const tones = {
    blue: "border-blue-400/20 from-blue-500/20 text-blue-300",
    green: "border-emerald-400/20 from-emerald-500/20 text-emerald-300",
    orange: "border-orange-400/20 from-orange-500/20 text-orange-300",
    purple: "border-violet-400/20 from-violet-500/20 text-violet-300",
    cyan: "border-cyan-400/20 from-cyan-500/20 text-cyan-300",
  };

  return (
    <article className={`group rounded-3xl border bg-gradient-to-br to-[#0b1728] p-5 shadow-xl shadow-blue-950/15 transition duration-200 hover:-translate-y-1 hover:shadow-2xl ${tones[tone] || tones.blue}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">{title}</p>
          <p className="mt-3 truncate text-3xl font-black text-white">{value}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/10 p-3">
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <div className="mt-5 flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold text-slate-400">{detail}</p>
          <p className="mt-1 text-xs font-black uppercase tracking-wide text-current">{formatTrend(trend, suffix)}</p>
        </div>
        <Sparkline />
      </div>
    </article>
  );
}

function Panel({ title, subtitle, icon: Icon, children }) {
  return (
    <section className="rounded-[1.5rem] border border-white/10 bg-[#0b1728] p-5 shadow-xl shadow-blue-950/10">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-black text-white">{title}</h2>
          <p className="mt-1 text-xs font-bold uppercase tracking-wide text-slate-500">{subtitle}</p>
        </div>
        {Icon && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-blue-300">
            <Icon className="h-5 w-5" />
          </div>
        )}
      </div>
      {children}
    </section>
  );
}

function DonutChart({ segments, total }) {
  const gradient = buildDonutGradient(segments, total);
  return (
    <div className="mx-auto flex h-56 w-56 items-center justify-center rounded-full p-5 shadow-inner shadow-black/40" style={{ background: gradient }}>
      <div className="flex h-full w-full flex-col items-center justify-center rounded-full border border-white/10 bg-[#0b1728] text-center">
        <p className="text-4xl font-black text-white">{total}</p>
        <p className="mt-1 text-xs font-black uppercase tracking-[0.18em] text-slate-500">Total Jobs</p>
      </div>
    </div>
  );
}

function FinancialBars({ revenue, expenses, profit }) {
  const rows = [
    { label: "Revenue", value: revenue, tone: "bg-blue-400" },
    { label: "Expenses", value: expenses, tone: "bg-orange-400" },
    { label: "Profit", value: profit, tone: profit >= 0 ? "bg-emerald-400" : "bg-red-400" },
  ];
  const max = Math.max(...rows.map((row) => Math.abs(row.value)), 1);

  return (
    <div className="space-y-5">
      {rows.map((row) => {
        const width = Math.max(4, (Math.abs(row.value) / max) * 100);
        return (
          <div key={row.label}>
            <div className="mb-2 flex items-center justify-between gap-4">
              <span className="text-sm font-black text-slate-300">{row.label}</span>
              <span className="text-sm font-black text-white">{money(row.value)}</span>
            </div>
            <div className="h-12 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] p-2">
              <div className={`h-full rounded-xl ${row.tone} shadow-lg`} style={{ width: `${width}%` }} />
            </div>
          </div>
        );
      })}
      <div className="grid gap-3 sm:grid-cols-3">
        <MiniStat label="Revenue" value={money(revenue)} tone="blue" />
        <MiniStat label="Expenses" value={money(expenses)} tone="orange" />
        <MiniStat label="Profit" value={money(profit)} tone={profit >= 0 ? "green" : "red"} />
      </div>
    </div>
  );
}

function PerformanceTable({ type, rows }) {
  const isTech = type === "technician";
  return (
    <div className="overflow-x-auto rounded-2xl border border-white/10">
      <table className="w-full min-w-[620px] text-left text-sm">
        <thead className="bg-[#10213a] text-xs uppercase tracking-wide text-slate-400">
          <tr>
            <th className="px-4 py-3">{isTech ? "Tech" : "Dispatcher"}</th>
            <th className="px-4 py-3">Jobs</th>
            <th className="px-4 py-3">Completed</th>
            {!isTech && <th className="px-4 py-3">Cancelled</th>}
            <th className="px-4 py-3">{isTech ? "Revenue Produced" : "Completion %"}</th>
            <th className="px-4 py-3">{isTech ? "Average ETA" : "Ranking"}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.label} className="border-t border-white/10">
              <td className="px-4 py-3 font-black text-white">{row.label}</td>
              <td className="px-4 py-3 font-bold text-slate-300">{row.jobs}</td>
              <td className="px-4 py-3 font-bold text-emerald-300">{row.completed}</td>
              {!isTech && <td className="px-4 py-3 font-bold text-red-300">{row.cancelled}</td>}
              <td className="px-4 py-3 font-bold text-slate-300">{isTech ? money(row.revenue) : `${row.completionPercent}%`}</td>
              <td className="px-4 py-3 font-bold text-blue-300">{isTech ? `${row.averageEta} min` : `#${index + 1}`}</td>
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td colSpan={isTech ? 5 : 6} className="px-4 py-10 text-center text-sm font-semibold text-slate-500">
                No performance data yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function HorizontalBars({ rows, emptyLabel }) {
  const max = Math.max(...rows.map((row) => row.value), 0);
  if (!rows.length) return <EmptyState label={emptyLabel} />;

  return (
    <div className="space-y-4">
      {rows.map((row, index) => {
        const width = max ? Math.max(5, (row.value / max) * 100) : 0;
        return (
          <div key={row.label} className="grid grid-cols-[34px_120px_minmax(0,1fr)_56px] items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/[0.05] text-xs font-black text-slate-400">#{index + 1}</span>
            <span className="truncate text-sm font-black text-white">{row.label}</span>
            <div className="h-3 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-blue-400" style={{ width: `${width}%` }} />
            </div>
            <span className="text-right text-sm font-black text-blue-300">{row.value}</span>
          </div>
        );
      })}
    </div>
  );
}

function InvoiceTile({ item }) {
  const tones = {
    Pending: "border-amber-400/20 bg-amber-400/10 text-amber-200",
    "Need Review": "border-orange-400/20 bg-orange-400/10 text-orange-200",
    Sent: "border-blue-400/20 bg-blue-400/10 text-blue-200",
    Paid: "border-emerald-400/20 bg-emerald-400/10 text-emerald-200",
    Cancelled: "border-red-400/20 bg-red-400/10 text-red-200",
  };
  return (
    <div className={`rounded-2xl border p-4 ${tones[item.label] || tones.Pending}`}>
      <p className="text-xs font-black uppercase tracking-wide text-slate-500">{item.label}</p>
      <p className="mt-2 text-3xl font-black text-white">{item.value}</p>
    </div>
  );
}

function ActivityItem({ item, jobs, onOpenJob }) {
  const Icon = activityIconMap[item.action] || Activity;
  const job = jobs.find((candidate) => String(candidate.id) === String(item.entity_id));
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
      <div className="flex gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-500/15 text-blue-300">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-black text-white">{friendlyActivityTitle(item.action)}</p>
              <p className="mt-1 text-xs font-semibold text-slate-400">{item.created_by || "System"}</p>
            </div>
            <span className="shrink-0 text-xs font-black uppercase text-slate-500">{shortTime(item.created_at)}</span>
          </div>
          <div className="mt-3 grid gap-2 text-xs font-semibold text-slate-400 sm:grid-cols-2">
            {item.entity_id && onOpenJob ? <button type="button" onClick={() => onOpenJob(item.entity_id)} className="min-h-11 text-left font-black text-blue-300 underline underline-offset-4">Job #: {job?.invoiceNumber || item.entity_id}</button> : <span>Job #: {job?.invoiceNumber || item.entity_id || "N/A"}</span>}
            <span>City: {job?.city || "N/A"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricBar({ label, value, total, tone }) {
  const percent = total ? Math.round((value / total) * 100) : 0;
  const visual = jobStatusVisual(label);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3 text-sm">
        <span className="font-bold text-slate-300">{visual.dot} {label}</span>
        <span className="font-black" style={{ color: visual.border }}>{value} ({percent}%)</span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full" style={{ width: `${percent}%`, backgroundColor: visual.border }} />
      </div>
    </div>
  );
}

function MiniStat({ label, value, tone = "blue" }) {
  const tones = {
    blue: "border-blue-400/20 bg-blue-400/10 text-blue-200",
    green: "border-emerald-400/20 bg-emerald-400/10 text-emerald-200",
    orange: "border-orange-400/20 bg-orange-400/10 text-orange-200",
    red: "border-red-400/20 bg-red-400/10 text-red-200",
  };
  return (
    <div className={`rounded-2xl border p-4 ${tones[tone] || tones.blue}`}>
      <p className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 truncate text-xl font-black text-white">{value}</p>
    </div>
  );
}

function DateInput({ label, value, disabled, onChange }) {
  return (
    <label className="grid gap-1 text-xs font-black uppercase tracking-wide text-slate-500">
      {label}
      <input
        type="date"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm font-bold text-slate-100 outline-none transition focus:border-blue-400 disabled:text-slate-600"
      />
    </label>
  );
}

function Sparkline() {
  return (
    <div className="flex h-8 w-20 items-end gap-1 text-current">
      <span className="h-2 flex-1 rounded-t bg-current opacity-25" />
      <span className="h-4 flex-1 rounded-t bg-current opacity-35" />
      <span className="h-3 flex-1 rounded-t bg-current opacity-50" />
      <span className="h-6 flex-1 rounded-t bg-current opacity-70" />
      <span className="h-5 flex-1 rounded-t bg-current" />
    </div>
  );
}

function EmptyState({ label }) {
  return <div className="rounded-2xl border border-dashed border-white/10 p-6 text-center text-sm font-semibold text-slate-500">{label}</div>;
}

function buildAnalytics(rows) {
  const revenue = sumBy(rows, "totalBill");
  const expenses = sumBy(rows, "parts") + sumBy(rows, "techLabor");
  const profit = revenue - expenses;
  const today = localDate(new Date());
  const todayRows = rows.filter((job) => job.date === today);
  const completed = rows.filter((job) => isCompleted(job.status)).length;
  const cancelled = rows.filter((job) => isCancelled(job.status)).length;
  const dryRuns = rows.filter((job) => normalized(job.status).includes("dry")).length;
  const pending = rows.filter((job) => isPending(job.status)).length;
  const inProgress = Math.max(rows.length - completed - cancelled - dryRuns - pending, 0);
  const avgEta = average(rows.map((job) => job.etaMinutes).filter((value) => value > 0));

  return {
    revenue,
    expenses,
    profit,
    profitMargin: revenue ? (profit / revenue) * 100 : 0,
    totalJobs: rows.length,
    openInvoices: rows.filter((job) => !isPaid(job.invoiceStatus) && !isCancelled(job.invoiceStatus)).length,
    averageEta: Math.round(avgEta || 0),
    todayRevenue: sumBy(todayRows, "totalBill"),
    todayExpenses: sumBy(todayRows, "parts") + sumBy(todayRows, "techLabor"),
    todayProfit: sumBy(todayRows, "totalBill") - sumBy(todayRows, "parts") - sumBy(todayRows, "techLabor"),
    jobsToday: todayRows.length,
    statusSegments: [
      { label: "Completed", value: completed, tone: "green" },
      { label: "In Progress", value: inProgress, tone: "blue" },
      { label: "Cancelled", value: cancelled, tone: "red" },
      { label: "Pending", value: pending, tone: "orange" },
      { label: "Dry Run", value: dryRuns, tone: "purple" },
    ],
    invoiceSegments: [
      { label: "Pending", value: rows.filter((job) => normalized(job.invoiceStatus).includes("pending")).length },
      { label: "Need Review", value: rows.filter((job) => normalized(job.invoiceStatus).includes("review")).length },
      { label: "Sent", value: rows.filter((job) => normalized(job.invoiceStatus).includes("sent")).length },
      { label: "Paid", value: rows.filter((job) => isPaid(job.invoiceStatus)).length },
      { label: "Cancelled", value: rows.filter((job) => isCancelled(job.invoiceStatus)).length },
    ],
    pendingInvoices: rows.filter((job) => normalized(job.invoiceStatus).includes("pending")).length,
    needReviewInvoices: rows.filter((job) => normalized(job.invoiceStatus).includes("review")).length,
    jobsWaitingEta: rows.filter((job) => !isCompleted(job.status) && !isCancelled(job.status) && !job.etaMinutes).length,
    jobsWithoutTechnician: rows.filter((job) => !job.technician || normalized(job.technician) === "unassigned").length,
    jobsWithoutUpdates: rows.filter((job) => !job.updates).length,
    pendingTechPayments: rows.filter((job) => ["pending", "reviewing", "hold"].includes(normalized(job.techPaymentStatus))).length,
  };
}

function buildDispatcherRows(rows) {
  return groupJobRows(rows, (job) => job.dispatch || "Unassigned").map((row) => ({
    label: row.label,
    jobs: row.jobs.length,
    completed: row.jobs.filter((job) => isCompleted(job.status)).length,
    cancelled: row.jobs.filter((job) => isCancelled(job.status)).length,
    completionPercent: row.jobs.length ? Math.round((row.jobs.filter((job) => isCompleted(job.status)).length / row.jobs.length) * 100) : 0,
  }));
}

function buildTechnicianRows(rows) {
  return groupJobRows(rows, (job) => job.technician || "Unassigned").map((row) => ({
    label: row.label,
    jobs: row.jobs.length,
    completed: row.jobs.filter((job) => isCompleted(job.status)).length,
    revenue: sumBy(row.jobs, "totalBill"),
    averageEta: Math.round(average(row.jobs.map((job) => job.etaMinutes).filter((value) => value > 0)) || 0),
  }));
}

function normalizeJob(row) {
  const date = dateOnly(readAlias(row, columnAliases.date));
  const location = stringValue(readAlias(row, columnAliases.location));
  const city = stringValue(readAlias(row, columnAliases.city)) || cityFromLocation(location);
  const totalBill = numberValue(readAlias(row, columnAliases.totalBill));
  const parts = numberValue(readAlias(row, columnAliases.parts));
  const techLabor = numberValue(readAlias(row, columnAliases.techLabor));
  const updates = stringValue(readAlias(row, columnAliases.updates));

  return {
    id: readAlias(row, columnAliases.id) || crypto.randomUUID(),
    date,
    time: timeOnly(readAlias(row, columnAliases.time)),
    invoiceNumber: stringValue(readAlias(row, columnAliases.invoiceNumber)),
    reference: stringValue(readAlias(row, columnAliases.reference)),
    company: stringValue(readAlias(row, columnAliases.company)) || "Unknown Company",
    location,
    city: city || "Unknown",
    state: stringValue(readAlias(row, columnAliases.state)),
    status: titleCase(stringValue(readAlias(row, columnAliases.status)) || "Pending"),
    dispatch: stringValue(readAlias(row, columnAliases.dispatch)) || "Unassigned",
    technician: stringValue(readAlias(row, columnAliases.technician)) || "Unassigned",
    paymentMethod: stringValue(readAlias(row, columnAliases.paymentMethod)) || "Unknown",
    invoiceStatus: titleCase(stringValue(readAlias(row, columnAliases.invoiceStatus)) || "Pending"),
    totalBill,
    parts,
    techLabor,
    profit: totalBill - parts - techLabor,
    updates,
    etaMinutes: extractEtaMinutes(updates),
    techPaymentStatus: titleCase(stringValue(readAlias(row, columnAliases.techPaymentStatus)) || "Pending"),
  };
}

function normalizeActivity(rows) {
  return rows
    .filter((item) => {
      if (importantActivityActions.has(item.action)) return true;
      const action = normalized(item.action);
      return action.includes("invoice") || action.includes("payment") || action.includes("assigned") || action.includes("deleted") || action.includes("created") || action.includes("login");
    })
    .slice(0, 20);
}

function readAlias(row, aliases) {
  for (const alias of aliases) {
    if (row && Object.prototype.hasOwnProperty.call(row, alias)) return row[alias];
  }
  return "";
}

function getDateRange(mode, customRange) {
  const now = new Date();
  const today = localDate(now);
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);
  endOfWeek.setHours(23, 59, 59, 999);

  if (mode === "Today") return { from: today, to: today };
  if (mode === "This Week") return { from: localDate(startOfWeek), to: localDate(endOfWeek) };
  if (mode === "Last Week") {
    const first = new Date(startOfWeek);
    first.setDate(startOfWeek.getDate() - 7);
    const last = new Date(startOfWeek);
    last.setDate(startOfWeek.getDate() - 1);
    return { from: localDate(first), to: localDate(last) };
  }
  if (mode === "This Month") return { from: `${today.slice(0, 7)}-01`, to: today };
  if (mode === "Last Month") {
    const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const last = new Date(now.getFullYear(), now.getMonth(), 0);
    return { from: localDate(first), to: localDate(last) };
  }
  if (mode === "This Year") return { from: `${now.getFullYear()}-01-01`, to: today };

  return {
    from: customRange.from || "1900-01-01",
    to: customRange.to || "2999-12-31",
  };
}

function isWithinRange(value, range) {
  if (!value) return false;
  return value >= range.from && value <= range.to;
}

function groupJobs(rows, labelGetter) {
  const grouped = new Map();
  rows.forEach((row) => {
    const label = cleanLabel(labelGetter(row));
    grouped.set(label, (grouped.get(label) || 0) + 1);
  });
  return Array.from(grouped, ([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}

function groupJobRows(rows, labelGetter) {
  const grouped = new Map();
  rows.forEach((row) => {
    const label = cleanLabel(labelGetter(row));
    if (!grouped.has(label)) grouped.set(label, []);
    grouped.get(label).push(row);
  });
  return Array.from(grouped, ([label, jobs]) => ({ label, jobs })).sort((a, b) => b.jobs.length - a.jobs.length);
}

function sumBy(rows, field) {
  return rows.reduce((sum, row) => sum + numberValue(row[field]), 0);
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + numberValue(value), 0) / values.length;
}

function numberValue(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function stringValue(value) {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.join(", ");
  return String(value).trim();
}

function dateOnly(value) {
  if (!value) return "";
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? "" : localDate(parsed);
}

function timeOnly(value) {
  if (!value) return "";
  const text = String(value);
  if (/^\d{2}:\d{2}/.test(text)) return text.slice(0, 5);
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function localDate(date) {
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 10);
}

function cityFromLocation(location) {
  if (!location) return "";
  return location.split(",")[0]?.trim() || "";
}

function cleanLabel(value) {
  const label = stringValue(value);
  return label || "Unknown";
}

function titleCase(value) {
  return String(value)
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function isCompleted(status) {
  const value = normalized(status);
  return value.includes("completed") || value.includes("complete") || value.includes("paid");
}

function isCancelled(status) {
  const value = normalized(status);
  return value.includes("cancel") || value.includes("void");
}

function isPending(status) {
  const value = normalized(status);
  return value.includes("pending") || value.includes("new") || value.includes("open");
}

function isPaid(status) {
  return normalized(status).includes("paid");
}

function normalized(value) {
  return String(value || "").toLowerCase();
}

function extractEtaMinutes(value) {
  const match = String(value || "").match(/eta[^0-9]*(\d{1,3})/i);
  return match ? numberValue(match[1]) : 0;
}

function money(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(numberValue(value));
}

function formatTrend(value, suffix) {
  if (typeof value === "number" && suffix) return `${value} ${suffix}`;
  if (typeof value === "number") return money(value);
  return value || "0";
}

function shortTime(value) {
  if (!value) return "Now";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Recent" : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function friendlyActivityTitle(action) {
  const text = String(action || "Activity");
  if (text === "Job Deleted") return "Delete Job";
  if (text === "Technician Deleted") return "Delete Technician";
  if (text === "Technician Paid") return "Tech Payment Paid";
  if (text === "Invoice Status changed") return "Status Changed";
  return text;
}

const jobStatusVisuals = {
  Completed: { background: "#DCFCE7", border: "#22C55E", text: "#166534", dot: "🟢" },
  Cancelled: { background: "#FEE2E2", border: "#EF4444", text: "#991B1B", dot: "🔴" },
  "In Progress": { background: "#DBEAFE", border: "#2563EB", text: "#1D4ED8", dot: "🔵" },
  "On Site": { background: "#FEF3C7", border: "#F59E0B", text: "#92400E", dot: "🟡" },
  "En Route": { background: "#E0F2FE", border: "#0284C7", text: "#075985", dot: "🔵" },
  "Waiting Parts": { background: "#F3E8FF", border: "#9333EA", text: "#6B21A8", dot: "🟣" },
  Pending: { background: "#FFF7ED", border: "#F97316", text: "#9A3412", dot: "🟠" },
  "Dry Run": { background: "#EDE9FE", border: "#7C3AED", text: "#5B21B6", dot: "🟣" },
  "Need Review": { background: "#FEF2F2", border: "#DC2626", text: "#7F1D1D", dot: "🔴" },
  New: { background: "#F8FAFC", border: "#64748B", text: "#334155", dot: "⚪" },
};

function canonicalJobStatus(status) {
  const value = String(status || "New").trim().toLowerCase();
  const aliases = {
    canceled: "Cancelled",
    cancelled: "Cancelled",
    declined: "Cancelled",
    working: "In Progress",
    assigned: "In Progress",
    "tech accepted": "In Progress",
    paid: "Completed",
    invoiced: "Completed",
    "dry runs": "Dry Run",
    "dry run": "Dry Run",
    "need review": "Need Review",
    pending: "Pending",
  };
  return aliases[value] || status || "New";
}

function jobStatusVisual(status) {
  return jobStatusVisuals[canonicalJobStatus(status)] || jobStatusVisuals.New;
}

function buildDonutGradient(segments, total) {
  if (!total) return "conic-gradient(#1e293b 0deg 360deg)";
  let cursor = 0;
  const stops = segments.map((segment) => {
    const degrees = (segment.value / total) * 360;
    const start = cursor;
    cursor += degrees;
    return `${jobStatusVisual(segment.label).border} ${start}deg ${cursor}deg`;
  });
  if (cursor < 360) stops.push(`#1e293b ${cursor}deg 360deg`);
  return `conic-gradient(${stops.join(", ")})`;
}
