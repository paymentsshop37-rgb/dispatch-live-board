import React, { useMemo, useState, useEffect } from "react";
import {
  Search,
  Plus,
  Truck,
  ClipboardList,
  CheckCircle2,
  Clock,
  AlertTriangle,
  DollarSign,
  Trash2,
  Save,
  Users,
  Database,
  Crown,
  FileSpreadsheet,
  FileText,
  BellRing,
} from "lucide-react";
import { motion } from "framer-motion";
import { supabase } from "./lib/supabase";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

const DISPATCH_PASSWORD = "DISPATCH2026";
const ADMIN_PASSWORD = "ADMIN2026";

const statusStyles = {
  New: "bg-blue-50 text-blue-700 border-blue-200",
  "In Progress": "bg-amber-50 text-amber-700 border-amber-200",
  Completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Canceled: "bg-red-50 text-red-700 border-red-200",
  Cancelled: "bg-red-50 text-red-700 border-red-200",
  "Dry Run": "bg-purple-50 text-purple-700 border-purple-200",
};

const rowStyles = {
  New: "bg-blue-50 border-l-4 border-blue-500",
  "In Progress": "bg-yellow-50 border-l-4 border-yellow-500",
  Completed: "bg-emerald-50 border-l-4 border-emerald-500",
  Canceled: "bg-red-50 border-l-4 border-red-500",
  Cancelled: "bg-red-50 border-l-4 border-red-500",
  "Dry Run": "bg-orange-50 border-l-4 border-orange-500",
  Pending: "bg-slate-50 border-l-4 border-slate-400",
  Problem: "bg-red-50 border-l-4 border-red-500",
  Info: "bg-cyan-50 border-l-4 border-cyan-500",
  Normal: "bg-white",
};

const invoiceStyles = {
  Pending: "bg-slate-100 text-slate-700",
  Sent: "bg-blue-100 text-blue-700",
  Paid: "bg-emerald-100 text-emerald-700",
  "Need Review": "bg-orange-100 text-orange-700",
};

const paymentMethods = ["EFS", "Comcheck", "Zelle", "Card", "Cash", "ACH", "Wire", "Pending"];
const paymentReceivers = ["A", "B"];

const fieldMap = {
  date: "job_date",
  time: "job_time",
  reference: "invoice_number",
  rowFlag: "row_flag",
  invoice: "invoice_status",
  paymentMethod: "payment_method",
  paymentReceiver: "received",
  totalBill: "total_bill",
  techLabor: "tech_labor",
};

function money(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(value || 0));
}

function exportJobsToCSV(jobs) {
  const headers = [
    "Date",
    "Time",
    "Invoice",
    "Dispatch",
    "Company",
    "Tech",
    "Location",
    "Status",
    "Invoice Status",
    "Payment Method",
    "Received",
    "Updates",
    "Total Bill",
    "Parts",
    "Tech Labor",
    "Profit",
  ];

  const rows = jobs.map((job) => [
    job.date,
    job.time,
    job.reference,
    job.dispatch,
    job.company,
    job.tech,
    job.location,
    job.status,
    job.invoice,
    job.paymentMethod,
    job.paymentReceiver,
    job.updates,
    job.totalBill,
    job.parts,
    job.techLabor,
    Number(job.totalBill || 0) - Number(job.parts || 0) - Number(job.techLabor || 0),
  ]);

  const csvContent = [headers, ...rows]
    .map((row) => row.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `dispatch-report-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function exportJobsToPDF(jobs) {
  const reportWindow = window.open("", "_blank");
  if (!reportWindow) {
    alert("Please allow popups to export PDF.");
    return;
  }

  const rows = jobs
    .map((job) => {
      const profit = Number(job.totalBill || 0) - Number(job.parts || 0) - Number(job.techLabor || 0);
      return `
        <tr>
          <td>${job.date || ""}</td>
          <td>${job.reference || ""}</td>
          <td>${job.company || ""}</td>
          <td>${job.tech || ""}</td>
          <td>${job.location || ""}</td>
          <td>${job.status || ""}</td>
          <td>$${Number(job.totalBill || 0).toFixed(2)}</td>
          <td>$${profit.toFixed(2)}</td>
        </tr>
      `;
    })
    .join("");

  reportWindow.document.write(`
    <html>
      <head>
        <title>Dispatch Report</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 30px; color: #111827; }
          h1 { margin-bottom: 5px; }
          .subtitle { color: #6b7280; margin-bottom: 20px; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th, td { border: 1px solid #d1d5db; padding: 8px; text-align: left; }
          th { background: #f3f4f6; }
          .footer { margin-top: 25px; font-size: 11px; color: #6b7280; }
        </style>
      </head>
      <body>
        <h1>Dispatch Live Report</h1>
        <div class="subtitle">Generated ${new Date().toLocaleString()}</div>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Invoice</th>
              <th>Company</th>
              <th>Tech</th>
              <th>Location</th>
              <th>Status</th>
              <th>Total Bill</th>
              <th>Profit</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="footer">Dispatch Live Board · Professional Road Service Report</div>
        <script>window.print();</script>
      </body>
    </html>
  `);
  reportWindow.document.close();
}

function fromDbJob(row) {
  return {
    id: row.id,
    date: row.job_date || "",
    time: row.job_time || "",
    reference: row.invoice_number || "",
    dispatch: row.dispatch || "",
    company: row.company || "",
    tech: row.tech || "",
    location: row.location || "",
    status: row.status || "New",
    rowFlag: row.row_flag || "Normal",
    invoice: row.invoice_status || "Pending",
    paymentMethod: row.payment_method || "Pending",
    paymentReceiver: row.received || "A",
    updates: row.updates || "",
    totalBill: Number(row.total_bill || 0),
    parts: Number(row.parts || 0),
    techLabor: Number(row.tech_labor || 0),
  };
}

function toDbJob(job) {
  return {
    job_date: job.date || null,
    job_time: job.time || "",
    invoice_number: job.reference || "",
    dispatch: job.dispatch || "",
    company: job.company || "",
    tech: job.tech || "",
    location: job.location || "",
    status: job.status || "New",
    row_flag: job.rowFlag || "Normal",
    invoice_status: job.invoice || "Pending",
    payment_method: job.paymentMethod || "Pending",
    received: job.paymentReceiver || "A",
    updates: job.updates || "",
    total_bill: Number(job.totalBill || 0),
    parts: Number(job.parts || 0),
    tech_labor: Number(job.techLabor || 0),
  };
}

function chartDataBy(jobs, key) {
  return Object.entries(
    jobs.reduce((acc, job) => {
      const name = job[key] || "Unknown";
      acc[name] = (acc[name] || 0) + 1;
      return acc;
    }, {})
  ).map(([name, value]) => ({ name, value }));
}

function emptyForm() {
  const today = new Date().toISOString().slice(0, 10);

  return {
    date: today,
    dispatch: "",
    time: "",
    reference: "",
    company: "",
    tech: "",
    location: "",
    status: "New",
    rowFlag: "Normal",
    invoice: "Pending",
    paymentMethod: "Pending",
    paymentReceiver: "A",
    updates: "",
    parts: "",
    totalBill: "",
    techLabor: "",
  };
}

export default function DispatchLiveUpdatesPage() {
  const [jobs, setJobs] = useState([]);
  const [accessGranted, setAccessGranted] = useState(false);
  const [accessCode, setAccessCode] = useState("");
  const [currentUserRole, setCurrentUserRole] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [dateFilter, setDateFilter] = useState("All");
  const [cityFilter, setCityFilter] = useState("All");
  const [dispatchFilter, setDispatchFilter] = useState("All");
  const [form, setForm] = useState(emptyForm());
  const [jobToDelete, setJobToDelete] = useState(null);
  const [changeLogs, setChangeLogs] = useState([]);
  const [activityLogs, setActivityLogs] = useState([]);

  const isAdmin = currentUserRole === "Admin";

  function handleLogin() {
    if (accessCode === ADMIN_PASSWORD) {
      setCurrentUserRole("Admin");
      setAccessGranted(true);
    } else if (accessCode === DISPATCH_PASSWORD) {
      setCurrentUserRole("Dispatcher");
      setAccessGranted(true);
    } else {
      alert("Invalid access code");
    }
  }

  useEffect(() => {
    loadJobs();

    const channel = supabase
      .channel("live-jobs")
      .on("postgres_changes", { event: "*", schema: "public", table: "jobs" }, () => {
        loadJobs();

        const audio = new Audio("https://www.soundjay.com/buttons/sounds/button-3.mp3");
        audio.play().catch(() => {});
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function loadJobs() {
    const { data, error } = await supabase
      .from("jobs")
      .select("*")
      .order("job_date", { ascending: true });

    if (error) {
      console.error("Error loading jobs:", error.message);
      return;
    }

    setJobs((data || []).map(fromDbJob));

    const { data: logsData } = await supabase
      .from("change_logs")
      .select("*")
      .order("created_at", { ascending: false });

    setChangeLogs(logsData || []);
  }

  const filteredJobs = useMemo(() => {
    return jobs
      .filter((job) => {
        const matchesSearch = Object.values(job).join(" ").toLowerCase().includes(search.toLowerCase());
        const matchesStatus = statusFilter === "All" || job.status === statusFilter;
        const matchesDate = dateFilter === "All" || job.date === dateFilter;
        const matchesCity = cityFilter === "All" || job.location === cityFilter;
        const matchesDispatch = dispatchFilter === "All" || job.dispatch === dispatchFilter;

        return matchesSearch && matchesStatus && matchesDate && matchesCity && matchesDispatch;
      })
      .sort((a, b) => new Date(a.date) - new Date(b.date));
  }, [jobs, search, statusFilter, dateFilter, cityFilter, dispatchFilter]);

  const dates = useMemo(
    () => [...new Set(jobs.map((job) => job.date).filter(Boolean))].sort((a, b) => new Date(a) - new Date(b)),
    [jobs]
  );

  const cities = useMemo(
    () => [...new Set(jobs.map((job) => job.location).filter(Boolean))].sort(),
    [jobs]
  );

  const dispatchers = useMemo(
    () => [...new Set(jobs.map((job) => job.dispatch).filter(Boolean))].sort(),
    [jobs]
  );

  const stats = useMemo(() => {
    return {
      total: jobs.length,
      inProgress: jobs.filter((j) => j.status === "In Progress").length,
      completed: jobs.filter((j) => j.status === "Completed").length,
      canceled: jobs.filter((j) => j.status === "Canceled" || j.status === "Cancelled").length,
      dryRuns: jobs.filter((j) => j.status === "Dry Run").length,
      weeklyJobs: jobs.filter((job) => {
        const jobDate = new Date(job.date);
        const now = new Date();
        const diff = (now - jobDate) / (1000 * 60 * 60 * 24);
        return diff <= 7;
      }).length,
       monthlyJobs: jobs.filter((job) => {
      const jobDate = new Date(job.date);
      const now = new Date();

      return (
        jobDate.getMonth() === now.getMonth() &&
        jobDate.getFullYear() === now.getFullYear()
      );
    }).length,
      pendingInvoices: jobs.filter((j) => j.invoice !== "Paid").length,
      revenue: jobs.reduce((sum, job) => sum + Number(job.totalBill || 0), 0),
      partsExpense: jobs.reduce((sum, job) => sum + Number(job.parts || 0), 0),
      techLaborExpense: jobs.reduce((sum, job) => sum + Number(job.techLabor || 0), 0),
      totalExpenses: jobs.reduce(
        (sum, job) => sum + Number(job.parts || 0) + Number(job.techLabor || 0),
        0
      ),
      profit: jobs.reduce(
        (sum, job) => sum + (Number(job.totalBill || 0) - Number(job.parts || 0) - Number(job.techLabor || 0)),
        0
      ),
    };
  }, [jobs]);

  async function addJob(e) {
    e.preventDefault();

    const newJob = {
      ...form,
      parts: Number(form.parts || 0),
      totalBill: Number(form.totalBill || 0),
      techLabor: Number(form.techLabor || 0),
    };

    const { data, error } = await supabase
      .from("jobs")
      .insert([toDbJob(newJob)])
      .select()
      .single();

    if (error) {
      alert("Error saving job: " + error.message);
      return;
    }

    if (data) {
      setJobs((currentJobs) => [fromDbJob(data), ...currentJobs]);
      setForm(emptyForm());
      setActivityLogs((logs) => [
        {
          id: Date.now(),
          message: `${currentUserRole || "Dispatcher"} added job "${newJob.reference || newJob.company || "New Job"}"`,
          time: new Date().toLocaleString(),
        },
        ...logs,
      ]);
    }
  }

  async function updateJob(id, field, value) {
    const oldJob = jobs.find((job) => job.id === id);
    const oldValue = oldJob ? oldJob[field] : "";

    setJobs((currentJobs) =>
      currentJobs.map((job) => (job.id === id ? { ...job, [field]: value } : job))
    );

    const dbField = fieldMap[field] || field;

    const { error } = await supabase
      .from("jobs")
      .update({ [dbField]: value })
      .eq("id", id);

    if (error) {
      alert("Error updating job: " + error.message);
      loadJobs();
      return;
    }

    setActivityLogs((logs) => [
      {
        id: Date.now(),
        message: `${currentUserRole || "Dispatcher"} changed ${field} from "${oldValue}" to "${value}"`,
        time: new Date().toLocaleString(),
      },
      ...logs,
    ]);

    await supabase.from("change_logs").insert([
      {
        job_id: id,
        action: "updated",
        field_name: field,
        old_value: String(oldValue ?? ""),
        new_value: String(value ?? ""),
        user_name: currentUserRole || "Dispatcher",
      },
    ]);
  }

  async function deleteJob(id) {
    const deletedJob = jobs.find((job) => job.id === id);

    const { error } = await supabase.from("jobs").delete().eq("id", id);

    if (error) {
      alert("Error deleting job: " + error.message);
      return;
    }

    await supabase.from("change_logs").insert([
      {
        job_id: id,
        action: "deleted",
        field_name: "job",
        old_value: deletedJob?.reference || deletedJob?.company || String(id),
        new_value: "",
        user_name: currentUserRole || "Dispatcher",
      },
    ]);

    setActivityLogs((logs) => [
      {
        id: Date.now(),
        message: `${currentUserRole || "Dispatcher"} deleted job "${deletedJob?.reference || deletedJob?.company || id}"`,
        time: new Date().toLocaleString(),
      },
      ...logs,
    ]);

    setJobs((currentJobs) => currentJobs.filter((job) => job.id !== id));
    setJobToDelete(null);
  }

  function requestDelete(job) {
    setJobToDelete(job);
  }

  if (!accessGranted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6">
        <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-2xl">
          <h1 className="text-3xl font-bold text-slate-900">Dispatch Live Access</h1>
          <p className="mt-2 text-sm text-slate-500">Enter your access code to continue.</p>

          <input
            type="password"
            className="mt-6 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-900"
            placeholder="Access code"
            value={accessCode}
            onChange={(e) => setAccessCode(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleLogin();
            }}
          />

          <button
            type="button"
            onClick={handleLogin}
            className="mt-4 w-full rounded-xl bg-slate-950 px-4 py-3 font-bold text-white hover:bg-slate-800"
          >
            Enter System
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 p-4 text-slate-900 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-3xl bg-slate-950 p-6 text-white shadow-xl"
        >
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-white/10 p-3">
                <Truck className="h-7 w-7" />
              </div>

              <div>
                <h1 className="text-3xl font-bold tracking-tight">Dispatch Live Board</h1>
                <p className="text-sm text-slate-300">
                  Secure live dispatch system · Truck & Trailer Road Service
                </p>
              </div>
            </div>

            <div className="rounded-2xl bg-white/10 px-4 py-3 text-sm text-slate-200">
              {currentUserRole} Access
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => {
                setAccessGranted(false);
                setAccessCode("");
                setCurrentUserRole(null);
              }}
              className="rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700"
            >
              Logout
            </button>

            <button
              type="button"
              onClick={() => {
                document.documentElement.classList.toggle("dark");
              }}
              className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-bold text-white hover:bg-slate-700"
            >
              Dark Mode
            </button>
          </div>
        </motion.div>

        <div className="mt-4 flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <BellRing className="h-5 w-5 animate-pulse" />
          <div>
            <p className="font-bold">Live Dispatch Notifications Active</p>
            <p className="text-xs text-amber-700">
              All dispatch updates sync instantly across all connected users
            </p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-4 xl:grid-cols-8">
          <StatCard icon={<ClipboardList />} label="Total Jobs" value={stats.total} />
          <StatCard icon={<Clock />} label="Weekly Jobs" value={stats.weeklyJobs} />
          <StatCard
  icon={<ClipboardList />}
  label="Monthly Jobs"
  value={stats.monthlyJobs}
/>
          <StatCard icon={<Clock />} label="In Progress" value={stats.inProgress} />
          <StatCard icon={<CheckCircle2 />} label="Completed" value={stats.completed} />
          <StatCard icon={<AlertTriangle />} label="Open Invoices" value={stats.pendingInvoices} />
          <StatCard icon={<AlertTriangle />} label="Canceled" value={stats.canceled} />
          <StatCard icon={<Truck />} label="Dry Runs" value={stats.dryRuns} />
          <StatCard icon={<DollarSign />} label="Profit" value={money(stats.profit)} />
        </div>

        {isAdmin && (
          <div className="rounded-3xl bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-3">
              <DollarSign className="h-5 w-5 text-emerald-700" />
              <h2 className="text-xl font-bold">Admin Financial Reports</h2>
            </div>

            <div className="grid gap-4 md:grid-cols-5">
              <StatCard icon={<DollarSign />} label="Total Bill" value={money(stats.revenue)} />
              <StatCard icon={<AlertTriangle />} label="Parts Expense" value={money(stats.partsExpense)} />
              <StatCard icon={<Users />} label="Tech Labor" value={money(stats.techLaborExpense)} />
              <StatCard icon={<ClipboardList />} label="Total Expenses" value={money(stats.totalExpenses)} />
              <StatCard icon={<CheckCircle2 />} label="Profit" value={money(stats.profit)} />
            </div>

            <p className="mt-3 text-xs text-slate-500">
              Only Admin can view this financial report section in the published system.
            </p>
            <div className="mt-6 rounded-3xl border border-blue-200 bg-blue-50 p-5">
  <div className="mb-4 flex items-center gap-3">
    <FileText className="h-5 w-5 text-blue-700" />

    <h2 className="text-xl font-bold text-blue-900">
      Invoice Center
    </h2>
  </div>

  <div className="grid gap-4 md:grid-cols-4">
    <StatCard
      icon={<Clock />}
      label="Pending"
      value={jobs.filter(j => j.invoice === "Pending").length}
    />

    <StatCard
      icon={<Bell />}
      label="Sent"
      value={jobs.filter(j => j.invoice === "Sent").length}
    />

    <StatCard
      icon={<CheckCircle2 />}
      label="Paid"
      value={jobs.filter(j => j.invoice === "Paid").length}
    />

    <StatCard
      icon={<AlertTriangle />}
      label="Need Review"
      value={jobs.filter(j => j.invoice === "Need Review").length}
    />
  </div>
</div>

            <AnalyticsCard
              title="Revenue Analytics"
              data={[
                { name: "Revenue", value: stats.revenue || 0 },
                { name: "Expenses", value: stats.totalExpenses || 0 },
                { name: "Profit", value: stats.profit || 0 },
              ]}
            />

            <AnalyticsCard title="Jobs By City" data={chartDataBy(jobs, "location")} />
            <div className="mt-6 rounded-3xl bg-white p-5 shadow-sm">
  <h2 className="mb-4 text-xl font-bold">Live GPS Dispatch Map</h2>

  <div className="grid gap-3 md:grid-cols-2">
    {[...new Set(jobs.map((job) => job.location))]
      .filter(Boolean)
      .map((location) => (
        <a
          key={location}
          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`}
          target="_blank"
          rel="noreferrer"
          className="rounded-2xl border border-blue-200 bg-blue-50 p-4 hover:bg-blue-100"
        >
          <p className="font-bold text-blue-900">{location}</p>
          <p className="text-sm text-blue-700">
            {jobs.filter((job) => job.location === location).length} active jobs
          </p>
          <p className="mt-2 text-xs font-bold text-blue-600">
            Open in Google Maps →
          </p>
        </a>
      ))}
  </div>
</div>
            <AnalyticsCard title="Tech Performance" data={chartDataBy(jobs, "tech")} />
            <AnalyticsCard title="Dispatcher Performance" data={chartDataBy(jobs, "dispatch")} />

            <div className="mt-6 rounded-3xl bg-white p-5 shadow-sm">
              <h2 className="mb-4 text-xl font-bold">Live Activity Log</h2>

              <div className="space-y-3">
                {activityLogs.length === 0 ? (
                  <p className="text-sm text-slate-500">No recent activity yet.</p>
                ) : (
                  activityLogs.map((log) => (
                    <div key={log.id} className="rounded-2xl border border-slate-200 px-4 py-3">
                      <p className="text-sm font-medium">{log.message}</p>
                      <p className="mt-1 text-xs text-slate-500">{log.time}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-3xl bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-3">
              <Database className="h-5 w-5 text-emerald-700" />
              <h2 className="text-xl font-bold">Secure Data Storage</h2>
            </div>

            <div className="grid gap-3 text-sm">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3">
                <p className="font-bold text-emerald-800">Protected Database</p>
                <p className="text-emerald-700">All job records are saved securely in the cloud.</p>
              </div>

              <div className="rounded-2xl border border-blue-200 bg-blue-50 p-3">
                <p className="font-bold text-blue-800">Unlimited Job History</p>
                <p className="text-blue-700">Old jobs remain saved for reporting, audits, and future review.</p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <p className="font-bold text-slate-800">Role-Based Access</p>
                <p className="text-slate-600">Admin and dispatchers can enter using separate access codes.</p>
              </div>
            </div>
          </div>

          <div className="rounded-3xl bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-3">
              <ClipboardList className="h-5 w-5 text-orange-700" />
              <h2 className="text-xl font-bold">Change History / Audit Logs</h2>
            </div>

            <div className="max-h-80 space-y-3 overflow-auto">
              {changeLogs.length === 0 ? (
                <p className="text-sm text-slate-500">No database audit logs yet.</p>
              ) : (
                changeLogs.map((log) => (
                  <div key={log.id} className="rounded-2xl border border-orange-200 bg-orange-50 p-3">
                    <p className="font-semibold text-orange-900">{log.user_name}</p>
                    <p className="text-sm text-orange-700">
                      {log.action} · {log.field_name}
                    </p>
                    <p className="text-sm text-gray-700">
                      <span className="font-semibold">Old:</span> {log.old_value}
                    </p>
                    <p className="text-sm text-gray-700">
                      <span className="font-semibold">New:</span> {log.new_value}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      {log.created_at ? new Date(log.created_at).toLocaleString() : ""}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
          <form onSubmit={addJob} className="rounded-3xl bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-bold">Add New Job</h2>
              <Plus className="h-5 w-5 text-slate-500" />
            </div>

            <div className="grid gap-3">
              <Input label="Date" type="date" value={form.date} onChange={(v) => setForm({ ...form, date: v })} />
              <Input label="Time" placeholder="10:45 AM" value={form.time} onChange={(v) => setForm({ ...form, time: v })} />
              <Input label="Invoice #" value={form.reference} onChange={(v) => setForm({ ...form, reference: v })} />
              <Input label="Dispatch" value={form.dispatch} onChange={(v) => setForm({ ...form, dispatch: v })} />
              <Input label="Company" value={form.company} onChange={(v) => setForm({ ...form, company: v })} />
              <Input label="Tech" value={form.tech} onChange={(v) => setForm({ ...form, tech: v })} />
              <Input label="Location" placeholder="City, State" value={form.location} onChange={(v) => setForm({ ...form, location: v })} />

              <div className="grid grid-cols-2 gap-3">
                <Select label="Priority Color" value={form.rowFlag} onChange={(v) => setForm({ ...form, rowFlag: v })} options={["Normal", "Pending", "Problem", "Completed", "Info"]} />
                <Select label="Status" value={form.status} onChange={(v) => setForm({ ...form, status: v })} options={["New", "In Progress", "Completed", "Canceled", "Dry Run"]} />
                <Select label="Invoice Status" value={form.invoice} onChange={(v) => setForm({ ...form, invoice: v })} options={["Pending", "Sent", "Paid", "Need Review"]} />
                <Select label="Payment Method" value={form.paymentMethod} onChange={(v) => setForm({ ...form, paymentMethod: v })} options={paymentMethods} />
                <Select label="Received" value={form.paymentReceiver} onChange={(v) => setForm({ ...form, paymentReceiver: v })} options={paymentReceivers} />
              </div>

              <label className="space-y-1 text-sm font-medium">
                Updates
                <textarea
                  className="min-h-24 w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-slate-500"
                  placeholder="Example: Driver called. Tech ETA 35 minutes..."
                  value={form.updates}
                  onChange={(e) => setForm({ ...form, updates: e.target.value })}
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <Input label="Total Bill" type="number" value={form.totalBill} onChange={(v) => setForm({ ...form, totalBill: v })} />
                <Input label="Parts" type="number" value={form.parts} onChange={(v) => setForm({ ...form, parts: v })} />
                <Input label="Tech Labor" type="number" value={form.techLabor} onChange={(v) => setForm({ ...form, techLabor: v })} />
              </div>

              <button
                type="submit"
                className="mt-2 rounded-2xl bg-slate-950 px-4 py-3 font-semibold text-white shadow-sm transition hover:bg-slate-800"
              >
                Add Job to Live Board
              </button>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => exportJobsToCSV(filteredJobs)}
                  className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 flex items-center gap-2"
                >
                  <FileSpreadsheet className="h-4 w-4" />
                  Export Excel
                </button>

                <button
                  type="button"
                  onClick={() => exportJobsToPDF(filteredJobs)}
                  className="rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 flex items-center gap-2"
                >
                  <FileText className="h-4 w-4" />
                  Export PDF
                </button>
              </div>
            </div>
          </form>

          <div className="rounded-3xl bg-white p-5 shadow-sm">
            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <h2 className="text-xl font-bold">Live Jobs Ordered Oldest to Newest</h2>

              <div className="flex flex-wrap gap-3">
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <input
                    className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 outline-none focus:border-slate-500 md:w-64"
                    placeholder="Search job, city, tech..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>

                <select
                  className="rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-slate-500"
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                >
                  <option>All</option>
                  {dates.map((date) => (
                    <option key={date}>{date}</option>
                  ))}
                </select>

                <select
                  className="rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-slate-500"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  {["All", "New", "In Progress", "Completed", "Canceled", "Dry Run"].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>

                <select
                  className="rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-slate-500"
                  value={cityFilter}
                  onChange={(e) => setCityFilter(e.target.value)}
                >
                  <option>All</option>
                  {cities.map((city) => (
                    <option key={city}>{city}</option>
                  ))}
                </select>

                <select
                  className="rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-slate-500"
                  value={dispatchFilter}
                  onChange={(e) => setDispatchFilter(e.target.value)}
                >
                  <option>All</option>
                  {dispatchers.map((dispatch) => (
                    <option key={dispatch}>{dispatch}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-slate-200">
              <table className="w-full min-w-[1600px] lg:min-w-full border-collapse text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <Th>Flag</Th>
                    <Th>Date</Th>
                    <Th>Time</Th>
                    <Th>Invoice #</Th>
                    <Th>Dispatch</Th>
                    <Th>Company</Th>
                    <Th>Tech</Th>
                    <Th>Location</Th>
                    <Th>Status</Th>
                    <Th>Invoice</Th>
                    <Th>Payment</Th>
                    <Th>Received</Th>
                    <Th>Updates</Th>
                    <Th>Total Bill</Th>
                    <Th>Parts</Th>
                    <Th>Tech Labor</Th>
                    <Th>Profit</Th>
                    <Th>Actions</Th>
                  </tr>
                </thead>

                <tbody>
                  {filteredJobs.map((job) => (
                  <tr
  key={job.id} className={`border-t border-slate-200 align-top hover:brightness-[0.98] $ {job.rowFlag === "Problem" || job.status === "Dry Run" ? "bg-red-100 border-l-4 border-red-600 animate-pulse" : rowStyles[job.rowFlag || "Normal" ]}`}
>
                      <Td>
                        <select
                          className="rounded-xl border border-slate-200 px-2 py-1 text-xs font-bold"
                          value={job.rowFlag || "Normal"}
                          onChange={(e) => updateJob(job.id, "rowFlag", e.target.value)}
                        >
                          <option>Normal</option>
                          <option>Pending</option>
                          <option>Problem</option>
                          <option>Completed</option>
                          <option>Info</option>
                        </select>
                      </Td>

                      <Td>
                        <input
                          type="date"
                          className="rounded-lg border p-1"
                          value={job.date}
                          onChange={(e) => updateJob(job.id, "date", e.target.value)}
                        />
                      </Td>

                      <Td><Editable value={job.time} onChange={(v) => updateJob(job.id, "time", v)} /></Td>
                      <Td><Editable value={job.reference} onChange={(v) => updateJob(job.id, "reference", v)} /></Td>
                      <Td><Editable value={job.dispatch} onChange={(v) => updateJob(job.id, "dispatch", v)} /></Td>

                      <Td>
                        <input
                          className="w-[320px] rounded-lg border border-slate-200 px-2 py-1 outline-none focus:border-slate-500"
                          value={job.company}
                          onChange={(e) => updateJob(job.id, "company", e.target.value)}
                        />
                      </Td>

                      <Td><Editable value={job.tech} onChange={(v) => updateJob(job.id, "tech", v)} /></Td>

                      <Td>
                        <div className="flex items-center gap-2">
                          <Editable value={job.location} onChange={(v) => updateJob(job.id, "location", v)} />
                          <a
                            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(job.location || "")}`}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-lg bg-blue-600 px-2 py-1 text-xs font-bold text-white hover:bg-blue-700"
                          >
                            Map
                          </a>
                        </div>
                      </Td>

                      <Td>
                        <select
                          className={`rounded-full border px-3 py-1 text-xs font-bold ${statusStyles[job.status] || ""}`}
                          value={job.status}
                          onChange={(e) => updateJob(job.id, "status", e.target.value)}
                        >
                          {["New", "In Progress", "Completed", "Canceled", "Dry Run"].map((s) => (
                            <option key={s}>{s}</option>
                          ))}
                        </select>
                      </Td>

                      <Td>
                        <select
                          className={`rounded-full px-3 py-1 text-xs font-bold ${invoiceStyles[job.invoice] || ""}`}
                          value={job.invoice}
                          onChange={(e) => updateJob(job.id, "invoice", e.target.value)}
                        >
                          {["Pending", "Sent", "Paid", "Need Review"].map((s) => (
                            <option key={s}>{s}</option>
                          ))}
                        </select>
                      </Td>

                      <Td>
                        <select
                          className="rounded-xl border border-slate-200 px-2 py-1 text-xs font-bold"
                          value={job.paymentMethod || "Pending"}
                          onChange={(e) => updateJob(job.id, "paymentMethod", e.target.value)}
                        >
                          {paymentMethods.map((method) => (
                            <option key={method}>{method}</option>
                          ))}
                        </select>
                      </Td>

                      <Td>
                        <select
                          className="rounded-xl border border-slate-200 px-2 py-1 text-xs font-bold"
                          value={job.paymentReceiver || "A"}
                          onChange={(e) => updateJob(job.id, "paymentReceiver", e.target.value)}
                        >
                          {paymentReceivers.map((receiver) => (
                            <option key={receiver}>{receiver}</option>
                          ))}
                        </select>
                      </Td>

                      <Td>
                        <textarea
                          className="min-h-20 w-72 rounded-xl border border-slate-200 p-2 outline-none focus:border-slate-500"
                          value={job.updates}
                          onChange={(e) => updateJob(job.id, "updates", e.target.value)}
                        />
                      </Td>

                      <Td><MoneyInput value={job.totalBill} onChange={(v) => updateJob(job.id, "totalBill", Number(v))} className="font-bold" /></Td>
                      <Td><MoneyInput value={job.parts} onChange={(v) => updateJob(job.id, "parts", Number(v))} /></Td>
                      <Td><MoneyInput value={job.techLabor} onChange={(v) => updateJob(job.id, "techLabor", Number(v))} /></Td>

                      <Td>
                        <div className={`rounded-xl px-3 py-2 text-center text-xs font-bold ${
                          Number(job.totalBill || 0) - Number(job.parts || 0) - Number(job.techLabor || 0) >= 0
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-red-100 text-red-700"
                        }`}>
                          {money(Number(job.totalBill || 0) - Number(job.parts || 0) - Number(job.techLabor || 0))}
                        </div>
                      </Td>

                      <Td>
                        <div className="flex gap-2">
                          <button type="button" title="Auto Saved" className="rounded-xl bg-emerald-100 p-2 text-emerald-700">
                            <Save className="h-4 w-4" />
                          </button>

                          <button
                            type="button"
                            onClick={() => requestDelete(job)}
                            className="rounded-xl bg-red-100 p-2 text-red-700 hover:bg-red-200"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {jobToDelete && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
                  <h3 className="text-xl font-bold text-slate-900">Confirm Delete</h3>
                  <p className="mt-2 text-sm text-slate-600">Are you sure you want to delete this job?</p>

                  <div className="mt-4 rounded-2xl bg-slate-50 p-3 text-sm">
                    <p className="font-bold">{jobToDelete.reference || "No Invoice #"}</p>
                    <p className="text-slate-500">{jobToDelete.company}</p>
                    <p className="text-slate-500">{jobToDelete.location}</p>
                  </div>

                  <div className="mt-5 flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => setJobToDelete(null)}
                      className="rounded-xl border border-slate-200 px-4 py-2 font-bold text-slate-700 hover:bg-slate-50"
                    >
                      Cancel
                    </button>

                    <button
                      type="button"
                      onClick={() => deleteJob(jobToDelete.id)}
                      className="rounded-xl bg-red-600 px-4 py-2 font-bold text-white hover:bg-red-700"
                    >
                      Yes, Delete Job
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500">
              <div className="rounded-full bg-emerald-50 px-3 py-1 font-semibold text-emerald-700">
                Auto Save Enabled
              </div>
              <div className="rounded-full bg-blue-50 px-3 py-1 font-semibold text-blue-700">
                Cloud Backup Active
              </div>
              <div className="rounded-full bg-red-50 px-3 py-1 font-semibold text-red-700">
                Delete Protection Confirmation
              </div>
            </div>

            <p className="mt-3 text-xs text-slate-500">
              All changes save automatically in the live cloud database. Jobs can still be deleted manually if someone entered a wrong work order.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function AnalyticsCard({ title, data }) {
  return (
    <div className="mt-6 rounded-3xl bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-xl font-bold">{title}</h2>

      <div className="h-[320px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip />
            <Bar dataKey="value" radius={[10, 10, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-3xl bg-white p-5 shadow-sm"
    >
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
        {React.cloneElement(icon, { className: "h-5 w-5" })}
      </div>
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </motion.div>
  );
}

function Input({ label, value, onChange, type = "text", placeholder = "" }) {
  return (
    <label className="space-y-1 text-sm font-medium">
      {label}
      <input
        type={type}
        className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-slate-500"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function Select({ label, value, onChange, options }) {
  return (
    <label className="space-y-1 text-sm font-medium">
      {label}
      <select
        className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-slate-500"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

function Editable({ value, onChange }) {
  return (
    <input
      className="w-32 rounded-lg border border-slate-200 px-2 py-1 outline-none focus:border-slate-500"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function MoneyInput({ value, onChange, className = "" }) {
  return (
    <input
      type="number"
      className={`w-24 rounded-lg border border-slate-200 px-2 py-1 outline-none focus:border-slate-500 ${className}`}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function Th({ children }) {
  return <th className="px-4 py-3 font-bold">{children}</th>;
}

function Td({ children, className = "" }) {
  return <td className={`px-4 py-3 ${className}`}>{children}</td>;
}
