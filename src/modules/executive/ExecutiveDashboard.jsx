import React, { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  CalendarDays,
  Download,
  DollarSign,
  FileText,
  PieChart,
  Printer,
  RefreshCw,
  TrendingUp,
} from "lucide-react";
import { supabase } from "../../lib/supabase";

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

export default function ExecutiveDashboard() {
  const [jobs, setJobs] = useState([]);
  const [warnings, setWarnings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterMode, setFilterMode] = useState("This Month");
  const [customRange, setCustomRange] = useState({ from: "", to: "" });

  useEffect(() => {
    loadJobs();
  }, []);

  async function loadJobs() {
    setLoading(true);
    const { data, error } = await supabase.from("jobs").select("*");

    if (error) {
      setWarnings([`Safe mode: unable to load jobs table (${error.message}).`]);
      setJobs([]);
      setLoading(false);
      return;
    }

    const rows = data || [];
    const availableColumns = new Set(rows.flatMap((row) => Object.keys(row || {})));
    const missingFields = requiredFields.filter((field) => !columnAliases[field].some((column) => availableColumns.has(column)));
    const nextWarnings = [];

    if (!rows.length) {
      nextWarnings.push("Safe mode: no jobs found yet. Dashboard totals will show zero until dispatch data exists.");
    }

    if (missingFields.length) {
      nextWarnings.push(`Safe mode: missing dashboard columns or no rows available for: ${missingFields.join(", ")}.`);
    }

    setWarnings(nextWarnings);
    setJobs(rows.map(normalizeJob).sort((a, b) => String(b.date || "").localeCompare(String(a.date || ""))));
    setLoading(false);
  }

  const dateRange = useMemo(() => getDateRange(filterMode, customRange), [filterMode, customRange]);
  const filteredJobs = useMemo(() => jobs.filter((job) => isWithinRange(job.date, dateRange)), [jobs, dateRange]);

  const metrics = useMemo(() => {
    const todayRange = getDateRange("Today", customRange);
    const weekRange = getDateRange("This Week", customRange);
    const monthRange = getDateRange("This Month", customRange);
    const revenueToday = sumBy(jobs.filter((job) => isWithinRange(job.date, todayRange)), "totalBill");
    const revenueWeek = sumBy(jobs.filter((job) => isWithinRange(job.date, weekRange)), "totalBill");
    const revenueMonth = sumBy(jobs.filter((job) => isWithinRange(job.date, monthRange)), "totalBill");
    const revenue = sumBy(filteredJobs, "totalBill");
    const partsCost = sumBy(filteredJobs, "parts");
    const techLabor = sumBy(filteredJobs, "techLabor");
    const completedJobs = filteredJobs.filter((job) => isCompleted(job.status)).length;
    const pendingJobs = filteredJobs.filter((job) => isPending(job.status)).length;
    const cancelledJobs = filteredJobs.filter((job) => isCancelled(job.status)).length;
    const outstandingBalance = filteredJobs.filter((job) => !isPaid(job.invoiceStatus)).reduce((sum, job) => sum + job.totalBill, 0);

    return {
      revenueToday,
      revenueWeek,
      revenueMonth,
      totalJobsToday: jobs.filter((job) => isWithinRange(job.date, todayRange)).length,
      completedJobs,
      pendingJobs,
      cancelledJobs,
      averageTicket: filteredJobs.length ? revenue / filteredJobs.length : 0,
      partsCost,
      techLabor,
      profit: revenue - partsCost - techLabor,
      outstandingBalance,
    };
  }, [jobs, filteredJobs, customRange]);

  const charts = useMemo(() => {
    return {
      revenueByDay: groupBySum(filteredJobs, (job) => job.date || "Unknown", "totalBill").slice(0, 14),
      jobsByStatus: groupByCount(filteredJobs, (job) => job.status || "Unknown"),
      jobsByCity: groupByCount(filteredJobs, (job) => job.city || "Unknown").slice(0, 10),
      jobsByDispatcher: groupByCount(filteredJobs, (job) => job.dispatch || "Unassigned").slice(0, 10),
      jobsByTechnician: groupByCount(filteredJobs, (job) => job.technician || "Unassigned").slice(0, 10),
      paymentMethods: groupByCount(filteredJobs, (job) => job.paymentMethod || "Unknown"),
      invoiceStatuses: groupByCount(filteredJobs, (job) => job.invoiceStatus || "Unknown"),
      topCompanies: groupBySum(filteredJobs, (job) => job.company || "Unknown", "totalBill").slice(0, 10),
      topCities: groupByCount(filteredJobs, (job) => job.city || "Unknown").slice(0, 10),
    };
  }, [filteredJobs]);

  function exportCsv() {
    const headers = [
      "Date",
      "Invoice #",
      "Company",
      "City",
      "Status",
      "Dispatcher",
      "Technician",
      "Payment Method",
      "Invoice Status",
      "Total Bill",
      "Parts",
      "Tech Labor",
      "Profit",
    ];
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
    <div className="min-h-screen w-full max-w-none bg-slate-100 p-4 md:p-8 print:bg-white print:p-0">
      <div className="space-y-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm print:border-0 print:shadow-none">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-600">Executive Dashboard</p>
              <h1 className="mt-1 text-3xl font-black text-slate-950">NTTR Command Center</h1>
              <p className="mt-2 text-sm font-medium text-slate-500">
                Revenue, operations volume, profitability, and dispatch trends from the live jobs table.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 print:hidden">
              <button type="button" onClick={loadJobs} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">
                <RefreshCw className="h-4 w-4" />
                Refresh
              </button>
              <button type="button" onClick={exportCsv} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700">
                <Download className="h-4 w-4" />
                Export CSV
              </button>
              <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800">
                <Printer className="h-4 w-4" />
                Print Report
              </button>
            </div>
          </div>
        </section>

        {warnings.map((warning) => (
          <div key={warning} className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800">
            {warning}
          </div>
        ))}

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm print:border-0 print:shadow-none">
          <div className="grid gap-3 xl:grid-cols-[1fr_auto_auto] xl:items-end">
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-slate-500">Report Range</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {filterPresets.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setFilterMode(preset)}
                    className={`rounded-xl px-4 py-2 text-sm font-bold transition ${
                      filterMode === preset ? "bg-blue-600 text-white" : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
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

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-6">
          <KpiCard icon={DollarSign} label="Revenue Today" value={money(metrics.revenueToday)} note="Current day" />
          <KpiCard icon={TrendingUp} label="Revenue This Week" value={money(metrics.revenueWeek)} note="Week to date" />
          <KpiCard icon={BarChart3} label="Revenue This Month" value={money(metrics.revenueMonth)} note="Month to date" />
          <KpiCard icon={CalendarDays} label="Total Jobs Today" value={metrics.totalJobsToday} note="Created today" />
          <KpiCard icon={FileText} label="Completed Jobs" value={metrics.completedJobs} note="Filtered range" />
          <KpiCard icon={FileText} label="Pending Jobs" value={metrics.pendingJobs} note="Filtered range" />
          <KpiCard icon={FileText} label="Cancelled Jobs" value={metrics.cancelledJobs} note="Filtered range" />
          <KpiCard icon={DollarSign} label="Average Ticket" value={money(metrics.averageTicket)} note="Filtered range" />
          <KpiCard icon={PieChart} label="Parts Cost" value={money(metrics.partsCost)} note="Filtered range" />
          <KpiCard icon={PieChart} label="Tech Labor" value={money(metrics.techLabor)} note="Filtered range" />
          <KpiCard icon={TrendingUp} label="Profit" value={money(metrics.profit)} note="Revenue less costs" tone={metrics.profit >= 0 ? "good" : "bad"} />
          <KpiCard icon={DollarSign} label="Outstanding Balance" value={money(metrics.outstandingBalance)} note="Not marked paid" tone="warning" />
        </section>

        <section className="grid gap-4 xl:grid-cols-2">
          <BarListCard title="Revenue by Day" rows={charts.revenueByDay} valueFormatter={money} loading={loading} />
          <BarListCard title="Jobs by Status" rows={charts.jobsByStatus} loading={loading} />
          <BarListCard title="Jobs by City" rows={charts.jobsByCity} loading={loading} />
          <BarListCard title="Jobs by Dispatcher" rows={charts.jobsByDispatcher} loading={loading} />
          <BarListCard title="Jobs by Technician" rows={charts.jobsByTechnician} loading={loading} />
          <BarListCard title="Payment Method Breakdown" rows={charts.paymentMethods} loading={loading} />
          <BarListCard title="Invoice Status Breakdown" rows={charts.invoiceStatuses} loading={loading} />
          <BarListCard title="Top 10 Companies by Revenue" rows={charts.topCompanies} valueFormatter={money} loading={loading} />
          <BarListCard title="Top 10 Cities by Jobs" rows={charts.topCities} loading={loading} />
        </section>
      </div>
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, note, tone = "default" }) {
  const toneClasses = {
    default: "bg-blue-50 text-blue-700",
    good: "bg-emerald-50 text-emerald-700",
    bad: "bg-red-50 text-red-700",
    warning: "bg-amber-50 text-amber-700",
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className={`rounded-2xl p-3 ${toneClasses[tone] || toneClasses.default}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="h-8 w-16 rounded-full bg-gradient-to-r from-blue-100 via-slate-100 to-emerald-100" />
      </div>
      <p className="mt-4 text-xs font-black uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-black text-slate-950">{value}</p>
      <p className="mt-1 text-xs font-semibold text-slate-400">{note}</p>
    </div>
  );
}

function BarListCard({ title, rows, valueFormatter = compactNumber, loading }) {
  const maxValue = Math.max(...rows.map((row) => row.value), 0);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-black text-slate-950">{title}</h2>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500">{rows.length} rows</span>
      </div>
      <div className="space-y-3">
        {rows.map((row) => {
          const width = maxValue ? Math.max(6, (row.value / maxValue) * 100) : 0;
          return (
            <div key={row.label} className="grid gap-2">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="truncate font-bold text-slate-700">{row.label}</span>
                <span className="font-black text-slate-950">{valueFormatter(row.value)}</span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-blue-600" style={{ width: `${width}%` }} />
              </div>
            </div>
          );
        })}
        {!loading && rows.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm font-semibold text-slate-500">
            No report data available for this range.
          </div>
        )}
        {loading && (
          <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm font-semibold text-slate-500">
            Loading report data...
          </div>
        )}
      </div>
    </div>
  );
}

function DateInput({ label, value, disabled, onChange }) {
  return (
    <label className="grid gap-2 text-sm font-bold text-slate-600">
      {label}
      <input
        type="date"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-xl border border-slate-200 bg-white px-3 py-2 font-semibold text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100 disabled:text-slate-400"
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
    if (row && Object.prototype.hasOwnProperty.call(row, alias)) {
      return row[alias];
    }
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

function groupBySum(rows, labelGetter, field) {
  const grouped = new Map();
  rows.forEach((row) => {
    const label = cleanLabel(labelGetter(row));
    grouped.set(label, (grouped.get(label) || 0) + numberValue(row[field]));
  });
  return Array.from(grouped, ([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}

function sumBy(rows, field) {
  return rows.reduce((sum, row) => sum + numberValue(row[field]), 0);
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
  return normalized(status).includes("completed");
}

function isCancelled(status) {
  const value = normalized(status);
  return value.includes("cancel") || value.includes("void");
}

function isPending(status) {
  return !isCompleted(status) && !isCancelled(status) && !normalized(status).includes("paid");
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

function compactNumber(value) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(numberValue(value));
}
