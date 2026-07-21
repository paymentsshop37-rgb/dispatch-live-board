import React, { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ClipboardList,
  DollarSign,
  LogIn,
  RefreshCw,
  Search,
  Trash2,
  UserCheck,
  UserPlus,
  XCircle,
} from "lucide-react";
import { getRecentActivity, SYSTEM_ACTIVITY_ACTIONS } from "./activityLogService";

const dateFilters = ["Today", "Yesterday", "Last 7 Days", "All"];
const dispatcherActivityActions = [
  "Job Created",
  "Job Deleted",
  "Technician Invited",
  "Technician Registered",
  "Technician Approved",
  "Technician Deleted",
  "Tech Payment Pending",
  "Tech Payment Reviewing",
  "Tech Payment Approved",
  "Tech Payment Paid",
  "Tech Payment Hold",
  "Invoice Status changed",
  "Payment Method changed",
  "Total Bill changed",
  "Parts changed",
  "Tech Labor changed",
  "Login Success",
  "Login Failure",
];

const eventIcons = {
  "Job Created": ClipboardList,
  "Job Deleted": Trash2,
  "Technician Invited": UserPlus,
  "Technician Registered": UserCheck,
  "Technician Approved": CheckCircle2,
  "Technician Deleted": Trash2,
  "Technician Deactivated": Trash2,
  "Technician Restored": UserCheck,
  "Technician Permanently Deleted": Trash2,
  "User Created": UserPlus,
  "User Disabled": XCircle,
  "Invoice Paid": DollarSign,
  "Technician Paid": DollarSign,
  "Tech Payment Pending": DollarSign,
  "Tech Payment Reviewing": DollarSign,
  "Tech Payment Approved": DollarSign,
  "Tech Payment Paid": DollarSign,
  "Tech Payment Hold": DollarSign,
  "Invoice Status changed": DollarSign,
  "Payment Method changed": DollarSign,
  "Total Bill changed": DollarSign,
  "Parts changed": DollarSign,
  "Tech Labor changed": DollarSign,
  "Login Success": LogIn,
  "Login Failure": XCircle,
};

export default function ActivityLogPage({ role = "admin" }) {
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    date: "Last 7 Days",
    user: "All",
    action: "All",
    search: "",
  });

  useEffect(() => {
    loadActivity();
  }, [role]);

  async function loadActivity() {
    setLoading(true);
    const rows = await getRecentActivity({ limit: 500 });
    const allowedActions = role === "dispatcher" ? dispatcherActivityActions : SYSTEM_ACTIVITY_ACTIONS;
    setActivity(rows.filter((item) => allowedActions.includes(item.action)));
    setLoading(false);
  }

  const options = useMemo(() => ({
    users: unique(activity.map((item) => item.created_by)),
    actions: (role === "dispatcher" ? dispatcherActivityActions : SYSTEM_ACTIVITY_ACTIONS).filter((action) => activity.some((item) => item.action === action)),
  }), [activity, role]);

  const summary = useMemo(() => ({
    total: activity.length,
    jobs: activity.filter((item) => item.entity_type === "job").length,
    technicians: activity.filter((item) => item.entity_type === "technician").length,
    users: activity.filter((item) => item.entity_type === "user" || item.entity_type === "auth").length,
  }), [activity]);

  const filteredActivity = useMemo(() => {
    const query = filters.search.trim().toLowerCase();

    return activity
      .filter((item) => {
        const matchesDate = matchesDateFilter(item.created_at, filters.date);
        const matchesUser = filters.user === "All" || item.created_by === filters.user;
        const matchesAction = filters.action === "All" || item.action === filters.action;
        const searchText = [item.action, item.description, item.created_by, item.entity_type, item.entity_id]
          .join(" ")
          .toLowerCase();
        const matchesSearch = !query || searchText.includes(query);
        return matchesDate && matchesUser && matchesAction && matchesSearch;
      })
      .sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
  }, [activity, filters]);

  return (
    <div className="min-h-screen w-full max-w-none bg-slate-100 p-4 md:p-8">
      <div className="space-y-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-600">Administration</p>
              <h1 className="mt-1 text-3xl font-black text-slate-950">System Activity Log</h1>
              <p className="mt-2 text-sm font-medium text-slate-500">
                {role === "dispatcher" ? "Operational events only. Financial and user administration events are hidden." : "Important NTTR business events only. Field edits and minor updates are intentionally excluded."}
              </p>
            </div>
            <button type="button" onClick={loadActivity} className="inline-flex w-fit items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <SummaryCard label="Business Events" value={summary.total} />
          <SummaryCard label="Job Events" value={summary.jobs} />
          <SummaryCard label="Technician Events" value={summary.technicians} />
          <SummaryCard label="User / Login Events" value={summary.users} />
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1fr_160px_180px_220px]">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <input className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-500" placeholder="Search system activity" value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} />
            </div>
            <FilterSelect value={filters.date} options={dateFilters} onChange={(value) => setFilters((current) => ({ ...current, date: value }))} />
            <FilterSelect value={filters.user} options={["All", ...options.users]} onChange={(value) => setFilters((current) => ({ ...current, user: value }))} />
            <FilterSelect value={filters.action} options={["All", ...options.actions]} onChange={(value) => setFilters((current) => ({ ...current, action: value }))} />
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-xl font-black text-slate-950">Business Event Timeline</h2>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{filteredActivity.length} events</span>
          </div>
          <div className="relative space-y-0 pl-3">
            <div className="absolute bottom-4 left-[26px] top-4 w-px bg-slate-200" />
            {filteredActivity.map((item) => {
              const Icon = eventIcons[item.action] || ClipboardList;
              return (
                <div key={item.id} className="relative flex gap-4 pb-5">
                  <div className="z-10 mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white shadow-sm">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="font-black text-slate-950">{item.action}</p>
                        <p className="mt-1 text-sm text-slate-600">{item.description || "No description recorded."}</p>
                      </div>
                      <div className="shrink-0 text-xs font-semibold text-slate-500 md:text-right">
                        <p>{formatDate(item.created_at)}</p>
                        <p>{item.created_by || "System"}</p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            {!loading && filteredActivity.length === 0 && (
              <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm font-semibold text-slate-500">
                No system activity found.
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function SummaryCard({ label, value }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-black text-slate-950">{value}</p>
    </div>
  );
}

function FilterSelect({ value, options, onChange }) {
  return (
    <select className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold outline-none focus:border-blue-500" value={value} onChange={(event) => onChange(event.target.value)}>
      {options.map((option) => <option key={option}>{option}</option>)}
    </select>
  );
}

function unique(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

function matchesDateFilter(value, filter) {
  if (filter === "All") return true;
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return false;

  const today = startOfDay(new Date());
  const itemDay = startOfDay(date);

  if (filter === "Today") return itemDay.getTime() === today.getTime();
  if (filter === "Yesterday") {
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    return itemDay.getTime() === yesterday.getTime();
  }
  if (filter === "Last 7 Days") {
    const last7 = new Date(today);
    last7.setDate(today.getDate() - 7);
    return itemDay >= last7;
  }

  return true;
}

function startOfDay(date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function formatDate(value) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}
