import React, { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  Download,
  Filter,
  LogIn,
  Printer,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
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
};

const requiredFields = [
  "date",
  "company",
  "location",
  "status",
  "dispatch",
  "technician",
  "paymentMethod",
  "invoiceStatus",
  "totalBill",
  "parts",
  "techLabor",
];

const filterPresets = ["Today", "This Week", "This Month", "Last Month", "This Year", "Custom Date Range"];

const activityIcons = {
  "Job Created": Activity,
  "Job Deleted": XCircle,
  "Technician Invited": Users,
  "Technician Registered": UserCheck,
  "Technician Approved": ShieldCheck,
  "Technician Deleted": XCircle,
  "User Created": Users,
  "User Disabled": XCircle,
  "Invoice Paid": CircleDollarSign,
  "Technician Paid": CircleDollarSign,
  "Login Success": LogIn,
  "Login Failure": AlertTriangle,
};

export default function ExecutiveDashboard({ onOpenActivity }) {
  const [jobs, setJobs] = useState([]);
  const [activityRows, setActivityRows] = useState([]);
  const [warnings, setWarnings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterMode, setFilterMode] = useState("This Month");
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
      nextWarnings.push(`Safe mode: unable to load jobs table (${error.message}).`);
      setJobs([]);
    } else {
      const rows = data || [];
      const availableColumns = new Set(rows.flatMap((row) => Object.keys(row || {})));
      const missingFields = requiredFields.filter((field) => !columnAliases[field].some((column) => availableColumns.has(column)));

      if (!rows.length) {
        nextWarnings.push("Safe mode: no jobs found yet. Dashboard totals will show zero until dispatch data exists.");
      }

      if (missingFields.length) {
        nextWarnings.push(`Safe mode: missing dashboard columns or no rows available for: ${missingFields.join(", ")}.`);
      }

      setJobs(rows.map(normalizeJob).sort((a, b) => String(b.date || "").localeCompare(String(a.date || ""))));
    }

    setActivityRows((recentActivity || []).filter((item) => SYSTEM_ACTIVITY_ACTIONS.includes(item.action)).slice(0, 12));
    setWarnings(nextWarnings);
    setLoading(false);
  }

  const dateRange = useMemo(() => getDateRange(filterMode, customRange), [filterMode, customRange]);
  const filteredJobs = useMemo(() => jobs.filter((job) => isWithinRange(job.date, dateRange)), [jobs, dateRange]);

  const analytics = useMemo(() => {
    const revenue = sumBy(filteredJobs, "totalBill");
    const partsCost = sumBy(filteredJobs, "parts");
    const techLabor = sumBy(filteredJobs, "techLabor");
    const totalExpenses = partsCost + techLabor;
    const netProfit = revenue - totalExpenses;
    const completedJobs = filteredJobs.filter((job) => isCompleted(job.status)).length;
    const cancelledJobs = filteredJobs.filter((job) => isCancelled(job.status)).length;
    const dryRuns = filteredJobs.filter((job) => normalized(job.status).includes("dry")).length;
    const openInvoices = filteredJobs.filter((job) => !isPaid(job.invoiceStatus)).length;
    const inProgressJobs = Math.max(filteredJobs.length - completedJobs - cancelledJobs - dryRuns, 0);

    return {
      revenue,
      partsCost,
      techLabor,
      totalExpenses,
      netProfit,
      profitMargin: revenue ? (netProfit / revenue) * 100 : 0,
      totalJobs: filteredJobs.length,
      totalCustomers: uniqueCount(filteredJobs.map((job) => job.company).filter((company) => company && company !== "Unknown Company")),
      averageTicket: filteredJobs.length ? revenue / filteredJobs.length : 0,
      statuses: [
        { label: "Completed", value: completedJobs, tone: "green" },
        { label: "In Progress", value: inProgressJobs, tone: "blue" },
        { label: "Cancelled", value: cancelledJobs, tone: "red" },
        { label: "Dry Runs", value: dryRuns, tone: "purple" },
        { label: "Open Invoices", value: openInvoices, tone: "orange" },
      ],
    };
  }, [filteredJobs]);

  const dispatcherRows = useMemo(() => groupByCount(filteredJobs, (job) => job.dispatch || "Unassigned"), [filteredJobs]);
  const technicianRows = useMemo(() => groupByCount(filteredJobs, (job) => job.technician || "Unassigned"), [filteredJobs]);
  const cityRows = useMemo(() => groupByCount(filteredJobs, (job) => job.city || "Unknown").slice(0, 8), [filteredJobs]);

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
    <div className="min-h-screen w-full max-w-none bg-[#07111f] p-4 text-slate-100 md:p-8 print:bg-white print:text-slate-950">
      <div className="space-y-6">
        <header className="rounded-3xl border border-white/10 bg-[#0b182b] p-5 shadow-2xl shadow-blue-950/20 print:border-slate-200 print:bg-white print:shadow-none">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-emerald-300">LIVE</span>
                <span className="text-xs font-bold uppercase tracking-[0.18em] text-blue-300">Data updated just now</span>
              </div>
              <h1 className="mt-4 text-3xl font-black tracking-tight text-white md:text-4xl">Executive Dashboard</h1>
              <p className="mt-2 text-sm font-semibold text-slate-400">Real-time overview of your operations</p>
            </div>

            <div className="flex flex-wrap gap-2 print:hidden">
              <button type="button" onClick={loadDashboard} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-bold text-slate-100 hover:bg-white/10">
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </button>
              <button type="button" className="inline-flex items-center gap-2 rounded-xl border border-blue-400/30 bg-blue-500/10 px-4 py-2 text-sm font-bold text-blue-200">
                <Filter className="h-4 w-4" />
                Filters
              </button>
              <button type="button" onClick={exportCsv} className="inline-flex items-center gap-2 rounded-xl bg-blue-500 px-4 py-2 text-sm font-black text-white hover:bg-blue-400">
                <Download className="h-4 w-4" />
                Export CSV
              </button>
              <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-bold text-slate-100 hover:bg-white/10">
                <Printer className="h-4 w-4" />
                Print
              </button>
            </div>
          </div>
        </header>

        {warnings.map((warning) => (
          <div key={warning} className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm font-semibold text-amber-200">
            {warning}
          </div>
        ))}

        <section className="rounded-3xl border border-white/10 bg-[#0b182b] p-4 shadow-xl shadow-blue-950/10 print:border-slate-200 print:bg-white">
          <div className="grid gap-3 xl:grid-cols-[1fr_auto_auto] xl:items-end">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Date Range</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {filterPresets.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setFilterMode(preset)}
                    className={`rounded-xl px-4 py-2 text-sm font-bold transition ${
                      filterMode === preset
                        ? "bg-blue-500 text-white shadow-lg shadow-blue-500/20"
                        : "border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>
            <DateInput label="Start Date" value={customRange.from} disabled={filterMode !== "Custom Date Range"} onChange={(value) => setCustomRange((current) => ({ ...current, from: value }))} />
            <DateInput label="End Date" value={customRange.to} disabled={filterMode !== "Custom Date Range"} onChange={(value) => setCustomRange((current) => ({ ...current, to: value }))} />
          </div>
        </section>

        <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_380px]">
          <main className="space-y-6">
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <FinancialCard label="Total Revenue" value={money(analytics.revenue)} trend="Live jobs revenue" tone="blue" />
              <FinancialCard label="Total Expenses" value={money(analytics.totalExpenses)} trend="Parts + tech labor" tone="orange" />
              <FinancialCard label="Net Profit" value={money(analytics.netProfit)} trend={analytics.netProfit >= 0 ? "Positive margin" : "Below cost"} tone={analytics.netProfit >= 0 ? "green" : "red"} />
              <FinancialCard label="Profit Margin" value={`${analytics.profitMargin.toFixed(1)}%`} trend="Revenue efficiency" tone="green" />
            </section>

            <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
              <Panel title="Jobs by Status" subtitle={`${analytics.totalJobs} total jobs`}>
                <div className="grid gap-5 lg:grid-cols-[180px_1fr] lg:items-center">
                  <Donut total={analytics.totalJobs} segments={analytics.statuses} />
                  <div className="space-y-3">
                    {analytics.statuses.map((item) => (
                      <StatusRow key={item.label} item={item} total={analytics.totalJobs} />
                    ))}
                    {!loading && analytics.totalJobs === 0 && <EmptyState label="No job status data yet." />}
                  </div>
                </div>
              </Panel>

              <Panel title="Jobs by City" subtitle={`${cityRows.length} cities tracked`}>
                <div className="mb-4 grid gap-3 sm:grid-cols-3">
                  <MiniStat label="Top City" value={cityRows[0]?.label || "None"} tone="blue" />
                  <MiniStat label="Total Cities" value={cityRows.length} tone="purple" />
                  <MiniStat label="Total Jobs" value={analytics.totalJobs} tone="green" />
                </div>
                <BarList rows={cityRows} total={analytics.totalJobs} color="bg-blue-400" emptyLabel="No city data yet." />
              </Panel>
            </section>

            <section className="grid gap-6 xl:grid-cols-2">
              <PerformancePanel title="Dispatcher Performance" rows={dispatcherRows} total={analytics.totalJobs} accent="blue" />
              <PerformancePanel title="Tech Performance" rows={technicianRows} total={analytics.totalJobs} accent="purple" />
            </section>
          </main>

          <aside className="space-y-6">
            <Panel title="Quick Summary" subtitle="Operational totals">
              <div className="grid gap-3">
                <SummaryLine label="Total Jobs" value={analytics.totalJobs} />
                <SummaryLine label="Total Customers" value={analytics.totalCustomers} />
                <SummaryLine label="Average Ticket" value={money(analytics.averageTicket)} />
                <SummaryLine label="Total Parts" value={money(analytics.partsCost)} />
                <SummaryLine label="Total Labor" value={money(analytics.techLabor)} />
              </div>
            </Panel>

            <Panel title="Activity Log" subtitle="Important internal events">
              <div className="space-y-3">
                {activityRows.map((item) => {
                  const Icon = activityIcons[item.action] || Activity;
                  return (
                    <div key={item.id} className="flex gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-500/15 text-blue-300">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-black text-white">{friendlyActivityTitle(item.action)}</p>
                        <p className="mt-1 line-clamp-2 text-xs font-medium text-slate-400">{item.description || item.entity_type || "System activity"}</p>
                        <div className="mt-2 flex items-center justify-between gap-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                          <span>{item.created_by || "System"}</span>
                          <span>{shortTime(item.created_at)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {!loading && activityRows.length === 0 && <EmptyState label="No important activity yet." />}
              </div>
              {onOpenActivity && (
                <button type="button" onClick={onOpenActivity} className="mt-4 w-full rounded-xl bg-blue-500 px-4 py-3 text-sm font-black text-white hover:bg-blue-400">
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

function FinancialCard({ label, value, trend, tone }) {
  const toneMap = {
    blue: "from-blue-500/25 to-blue-500/5 text-blue-300 border-blue-400/20",
    green: "from-emerald-500/25 to-emerald-500/5 text-emerald-300 border-emerald-400/20",
    orange: "from-orange-500/25 to-orange-500/5 text-orange-300 border-orange-400/20",
    red: "from-red-500/25 to-red-500/5 text-red-300 border-red-400/20",
  };

  return (
    <div className={`rounded-3xl border bg-gradient-to-br p-5 shadow-xl shadow-blue-950/10 ${toneMap[tone] || toneMap.blue}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">{label}</p>
          <p className="mt-3 text-3xl font-black text-white">{value}</p>
        </div>
        <div className="rounded-2xl bg-white/10 p-3">
          <TrendingUp className="h-5 w-5" />
        </div>
      </div>
      <div className="mt-5 flex items-center justify-between gap-3">
        <p className="text-xs font-bold text-slate-400">{trend}</p>
        <Sparkline />
      </div>
    </div>
  );
}

function Panel({ title, subtitle, children }) {
  return (
    <section className="rounded-3xl border border-white/10 bg-[#0b182b] p-5 shadow-xl shadow-blue-950/10 print:border-slate-200 print:bg-white">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-white print:text-slate-950">{title}</h2>
          <p className="mt-1 text-xs font-bold uppercase tracking-wide text-slate-500">{subtitle}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function Donut({ total, segments }) {
  const completed = segments.find((item) => item.label === "Completed")?.value || 0;
  const percent = total ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="mx-auto flex h-40 w-40 items-center justify-center rounded-full bg-[conic-gradient(#22c55e_var(--value),#1d2a3d_0)] p-4" style={{ "--value": `${percent}%` }}>
      <div className="flex h-full w-full flex-col items-center justify-center rounded-full bg-[#0b182b] text-center">
        <p className="text-3xl font-black text-white">{percent}%</p>
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Completed</p>
      </div>
    </div>
  );
}

function StatusRow({ item, total }) {
  const percent = total ? Math.round((item.value / total) * 100) : 0;
  const colors = {
    blue: "bg-blue-400 text-blue-300",
    green: "bg-emerald-400 text-emerald-300",
    orange: "bg-orange-400 text-orange-300",
    red: "bg-red-400 text-red-300",
    purple: "bg-violet-400 text-violet-300",
  };

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-3 text-sm">
        <span className="font-bold text-slate-300">{item.label}</span>
        <span className={`font-black ${colors[item.tone]?.split(" ")[1] || "text-blue-300"}`}>{item.value} ({percent}%)</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/10">
        <div className={`h-full rounded-full ${colors[item.tone]?.split(" ")[0] || "bg-blue-400"}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function PerformancePanel({ title, rows, total, accent }) {
  const top = rows[0];
  return (
    <Panel title={title} subtitle={`${total} total jobs`}>
      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <MiniStat label="Total Jobs" value={total} tone={accent} />
        <MiniStat label={title.includes("Tech") ? "Top Technician" : "Top Dispatcher"} value={top?.label || "None"} tone={accent} />
      </div>
      <div className="overflow-hidden rounded-2xl border border-white/10">
        <table className="w-full text-left text-sm">
          <thead className="bg-white/[0.04] text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">{title.includes("Tech") ? "Technician" : "Dispatcher"}</th>
              <th className="px-4 py-3">Jobs</th>
              <th className="px-4 py-3">Percentage</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 6).map((row) => (
              <tr key={row.label} className="border-t border-white/10">
                <td className="px-4 py-3 font-bold text-slate-200">{row.label}</td>
                <td className="px-4 py-3 font-black text-white">{row.value}</td>
                <td className="px-4 py-3 text-slate-400">{total ? Math.round((row.value / total) * 100) : 0}%</td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-sm font-semibold text-slate-500">No performance data yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function BarList({ rows, total, color, emptyLabel }) {
  const max = Math.max(...rows.map((row) => row.value), 0);
  if (!rows.length) return <EmptyState label={emptyLabel} />;

  return (
    <div className="space-y-4">
      {rows.map((row) => {
        const width = max ? Math.max(4, (row.value / max) * 100) : 0;
        const percent = total ? Math.round((row.value / total) * 100) : 0;
        return (
          <div key={row.label}>
            <div className="mb-1 flex items-center justify-between gap-3 text-sm">
              <span className="font-bold text-slate-300">{row.label}</span>
              <span className="font-black text-white">{row.value} jobs · {percent}%</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-white/10">
              <div className={`h-full rounded-full ${color}`} style={{ width: `${width}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MiniStat({ label, value, tone = "blue" }) {
  const toneClasses = {
    blue: "border-blue-400/20 bg-blue-500/10 text-blue-200",
    green: "border-emerald-400/20 bg-emerald-500/10 text-emerald-200",
    purple: "border-violet-400/20 bg-violet-500/10 text-violet-200",
  };

  return (
    <div className={`rounded-2xl border p-4 ${toneClasses[tone] || toneClasses.blue}`}>
      <p className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 truncate text-xl font-black text-white">{value}</p>
    </div>
  );
}

function SummaryLine({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
      <span className="text-sm font-bold text-slate-400">{label}</span>
      <span className="font-black text-white">{value}</span>
    </div>
  );
}

function Sparkline() {
  return (
    <div className="flex h-8 w-20 items-end gap-1">
      <span className="h-2 flex-1 rounded-t bg-current opacity-30" />
      <span className="h-4 flex-1 rounded-t bg-current opacity-40" />
      <span className="h-3 flex-1 rounded-t bg-current opacity-50" />
      <span className="h-6 flex-1 rounded-t bg-current opacity-70" />
      <span className="h-5 flex-1 rounded-t bg-current" />
    </div>
  );
}

function EmptyState({ label }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/10 p-6 text-center text-sm font-semibold text-slate-500">
      {label}
    </div>
  );
}

function DateInput({ label, value, disabled, onChange }) {
  return (
    <label className="grid gap-2 text-sm font-bold text-slate-400">
      {label}
      <input
        type="date"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 font-semibold text-slate-100 outline-none focus:border-blue-400 disabled:bg-white/[0.03] disabled:text-slate-600"
      />
    </label>
  );
}

function normalizeJob(row) {
  const date = dateOnly(readAlias(row, columnAliases.date));
  const location = stringValue(readAlias(row, columnAliases.location));
  const city = stringValue(readAlias(row, columnAliases.city)) || cityFromLocation(location);
  const totalBill = numberValue(readAlias(row, columnAliases.totalBill));
  const parts = numberValue(readAlias(row, columnAliases.parts));
  const techLabor = numberValue(readAlias(row, columnAliases.techLabor));

  return {
    id: readAlias(row, columnAliases.id) || crypto.randomUUID(),
    date,
    time: timeOnly(readAlias(row, columnAliases.time)),
    invoiceNumber: stringValue(readAlias(row, columnAliases.invoiceNumber)),
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
  };
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

  if (mode === "Today") return { from: today, to: today };
  if (mode === "This Week") return { from: localDate(startOfWeek), to: today };
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

function groupByCount(rows, labelGetter) {
  const grouped = new Map();
  rows.forEach((row) => {
    const label = cleanLabel(labelGetter(row));
    grouped.set(label, (grouped.get(label) || 0) + 1);
  });
  return Array.from(grouped, ([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}

function sumBy(rows, field) {
  return rows.reduce((sum, row) => sum + numberValue(row[field]), 0);
}

function uniqueCount(values) {
  return new Set(values.filter(Boolean)).size;
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
  return normalized(status).includes("completed") || normalized(status).includes("paid");
}

function isCancelled(status) {
  const value = normalized(status);
  return value.includes("cancel") || value.includes("void");
}

function isPaid(status) {
  return normalized(status).includes("paid");
}

function normalized(value) {
  return String(value || "").toLowerCase();
}

function money(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(numberValue(value));
}

function friendlyActivityTitle(action) {
  return String(action || "Activity")
    .replace("Technician Paid", "Technician paid")
    .replace("Invoice Paid", "Invoice paid")
    .replace("Login Success", "User login")
    .replace("Login Failure", "Login failure");
}

function shortTime(value) {
  if (!value) return "Now";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Recent" : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
