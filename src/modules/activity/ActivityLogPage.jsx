import React, { useEffect, useMemo, useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import { getRecentActivity } from "./activityLogService";

const dateFilters = ["Today", "Last 7 days", "All"];

export default function ActivityLogPage() {
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    date: "Last 7 days",
    user: "All",
    entityType: "All",
    action: "All",
    search: "",
  });

  useEffect(() => {
    loadActivity();
  }, []);

  async function loadActivity() {
    setLoading(true);
    setActivity(await getRecentActivity({ limit: 250 }));
    setLoading(false);
  }

  const options = useMemo(() => ({
    users: unique(activity.map((item) => item.created_by)),
    entityTypes: unique(activity.map((item) => item.entity_type)),
    actions: unique(activity.map((item) => item.action)),
  }), [activity]);

  const filteredActivity = useMemo(() => {
    const query = filters.search.trim().toLowerCase();
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const last7 = new Date(now);
    last7.setDate(now.getDate() - 7);

    return activity.filter((item) => {
      const createdAt = item.created_at ? new Date(item.created_at) : null;
      const matchesDate =
        filters.date === "All" ||
        (filters.date === "Today" && String(item.created_at || "").slice(0, 10) === today) ||
        (filters.date === "Last 7 days" && createdAt && createdAt >= last7);
      const matchesUser = filters.user === "All" || item.created_by === filters.user;
      const matchesEntity = filters.entityType === "All" || item.entity_type === filters.entityType;
      const matchesAction = filters.action === "All" || item.action === filters.action;
      const searchText = [item.entity_type, item.entity_id, item.action, item.description, item.created_by].join(" ").toLowerCase();
      const matchesSearch = !query || searchText.includes(query);
      return matchesDate && matchesUser && matchesEntity && matchesAction && matchesSearch;
    });
  }, [activity, filters]);

  return (
    <div className="min-h-screen w-full max-w-none bg-slate-100 p-4 md:p-8">
      <div className="space-y-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-600">Administration</p>
              <h1 className="mt-1 text-3xl font-black text-slate-950">Activity Log</h1>
              <p className="mt-2 text-sm font-medium text-slate-500">Recent system activity from the shared activity log foundation.</p>
            </div>
            <button type="button" onClick={loadActivity} className="inline-flex w-fit items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1fr_150px_180px_180px_180px]">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <input className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-500" placeholder="Search activity" value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} />
            </div>
            <FilterSelect value={filters.date} options={dateFilters} onChange={(value) => setFilters((current) => ({ ...current, date: value }))} />
            <FilterSelect value={filters.user} options={["All", ...options.users]} onChange={(value) => setFilters((current) => ({ ...current, user: value }))} />
            <FilterSelect value={filters.entityType} options={["All", ...options.entityTypes]} onChange={(value) => setFilters((current) => ({ ...current, entityType: value }))} />
            <FilterSelect value={filters.action} options={["All", ...options.actions]} onChange={(value) => setFilters((current) => ({ ...current, action: value }))} />
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-black text-slate-950">Recent Activity</h2>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{filteredActivity.length} records</span>
          </div>
          <div className="grid gap-3">
            {filteredActivity.map((item) => (
              <div key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="font-black text-slate-950">{item.action || "Activity"}</p>
                    <p className="mt-1 text-slate-600">{item.description || "No description"}</p>
                    <p className="mt-2 text-xs font-semibold text-slate-400">{item.entity_type || "entity"} #{item.entity_id || "n/a"}</p>
                  </div>
                  <div className="text-xs font-semibold text-slate-500 md:text-right">
                    <p>{formatDate(item.created_at)}</p>
                    <p>{item.created_by || "System"}</p>
                  </div>
                </div>
              </div>
            ))}
            {!loading && filteredActivity.length === 0 && (
              <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm font-semibold text-slate-500">
                No activity found.
              </div>
            )}
          </div>
        </section>
      </div>
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

function formatDate(value) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}
