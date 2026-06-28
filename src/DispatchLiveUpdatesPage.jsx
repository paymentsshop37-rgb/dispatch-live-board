import React, { useMemo, useRef, useState, useEffect } from "react";
import {
  Search,
  Menu,
  Truck,
  Plus,
  Upload,
  Image as ImageIcon,
  ClipboardList,
  CheckCircle2,
  Clock,
  AlertTriangle,
  DollarSign,
  Trash2,
  Save,
  RefreshCw,
  Columns3,
  Filter,
  Edit3,
  Eye,
  MoreHorizontal,
  HelpCircle,
  MapPin,
  MessageCircle,
  Moon,
  Phone,
  Star,
  Users,
  Database,
  Crown,
  FileSpreadsheet,
  FileText,
  Bell,
  BellRing,
} from "lucide-react";
import { motion } from "framer-motion";
import { supabase } from "./lib/supabase";
import { AUTH_USERS, clearAuthSession } from "./authUsers";
import { logActivity } from "./modules/activity";
import { loadTechnicians } from "./modules/technicians/technicianService";
import { getPermissions, normalizeRole } from "./modules/permissions";

const statusStyles = {
  New: "bg-blue-50 text-blue-700 border-blue-200",
  Assigned: "bg-blue-100 text-blue-800 border-blue-300",
  "Tech Accepted": "bg-indigo-50 text-indigo-700 border-indigo-200",
  "En Route": "bg-cyan-50 text-cyan-700 border-cyan-200",
  "On Site": "bg-violet-50 text-violet-700 border-violet-200",
  Working: "bg-amber-50 text-amber-700 border-amber-200",
  "In Progress": "bg-amber-50 text-amber-700 border-amber-200",
  Completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Invoiced: "bg-slate-100 text-slate-700 border-slate-200",
  Paid: "bg-emerald-100 text-emerald-800 border-emerald-300",
  Declined: "bg-red-50 text-red-700 border-red-200",
  Canceled: "bg-red-50 text-red-700 border-red-200",
  Cancelled: "bg-red-50 text-red-700 border-red-200",
  "Dry Run": "bg-purple-50 text-purple-700 border-purple-200",
};

const rowStyles = {
  New: "bg-blue-50 border-l-4 border-blue-500",
  Assigned: "bg-blue-50 border-l-4 border-blue-600",
  "Tech Accepted": "bg-indigo-50 border-l-4 border-indigo-500",
  "En Route": "bg-cyan-50 border-l-4 border-cyan-500",
  "On Site": "bg-violet-50 border-l-4 border-violet-500",
  Working: "bg-amber-50 border-l-4 border-amber-500",
  "In Progress": "bg-yellow-50 border-l-4 border-yellow-500",
  Completed: "bg-emerald-50 border-l-4 border-emerald-500",
  Invoiced: "bg-slate-50 border-l-4 border-slate-500",
  Paid: "bg-emerald-50 border-l-4 border-emerald-600",
  Declined: "bg-red-50 border-l-4 border-red-500",
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
const jobPipeline = ["New", "Assigned", "Tech Accepted", "En Route", "On Site", "Working", "Completed", "Invoiced", "Paid"];
const jobStatusOptions = [...jobPipeline, "Declined", "Canceled", "Dry Run"];
const techPaymentStatusOptions = ["Pending", "Paid", "Hold", "Not Required"];
const techPaymentStatusStyles = {
  Paid: "bg-emerald-100 text-emerald-800 border-emerald-200",
  Pending: "bg-yellow-100 text-yellow-800 border-yellow-200",
  Hold: "bg-red-100 text-red-800 border-red-200",
  "Not Required": "bg-slate-100 text-slate-700 border-slate-200",
};
const techPaymentFieldAliases = {
  status: ["tech_payment_status", "technician_payment_status", "tech_paid_status"],
  method: ["tech_payment_method", "technician_payment_method"],
  paidDate: ["tech_paid_date", "technician_paid_date", "tech_payment_paid_at"],
  notes: ["tech_payment_notes", "technician_payment_notes"],
};

const fieldMap = {
  photo_url: "photo_url",
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
    "Tech Payment",
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
    job.techPaymentStatus || "Pending",
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

function exportJobsToPDF(jobs, showProfit = true) {
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
          ${showProfit ? `<td>$${profit.toFixed(2)}</td>` : ""}
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
              <th>Status</th>
              <th>Invoice</th>
              <th>Company</th>
              <th>Tech</th>
              <th>Location</th>
              <th>Total Bill</th>
              ${showProfit ? "<th>Profit</th>" : ""}
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
    photo_url: row.photo_url || "",
    id: row.id,
    date: row.job_date || "",
    time: row.job_time || "",
    reference: row.invoice_number || "",
    dispatch: row.dispatch || "",
    company: row.company || "",
    tech: row.tech || "",
    technicianId: row.technician_id || "",
    assignedAt: row.assigned_at || "",
    assignedBy: row.assigned_by || "",
    previousTechnician: row.previous_technician || "",
    reassignedCount: Number(row.reassigned_count || 0),
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
    techPaymentStatus: readFirstColumn(row, techPaymentFieldAliases.status) || "Pending",
    techPaymentMethod: readFirstColumn(row, techPaymentFieldAliases.method) || "",
    techPaidDate: readFirstColumn(row, techPaymentFieldAliases.paidDate) || "",
    techPaymentNotes: readFirstColumn(row, techPaymentFieldAliases.notes) || "",
  };
}

function toDbJob(job) {
  return {
    photo_url: job.photo_url || "",
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

function readFirstColumn(row, aliases) {
  const column = aliases.find((alias) => row?.[alias] !== undefined && row?.[alias] !== null);
  return column ? row[column] : "";
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
    jobReference: "",
    poNumber: "",
    truckUnit: "",
    updates: "",
    parts: "",
    totalBill: "",
    techLabor: "",
  };
}

export default function DispatchLiveUpdatesPage() {
  const formRef = useRef(null);
  const searchInputRef = useRef(null);
  const [jobs, setJobs] = useState([]);
  const [accessGranted, setAccessGranted] = useState(() => Boolean(AUTH_USERS[localStorage.getItem("currentUser") || ""]));
  const [accessCode, setAccessCode] = useState("");
  const [currentUserRole, setCurrentUserRole] = useState(
    localStorage.getItem("currentUserRole") || null
  );
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [dateFilter, setDateFilter] = useState("All");
  const [periodFilter, setPeriodFilter] = useState("This Week");
  const [cityFilter, setCityFilter] = useState("All");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [dispatchFilter, setDispatchFilter] = useState("All");
  const [techFilter, setTechFilter] = useState("All");
  const [invoiceFilter, setInvoiceFilter] = useState("All");
  const [form, setForm] = useState(emptyForm());
  const [jobToDelete, setJobToDelete] = useState(null);
  const [assignmentJob, setAssignmentJob] = useState(null);
  const [techPaymentJob, setTechPaymentJob] = useState(null);
  const [dispatchViewMode, setDispatchViewMode] = useState("cockpit");
  const [dispatchTechnicians, setDispatchTechnicians] = useState([]);
  const [assignmentFilters, setAssignmentFilters] = useState({
    city: "",
    state: "",
    service: "",
  });
  const [jobsSupportsTechnicianId, setJobsSupportsTechnicianId] = useState(false);
  const [jobsSupportsAssignedAt, setJobsSupportsAssignedAt] = useState(false);
  const [jobsSupportsAssignedBy, setJobsSupportsAssignedBy] = useState(false);
  const [jobsSupportsPreviousTechnician, setJobsSupportsPreviousTechnician] = useState(false);
  const [jobsSupportsReassignedCount, setJobsSupportsReassignedCount] = useState(false);
  const [techPaymentColumns, setTechPaymentColumns] = useState({
    status: "",
    method: "",
    paidDate: "",
    notes: "",
  });
  const [technicianAvailabilityColumn, setTechnicianAvailabilityColumn] = useState("");
  const [techniciansSupportCurrentJobId, setTechniciansSupportCurrentJobId] = useState(false);
  const [supportsActivityLog, setSupportsActivityLog] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [changeLogs, setChangeLogs] = useState([]);
  const [activityLogs, setActivityLogs] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [jobContextMenu, setJobContextMenu] = useState(null);
  const [currentUserName, setCurrentUserName] = useState(
  localStorage.getItem("currentUserName") || ""
);
  
  const permissions = getPermissions(currentUserRole);
  const isAdmin = normalizeRole(currentUserRole) === "admin";

  function handleLogin() {
  const input = accessCode.trim();

  const userFound = Object.entries(AUTH_USERS).find(
    ([username, user]) => input === `${username}/${user.password}`
  );

  if (userFound) {
    const [username, user] = userFound;

setCurrentUserRole(user.role);
setCurrentUserName(user.name);
setAccessGranted(true);

localStorage.setItem("currentUser", username);
localStorage.setItem("currentUserName", user.name);
localStorage.setItem("currentUserRole", user.role);
window.dispatchEvent(new Event("nttr-auth-changed"));
  } else {
    alert("Invalid username or password");
  }
}

  useEffect(() => {
    if (!accessGranted) return undefined;

    loadJobs();
    loadDispatchTechnicians();
    checkJobAssignmentSupport();

    const channel = supabase
      .channel("live-jobs")
      .on("postgres_changes", { event: "*", schema: "public", table: "jobs" }, (payload) => {
        const nextStatus = payload?.new?.status;
        if (nextStatus) {
          const messageByStatus = {
            "Tech Accepted": "Technician Accepted",
            Declined: "Technician Declined",
            "On Site": "Technician Arrived",
            Completed: "Job Completed",
          };
          const message = messageByStatus[nextStatus];
          if (message) {
            setNotifications((current) => [
              {
                id: `${payload.new.id}-${Date.now()}`,
                message,
                detail: payload.new.company || payload.new.invoice_number || `Job ${payload.new.id}`,
                time: new Date().toLocaleTimeString(),
              },
              ...current,
            ].slice(0, 8));
          }
        }
        loadJobs();

        const audio = new Audio("https://www.soundjay.com/buttons/sounds/button-3.mp3");
        audio.play().catch(() => {});
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [accessGranted]);

  useEffect(() => {
    if (!accessGranted) return undefined;

    const channel = supabase
      .channel("live-dispatch-technicians")
      .on("postgres_changes", { event: "*", schema: "public", table: "technicians" }, () => {
        loadDispatchTechnicians();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [accessGranted]);

  useEffect(() => {
    if (!accessGranted) return undefined;

    function handleKeyboard(event) {
      const targetTag = event.target?.tagName?.toLowerCase();
      const isTyping = ["input", "textarea", "select"].includes(targetTag);

      if (event.key === "Escape") {
        setJobContextMenu(null);
        setAssignmentJob(null);
        return;
      }

      if (!event.ctrlKey) return;

      const key = event.key.toLowerCase();
      if (key === "n") {
        event.preventDefault();
        setForm(emptyForm());
        setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
      }
      if (key === "s") {
        event.preventDefault();
        formRef.current?.requestSubmit();
      }
      if (key === "f") {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
      if (key === "r") {
        event.preventDefault();
        loadJobs();
        loadDispatchTechnicians();
      }
    }

    function closeContextMenu() {
      setJobContextMenu(null);
    }

    window.addEventListener("keydown", handleKeyboard);
    window.addEventListener("click", closeContextMenu);

    return () => {
      window.removeEventListener("keydown", handleKeyboard);
      window.removeEventListener("click", closeContextMenu);
    };
  }, [accessGranted]);

  async function loadDispatchTechnicians() {
    try {
      const technicians = await loadTechnicians();
      setDispatchTechnicians(
        technicians.filter((technician) => {
          const isApproved = String(technician.status || "").toLowerCase() === "approved";
          return isApproved;
        })
      );
    } catch (error) {
      console.error("Error loading technicians:", error.message);
    }
  }

  async function checkJobAssignmentSupport() {
    const [
      { error: technicianIdError },
      { error: assignedAtError },
      { error: assignedByError },
      { error: previousTechnicianError },
      { error: reassignedCountError },
      { error: technicianAvailabilityError },
      { error: technicianAvailabilityStatusError },
      { error: technicianCurrentJobIdError },
      { error: activityLogError },
    ] = await Promise.all([
      supabase.from("jobs").select("technician_id").limit(0),
      supabase.from("jobs").select("assigned_at").limit(0),
      supabase.from("jobs").select("assigned_by").limit(0),
      supabase.from("jobs").select("previous_technician").limit(0),
      supabase.from("jobs").select("reassigned_count").limit(0),
      supabase.from("technicians").select("availability").limit(0),
      supabase.from("technicians").select("availability_status").limit(0),
      supabase.from("technicians").select("current_job_id").limit(0),
      supabase.from("activity_log").select("id").limit(0),
    ]);

    setJobsSupportsTechnicianId(!technicianIdError);
    setJobsSupportsAssignedAt(!assignedAtError);
    setJobsSupportsAssignedBy(!assignedByError);
    setJobsSupportsPreviousTechnician(!previousTechnicianError);
    setJobsSupportsReassignedCount(!reassignedCountError);
    setTechnicianAvailabilityColumn(!technicianAvailabilityError ? "availability" : !technicianAvailabilityStatusError ? "availability_status" : "");
    setTechniciansSupportCurrentJobId(!technicianCurrentJobIdError);
    setSupportsActivityLog(!activityLogError);
    const [statusColumn, methodColumn, paidDateColumn, notesColumn] = await Promise.all([
      detectJobsColumn(techPaymentFieldAliases.status),
      detectJobsColumn(techPaymentFieldAliases.method),
      detectJobsColumn(techPaymentFieldAliases.paidDate),
      detectJobsColumn(techPaymentFieldAliases.notes),
    ]);

    setTechPaymentColumns({
      status: statusColumn,
      method: methodColumn,
      paidDate: paidDateColumn,
      notes: notesColumn,
    });
  }

  async function detectJobsColumn(aliases) {
    for (const alias of aliases) {
      const { error } = await supabase.from("jobs").select(alias).limit(0);
      if (!error) return alias;
    }

    return "";
  }

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

   const currentMonth = new Date().toISOString().slice(0, 7);

const { data: logsData } = await supabase
  .from("change_logs")
  .select("*")
  .eq("month_key", currentMonth)
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
        const matchesTech = techFilter === "All" || job.tech === techFilter;
        const matchesInvoice = invoiceFilter === "All" || job.invoice === invoiceFilter;
const today = new Date();
const jobDate = new Date(job.date + " 00:00:00");

const startOfWeek = new Date(today);
startOfWeek.setHours(0, 0, 0, 0);
startOfWeek.setDate(today.getDate() - today.getDay());

const endOfWeek = new Date(startOfWeek);
endOfWeek.setHours(23, 59, 59, 999);
endOfWeek.setDate(startOfWeek.getDate() + 6);
const isThisWeek =
  jobDate >= startOfWeek && jobDate <= endOfWeek;

const startOfLastWeek = new Date(startOfWeek);
startOfLastWeek.setDate(startOfWeek.getDate() - 7);
startOfLastWeek.setHours(0, 0, 0, 0);

const endOfLastWeek = new Date(startOfWeek);
endOfLastWeek.setDate(startOfWeek.getDate() - 1);
endOfLastWeek.setHours(23, 59, 59, 999);

const isLastWeek =
  jobDate >= startOfLastWeek &&
  jobDate <= endOfLastWeek;

const isThisMonth =
  jobDate.getMonth() === today.getMonth() &&
  jobDate.getFullYear() === today.getFullYear();
const startOfLastMonth = new Date(
  today.getFullYear(),
  today.getMonth() - 1,
  1
);

startOfLastMonth.setHours(0, 0, 0, 0);

const endOfLastMonth = new Date(
  today.getFullYear(),
  today.getMonth(),
  0
);

endOfLastMonth.setHours(23, 59, 59, 999);

const isLastMonth =
  jobDate >= startOfLastMonth &&
  jobDate <= endOfLastMonth;

const startOfYear = new Date(today.getFullYear(), 0, 1);
startOfYear.setHours(0, 0, 0, 0);

const endOfYear = new Date(today.getFullYear(), 11, 31);
endOfYear.setHours(23, 59, 59, 999);

const isThisYear =
  jobDate >= startOfYear &&
  jobDate <= endOfYear;

const startOfLastYear = new Date(today.getFullYear() - 1, 0, 1);
startOfLastYear.setHours(0, 0, 0, 0);

const endOfLastYear = new Date(today.getFullYear() - 1, 11, 31);
endOfLastYear.setHours(23, 59, 59, 999);

const isLastYear =
  jobDate >= startOfLastYear &&
  jobDate <= endOfLastYear;

const matchesPeriod =
  periodFilter === "All"
    ? true
    : periodFilter === "This Week" || periodFilter === "ThisWeek"
    ? isThisWeek
    : periodFilter === "Last Week" || periodFilter === "LastWeek"
    ? isLastWeek
    : periodFilter === "This Month" || periodFilter === "ThisMonth"
    ? isThisMonth
    : periodFilter === "Last Month" || periodFilter === "LastMonth"
    ? isLastMonth
    : periodFilter === "This Year" || periodFilter === "ThisYear"
    ? isThisYear
    : periodFilter === "Last Year" || periodFilter === "LastYear"
    ? isLastYear
    : true;

  const matchesDateRange =
  (!fromDate || job.date >= fromDate) &&
  (!toDate || job.date <= toDate);

return (
  matchesSearch &&
  matchesStatus &&
  matchesDate &&
  matchesCity &&
  matchesDispatch &&
  matchesTech &&
  matchesInvoice &&
  matchesPeriod &&
  matchesDateRange
);
      })
      .sort((a, b) => {
  const dateTimeA = new Date(`${a.date} ${a.time || "00:00"}`);
  const dateTimeB = new Date(`${b.date} ${b.time || "00:00"}`);

  return dateTimeA - dateTimeB;
});
  }, [jobs, search, statusFilter, dateFilter, cityFilter, dispatchFilter, techFilter, invoiceFilter, periodFilter, fromDate, toDate]);

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

  const techs = useMemo(
    () => [...new Set(jobs.map((job) => job.tech).filter(Boolean))].sort(),
    [jobs]
  );

  const recentCompanies = useMemo(() => recentValues(jobs, "company"), [jobs]);
  const recentLocations = useMemo(() => recentValues(jobs, "location"), [jobs]);
  const recentTechnicians = useMemo(
    () => [
      ...new Set([
        ...jobs.map((job) => job.tech).filter(Boolean),
        ...dispatchTechnicians.map((technician) => technician.full_name).filter(Boolean),
      ]),
    ].slice(0, 8),
    [jobs, dispatchTechnicians]
  );
  const recentDispatchers = useMemo(() => recentValues(jobs, "dispatch"), [jobs]);

  const stats = useMemo(() => {
   return {
  total: filteredJobs.length,
  activeJobs: filteredJobs.filter((j) => !["Completed", "Canceled", "Cancelled", "Paid"].includes(j.status)).length,
  pendingJobs: filteredJobs.filter((j) => ["New", "Pending"].includes(j.status)).length,
  newJobs: filteredJobs.filter((j) => j.status === "New").length,
  assigned: filteredJobs.filter((j) => j.status === "Assigned").length,
  enRoute: filteredJobs.filter((j) => j.status === "En Route").length,
  working: filteredJobs.filter((j) => j.status === "Working").length,
  completedToday: filteredJobs.filter((j) => j.status === "Completed" && j.date === new Date().toISOString().slice(0, 10)).length,
  revenueToday: filteredJobs.filter((j) => j.date === new Date().toISOString().slice(0, 10)).reduce((sum, job) => sum + Number(job.totalBill || 0), 0),
  averageEta: averageEta(filteredJobs),
  inProgress: filteredJobs.filter((j) => j.status === "In Progress").length,
  completed: filteredJobs.filter((j) => j.status === "Completed").length,
  canceled: filteredJobs.filter((j) => j.status === "Canceled" || j.status === "Cancelled").length,
  dryRuns: filteredJobs.filter((j) => j.status === "Dry Run").length,
  weeklyJobs: filteredJobs.length,
  monthlyJobs: filteredJobs.length,
     
    pendingInvoices: filteredJobs.filter(
  (j) => j.invoice !== "Paid"
).length,

revenue: filteredJobs.reduce(
  (sum, job) => sum + Number(job.totalBill || 0),
  0
),

partsExpense: filteredJobs.reduce(
  (sum, job) => sum + Number(job.parts || 0),
  0
),

techLaborExpense: filteredJobs.reduce(
  (sum, job) => sum + Number(job.techLabor || 0),
  0
),

totalExpenses: filteredJobs.reduce(
  (sum, job) =>
    sum +
    Number(job.parts || 0) +
    Number(job.techLabor || 0),
  0
),

profit: filteredJobs.reduce(
  (sum, job) =>
    sum +
    (
      Number(job.totalBill || 0) -
      Number(job.parts || 0) -
      Number(job.techLabor || 0)
    ),
  0
),
    };
 }, [jobs, filteredJobs]);

  const assignmentTechnicians = useMemo(() => {
    const jobLocation = parseLocation(assignmentJob?.location);
    const city = (assignmentFilters.city || jobLocation.city).trim().toLowerCase();
    const state = (assignmentFilters.state || jobLocation.state).trim().toLowerCase();
    const service = assignmentFilters.service.trim().toLowerCase();

    return dispatchTechnicians
      .filter((technician) => {
      const services = splitServices(technician.services).join(" ").toLowerCase();
      const coverage = [technician.coverage, technician.serviceArea].join(" ").toLowerCase();

      const matchesCity =
        !city ||
        String(technician.city || "").toLowerCase().includes(city) ||
        coverage.includes(city);
      const matchesState = !state || String(technician.state || "").toLowerCase().includes(state);
      const matchesService = !service || services.includes(service);

      return matchesCity && matchesState && matchesService;
    })
      .sort((a, b) => {
        const aCityExact = String(a.city || "").trim().toLowerCase() === city ? 1 : 0;
        const bCityExact = String(b.city || "").trim().toLowerCase() === city ? 1 : 0;
        if (aCityExact !== bCityExact) return bCityExact - aCityExact;

        const aStateMatch = state && String(a.state || "").trim().toLowerCase() === state ? 1 : 0;
        const bStateMatch = state && String(b.state || "").trim().toLowerCase() === state ? 1 : 0;
        if (aStateMatch !== bStateMatch) return bStateMatch - aStateMatch;

        const ratingDifference = Number(b.rating || 0) - Number(a.rating || 0);
        if (ratingDifference !== 0) return ratingDifference;

        return technicianCompliance(b) - technicianCompliance(a);
      });
  }, [assignmentFilters, assignmentJob, dispatchTechnicians]);

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
          message: `${currentUserName || "Dispatcher"} added job "${newJob.reference || newJob.company || "New Job"}"`,
          time: new Date().toLocaleString(),
        },
        ...logs,
      ]);

      await supabase.from("change_logs").insert([
        {
          job_id: data.id,
          action: "created",
          field_name: "job",
          old_value: "",
          new_value: newJob.reference || newJob.company || "New Job",
          user_name: currentUserName || "Dispatcher",
          month_key: new Date().toISOString().slice(0, 7),
        },
      ]);
      await logActivity({
        entityType: "job",
        entityId: data.id,
        action: "Job Created",
        description: `${currentUserName || "Dispatcher"} created job ${newJob.reference || newJob.company || data.id}`,
        createdBy: currentUserName || "Dispatcher",
      });
    }
  }
async function uploadPhoto(jobId, file) {
  if (!file) return;

  const fileName = `${jobId}-${Date.now()}-${file.name}`;

  const { error: uploadError } = await supabase.storage
    .from("job-photos")
    .upload(fileName, file);

  if (uploadError) {
    alert(uploadError.message);
    return;
  }

  const {
    data: { publicUrl },
  } = supabase.storage
    .from("job-photos")
    .getPublicUrl(fileName);

  await updateJob(jobId, "photo_url", publicUrl);
   
  const activityMessage = {
  id: Date.now(),
  message: `${currentUserName || "Dispatcher"} uploaded photo to job ${jobId}`,
  time: new Date().toLocaleString(),
};
 
  setActivityLogs((logs) => [ activityMessage, ...logs,]);
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
    const activityMessage = {
      id: Date.now(),
      message: `${currentUserName || "Dispatcher"} updated ${field} from "${oldValue}" to "${value}"`,
      time: new Date().toLocaleString(),
    };

    setActivityLogs((logs) => [activityMessage, ...logs]);

    await supabase.from("change_logs").insert([
      {
        job_id: id,
        action: "updated",
        field_name: field,
        old_value: String(oldValue ?? ""),
        new_value: String(value ?? ""),
        user_name: currentUserName || "Dispatcher",
        month_key: new Date().toISOString().slice(0, 7),
      },
    ]);
    await logActivity({
      entityType: "job",
      entityId: id,
      action: "Job Updated",
      description: `${currentUserName || "Dispatcher"} updated ${field} from "${oldValue}" to "${value}"`,
      createdBy: currentUserName || "Dispatcher",
      metadata: { field, oldValue, value },
    });
  }

  async function updateTechPaymentStatus(job, value) {
    if (!techPaymentColumns.status) {
      alert("Tech payment columns are not available yet.");
      setJobs((currentJobs) =>
        currentJobs.map((currentJob) =>
          currentJob.id === job.id ? { ...currentJob, techPaymentStatus: value } : currentJob
        )
      );
      return;
    }

    await saveTechPaymentDetails(job.id, { techPaymentStatus: value });
  }

  async function saveTechPaymentDetails(jobId, details) {
    if (!techPaymentColumns.status) {
      alert("Tech payment columns are not available yet.");
      return false;
    }

    const update = {};
    if (techPaymentColumns.status && details.techPaymentStatus !== undefined) {
      update[techPaymentColumns.status] = details.techPaymentStatus || "Pending";
    }
    if (techPaymentColumns.method && details.techPaymentMethod !== undefined) {
      update[techPaymentColumns.method] = details.techPaymentMethod || "";
    }
    if (techPaymentColumns.paidDate && details.techPaidDate !== undefined) {
      update[techPaymentColumns.paidDate] = details.techPaidDate || null;
    }
    if (techPaymentColumns.notes && details.techPaymentNotes !== undefined) {
      update[techPaymentColumns.notes] = details.techPaymentNotes || "";
    }

    if (Object.keys(update).length === 0) {
      alert("Tech payment columns are not available yet.");
      return false;
    }

    const { error } = await supabase.from("jobs").update(update).eq("id", jobId);

    if (error) {
      alert("Error updating tech payment: " + error.message);
      loadJobs();
      return false;
    }

    setJobs((currentJobs) =>
      currentJobs.map((job) => (job.id === jobId ? { ...job, ...details } : job))
    );
    setActivityLogs((logs) => [
      {
        id: Date.now(),
        message: `${currentUserName || "Dispatcher"} updated tech payment for job ${jobId}`,
        time: new Date().toLocaleString(),
      },
      ...logs,
    ]);
    return true;
  }

  async function deleteJob(id) {
    const deletedJob = jobs.find((job) => job.id === id);

    const { error } = await supabase.from("jobs").delete().eq("id", id);

    if (error) {
      alert("Error deleting job: " + error.message);
      return;
    }
const newActivity = {
  id: Date.now(),
  message: `${currentUserName || "Dispatcher"} deleted job ${deletedJob?.reference || deletedJob?.company || id}`,
  time: new Date().toLocaleString(),
};

setActivityLogs((logs) => [newActivity, ...logs]);
  await supabase.from("change_logs").insert([
  {
    job_id: id,
    action: "deleted",
    field_name: "job",
    old_value: deletedJob?.reference || deletedJob?.company || String(id),
    new_value: "",
    user_name: currentUserName || "Dispatcher",
    month_key: new Date().toISOString().slice(0, 7)
  },
]);
await logActivity({
  entityType: "job",
  entityId: id,
  action: "Job Deleted",
  description: `${currentUserName || "Dispatcher"} deleted job ${deletedJob?.reference || deletedJob?.company || id}`,
  createdBy: currentUserName || "Dispatcher",
});

    setJobs((currentJobs) => currentJobs.filter((job) => job.id !== id));
    setJobToDelete(null);
  }

  function requestDelete(job) {
    setJobToDelete(job);
  }

  async function assignRecommendedTechnician(job, technician) {
    if (!jobsSupportsTechnicianId) {
      alert("Safe mode: jobs.technician_id does not exist yet. Assignment preview only.");
      setForm((current) => ({ ...current, tech: technician.full_name || "" }));
      return;
    }

    if (!job?.id) {
      setForm((current) => ({ ...current, tech: technician.full_name || "" }));
      alert("Technician selected. Save the job first, then assign it from the live board.");
      return;
    }

    const isReassignment = Boolean(job.technicianId && job.technicianId !== technician.id);
    if (isReassignment) {
      const shouldReassign = window.confirm("This job is already assigned.\nDo you want to reassign?");
      if (!shouldReassign) return;
    }

    try {
      const assignedAt = new Date().toISOString();
      const dispatcher = currentUserName || "Dispatcher";
      const previousTechnician = job.tech || job.previousTechnician || "";
      const nextReassignedCount = isReassignment ? Number(job.reassignedCount || 0) + 1 : Number(job.reassignedCount || 0);
      const jobUpdate = {
        technician_id: technician.id,
        tech: technician.full_name || "",
        status: "Assigned",
      };

      if (jobsSupportsAssignedAt) {
        jobUpdate.assigned_at = assignedAt;
      }
      if (jobsSupportsAssignedBy) {
        jobUpdate.assigned_by = dispatcher;
      }
      if (jobsSupportsPreviousTechnician && isReassignment) {
        jobUpdate.previous_technician = previousTechnician;
      }
      if (jobsSupportsReassignedCount) {
        jobUpdate.reassigned_count = nextReassignedCount;
      }

      const { error } = await supabase
        .from("jobs")
        .update(jobUpdate)
        .eq("id", job.id);

      if (error) {
        throw error;
      }

      const technicianUpdate = {};
      if (technicianAvailabilityColumn) {
        technicianUpdate[technicianAvailabilityColumn] = "Busy";
      }
      if (techniciansSupportCurrentJobId) {
        technicianUpdate.current_job_id = job.id;
      }
      if (Object.keys(technicianUpdate).length > 0) {
        const { error: technicianUpdateError } = await supabase
          .from("technicians")
          .update(technicianUpdate)
          .eq("id", technician.id);

        if (technicianUpdateError) {
          console.warn("Technician assignment status update skipped:", technicianUpdateError.message);
        }
      }

      const assignedDate = new Date(assignedAt);
      await logActivity({
        entityType: "job",
        entityId: job.id,
        action: "Job Assigned",
        description: [
          `Job ID: ${job.id}`,
          `Technician: ${technician.full_name || "Technician"}`,
          `Dispatcher: ${dispatcher}`,
          `Date: ${assignedDate.toLocaleDateString()}`,
          `Time: ${assignedDate.toLocaleTimeString()}`,
        ].join(" | "),
        createdBy: dispatcher,
      });

      setJobs((currentJobs) =>
        currentJobs.map((currentJob) =>
          currentJob.id === job.id
            ? {
                ...currentJob,
                tech: technician.full_name || "",
                technicianId: technician.id,
                assignedAt,
                assignedBy: dispatcher,
                previousTechnician: isReassignment ? previousTechnician : currentJob.previousTechnician,
                reassignedCount: nextReassignedCount,
                status: "Assigned",
              }
            : currentJob
        )
      );
      setAssignmentJob(null);
      setToastMessage("Technician Assigned Successfully");
      window.setTimeout(() => setToastMessage(""), 3500);
      await loadDispatchTechnicians();
      await loadJobs();
    } catch (error) {
      alert("Error assigning technician: " + error.message);
    }
  }

  async function updateTechnicianAvailability(technician, availability) {
    if (!technicianAvailabilityColumn) {
      alert("Safe mode: technician availability column does not exist yet.");
      return;
    }

    const { error } = await supabase
      .from("technicians")
      .update({ [technicianAvailabilityColumn]: availability })
      .eq("id", technician.id);

    if (error) {
      alert("Error updating technician availability: " + error.message);
      return;
    }

    setDispatchTechnicians((current) =>
      current.map((item) =>
        item.id === technician.id ? { ...item, availabilityStatus: availability } : item
      )
    );
    await loadDispatchTechnicians();
  }

  function openJobContextMenu(event, job) {
    event.preventDefault();
    setJobContextMenu({ x: event.clientX, y: event.clientY, job });
  }

  function handleJobContextAction(action, job) {
    setJobContextMenu(null);
    if (!job) return;

    if (action === "edit") {
      setAssignmentJob(job);
      setDispatchViewMode("table");
      return;
    }
    if (action === "assign") {
      setAssignmentJob(job);
      return;
    }
    if (action === "copy") {
      navigator.clipboard?.writeText(formatJobForClipboard(job));
      setToastMessage("Job copied");
      window.setTimeout(() => setToastMessage(""), 2500);
      return;
    }
    if (action === "duplicate") {
      setForm({
        ...emptyForm(),
        date: job.date || new Date().toISOString().slice(0, 10),
        time: job.time || "",
        reference: `${job.reference || ""} COPY`.trim(),
        dispatch: job.dispatch || "",
        company: job.company || "",
        tech: job.tech || "",
        location: job.location || "",
        status: "New",
        rowFlag: job.rowFlag || "Normal",
        invoice: job.invoice || "Pending",
        paymentMethod: job.paymentMethod || "Pending",
        paymentReceiver: job.paymentReceiver || "A",
        updates: job.updates || "",
        parts: job.parts || "",
        totalBill: job.totalBill || "",
        techLabor: job.techLabor || "",
      });
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (action === "complete") {
      updateJob(job.id, "status", "Completed");
      return;
    }
    if (action === "cancel") {
      updateJob(job.id, "status", "Canceled");
      return;
    }
    if (action === "maps") {
      window.open(mapLink(job.location), "_blank", "noopener,noreferrer");
      return;
    }
    if (action === "call") {
      alert("Customer phone is not stored on this job yet.");
      return;
    }
    if (action === "whatsapp") {
      window.open(customerWhatsAppLink(job), "_blank", "noopener,noreferrer");
    }
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
    <div className="min-h-screen w-full max-w-none min-w-0 overflow-x-hidden bg-slate-100 text-slate-900">
      {toastMessage && (
        <div className="fixed right-6 top-6 z-50 rounded-xl border border-emerald-200 bg-white px-5 py-3 text-sm font-bold text-emerald-700 shadow-xl">
          {toastMessage}
        </div>
      )}
      <div className="w-full max-w-none min-w-0 space-y-6 p-4 md:p-6 xl:p-8">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-slate-800 bg-[#0b1628] p-4 text-white shadow-sm"
        >
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap items-center gap-4">
              <button type="button" className="rounded-xl bg-white/10 p-3 text-slate-200 hover:bg-white/15" title="Menu">
                <Menu className="h-5 w-5" />
              </button>

              <div>
                <div className="hidden">
                  <span>Home</span><span>&gt;</span><span>Dispatch Center</span><span>&gt;</span><span className="text-blue-700">Live Jobs</span>
                </div>
                <h1 className="text-2xl font-bold tracking-tight text-white">Dispatch Cockpit</h1>
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-300">
                  Secure live dispatch system · Truck & Trailer Road Service
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 xl:flex-nowrap">
              <button type="button" className="rounded-xl bg-white/10 px-4 py-2 text-sm font-bold text-slate-200 hover:bg-white/15">
                Shortcuts
              </button>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <input
                  ref={searchInputRef}
                  className="w-80 rounded-xl border border-white/10 bg-white/10 py-2 pl-9 pr-3 text-sm text-white outline-none placeholder:text-slate-400 focus:border-blue-400"
                  placeholder="Search jobs, invoices, companies..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <button type="button" className="rounded-xl bg-white/10 p-3 text-slate-200 hover:bg-white/15" title="Notifications">
                <Bell className="h-4 w-4" />
              </button>
              <button type="button" className="rounded-xl bg-white/10 p-3 text-slate-200 hover:bg-white/15" title="Help">
                <HelpCircle className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => document.documentElement.classList.toggle("dark")}
                className="rounded-xl bg-white/10 p-3 text-slate-200 hover:bg-white/15"
                title="Dark mode"
              >
                <Moon className="h-4 w-4" />
              </button>
              <div className="rounded-xl bg-white/10 px-4 py-2 text-sm font-bold capitalize text-white">
                {currentUserName || "Not signed in"} · {normalizeRole(currentUserRole) || "access required"}
              </div>
              <div className="hidden gap-2 lg:flex">
                {["cockpit", "table"].map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setDispatchViewMode(mode)}
                    className={`rounded-xl px-4 py-2 text-sm font-bold ${
                      dispatchViewMode === mode
                        ? "bg-blue-600 text-white"
                        : "bg-white/10 text-slate-200 hover:bg-white/15"
                    }`}
                  >
                    {mode === "cockpit" ? "Cockpit View" : "Table View"}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => {
                setAccessGranted(false);
                setAccessCode("");
                setCurrentUserRole(null);
                setCurrentUserName("");
                clearAuthSession();
              }}
              className="rounded-xl bg-red-50 px-4 py-2 text-sm font-bold text-red-700 hover:bg-red-100"
            >
              Logout
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

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-950">Job Status Pipeline</h2>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Live dispatch workflow</p>
            </div>
            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">Realtime</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {jobPipeline.map((status) => (
              <span key={status} className={`rounded-full border px-3 py-1 text-xs font-bold uppercase ${statusStyles[status] || "bg-slate-50 text-slate-700 border-slate-200"}`}>
                {status}
              </span>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <Bell className="h-5 w-5 text-blue-600" />
            <h2 className="text-lg font-bold text-slate-950">Notification Center</h2>
          </div>
          {notifications.length === 0 ? (
            <p className="text-sm text-slate-500">No live workflow notifications yet.</p>
          ) : (
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
              {notifications.map((notification) => (
                <div key={notification.id} className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm">
                  <p className="font-bold text-blue-900">{notification.message}</p>
                  <p className="text-xs text-blue-700">{notification.detail}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">{notification.time}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="sticky top-0 z-30 grid gap-4 rounded-xl border border-slate-200 bg-slate-100/95 p-2 backdrop-blur md:grid-cols-3 xl:grid-cols-6">
          <StatCard icon={<ClipboardList />} label="Active Jobs" value={stats.activeJobs} />
          <StatCard icon={<AlertTriangle />} label="Pending Jobs" value={stats.pendingJobs} />
          <StatCard icon={<Users />} label="Assigned Jobs" value={stats.assigned} />
          <StatCard icon={<CheckCircle2 />} label="Completed Today" value={stats.completedToday} />
          <StatCard icon={<DollarSign />} label="Revenue Today" value={money(stats.revenueToday)} />
          <StatCard icon={<Clock />} label="Average ETA" value={stats.averageEta ? `${stats.averageEta} min` : "0"} />
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
  onClick={() => {
    setInvoiceFilter("Pending");
    setPeriodFilter("All");
    setTimeout(() => document.getElementById("live-jobs-table")?.scrollIntoView({ behavior: "smooth" }), 0);
  }}
/>

   <StatCard
  icon={<Bell />}
  label="Sent"
  value={jobs.filter(j => j.invoice === "Sent").length}
  onClick={() => {
    setInvoiceFilter("Sent");
    setPeriodFilter("All");
    setTimeout(() => document.getElementById("live-jobs-table")?.scrollIntoView({ behavior: "smooth" }), 0);
  }}
/>
   <StatCard
  icon={<CheckCircle2 />}
  label="Paid"
  value={jobs.filter(j => j.invoice === "Paid").length}
  onClick={() => {
    setInvoiceFilter("Paid");
    setPeriodFilter("All");
    setTimeout(() => document.getElementById("live-jobs-table")?.scrollIntoView({ behavior: "smooth" }), 0);
  }}
/>
   <StatCard
  icon={<AlertTriangle />}
  label="Need Review"
  value={jobs.filter(j => j.invoice === "Need Review").length}
  onClick={() => {
    setInvoiceFilter("Need Review");
    setPeriodFilter("All");
    setTimeout(() => document.getElementById("live-jobs-table")?.scrollIntoView({ behavior: "smooth" }), 0);
  }}
/>
  </div>
</div>

    <div className="mt-6 grid gap-6 xl:grid-cols-2">
  <AnalyticsCard
    title="Financial Overview"
    data={[
      { name: "Revenue", value: stats.revenue || 0 },
      { name: "Expenses", value: stats.totalExpenses || 0 },
      { name: "Profit", value: stats.profit || 0 },
    ]}
  />

  <AnalyticsCard
    title="Jobs by Status"
    data={[
      { name: "Completed", value: stats.completed },
      { name: "In Progress", value: stats.inProgress },
      { name: "Canceled", value: stats.canceled },
      { name: "Dry Runs", value: stats.dryRuns },
      { name: "Open Invoices", value: stats.pendingInvoices },
    ]}
  />

  <AnalyticsCard title="Dispatcher Performance" data={chartDataBy(filteredJobs, "dispatch")} />
  <AnalyticsCard title="Tech Performance" data={chartDataBy(filteredJobs, "tech")} />
  <AnalyticsCard title="Jobs by City" data={chartDataBy(filteredJobs, "location")} />

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

        <div className="grid w-full min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
          <form ref={formRef} onSubmit={addJob} className="w-full max-w-none rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-950">Add New Job</h2>
                <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Dispatch intake</p>
              </div>
              <Plus className="h-5 w-5 text-blue-600" />
            </div>

            <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
              <Input label="Date" type="date" value={form.date} onChange={(v) => setForm({ ...form, date: v })} />
              <Input label="Time" placeholder="10:45 AM" value={form.time} onChange={(v) => setForm({ ...form, time: v })} />
              <Input label="Invoice #" value={form.reference} onChange={(v) => setForm({ ...form, reference: v })} />
              <Input label="Dispatch" list="dispatcher-suggestions" value={form.dispatch} onChange={(v) => setForm({ ...form, dispatch: v })} />
              <Input label="Company" list="company-suggestions" value={form.company} onChange={(v) => setForm({ ...form, company: v })} />
              <Input label="Tech" list="technician-suggestions" value={form.tech} onChange={(v) => setForm({ ...form, tech: v })} />
              <Input label="Location" list="location-suggestions" placeholder="City, State" value={form.location} onChange={(v) => setForm({ ...form, location: v })} />
              <Select label="Priority Color" value={form.rowFlag} onChange={(v) => setForm({ ...form, rowFlag: v })} options={["Normal", "Pending", "Problem", "Completed", "Info"]} />
              <Select label="Status" value={form.status} onChange={(v) => setForm({ ...form, status: v })} options={jobStatusOptions} />
              <Select label="Invoice Status" value={form.invoice} onChange={(v) => setForm({ ...form, invoice: v })} options={["Pending", "Sent", "Paid", "Need Review"]} />
              <Select label="Payment Method" value={form.paymentMethod} onChange={(v) => setForm({ ...form, paymentMethod: v })} options={paymentMethods} />
              <Select label="Received" value={form.paymentReceiver} onChange={(v) => setForm({ ...form, paymentReceiver: v })} options={paymentReceivers} />
              <Input label="Reference #" value={form.jobReference || ""} onChange={(v) => setForm({ ...form, jobReference: v })} />
              <Input label="PO #" value={form.poNumber || ""} onChange={(v) => setForm({ ...form, poNumber: v })} />
              <Input label="Truck/Unit #" value={form.truckUnit || ""} onChange={(v) => setForm({ ...form, truckUnit: v })} />

              <label className="space-y-1 text-sm font-medium md:col-span-2 2xl:col-span-3">
                Updates / Notes
                <textarea
                  className="min-h-24 w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-slate-500"
                  placeholder="Example: Driver called. Tech ETA 35 minutes..."
                  value={form.updates}
                  onChange={(e) => setForm({ ...form, updates: e.target.value })}
                />
              </label>

              <Input label="Total Bill" type="number" value={form.totalBill} onChange={(v) => setForm({ ...form, totalBill: v })} />
              <Input label="Parts" type="number" value={form.parts} onChange={(v) => setForm({ ...form, parts: v })} />
              <Input label="Tech Labor" type="number" value={form.techLabor} onChange={(v) => setForm({ ...form, techLabor: v })} />

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 md:col-span-2 2xl:col-span-3">
                <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                  Filter by period / date range
                </div>
                <div className="flex flex-wrap items-center gap-2 overflow-x-auto">
                  <select
                    className="rounded-xl border border-slate-200 px-3 py-2"
                    value={periodFilter}
                    onChange={(e) => setPeriodFilter(e.target.value)}
                  >
                    <option value="ThisWeek">This Week</option>
                    <option value="LastWeek">Last Week</option>
                    <option value="ThisMonth">This Month</option>
                    <option value="LastMonth">Last Month</option>
                    <option value="ThisYear">This Year</option>
                    <option value="LastYear">Last Year</option>
                    <option value="All">All</option>
                  </select>

                  <input
                    type="date"
                    className="w-36 rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                  />

                  <input
                    type="date"
                    className="w-36 rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex flex-wrap justify-end gap-2 md:col-span-2 2xl:col-span-3">
                <button
                  type="button"
                  onClick={() => setForm(emptyForm())}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50"
                >
                  Clear
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700"
                >
                  Save Job
                </button>
              </div>
            </div>
            <datalist id="company-suggestions">
              {recentCompanies.map((company) => <option key={company} value={company} />)}
            </datalist>
            <datalist id="location-suggestions">
              {recentLocations.map((location) => <option key={location} value={location} />)}
            </datalist>
            <datalist id="technician-suggestions">
              {recentTechnicians.map((technician) => <option key={technician} value={technician} />)}
            </datalist>
            <datalist id="dispatcher-suggestions">
              {recentDispatchers.map((dispatcher) => <option key={dispatcher} value={dispatcher} />)}
            </datalist>
          </form>

          <div className="order-2 col-span-full flex flex-wrap justify-end gap-2">
            {["cockpit", "table"].map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setDispatchViewMode(mode)}
                className={`rounded-xl px-4 py-2 text-sm font-bold ${
                  dispatchViewMode === mode
                    ? "bg-blue-600 text-white"
                    : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {mode === "cockpit" ? "Cockpit View" : "Table View"}
              </button>
            ))}
          </div>

          {dispatchViewMode === "cockpit" && (
            <DispatchCockpit
              jobs={filteredJobs}
              selectedJob={assignmentJob || filteredJobs[0]}
              technicians={assignmentTechnicians}
              notifications={notifications}
              activityLogs={activityLogs}
              changeLogs={changeLogs}
              filters={assignmentFilters}
              onSelectJob={setAssignmentJob}
              onFiltersChange={setAssignmentFilters}
              onAssign={assignRecommendedTechnician}
              onUpdateJob={updateJob}
              onOpenTable={() => setDispatchViewMode("table")}
              onContextMenu={openJobContextMenu}
            />
          )}

          {jobContextMenu && (
            <JobContextMenu
              x={jobContextMenu.x}
              y={jobContextMenu.y}
              job={jobContextMenu.job}
              onAction={handleJobContextAction}
            />
          )}

          {dispatchViewMode === "table" && (
          <div id="live-jobs-table" className="order-3 col-span-full w-full max-w-none min-w-0 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex flex-col gap-3 2xl:flex-row 2xl:items-center 2xl:justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-950">Live Jobs</h2>
                <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Ordered oldest to newest</p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => exportJobsToCSV(filteredJobs)}
                  className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700"
                >
                  <FileSpreadsheet className="h-4 w-4" />
                  Export Excel
                </button>
                <button
                  type="button"
                  className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
                >
                  <Columns3 className="h-4 w-4" />
                  Columns
                </button>
                <button
                  type="button"
                  onClick={loadJobs}
                  className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700"
                >
                  <RefreshCw className="h-4 w-4" />
                  Refresh
                </button>
              </div>
            </div>

            <div className="mb-4 w-full max-w-none overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="grid w-full min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-[minmax(220px,1fr)_150px_170px_170px_160px_160px] xl:items-center">
                <div className="relative min-w-0">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <input
                    className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 outline-none focus:border-slate-500"
                    placeholder="Search job, city, tech..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>

                <select
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-slate-500"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  {["All", ...jobStatusOptions].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>

                <select
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-slate-500"
                  value={dispatchFilter}
                  onChange={(e) => setDispatchFilter(e.target.value)}
                >
                  <option>All</option>
                  {dispatchers.map((dispatch) => (
                    <option key={dispatch}>{dispatch}</option>
                  ))}
                </select>

                <select
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-slate-500"
                  value={techFilter}
                  onChange={(e) => setTechFilter(e.target.value)}
                >
                  <option>All</option>
                  {techs.map((tech) => (
                    <option key={tech}>{tech}</option>
                  ))}
                </select>

                <input
                  type="date"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-500"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                />

                <input
                  type="date"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-500"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                />
              </div>

              <div className="mt-3 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  className="whitespace-nowrap rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700"
                >
                  Filter
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSearch("");
                    setStatusFilter("All");
                    setDispatchFilter("All");
                    setTechFilter("All");
                    setFromDate("");
                    setToDate("");
                    setInvoiceFilter("All");
                    setPeriodFilter("All");
                  }}
                  className="whitespace-nowrap rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
                >
                  Reset
                </button>
              </div>
            </div>

            <div className="w-full max-w-none overflow-x-auto rounded-2xl border border-slate-200">
              <table className="min-w-[1800px] table-auto border-collapse whitespace-nowrap text-left text-sm">
                <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <Th>#</Th>
                    <Th>Flag</Th>
                    <Th>Date</Th>
                    <Th>Status</Th>
                    <Th>Time</Th>
                    <Th>Invoice #</Th>
                    <Th>Dispatch</Th>
                    <Th>Company</Th>
                    <Th>Tech</Th>
                    <Th>Location</Th>
                    <Th>Invoice</Th>
                    <Th>Payment</Th>
                    <Th>Received</Th>
                    <Th>Updates</Th>
                    <Th>Total Bill</Th>
                    <Th>Parts</Th>
                    <Th>Tech Labor</Th>
                    <Th>Tech Payment</Th>
                    {isAdmin && <Th>Profit</Th>}
                    <Th>Photo</Th>
                    <Th>Actions</Th>
                  </tr>
                </thead>

                <tbody>
                  {filteredJobs.map((job, index) => (
                    <tr
                      key={job.id}
                      onContextMenu={(event) => openJobContextMenu(event, job)}
                      className={`border-t border-slate-200 align-top hover:brightness-[0.98] ${
                        job.rowFlag === "Problem" || job.status === "Dry Run"
                          ? "bg-red-300 border-l-8 border-red-800 shadow-lg"
                          : rowStyles[job.rowFlag && job.rowFlag !== "Normal" ? job.rowFlag : job.status] || rowStyles.Normal
                      }`}
                    >
                      <Td>
                        <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-bold">
                          #{index + 1}
                        </span>
                      </Td>

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

                      <Td>
                        <select
                          className={`rounded-full border px-3 py-1 text-xs font-bold ${statusStyles[job.status] || ""}`}
                          value={job.status}
                          onChange={(e) => updateJob(job.id, "status", e.target.value)}
                        >
                          {jobStatusOptions.map((s) => (
                            <option key={s}>{s}</option>
                          ))}
                        </select>
                        <JobPipelineMini status={job.status} />
                        <p className="mt-2 text-xs font-semibold text-slate-500">ETA: {job.manualEta || extractEta(job.updates) || "Manual ETA not set"}</p>
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
                          defaultValue={job.updates}
                          onBlur={(e) => updateJob(job.id, "updates", e.target.value)}
                        />
                        <JobTimeline job={job} />
                      </Td>

                      <Td>
                        <input
                          type="number"
                          className="w-24 rounded-lg border border-slate-200 px-2 py-1 font-bold outline-none focus:border-slate-500"
                          defaultValue={job.totalBill}
                          onBlur={(e) => updateJob(job.id, "totalBill", Number(e.target.value || 0))}
                        />
                      </Td>

                      <Td>
                        <input
                          type="number"
                          className="w-24 rounded-lg border border-slate-200 px-2 py-1 outline-none focus:border-slate-500"
                          defaultValue={job.parts}
                          onBlur={(e) => updateJob(job.id, "parts", Number(e.target.value || 0))}
                        />
                      </Td>

                      <Td>
                        <input
                          type="number"
                          className="w-24 rounded-lg border border-slate-200 px-2 py-1 outline-none focus:border-slate-500"
                          defaultValue={job.techLabor}
                          onBlur={(e) => updateJob(job.id, "techLabor", Number(e.target.value || 0))}
                        />
                      </Td>

                      <Td>
                        <div className="grid gap-2">
                          <span className={`inline-flex w-fit rounded-full border px-3 py-1 text-xs font-black uppercase tracking-wide ${techPaymentStatusStyles[job.techPaymentStatus] || techPaymentStatusStyles.Pending}`}>
                            {job.techPaymentStatus || "Pending"}
                          </span>
                          <select
                            className="w-36 rounded-xl border border-slate-200 px-2 py-1 text-xs font-bold outline-none focus:border-slate-500"
                            value={job.techPaymentStatus || "Pending"}
                            onChange={(e) => updateTechPaymentStatus(job, e.target.value)}
                          >
                            {techPaymentStatusOptions.map((status) => (
                              <option key={status}>{status}</option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => setTechPaymentJob(job)}
                            className="w-fit rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700"
                          >
                            Tech Payment
                          </button>
                        </div>
                      </Td>

                      {isAdmin && (
                        <Td>
                          <div
                            className={`rounded-xl px-3 py-2 text-center text-xs font-bold ${
                              Number(job.totalBill || 0) - Number(job.parts || 0) - Number(job.techLabor || 0) < 100
                                ? "bg-red-100 text-red-700"
                                : "bg-emerald-100 text-emerald-700"
                            }`}
                          >
                            {money(
                              Number(job.totalBill || 0) -
                                Number(job.parts || 0) -
                                Number(job.techLabor || 0)
                            )}
                          </div>
                        </Td>
                      )}

                      <Td>
                        <label className="flex cursor-pointer items-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700">
                          <Upload className="h-4 w-4" />
                          Upload
                          <input
                            type="file"
                            className="hidden"
                            accept="image/*"
                            onChange={(e) => uploadPhoto(job.id, e.target.files[0])}
                          />
                        </label>

                        {job.photo_url && (
                          <div className="mt-2 flex flex-col gap-2">
                            <a
                              href={job.photo_url}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center gap-1 text-xs font-bold text-blue-700"
                            >
                              <ImageIcon className="h-4 w-4" />
                              View
                            </a>

                            <button
                              type="button"
                              onClick={async () => {
                                const fileName = job.photo_url.split("/").pop();

                                await supabase.storage
                                  .from("job-photos")
                                  .remove([fileName]);

                                await updateJob(job.id, "photo_url", "");
                              }}
                              className="flex items-center gap-1 text-xs font-bold text-red-600"
                            >
                              <Trash2 className="h-4 w-4" />
                              Delete Photo
                            </button>
                          </div>
                        )}
                      </Td>

                      <Td>
                        <div className="flex gap-2">
                          <button type="button" title="Call Customer" onClick={() => handleJobContextAction("call", job)} className="rounded-xl bg-slate-100 px-2 py-2 text-xs hover:bg-slate-200">📞</button>
                          <button type="button" title="WhatsApp Customer" onClick={() => handleJobContextAction("whatsapp", job)} className="rounded-xl bg-emerald-100 px-2 py-2 text-xs hover:bg-emerald-200">💬</button>
                          <button type="button" title="Open Maps" onClick={() => handleJobContextAction("maps", job)} className="rounded-xl bg-blue-100 px-2 py-2 text-xs hover:bg-blue-200">📍</button>
                          <button type="button" title="Edit Job" onClick={() => handleJobContextAction("edit", job)} className="rounded-xl bg-slate-100 px-2 py-2 text-xs hover:bg-slate-200">✏️</button>
                          <button type="button" title="Copy Job" onClick={() => handleJobContextAction("copy", job)} className="rounded-xl bg-slate-100 px-2 py-2 text-xs hover:bg-slate-200">📄</button>
                          <button type="button" title="Assign Technician" onClick={() => handleJobContextAction("assign", job)} className="rounded-xl bg-indigo-100 px-2 py-2 text-xs hover:bg-indigo-200">🚚</button>
                          <button
                            type="button"
                            onClick={() => setAssignmentJob(job)}
                            className="rounded-xl bg-blue-100 px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-200"
                          >
                            Workspace
                          </button>
                          <button
                            type="button"
                            title="Edit inline"
                            className="rounded-xl bg-slate-100 p-2 text-slate-700 hover:bg-slate-200"
                          >
                            <Edit3 className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            title="View job"
                            onClick={() => {
                              alert(
                                [
                                  `Invoice: ${job.reference || "N/A"}`,
                                  `Company: ${job.company || "N/A"}`,
                                  `Tech: ${job.tech || "N/A"}`,
                                  `Location: ${job.location || "N/A"}`,
                                  `Status: ${job.status || "N/A"}`,
                                ].join("\n")
                              );
                            }}
                            className="rounded-xl bg-emerald-100 p-2 text-emerald-700 hover:bg-emerald-200"
                          >
                            <Eye className="h-4 w-4" />
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
                  {filteredJobs.length === 0 && (
                    <tr>
                      <td colSpan={isAdmin ? 21 : 20} className="px-4 py-10 text-center text-sm font-semibold text-slate-500">
                        No live jobs yet.
                      </td>
                    </tr>
                  )}
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

            {techPaymentJob && (
              <TechPaymentModal
                job={techPaymentJob}
                columnsAvailable={Boolean(techPaymentColumns.status)}
                onClose={() => setTechPaymentJob(null)}
                onSave={async (details) => {
                  const saved = await saveTechPaymentDetails(techPaymentJob.id, details);
                  if (saved) {
                    setTechPaymentJob(null);
                  }
                }}
              />
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
          )}

          {dispatchViewMode === "table" && permissions.canAssignTechnicians && (
            <AssignmentPanel
              job={assignmentJob}
              jobs={jobs}
              technicians={assignmentTechnicians}
              filters={assignmentFilters}
              onFiltersChange={setAssignmentFilters}
              supportsAssignment={jobsSupportsTechnicianId}
              onAssign={assignRecommendedTechnician}
              onAvailabilityChange={updateTechnicianAvailability}
              onClear={() => setAssignmentJob(null)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function DispatchCockpit({
  jobs,
  selectedJob,
  technicians,
  notifications,
  activityLogs,
  changeLogs,
  filters,
  onSelectJob,
  onFiltersChange,
  onAssign,
  onUpdateJob,
  onOpenTable,
  onContextMenu,
}) {
  const selected = selectedJob || jobs[0];
  const activity = buildCockpitActivity(selected, notifications, activityLogs, changeLogs, jobs);

  return (
    <div className="order-3 col-span-full grid w-full gap-4 xl:grid-cols-[1.1fr_1.2fr_1.1fr] lg:grid-cols-2">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Live Jobs</h2>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{jobs.length} visible jobs</p>
          </div>
          <button type="button" className="rounded-xl bg-slate-100 p-2 text-slate-600 hover:bg-slate-200" title="Filter">
            <Filter className="h-4 w-4" />
          </button>
        </div>
        <div className="relative mb-3">
          <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
          <input className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-500" placeholder="Search live jobs" />
        </div>
        <div className="max-h-[680px] space-y-3 overflow-y-auto pr-1">
          {jobs.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm font-semibold text-slate-500">
              No live jobs yet.
            </div>
          ) : (
            jobs.map((job) => (
            <button
              key={job.id}
              type="button"
              onClick={() => onSelectJob(job)}
              onContextMenu={(event) => onContextMenu(event, job)}
              className={`w-full rounded-2xl border p-4 text-left transition ${
                selected?.id === job.id ? "border-blue-500 bg-blue-50 shadow-sm" : "border-slate-200 bg-white hover:bg-slate-50"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-slate-950">{job.reference || "No invoice"}</p>
                  <p className="mt-1 truncate text-sm font-semibold text-slate-700">{job.company || "No company"}</p>
                  <p className="mt-1 truncate text-xs text-slate-500">{job.location || "No location"}</p>
                  <p className="mt-2 text-xs text-slate-500">{[job.date, job.time].filter(Boolean).join(" · ") || "No date/time"}</p>
                </div>
                <span className={`shrink-0 rounded-full border px-2 py-1 text-[11px] font-bold ${statusStyles[job.status] || "border-slate-200 bg-slate-50 text-slate-700"}`}>
                  {job.status || "New"}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded-lg bg-slate-100 p-2 text-xs font-bold text-slate-700" title="View"><Eye className="h-3.5 w-3.5" /></span>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    alert("Customer phone is not stored on this job yet.");
                  }}
                  className="rounded-lg bg-slate-100 p-2 text-xs font-bold text-slate-700"
                >
                  <Phone className="h-3.5 w-3.5" />
                </button>
                <a
                  href={customerWhatsAppLink(job)}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(event) => event.stopPropagation()}
                  className="rounded-lg bg-emerald-100 p-2 text-xs font-bold text-emerald-700"
                >
                  <MessageCircle className="h-3.5 w-3.5" />
                </a>
                <a
                  href={mapLink(job.location)}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(event) => event.stopPropagation()}
                  className="rounded-lg bg-blue-100 p-2 text-xs font-bold text-blue-700"
                >
                  <MapPin className="h-3.5 w-3.5" />
                </a>
                <span className="rounded-lg bg-slate-100 p-2 text-slate-700"><MoreHorizontal className="h-3.5 w-3.5" /></span>
              </div>
            </button>
            ))
          )}
        </div>
        <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs font-semibold text-slate-500">
          <span>{jobs.length ? `Showing 1 to ${Math.min(50, jobs.length)} of ${jobs.length} jobs` : "Showing 0 jobs"}</span>
          {jobs.length > 50 && <button type="button" className="rounded-lg bg-slate-100 px-3 py-2 text-slate-700 hover:bg-slate-200">Load More</button>}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        {selected ? (
          <>
            <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Job Details</p>
                <div className="flex items-center gap-2">
                  <h2 className="text-2xl font-bold text-slate-950">{selected.company || "No company"}</h2>
                </div>
                <p className="mt-1 text-sm text-slate-500">{selected.location || "No location"}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`rounded-full border px-3 py-1 text-xs font-bold ${statusStyles[selected.status] || "border-slate-200 bg-slate-50 text-slate-700"}`}>
                  {selected.status || "New"}
                </span>
                <button type="button" className="rounded-xl bg-slate-100 p-2 text-slate-600 hover:bg-slate-200" title="More">
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <CockpitDetail label="Location" value={selected.location} />
              <CockpitDetail label="Date / Time" value={[selected.date, selected.time].filter(Boolean).join(" · ")} />
              <CockpitDetail label="Invoice #" value={selected.reference} />
              <CockpitDetail label="Reference #" value={selected.reference} />
              <CockpitDetail label="Payment Method" value={selected.paymentMethod} />
              <CockpitDetail label="Invoice Status" value={selected.invoice} />
              <CockpitDetail label="Dispatch" value={selected.dispatch} />
              <CockpitDetail label="Technician" value={selected.tech} />
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-4">
              <FinancialCard label="Total Bill" value={money(selected.totalBill)} />
              <FinancialCard label="Parts" value={money(selected.parts)} />
              <FinancialCard label="Tech Labor" value={money(selected.techLabor)} />
              <FinancialCard label="Profit" value={money(Number(selected.totalBill || 0) - Number(selected.parts || 0) - Number(selected.techLabor || 0))} accent />
            </div>

            <div className="mt-4 rounded-xl bg-slate-50 p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Updates / Notes</p>
                <button type="button" onClick={onOpenTable} className="text-xs font-bold text-blue-700 hover:text-blue-800">Edit</button>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{selected.updates || "No updates yet."}</p>
              <JobTimeline job={selected} />
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <a href={customerWhatsAppLink(selected)} target="_blank" rel="noreferrer" className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700">WhatsApp Customer</a>
              <button type="button" onClick={() => alert("Customer phone is not stored on this job yet.")} className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-200">Call Customer</button>
              <a href={mapLink(selected.location)} target="_blank" rel="noreferrer" className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700">Open Maps</a>
              <button type="button" onClick={onOpenTable} className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-200">Edit Job</button>
              <button type="button" onClick={() => document.getElementById("cockpit-technicians")?.scrollIntoView({ behavior: "smooth", block: "center" })} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700">Assign Technician</button>
              <button type="button" onClick={() => onUpdateJob(selected.id, "status", "Completed")} className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800">Mark Completed</button>
            </div>
          </>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">No job selected.</div>
        )}
      </section>

      <aside className="space-y-6 lg:col-span-2 xl:col-span-1">
        <section id="cockpit-technicians" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4">
            <h2 className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Recommended Technicians</h2>
            <p className="text-xs text-slate-500">Approved technicians matched by city, state, and service when available.</p>
          </div>
          <div className="mb-4 grid gap-2 md:grid-cols-3 xl:grid-cols-1">
            <input className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500" placeholder="City" value={filters.city} onChange={(event) => onFiltersChange((current) => ({ ...current, city: event.target.value }))} />
            <input className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500" placeholder="State" value={filters.state} onChange={(event) => onFiltersChange((current) => ({ ...current, state: event.target.value }))} />
            <input className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500" placeholder="Service" value={filters.service} onChange={(event) => onFiltersChange((current) => ({ ...current, service: event.target.value }))} />
          </div>
          <div className="max-h-[430px] space-y-3 overflow-y-auto pr-1">
            {technicians.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">No matching approved technicians.</div>
            ) : (
              technicians.map((technician) => (
                <div key={technician.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-50 text-sm font-black text-blue-700">
                        {initials(technician.full_name)}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-bold text-slate-950">{technician.full_name || "Unnamed technician"}</p>
                        <p className="text-xs font-semibold text-amber-500">★ {Number(technician.rating || 0).toFixed(1)}</p>
                        <p className="text-xs text-slate-500">{technician.phone || "No phone"}</p>
                        <p className="text-xs text-slate-500">{[technician.city, technician.state].filter(Boolean).join(", ") || "No location"} · Distance N/A</p>
                      </div>
                    </div>
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-700">{technician.availabilityStatus || "Available"}</span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <MiniMetric label="Services" value={formatServices(technician.services)} />
                    <MiniMetric label="Rating" value={Number(technician.rating || 0).toFixed(1)} />
                    <MiniMetric label="Compliance" value={`${technicianCompliance(technician)}%`} />
                    <MiniMetric label="Availability" value={technician.availabilityStatus || "Available"} />
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <a href={technician.phone ? `tel:${technician.phone}` : undefined} className="flex justify-center rounded-xl bg-slate-100 px-3 py-2 text-slate-700 hover:bg-slate-200" title="Call">
                      <Phone className="h-4 w-4" />
                    </a>
                    <a href={whatsappLink(selected, technician, filters.service)} target="_blank" rel="noreferrer" className="flex justify-center rounded-xl bg-emerald-600 px-3 py-2 text-white hover:bg-emerald-700" title="WhatsApp">
                      <MessageCircle className="h-4 w-4" />
                    </a>
                    <button type="button" onClick={() => onAssign(selected, technician)} className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700">Assign</button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Activity Feed</h2>
          <div className="mt-4 max-h-[300px] space-y-3 overflow-y-auto pr-1">
            {activity.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 p-4 text-sm font-semibold text-slate-500">
                No activity yet.
              </div>
            ) : (
              activity.map((item) => (
              <div key={item.id} className="flex gap-3 rounded-xl bg-slate-50 p-3 text-sm">
                <div className="mt-1 h-3 w-3 shrink-0 rounded-full bg-blue-600" />
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-400">{item.time || "Now"}</p>
                  <p className="font-bold text-slate-800">{item.title}</p>
                  <p className="text-xs text-slate-500">by {item.by || item.detail || "System"}</p>
                </div>
              </div>
              ))
            )}
          </div>
        </section>
      </aside>
    </div>
  );
}

function TechPaymentModal({ job, columnsAvailable, onClose, onSave }) {
  const [details, setDetails] = useState({
    techPaymentStatus: job.techPaymentStatus || "Pending",
    techPaymentMethod: job.techPaymentMethod || job.paymentMethod || "",
    techPaidDate: job.techPaidDate || "",
    techPaymentNotes: job.techPaymentNotes || "",
  });
  const amountOwed = Number(job.techLabor || 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-3xl rounded-3xl bg-white p-6 shadow-2xl">
        <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-blue-600">Tech Payment</p>
            <h3 className="mt-1 text-2xl font-black text-slate-950">{job.tech || "No technician assigned"}</h3>
            <p className="mt-1 text-sm font-semibold text-slate-500">Job / Invoice #: {job.reference || job.id || "N/A"}</p>
          </div>
          <span className={`w-fit rounded-full border px-3 py-1 text-xs font-black uppercase tracking-wide ${techPaymentStatusStyles[details.techPaymentStatus] || techPaymentStatusStyles.Pending}`}>
            {details.techPaymentStatus || "Pending"}
          </span>
        </div>

        {!columnsAvailable && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800">
            Tech payment columns are not available yet.
          </div>
        )}

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <PaymentDetail label="Technician name" value={job.tech || "Not assigned"} />
          <PaymentDetail label="Job / Invoice #" value={job.reference || job.id || "N/A"} />
          <PaymentDetail label="Total Bill" value={money(job.totalBill)} />
          <PaymentDetail label="Parts" value={money(job.parts)} />
          <PaymentDetail label="Tech Labor" value={money(job.techLabor)} />
          <PaymentDetail label="Amount owed to technician" value={money(amountOwed)} highlight />
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="grid gap-2 text-sm font-bold text-slate-600">
            Tech Payment Status
            <select
              className="rounded-xl border border-slate-200 px-3 py-2 font-semibold text-slate-900 outline-none focus:border-blue-500"
              value={details.techPaymentStatus}
              onChange={(event) => setDetails((current) => ({ ...current, techPaymentStatus: event.target.value }))}
            >
              {techPaymentStatusOptions.map((status) => (
                <option key={status}>{status}</option>
              ))}
            </select>
          </label>

          <label className="grid gap-2 text-sm font-bold text-slate-600">
            Payment Method
            <select
              className="rounded-xl border border-slate-200 px-3 py-2 font-semibold text-slate-900 outline-none focus:border-blue-500"
              value={details.techPaymentMethod}
              onChange={(event) => setDetails((current) => ({ ...current, techPaymentMethod: event.target.value }))}
            >
              <option value="">Not set</option>
              {paymentMethods.map((method) => (
                <option key={method}>{method}</option>
              ))}
            </select>
          </label>

          <label className="grid gap-2 text-sm font-bold text-slate-600">
            Paid Date
            <input
              type="date"
              className="rounded-xl border border-slate-200 px-3 py-2 font-semibold text-slate-900 outline-none focus:border-blue-500"
              value={details.techPaidDate || ""}
              onChange={(event) => setDetails((current) => ({ ...current, techPaidDate: event.target.value }))}
            />
          </label>

          <label className="grid gap-2 text-sm font-bold text-slate-600 md:col-span-2">
            Notes
            <textarea
              className="min-h-24 rounded-xl border border-slate-200 px-3 py-2 font-semibold text-slate-900 outline-none focus:border-blue-500"
              value={details.techPaymentNotes}
              onChange={(event) => setDetails((current) => ({ ...current, techPaymentNotes: event.target.value }))}
              placeholder="Payment confirmation, hold reason, check number, or dispatcher notes"
            />
          </label>
        </div>

        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 font-bold text-slate-700 hover:bg-slate-50">
            Cancel
          </button>
          <button type="button" onClick={() => onSave(details)} className="rounded-xl bg-blue-600 px-4 py-2 font-bold text-white hover:bg-blue-700">
            Save Tech Payment
          </button>
        </div>
      </div>
    </div>
  );
}

function PaymentDetail({ label, value, highlight = false }) {
  return (
    <div className={`rounded-2xl border p-4 ${highlight ? "border-blue-200 bg-blue-50" : "border-slate-200 bg-slate-50"}`}>
      <p className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-2 text-lg font-black ${highlight ? "text-blue-800" : "text-slate-950"}`}>{value || "Not set"}</p>
    </div>
  );
}

function AnalyticsCard({ title, data, total }) {
  return (
    <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">{title}</h2>
          <p className="text-xs text-slate-500">
            Total: {typeof total === "number" ? total.toLocaleString() : total}
          </p>
        </div>

        <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">
          LIVE
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {data.map((item) => (
          <div
            key={item.name}
            className="rounded-2xl bg-white p-6 shadow-lg border border-slate-200"
          >
            <p className="text-sm text-slate-500">{item.name}</p>
            <p className="mt-2 text-3xl font-bold text-slate-900">
  {title === "Financial Overview"
    ? "$" + Number(item.value || 0).toLocaleString()
    : Number(item.value || 0).toLocaleString()}
</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function JobContextMenu({ x, y, job, onAction }) {
  const actions = [
    ["edit", "Edit"],
    ["assign", "Assign Technician"],
    ["copy", "Copy Job"],
    ["duplicate", "Duplicate"],
    ["complete", "Complete"],
    ["cancel", "Cancel"],
    ["maps", "Open Maps"],
    ["call", "Call Customer"],
    ["whatsapp", "WhatsApp Customer"],
  ];

  return (
    <div
      className="fixed z-[80] w-56 overflow-hidden rounded-xl border border-slate-200 bg-white py-2 text-sm shadow-2xl"
      style={{ left: Math.min(x, window.innerWidth - 240), top: Math.min(y, window.innerHeight - 360) }}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="border-b border-slate-100 px-3 py-2">
        <p className="font-bold text-slate-950">{job?.reference || "Job"}</p>
        <p className="truncate text-xs text-slate-500">{job?.company}</p>
      </div>
      {actions.map(([action, label]) => (
        <button
          key={action}
          type="button"
          onClick={() => onAction(action, job)}
          className="block w-full px-3 py-2 text-left font-semibold text-slate-700 hover:bg-slate-50"
        >
          {label}
        </button>
      ))}
    </div>
  );
}

  function StatCard({ icon, label, value, onClick }) {
  return (
    <motion.div
      onClick={onClick}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="cursor-pointer rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
          {icon}
        </div>
        <div className="flex h-8 w-16 items-end gap-1">
          <span className="h-3 flex-1 rounded-t bg-blue-100" />
          <span className="h-5 flex-1 rounded-t bg-blue-200" />
          <span className="h-4 flex-1 rounded-t bg-blue-300" />
          <span className="h-7 flex-1 rounded-t bg-blue-500" />
        </div>
      </div>

      <p className="mt-4 text-xs font-black uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-black text-slate-950">{value}</p>
      <p className="mt-1 text-xs font-semibold text-slate-400">Realtime dispatch metric</p>
    </motion.div>
  );
}

function Input({ label, value, onChange, type = "text", placeholder = "", list = "" }) {
  return (
    <label className="space-y-1 text-sm font-medium">
      {label}
      <input
        type={type}
        className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-slate-500"
        placeholder={placeholder}
        list={list || undefined}
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

function AssignmentPanel({ job, jobs, technicians, filters, onFiltersChange, supportsAssignment, onAssign, onAvailabilityChange, onClear }) {
  return (
    <aside className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-950">Dispatch Workspace</h2>
          <p className="mt-1 text-xs text-slate-500">
            {job?.id ? `Selected job ${job.reference || job.id}` : "Select a job from Live Jobs to manage assignment"}
          </p>
        </div>
        {job?.id && (
          <button
            type="button"
            onClick={onClear}
            className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200"
          >
            Clear
          </button>
        )}
      </div>

      {!supportsAssignment && (
        <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800">
          Safe mode: jobs.technician_id does not exist yet. Assignment preview only.
        </div>
      )}

      {supportsAssignment && (!job?.assignedAt && !job?.assignedBy) && (
        <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
          Assignment timestamps and assigned-by values are saved when those columns exist.
        </div>
      )}

      {job?.id ? (
        <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="font-bold text-slate-950">Job Details</p>
            <span className={`rounded-full border px-3 py-1 text-xs font-bold ${statusStyles[job.status] || "border-slate-200 bg-white text-slate-700"}`}>
              {job.status || "New"}
            </span>
          </div>
          <div className="grid gap-2">
            <DetailLine label="Customer / Company" value={job.company} />
            <DetailLine label="Location" value={job.location} />
            <DetailLine label="Service Needed" value={filters.service || extractService(job)} />
            <DetailLine label="Invoice #" value={job.reference} />
            <DetailLine label="Reference #" value={job.reference} />
            <DetailLine label="Notes / Updates" value={job.updates} />
          </div>
          <JobTimeline job={job} />
        </div>
      ) : (
        <div className="mb-4 rounded-2xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">
          Click Workspace on a live job to review details and assign an approved technician.
        </div>
      )}

      {job?.technicianId && (
        <div className="mb-4 rounded-2xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">
          <p className="font-bold">Assignment History</p>
          <p>Assigned By: {job.assignedBy || "Not recorded"}</p>
          <p>Assigned Time: {job.assignedAt ? new Date(job.assignedAt).toLocaleString() : "Not recorded"}</p>
          <p>Previous Technician: {job.previousTechnician || "None"}</p>
          <p>Reassigned Count: {job.reassignedCount || 0}</p>
        </div>
      )}

      <div className="mb-3">
        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">Recommended Technicians</h3>
      </div>

      <div className="mb-4 grid gap-2">
        <input
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-500"
          placeholder="Filter by city"
          value={filters.city}
          onChange={(event) => onFiltersChange((current) => ({ ...current, city: event.target.value }))}
        />
        <input
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-500"
          placeholder="Filter by state"
          value={filters.state}
          onChange={(event) => onFiltersChange((current) => ({ ...current, state: event.target.value }))}
        />
        <input
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-500"
          placeholder="Filter by service"
          value={filters.service}
          onChange={(event) => onFiltersChange((current) => ({ ...current, service: event.target.value }))}
        />
      </div>

      <div className="grid gap-3">
        {technicians.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">
            No approved technicians match the current filters.
          </div>
        ) : (
          technicians.map((technician) => (
            <div key={technician.id} className="rounded-xl border border-slate-200 p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-slate-100 text-sm font-bold text-slate-600">
                  {technician.profilePhotoUrl ? (
                    <img src={technician.profilePhotoUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    initials(technician.full_name)
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-slate-950">{technician.full_name || "Unnamed technician"}</p>
                  <p className="text-xs text-slate-500">{technician.phone || "No phone"}</p>
                  <p className="text-xs text-slate-500">{[technician.city, technician.state].filter(Boolean).join(", ") || "No city"}</p>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <MiniMetric label="Services" value={formatServices(technician.services)} />
                <MiniMetric label="Rating" value={Number(technician.rating || 0).toFixed(1)} />
                <MiniMetric label="Compliance" value={`${technicianCompliance(technician)}%`} />
                <MiniMetric label="Availability" value={technician.availabilityStatus || "Available"} />
                <MiniMetric label="Last Job" value={lastTechnicianJob(jobs, technician)} />
                <MiniMetric label="Jobs Completed" value={technician.completedJobs || 0} />
              </div>

              {technician.notes && (
                <p className="mt-3 rounded-xl bg-slate-50 p-2 text-xs text-slate-600">{technician.notes}</p>
              )}

              <div className="mt-3 grid grid-cols-2 gap-2">
                {["Available", "Busy", "Off Duty", "Offline"].map((availability) => (
                  <button
                    key={availability}
                    type="button"
                    onClick={() => onAvailabilityChange(technician, availability)}
                    className={`rounded-xl px-2 py-2 text-xs font-bold ${
                      technician.availabilityStatus === availability
                        ? "bg-blue-600 text-white"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    }`}
                  >
                    {availability}
                  </button>
                ))}
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2">
                <a
                  href={technician.phone ? `tel:${technician.phone}` : undefined}
                  className="rounded-xl bg-slate-100 px-3 py-2 text-center text-xs font-bold text-slate-700 hover:bg-slate-200"
                >
                  Call
                </a>
                <a
                  href={whatsappLink(job, technician, filters.service)}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-xl bg-emerald-600 px-3 py-2 text-center text-xs font-bold text-white hover:bg-emerald-700"
                >
                  WhatsApp
                </a>
                <button
                  type="button"
                  onClick={() => onAssign(job, technician)}
                  className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700"
                >
                  Assign
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}

function MiniMetric({ label, value }) {
  return (
    <div className="rounded-xl bg-slate-50 p-2">
      <p className="font-bold uppercase text-slate-400">{label}</p>
      <p className="mt-1 font-semibold text-slate-800">{value}</p>
    </div>
  );
}

function CockpitDetail({ label, value }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <div className="mt-1 flex items-center gap-2">
        <p className="font-semibold text-slate-800">{value || "Not provided"}</p>
      </div>
    </div>
  );
}

function FinancialCard({ label, value, accent = false }) {
  return (
    <div className={`rounded-xl border p-3 ${accent ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white"}`}>
      <p className="text-xs font-black uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-1 text-lg font-black ${accent ? "text-emerald-700" : "text-slate-950"}`}>{value}</p>
    </div>
  );
}

function DetailLine({ label, value }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase text-slate-400">{label}</p>
      <p className="mt-1 whitespace-pre-wrap font-semibold text-slate-800">{value || "Not provided"}</p>
    </div>
  );
}

function whatsappLink(job, technician, requestedService) {
  const phone = String(technician.phone || "").replace(/\D/g, "");
  const message = [
    "NTTR Dispatch",
    "",
    "Customer:",
    job?.company || "",
    "",
    "Location:",
    job?.location || "",
    "",
    "Service:",
    requestedService || extractService(job),
    "",
    "Reference:",
    job?.reference || "",
    "",
    "Please confirm availability.",
  ].join("\n");

  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

function customerWhatsAppLink(job) {
  const message = [
    "NTTR Dispatch",
    "",
    "Customer:",
    job?.company || "",
    "",
    "Location:",
    job?.location || "",
    "",
    "Reference:",
    job?.reference || "",
    "",
    "Please contact NTTR Dispatch for your job update.",
  ].join("\n");

  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

function mapLink(location) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location || "")}`;
}

function extractService(job) {
  const updates = String(job?.updates || "");
  const serviceLine = updates
    .split(/\n+/)
    .find((line) => /service|repair|tire|brake|reefer|tow|jump|fuel/i.test(line));

  return serviceLine || updates.slice(0, 80) || "Roadside service";
}

function lastTechnicianJob(jobs, technician) {
  const technicianJobs = jobs
    .filter((job) => job.technicianId === technician.id || job.tech === technician.full_name)
    .sort((a, b) => new Date(`${b.date || ""} ${b.time || "00:00"}`) - new Date(`${a.date || ""} ${a.time || "00:00"}`));

  const lastJob = technicianJobs[0];
  if (!lastJob) return "None";

  return [lastJob.company, lastJob.location].filter(Boolean).join(" - ") || lastJob.reference || "Recent job";
}

function buildCockpitActivity(selectedJob, notifications, activityLogs, changeLogs, jobs) {
  const feed = [
    ...notifications.map((item) => ({
      id: `notification-${item.id}`,
      title: item.message,
      detail: `${item.detail || ""} ${item.time || ""}`.trim(),
      time: item.time || "Live",
      by: "System",
    })),
    ...activityLogs.map((item) => ({
      id: `activity-${item.id}`,
      title: item.message || "Activity",
      detail: item.time || "Live update",
      time: item.time || "Live",
      by: "Dispatcher",
    })),
    ...changeLogs.slice(0, 8).map((item) => ({
      id: `change-${item.id}`,
      title: `${item.action || "Updated"} ${item.field_name || "job"}`,
      detail: `${item.user_name || "Dispatcher"} · ${item.created_at ? new Date(item.created_at).toLocaleString() : "Recent"}`,
      time: item.created_at ? new Date(item.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Recent",
      by: item.user_name || "Dispatcher",
    })),
  ];

  if (feed.length > 0) return feed.slice(0, 12);

  return [];
}

function recentValues(jobs, key) {
  const values = [];
  [...jobs].reverse().forEach((job) => {
    const value = job[key];
    if (value && !values.includes(value)) values.push(value);
  });
  return values.slice(0, 8);
}

function formatJobForClipboard(job) {
  return [
    `Invoice: ${job.reference || ""}`,
    `Company: ${job.company || ""}`,
    `Location: ${job.location || ""}`,
    `Status: ${job.status || ""}`,
    `Dispatch: ${job.dispatch || ""}`,
    `Tech: ${job.tech || ""}`,
    `Total: ${money(job.totalBill)}`,
    `Updates: ${job.updates || ""}`,
  ].join("\n");
}

function initials(name) {
  return String(name || "T")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function technicianCompliance(technician) {
  const checks = [
    technician.driverLicenseUrl,
    technician.insuranceUrl,
    technician.w9Url,
    technician.dotCertificateUrl,
    technician.profilePhotoUrl,
    technician.bankZelleInfo || technician.paymentMethod,
    technician.signedAgreementUrl || technician.agreementAccepted || technician.digitalSignature,
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

function splitServices(services) {
  if (Array.isArray(services)) {
    return services.map((service) => String(service).trim()).filter(Boolean);
  }

  return String(services || "")
    .split(/[,\n\r]+/)
    .map((service) => service.trim())
    .filter(Boolean);
}

function parseLocation(location) {
  const [city = "", state = ""] = String(location || "")
    .split(",")
    .map((part) => part.trim());

  return { city, state };
}

function formatServices(services) {
  const serviceList = splitServices(services);
  return serviceList.length ? serviceList.join(", ") : "No services";
}

function averageEta(jobs) {
  const etaValues = jobs
    .map((job) => {
      const eta = extractEta(job.updates);
      const match = String(eta).match(/\d+/);
      return match ? Number(match[0]) : 0;
    })
    .filter(Boolean);

  if (etaValues.length === 0) return 0;
  return Math.round(etaValues.reduce((sum, value) => sum + value, 0) / etaValues.length);
}

function Th({ children }) {
  return <th className="whitespace-nowrap px-4 py-3 font-bold">{children}</th>;
}

function Td({ children, className = "" }) {
  return <td className={`whitespace-nowrap px-4 py-3 align-top ${className}`}>{children}</td>;
}

function JobPipelineMini({ status }) {
  const activeIndex = jobPipeline.findIndex((item) => item === status);

  return (
    <div className="mt-2 flex max-w-xs flex-wrap gap-1">
      {jobPipeline.map((item, index) => {
        const isActive = index <= activeIndex;
        return (
          <span
            key={item}
            title={item}
            className={`h-2 w-6 rounded-full ${isActive ? "bg-blue-600" : "bg-slate-200"}`}
          />
        );
      })}
    </div>
  );
}

function JobTimeline({ job }) {
  const timeline = buildJobTimeline(job);

  return (
    <div className="mt-3 max-w-sm space-y-1 rounded-xl bg-slate-50 p-2 text-xs text-slate-600">
      {timeline.map((item) => (
        <div key={`${item.label}-${item.time}`} className="flex gap-2">
          <span className="min-w-14 font-bold text-slate-500">{item.time}</span>
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  );
}

function buildJobTimeline(job) {
  const createdTime = formatTimelineTime(job.time);
  const timeline = [{ time: createdTime, label: "Job Created" }];

  if (job.assignedAt) {
    timeline.push({ time: formatTimelineTime(job.assignedAt), label: "Assigned" });
  }

  const updateLines = String(job.updates || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => /^\d{1,2}:\d{2}/.test(line));

  updateLines.forEach((line) => {
    const [time, ...rest] = line.split(" ");
    timeline.push({ time, label: rest.join(" ") || "Status Updated" });
  });

  if (timeline.length === 1 && job.status && job.status !== "New") {
    timeline.push({ time: "Live", label: job.status });
  }

  return timeline.slice(-8);
}

function formatTimelineTime(value) {
  if (!value) return "--:--";
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return String(value).slice(0, 5);
}

function extractEta(updates) {
  const match = String(updates || "").match(/eta\s*:?\s*([^\n\r]+)/i);
  return match?.[1]?.trim() || "";
}
