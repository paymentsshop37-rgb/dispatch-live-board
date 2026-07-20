import React, { useMemo, useRef, useState, useEffect } from "react";
import {
  Search,
  Menu,
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
  MapPin,
  MessageCircle,
  Phone,
  UserPlus,
  Star,
  Users,
  Database,
  Crown,
  FileSpreadsheet,
  FileText,
  Bell,
  BellRing,
  Wrench,
} from "lucide-react";
import { motion } from "framer-motion";
import { supabase } from "./lib/supabase";
import { clearAuthSession } from "./authUsers";
import { logActivity } from "./modules/activity";
import { loadTechnicians } from "./modules/technicians/technicianService";
import { getPermissions, normalizeRole } from "./modules/permissions";

const normalizeText = (value) => {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
};

const jobStatusVisuals = {
  Completed: { background: "#DCFCE7", border: "#22C55E", text: "#166534", dot: "🟢", icon: "✅" },
  Cancelled: { background: "#FEE2E2", border: "#EF4444", text: "#991B1B", dot: "🔴", icon: "❌" },
  "In Progress": { background: "#DBEAFE", border: "#2563EB", text: "#1D4ED8", dot: "🔵", icon: "🔵" },
  "On Site": { background: "#FEF3C7", border: "#F59E0B", text: "#92400E", dot: "🟡", icon: "📍" },
  "En Route": { background: "#E0F2FE", border: "#0284C7", text: "#075985", dot: "🔵", icon: "🚚" },
  "Waiting Parts": { background: "#F3E8FF", border: "#9333EA", text: "#6B21A8", dot: "🟣", icon: "📦" },
  Pending: { background: "#FFF7ED", border: "#F97316", text: "#9A3412", dot: "🟠", icon: "⏳" },
  "Dry Run": { background: "#EDE9FE", border: "#7C3AED", text: "#5B21B6", dot: "🟣", icon: "⚠️" },
  "Need Review": { background: "#FEF2F2", border: "#DC2626", text: "#7F1D1D", dot: "🔴", icon: "🔎" },
  New: { background: "#F8FAFC", border: "#64748B", text: "#334155", dot: "⚪", icon: "🆕" },
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
  Pending: "bg-yellow-100 text-yellow-800 border-yellow-300",
  Sent: "bg-blue-100 text-blue-700",
  Paid: "bg-green-100 text-green-800 border-green-300",
  Cancelled: "bg-red-100 text-red-800 border-red-300",
  "Need Review": "bg-orange-100 text-orange-700",
};

const invoiceStatusOptions = ["Pending", "Sent", "Paid", "Need Review", "Cancelled"];
const paymentMethods = ["EFS", "Comcheck", "Zelle", "Card", "Cash", "ACH", "Wire", "Pending"];
const techPaymentMethods = ["Zelle", "ACH", "Check", "Cash", "Card", "Other"];
const paymentReceivers = ["A", "B"];
const nearbyPartsCategories = [
  "Commercial Tire Shops",
  "Truck Parts Suppliers",
  "Trailer Parts",
  "Cummins Dealers",
  "Freightliner Dealers",
  "Kenworth Dealers",
  "Peterbilt Dealers",
  "Volvo Mack Dealers",
  "Love's Truck Care",
  "TA Truck Service",
  "Pilot Flying J Service",
  "Welding Shops",
  "Hydraulic Hose Shops",
  "Battery Suppliers",
  "Road Service",
];
const nearbyPartsCache = new Map();
const jobPipeline = ["New", "Pending", "Assigned", "Tech Accepted", "En Route", "On Site", "In Progress", "Waiting Parts", "Working", "Completed", "Invoiced", "Paid"];
const jobStatusOptions = [...jobPipeline, "Need Review", "Declined", "Canceled", "Cancelled", "Dry Run"];
const techPaymentStatusOptions = ["Pending", "Reviewing", "Approved", "Paid", "Hold"];
const techPaymentStatusStyles = {
  Pending: "bg-yellow-100 text-yellow-800 border-yellow-200",
  Reviewing: "bg-orange-100 text-orange-800 border-orange-200",
  Approved: "bg-blue-100 text-blue-800 border-blue-200",
  Paid: "bg-emerald-100 text-emerald-800 border-emerald-200",
  Hold: "bg-red-100 text-red-800 border-red-200",
};
const techPaymentFieldAliases = {
  status: ["tech_payment_status", "technician_payment_status", "tech_paid_status"],
  method: ["tech_payment_method", "technician_payment_method"],
  paidDate: ["tech_paid_date", "technician_paid_date", "tech_payment_paid_at", "paid_date"],
  paidBy: ["tech_paid_by", "technician_paid_by", "tech_payment_paid_by", "paid_by"],
  reference: ["tech_payment_reference", "technician_payment_reference", "tech_paid_reference"],
  notes: ["tech_payment_notes", "technician_payment_notes"],
};
const tableControlClass =
  "rounded-lg border border-[#cbd5e1] bg-white text-[#0f172a] placeholder:text-[#64748b] outline-none focus:border-[#2563eb] disabled:bg-[#f1f5f9] disabled:text-[#334155] disabled:opacity-100";
const darkSelectClass =
  "rounded-lg border border-[#334155] bg-[#0f172a] text-white outline-none focus:border-[#2563eb] disabled:bg-[#111827] disabled:text-[#e5e7eb] disabled:opacity-100";
const darkOptionStyle = { backgroundColor: "#0f172a", color: "#ffffff" };

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

const jobFinancialActivityActions = {
  invoice: "Invoice Status changed",
  paymentMethod: "Payment Method changed",
  totalBill: "Total Bill changed",
  parts: "Parts changed",
  techLabor: "Tech Labor changed",
};

const jobFinancialActivityLabels = {
  invoice: "Invoice Status",
  paymentMethod: "Payment Method",
  totalBill: "Total Bill",
  parts: "Parts",
  techLabor: "Tech Labor",
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
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || "",
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
    techPaidBy: readFirstColumn(row, techPaymentFieldAliases.paidBy) || "",
    techPaymentReference: readFirstColumn(row, techPaymentFieldAliases.reference) || "",
    techPaymentNotes: readFirstColumn(row, techPaymentFieldAliases.notes) || "",
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

export default function DispatchLiveUpdatesPage({ currentUser, onOpenFlatRate, onOpenParts }) {
  const formRef = useRef(null);
  const searchInputRef = useRef(null);
  const [jobs, setJobs] = useState([]);
  const [accessGranted] = useState(true);
  const [currentUserRole, setCurrentUserRole] = useState(
    currentUser?.role || null
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
  const [companyFilter, setCompanyFilter] = useState("All");
  const [invoiceFilter, setInvoiceFilter] = useState("All");
  const [form, setForm] = useState(emptyForm());
  const [jobToDelete, setJobToDelete] = useState(null);
  const [nearbyPartsJob, setNearbyPartsJob] = useState(null);
  const [assignmentJob, setAssignmentJob] = useState(null);
  const [showAddJobModal, setShowAddJobModal] = useState(false);
  const [updatesJob, setUpdatesJob] = useState(null);
  const [documentsJob, setDocumentsJob] = useState(null);
  const [techPaymentJob, setTechPaymentJob] = useState(null);
  const [dispatchViewMode, setDispatchViewMode] = useState("table");
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
  const [jobsSupportsPhotoUrl, setJobsSupportsPhotoUrl] = useState(false);
  const [techPaymentColumns, setTechPaymentColumns] = useState({
    status: "",
    method: "",
    paidDate: "",
    paidBy: "",
    reference: "",
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
  currentUser?.name || ""
);
  
  const permissions = getPermissions(currentUserRole);
  const normalizedUserRole = normalizeRole(currentUserRole);
  const isAdmin = normalizedUserRole === "admin";
  const canDeleteJobs = isAdmin;
  const canEditJobFinancial = isAdmin || normalizedUserRole === "dispatcher";

  useEffect(() => {
    if (localStorage.getItem("flat-rate-create-job") === "1") {
      localStorage.removeItem("flat-rate-create-job");
      setForm(emptyForm());
      setShowAddJobModal(true);
    }
  }, []);

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
        setShowAddJobModal(true);
      }
      if (key === "s") {
        event.preventDefault();
        if (showAddJobModal) formRef.current?.requestSubmit();
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

  useEffect(() => {
    if (!accessGranted || jobs.length === 0) return;
    const pendingJobId = localStorage.getItem("nttr-open-job-id");
    if (!pendingJobId) return;

    const job = jobs.find((candidate) => String(candidate.id) === String(pendingJobId));
    if (job) {
      setAssignmentJob(job);
      localStorage.removeItem("nttr-open-job-id");
      setTimeout(() => document.getElementById("live-jobs-table")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
    }
  }, [accessGranted, jobs]);

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
      { error: technicianAvailabilityError },
      { error: technicianCurrentJobIdError },
      { error: activityLogError },
    ] = await Promise.all([
      supabase.from("technicians").select("availability").limit(0),
      supabase.from("technicians").select("current_job_id").limit(0),
      supabase.from("activity_log").select("id").limit(0),
    ]);

    setTechnicianAvailabilityColumn(!technicianAvailabilityError ? "availability" : "");
    setTechniciansSupportCurrentJobId(!technicianCurrentJobIdError);
    setSupportsActivityLog(!activityLogError);
  }

  function configureJobsColumnSupport(rows) {
    const sample = Array.isArray(rows) ? rows.find(Boolean) || {} : {};
    const hasColumn = (column) => Object.prototype.hasOwnProperty.call(sample, column);
    const firstExistingAlias = (aliases) => aliases.find(hasColumn) || "";

    setJobsSupportsTechnicianId(hasColumn("technician_id"));
    setJobsSupportsAssignedAt(hasColumn("assigned_at"));
    setJobsSupportsAssignedBy(hasColumn("assigned_by"));
    setJobsSupportsPreviousTechnician(hasColumn("previous_technician"));
    setJobsSupportsReassignedCount(hasColumn("reassigned_count"));
    setJobsSupportsPhotoUrl(hasColumn("photo_url"));
    setTechPaymentColumns({
      status: firstExistingAlias(techPaymentFieldAliases.status),
      method: firstExistingAlias(techPaymentFieldAliases.method),
      paidDate: firstExistingAlias(techPaymentFieldAliases.paidDate),
      paidBy: firstExistingAlias(techPaymentFieldAliases.paidBy),
      reference: firstExistingAlias(techPaymentFieldAliases.reference),
      notes: firstExistingAlias(techPaymentFieldAliases.notes),
    });
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

    configureJobsColumnSupport(data || []);
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
        const matchesCompany = companyFilter === "All" || job.company === companyFilter;
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
  matchesCompany &&
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
  }, [jobs, search, statusFilter, dateFilter, cityFilter, dispatchFilter, techFilter, companyFilter, invoiceFilter, periodFilter, fromDate, toDate]);

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

  const companies = useMemo(
    () => [...new Set(jobs.map((job) => job.company).filter(Boolean))].sort(),
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
  (j) => !["Paid", "Cancelled"].includes(j.invoice)
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

  const roleKpis = useMemo(() => dispatchKpis(stats, isAdmin), [stats, isAdmin]);
  const activeTechniciansCount = useMemo(
    () => dispatchTechnicians.filter((technician) => String(technician.availability || "").toLowerCase() === "available").length,
    [dispatchTechnicians]
  );
  const todayJobs = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return filteredJobs.filter((job) => job.date === today);
  }, [filteredJobs]);

  const assignmentTechnicians = useMemo(() => {
    const jobLocation = parseLocation(assignmentJob?.location);
    const city = (assignmentFilters.city || jobLocation.city).trim().toLowerCase();
    const state = (assignmentFilters.state || jobLocation.state).trim().toLowerCase();
    const service = assignmentFilters.service.trim().toLowerCase();

    return dispatchTechnicians
      .filter((technician) => {
      const services = splitServices(technician.services).join(" ").toLowerCase();
      const coverage = technicianCoverageText(technician);
      const homeCity = String(technician.city || "").toLowerCase();
      const homeState = String(technician.state || "").toLowerCase();

      const matchesLocation =
        (!city && !state) ||
        (city && homeCity.includes(city)) ||
        (state && homeState.includes(state)) ||
        (city && coverage.includes(city)) ||
        (state && coverage.includes(state));
      const matchesService = !service || services.includes(service);

      return matchesLocation && matchesService;
    })
      .sort((a, b) => {
        const scoreDifference = technicianAssignmentScore(b, city, state) - technicianAssignmentScore(a, city, state);
        if (scoreDifference !== 0) return scoreDifference;

        const availabilityDifference = technicianAvailabilityRank(b.availability) - technicianAvailabilityRank(a.availability);
        if (availabilityDifference !== 0) return availabilityDifference;

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
      setShowAddJobModal(false);
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
async function uploadPhoto(jobId, file, documentType = "Job photo") {
  if (!file) return;

  const allowedTypes = ["application/pdf"];
  const isAllowed = file.type?.startsWith("image/") || allowedTypes.includes(file.type);
  if (!isAllowed) {
    alert("Please upload an image or PDF file.");
    return;
  }

  const safeName = file.name.replace(/[^\w.\-]+/g, "-");
  const fileName = `${jobId}/${Date.now()}-${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from("job-photos")
    .upload(fileName, file);

  if (uploadError) {
    alert(`Safe mode: unable to upload file. ${uploadError.message}`);
    return;
  }

  const {
    data: { publicUrl },
  } = supabase.storage
    .from("job-photos")
    .getPublicUrl(fileName);

  if (!publicUrl) {
    alert("Safe mode: upload finished, but no public file URL was returned.");
    return;
  }

  if (jobsSupportsPhotoUrl) {
    await updateJob(jobId, "photo_url", publicUrl);
  }
  setDocumentsJob((current) =>
    current?.id === jobId ? { ...current, photo_url: publicUrl, updatedAt: new Date().toISOString() } : current
  );

  const { error: fileRecordError } = await supabase.from("job_files").insert([
    {
      job_id: jobId,
      file_url: publicUrl,
      file_name: file.name,
      file_type: file.type || "application/octet-stream",
      document_type: documentType,
      uploaded_by: currentUserName || "Dispatcher",
    },
  ]);
  if (fileRecordError) {
    console.warn("Safe mode: job_files record skipped:", fileRecordError.message);
  }
   
  const activityMessage = {
  id: Date.now(),
  message: `${currentUserName || "Dispatcher"} uploaded ${documentType.toLowerCase()} to job ${jobId}`,
  time: new Date().toLocaleString(),
};
 
  setActivityLogs((logs) => [ activityMessage, ...logs,]);
  setToastMessage("File uploaded successfully");
  window.setTimeout(() => setToastMessage(""), 3000);
  await loadJobs();
  }

  async function handleJobFileDeleted(job, document, warning = "", remainingDocuments = []) {
    const nextPhotoUrl = remainingDocuments.find((item) => item?.url)?.url || "";
    if (jobsSupportsPhotoUrl && (document?.url === job?.photo_url || !nextPhotoUrl)) {
      await updateJob(job.id, "photo_url", nextPhotoUrl);
    }
    setDocumentsJob((current) =>
      current?.id === job.id ? { ...current, photo_url: nextPhotoUrl, updatedAt: new Date().toISOString() } : current
    );

    const jobLabel = job?.reference || job?.id || "unknown";
    setActivityLogs((logs) => [
      {
        id: Date.now(),
        message: `File deleted from Job #${jobLabel} by ${currentUserName || "Dispatcher"}`,
        time: new Date().toLocaleString(),
      },
      ...logs,
    ]);
    await logActivity({
      entityType: "job",
      entityId: job.id,
      action: "File Deleted",
      description: `File deleted from Job #${jobLabel} by ${currentUserName || "Dispatcher"}`,
      createdBy: currentUserName || "Dispatcher",
    });
    await loadJobs();
    setToastMessage(warning || "File deleted successfully.");
    window.setTimeout(() => setToastMessage(""), 3500);
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
      message: buildJobActivityMessage(field, oldValue, value, currentUserName || "Dispatcher"),
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

    if (jobFinancialActivityActions[field] && valueActuallyChanged(oldValue, value)) {
      await logActivity({
        entityType: "job",
        entityId: id,
        action: jobFinancialActivityActions[field],
        description: `${currentUserName || "Dispatcher"} changed ${jobFinancialActivityLabels[field]} for job ${oldJob?.reference || id}.`,
        createdBy: currentUserName || "Dispatcher",
      });
    }
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

    const previousJob = jobs.find((job) => job.id === jobId);
    const markedPaid = isPaidStatus(details.techPaymentStatus) && !isPaidStatus(previousJob?.techPaymentStatus);
    const paidTimestamp = markedPaid ? new Date().toISOString() : details.techPaidDate;
    const paidBy = markedPaid ? currentUserName || "Admin" : details.techPaidBy;
    const nextDetails = {
      ...details,
      ...(markedPaid ? { techPaidDate: paidTimestamp, techPaidBy: paidBy } : {}),
    };

    const update = {};
    if (techPaymentColumns.status && details.techPaymentStatus !== undefined) {
      update[techPaymentColumns.status] = details.techPaymentStatus || "Pending";
    }
    if (techPaymentColumns.method && details.techPaymentMethod !== undefined) {
      update[techPaymentColumns.method] = details.techPaymentMethod || "";
    }
    if (techPaymentColumns.paidDate && (details.techPaidDate !== undefined || markedPaid)) {
      update[techPaymentColumns.paidDate] = paidTimestamp || null;
    }
    if (techPaymentColumns.paidBy && (details.techPaidBy !== undefined || markedPaid)) {
      update[techPaymentColumns.paidBy] = paidBy || "";
    }
    if (techPaymentColumns.reference && details.techPaymentReference !== undefined) {
      update[techPaymentColumns.reference] = details.techPaymentReference || "";
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
      await loadJobs();
      return false;
    }

    setJobs((currentJobs) =>
      currentJobs.map((job) => (job.id === jobId ? { ...job, ...nextDetails } : job))
    );
    setActivityLogs((logs) => [
      {
        id: Date.now(),
        message: `${currentUserName || "Dispatcher"} updated tech payment for job ${jobId}`,
        time: new Date().toLocaleString(),
      },
      ...logs,
    ]);

    await supabase.from("change_logs").insert([
      {
        job_id: jobId,
        action: "tech_payment",
        field_name: "techPaymentStatus",
        old_value: previousJob?.techPaymentStatus || "",
        new_value: details.techPaymentStatus || previousJob?.techPaymentStatus || "",
        user_name: currentUserName || "Dispatcher",
        month_key: new Date().toISOString().slice(0, 7),
      },
    ]);

    const statusChanged =
      details.techPaymentStatus !== undefined &&
      String(details.techPaymentStatus || "") !== String(previousJob?.techPaymentStatus || "");

    if (statusChanged && techPaymentStatusOptions.includes(details.techPaymentStatus)) {
      await logActivity({
        entityType: "job",
        entityId: jobId,
        action: "Tech Payment Status Changed",
        description: `Tech Payment Status changed to ${details.techPaymentStatus}`,
        createdBy: currentUserName || "Admin",
      });
    }
    return true;
  }

  async function deleteJob(id) {
    if (!canDeleteJobs) {
      alert("Only administrators can delete jobs.");
      setJobToDelete(null);
      return;
    }

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
    if (!canDeleteJobs) {
      alert("Only administrators can delete jobs.");
      return;
    }
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

      await supabase.from("change_logs").insert([
        {
          job_id: job.id,
          action: "assigned",
          field_name: "technician",
          old_value: previousTechnician || "",
          new_value: technician.full_name || "Technician",
          user_name: dispatcher,
          month_key: new Date().toISOString().slice(0, 7),
        },
      ]);

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
        item.id === technician.id ? { ...item, availability: availability } : item
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
      setUpdatesJob(job);
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

  return (
    <div className="min-h-screen w-full max-w-none min-w-0 overflow-x-hidden bg-[#07111f] text-slate-100">
      {toastMessage && (
        <div className="fixed right-6 top-6 z-50 rounded-xl border border-emerald-200 bg-white px-5 py-3 text-sm font-bold text-emerald-700 shadow-xl">
          {toastMessage}
        </div>
      )}
      <div className="min-h-screen w-full max-w-none min-w-0">
        <main className="w-full min-w-0 space-y-6 p-4 md:p-6 xl:p-8">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-white/10 bg-[#0b1628] p-4 text-white shadow-2xl shadow-black/20"
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
                <h1 className="text-3xl font-black tracking-tight text-white">Dispatch Board</h1>
                <p className="mt-1 text-sm font-semibold text-slate-300">Manage all live jobs from one place.</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className={`rounded-full border px-3 py-1 text-xs font-black uppercase tracking-wide ${isAdmin ? "border-purple-400/40 bg-purple-500/15 text-purple-100" : "border-blue-400/40 bg-blue-500/15 text-blue-100"}`}>
                    {isAdmin ? "ADMINISTRATOR VIEW" : "DISPATCHER VIEW"}
                  </span>
                  <span className="text-xs font-semibold text-slate-400">
                    {isAdmin ? "Acceso completo" : "Sin acceso a administracion avanzada"}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 xl:flex-nowrap">
              <select
                className={`${darkSelectClass} h-10 rounded-xl px-3 text-sm font-bold`}
                value={periodFilter}
                onChange={(e) => setPeriodFilter(e.target.value)}
              >
                <option style={darkOptionStyle} value="ThisWeek">This Week</option>
                <option style={darkOptionStyle} value="LastWeek">Last Week</option>
                <option style={darkOptionStyle} value="ThisMonth">This Month</option>
                <option style={darkOptionStyle} value="LastMonth">Last Month</option>
                <option style={darkOptionStyle} value="ThisYear">This Year</option>
                <option style={darkOptionStyle} value="All">All</option>
              </select>
              <button type="button" onClick={() => document.getElementById("live-jobs-table")?.scrollIntoView({ behavior: "smooth" })} className="rounded-xl bg-white/10 px-4 py-2 text-sm font-bold text-slate-200 hover:bg-white/15">
                <Filter className="mr-2 inline h-4 w-4" />
                Filters
              </button>
              <button type="button" onClick={() => setShowAddJobModal(true)} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-500">
                <Plus className="mr-2 inline h-4 w-4" />
                Add Job
              </button>
              <button
                type="button"
                onClick={() => {
                  loadJobs();
                  loadDispatchTechnicians();
                }}
                className="rounded-xl bg-white/10 p-3 text-slate-200 hover:bg-white/15"
                title="Refresh"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
              <div className="rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-sm font-bold capitalize text-white">
                {currentUserName || "Not signed in"} · {normalizeRole(currentUserRole) || "access required"}
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

        <div className="hidden">
          <BellRing className="h-5 w-5 animate-pulse" />
          <div>
            <p className="font-bold">Live Dispatch Notifications Active</p>
            <p className="text-xs text-amber-700">
              All dispatch updates sync instantly across all connected users
            </p>
          </div>
        </div>

        <div className="hidden">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-950">Job Status Pipeline</h2>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Live dispatch workflow</p>
            </div>
            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">Realtime</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {jobPipeline.map((status) => (
              <JobStatusBadge key={status} status={status} />
            ))}
          </div>
        </div>

        <div className="hidden">
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

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          {roleKpis.map((kpi) => (
            <DispatchKpiCard key={kpi.label} {...kpi} />
          ))}
        </div>

        {false && isAdmin && (
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

  <div className="grid gap-4 md:grid-cols-5">
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
  icon={<AlertTriangle />}
  label="Cancelled"
  value={jobs.filter(j => j.invoice === "Cancelled").length}
  onClick={() => {
    setInvoiceFilter("Cancelled");
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

        <div className="hidden">
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


        </div>

        <div className="grid w-full min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          {showAddJobModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form ref={formRef} onSubmit={addJob} className="max-h-[92vh] w-full max-w-[1000px] overflow-auto rounded-2xl border border-white/10 bg-[#0b1628] p-4 shadow-2xl shadow-black/40">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-black text-white">Add New Job</h2>
                <p className="mt-0.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Dispatch intake</p>
              </div>
              <button type="button" onClick={() => setShowAddJobModal(false)} className="rounded-lg bg-white/10 px-3 py-2 text-xs font-bold text-slate-100 hover:bg-white/15">
                Close
              </button>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <Input label="Date" type="date" value={form.date} onChange={(v) => setForm({ ...form, date: v })} />
              <Input label="Time" placeholder="10:45 AM" value={form.time} onChange={(v) => setForm({ ...form, time: v })} />
              <Input label="Invoice #" value={form.reference} onChange={(v) => setForm({ ...form, reference: v })} />
              <Input label="Dispatch" list="dispatcher-suggestions" value={form.dispatch} onChange={(v) => setForm({ ...form, dispatch: v })} />
              <Input label="Company" list="company-suggestions" value={form.company} onChange={(v) => setForm({ ...form, company: v })} />
              <Input label="Tech" list="technician-suggestions" value={form.tech} onChange={(v) => setForm({ ...form, tech: v })} />
              <Input label="Location" list="location-suggestions" placeholder="City, State" value={form.location} onChange={(v) => setForm({ ...form, location: v })} />
              <Select label="Priority Color" value={form.rowFlag} onChange={(v) => setForm({ ...form, rowFlag: v })} options={["Normal", "Pending", "Problem", "Completed", "Info"]} />
              <Select label="Status" value={form.status} onChange={(v) => setForm({ ...form, status: v })} options={jobStatusOptions} />
              <Select label="Invoice Status" value={form.invoice} onChange={(v) => setForm({ ...form, invoice: v })} options={invoiceStatusOptions} />
              <Select label="Payment Method" value={form.paymentMethod} onChange={(v) => setForm({ ...form, paymentMethod: v })} options={paymentMethods} />
              <Select label="Received" value={form.paymentReceiver} onChange={(v) => setForm({ ...form, paymentReceiver: v })} options={paymentReceivers} />
              <Input label="Reference #" value={form.jobReference || ""} onChange={(v) => setForm({ ...form, jobReference: v })} />
              <Input label="PO #" value={form.poNumber || ""} onChange={(v) => setForm({ ...form, poNumber: v })} />
              <Input label="Truck/Unit #" value={form.truckUnit || ""} onChange={(v) => setForm({ ...form, truckUnit: v })} />

              <label className="grid gap-1 text-xs font-bold uppercase tracking-wide text-slate-300 md:col-span-2 xl:col-span-4">
                <span>Updates / Notes</span>
                <textarea
                  className="h-16 w-full resize-none rounded-lg border border-white/10 bg-[#111f33] px-3 py-2 text-sm font-semibold text-white outline-none placeholder:text-slate-500 focus:border-blue-400"
                  placeholder="Example: Driver called. Tech ETA 35 minutes..."
                  value={form.updates}
                  onChange={(e) => setForm({ ...form, updates: e.target.value })}
                />
              </label>

              {canEditJobFinancial && (
                <>
                  <Input label="Total Bill" type="number" value={form.totalBill} onChange={(v) => setForm({ ...form, totalBill: v })} />
                  <Input label="Parts" type="number" value={form.parts} onChange={(v) => setForm({ ...form, parts: v })} />
                  <Input label="Tech Labor" type="number" value={form.techLabor} onChange={(v) => setForm({ ...form, techLabor: v })} />
                </>
              )}

              <div className="rounded-xl border border-white/10 bg-white/5 p-3 md:col-span-2 xl:col-span-4">
                <button type="button" onClick={onOpenFlatRate} className="mb-3 flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-500">
                  <Wrench className="h-4 w-4" /> Add Flat Rate Labor
                </button>
                <button type="button" onClick={onOpenParts} className="mb-3 ml-2 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-500">
                  <Database className="h-4 w-4" /> Add Parts
                </button>
                <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">
                  Filter by period / date range
                </div>
                <div className="grid gap-2 md:grid-cols-[180px_150px_150px_1fr] md:items-center">
                  <select
                    className={`${darkSelectClass} h-9 px-3 text-sm font-semibold`}
                    value={periodFilter}
                    onChange={(e) => setPeriodFilter(e.target.value)}
                  >
                    <option style={darkOptionStyle} value="ThisWeek">This Week</option>
                    <option style={darkOptionStyle} value="LastWeek">Last Week</option>
                    <option style={darkOptionStyle} value="ThisMonth">This Month</option>
                    <option style={darkOptionStyle} value="LastMonth">Last Month</option>
                    <option style={darkOptionStyle} value="ThisYear">This Year</option>
                    <option style={darkOptionStyle} value="LastYear">Last Year</option>
                    <option style={darkOptionStyle} value="All">All</option>
                  </select>

                  <input
                    type="date"
                    className="h-9 rounded-lg border border-white/10 bg-[#111f33] px-3 text-sm font-semibold text-white outline-none focus:border-blue-400"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                  />

                  <input
                    type="date"
                    className="h-9 rounded-lg border border-white/10 bg-[#111f33] px-3 text-sm font-semibold text-white outline-none focus:border-blue-400"
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                  />
                  <span className="hidden text-xs font-semibold text-slate-500 md:block">Applies to dispatch list and workspace filters.</span>
                </div>
              </div>

              <div className="flex flex-wrap justify-end gap-2 md:col-span-2 xl:col-span-4">
                <button
                  type="button"
                  onClick={() => setForm(emptyForm())}
                  className="h-9 rounded-lg border border-white/10 bg-white/10 px-4 text-sm font-bold text-slate-100 hover:bg-white/15"
                >
                  Clear
                </button>
                <button
                  type="submit"
                  className="h-9 rounded-lg bg-blue-600 px-5 text-sm font-bold text-white shadow-sm transition hover:bg-blue-500"
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
          </div>
          )}

          <DispatchRightPanel
            isAdmin={isAdmin}
            stats={stats}
            todayJobs={todayJobs}
            technicians={dispatchTechnicians}
            activeTechniciansCount={activeTechniciansCount}
            activityLogs={activityLogs}
            onAddJob={() => setShowAddJobModal(true)}
            onAssign={() => {
              setAssignmentJob(filteredJobs[0] || null);
            }}
            onMap={() => window.open("https://www.google.com/maps/search/?api=1&query=active%20truck%20roadside%20jobs", "_blank", "noopener,noreferrer")}
            onReport={() => exportJobsToCSV(filteredJobs)}
          />

          {false && (
            <DispatchCockpit
              jobs={filteredJobs}
              selectedJob={assignmentJob || filteredJobs[0]}
              technicians={assignmentTechnicians}
              notifications={notifications}
              activityLogs={activityLogs}
              changeLogs={changeLogs}
              filters={assignmentFilters}
              canEditJobFinancial={canEditJobFinancial}
              onSelectJob={setAssignmentJob}
              onFiltersChange={setAssignmentFilters}
              onAssign={assignRecommendedTechnician}
              onUpdateJob={updateJob}
              onOpenTable={() => setDispatchViewMode("table")}
              onContextMenu={openJobContextMenu}
              onNearbyParts={setNearbyPartsJob}
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

          {true && (
          <div id="live-jobs-table" className="order-3 col-span-full w-full max-w-none min-w-0 rounded-2xl border border-white/10 bg-[#0b1628] p-5 shadow-xl shadow-black/10">
            <div className="mb-5 flex flex-col gap-3 2xl:flex-row 2xl:items-center 2xl:justify-between">
              <div>
                <h2 className="text-3xl font-black tracking-tight text-white">Live Jobs</h2>
                <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Ordered oldest to newest</p>
              </div>

              <div className="flex flex-wrap gap-2">
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => exportJobsToCSV(filteredJobs)}
                    className="flex h-10 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white hover:bg-emerald-700"
                  >
                    <FileSpreadsheet className="h-4 w-4" />
                    Export Excel
                  </button>
                )}
                <button
                  type="button"
                  className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50"
                >
                  <Columns3 className="h-4 w-4" />
                  Columns
                </button>
                <button
                  type="button"
                  onClick={loadJobs}
                  className="flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700"
                >
                  <RefreshCw className="h-4 w-4" />
                  Refresh
                </button>
              </div>
            </div>

            <div className="mb-3 w-full max-w-none overflow-hidden rounded-xl border border-white/10 bg-white/5 p-2">
              <div className="grid w-full min-w-0 gap-2 md:grid-cols-2 2xl:grid-cols-[minmax(220px,1fr)_130px_140px_140px_150px_140px_150px_auto_auto] 2xl:items-center">
                <div className="relative min-w-0">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    ref={searchInputRef}
                    className="h-9 w-full rounded-lg border border-white/10 bg-[#111f33] py-2 pl-9 pr-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-blue-400"
                    placeholder="Search by Ref #, Company, Location, Technician"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>

                <select
                  className={`${darkSelectClass} h-9 w-full px-3 py-2 text-sm font-semibold`}
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  {["All", ...jobStatusOptions].map((s) => (
                    <option style={darkOptionStyle} key={s}>{s}</option>
                  ))}
                </select>

                <select
                  className={`${darkSelectClass} h-9 w-full px-3 py-2 text-sm font-semibold`}
                  value={dispatchFilter}
                  onChange={(e) => setDispatchFilter(e.target.value)}
                >
                  <option style={darkOptionStyle}>All</option>
                  {dispatchers.map((dispatcher) => (
                    <option style={darkOptionStyle} key={dispatcher}>{dispatcher}</option>
                  ))}
                </select>

                <select
                  className={`${darkSelectClass} h-9 w-full px-3 py-2 text-sm font-semibold`}
                  value={techFilter}
                  onChange={(e) => setTechFilter(e.target.value)}
                >
                  <option style={darkOptionStyle}>All</option>
                  {techs.map((tech) => (
                    <option style={darkOptionStyle} key={tech}>{tech}</option>
                  ))}
                </select>

                <select
                  className={`${darkSelectClass} h-9 w-full px-3 py-2 text-sm font-semibold`}
                  value={cityFilter}
                  onChange={(e) => setCityFilter(e.target.value)}
                >
                  <option style={darkOptionStyle}>All</option>
                  {cities.map((city) => (
                    <option style={darkOptionStyle} key={city}>{city}</option>
                  ))}
                </select>

                <select
                  className={`${darkSelectClass} h-9 w-full px-3 py-2 text-sm font-semibold`}
                  value={invoiceFilter}
                  onChange={(e) => setInvoiceFilter(e.target.value)}
                >
                  <option style={darkOptionStyle}>All</option>
                  {invoiceStatusOptions.map((status) => (
                    <option style={darkOptionStyle} key={status}>{status}</option>
                  ))}
                </select>

                <input
                  type="date"
                  className="h-9 w-full rounded-lg border border-white/10 bg-[#111f33] px-3 py-2 text-sm text-white outline-none focus:border-blue-400"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                />

                <button
                  type="button"
                  onClick={() => exportJobsToCSV(filteredJobs)}
                  className="h-9 whitespace-nowrap rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700"
                >
                  Export
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSearch("");
                    setStatusFilter("All");
                    setDispatchFilter("All");
                    setTechFilter("All");
                    setCompanyFilter("All");
                    setFromDate("");
                    setToDate("");
                    setInvoiceFilter("All");
                    setPeriodFilter("All");
                  }}
                  className="h-9 whitespace-nowrap rounded-lg border border-white/10 bg-white/10 px-4 py-2 text-sm font-bold text-slate-100 hover:bg-white/15"
                >
                  Reset
                </button>
              </div>
            </div>

            <div className="w-full max-w-none overflow-x-auto rounded-2xl border border-white/10 bg-[#0f1c2e]">
              <table className="min-w-[1900px] table-auto border-separate border-spacing-0 whitespace-nowrap text-left text-sm">
                <thead className="sticky top-0 z-10 bg-[#0b1628] text-xs uppercase tracking-wide text-slate-200">
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
                    {canEditJobFinancial && <Th>Total Bill</Th>}
                    {canEditJobFinancial && <Th>Parts</Th>}
                    {canEditJobFinancial && <Th>Tech Labor</Th>}
                    <Th>Tech Payment</Th>
                    {canEditJobFinancial && <Th>Profit</Th>}
                    <Th>Actions</Th>
                  </tr>
                </thead>

                <tbody>
                  {filteredJobs.map((job, index) => (
                    <tr
                      key={job.id}
                      onContextMenu={(event) => openJobContextMenu(event, job)}
                    className={`h-11 align-middle text-slate-200 transition hover:bg-blue-500/10 ${
                      job.rowFlag === "Problem" || job.status === "Dry Run"
                          ? "border-l-4 border-red-500 bg-red-500/10"
                          : "border-l-4 border-transparent odd:bg-white/[0.03] even:bg-white/[0.06]"
                      }`}
                    >
                      <Td>
                        <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-slate-200">
                          #{index + 1}
                        </span>
                      </Td>

                      <Td>
                        <select
                          className={`${darkSelectClass} h-9 px-2 text-xs font-bold`}
                          value={job.rowFlag || "Normal"}
                          onChange={(e) => updateJob(job.id, "rowFlag", e.target.value)}
                        >
                          <option style={darkOptionStyle}>Normal</option>
                          <option style={darkOptionStyle}>Pending</option>
                          <option style={darkOptionStyle}>Problem</option>
                          <option style={darkOptionStyle}>Completed</option>
                          <option style={darkOptionStyle}>Info</option>
                        </select>
                      </Td>

                      <Td>
                        <input
                          type="date"
                          className={`${tableControlClass} h-9 px-2 text-xs font-semibold`}
                          value={job.date}
                          onChange={(e) => updateJob(job.id, "date", e.target.value)}
                        />
                      </Td>

                      <Td className="text-center">
                        <div className="flex items-center justify-center gap-2">
                          <select
                            className={`${darkSelectClass} h-8 rounded-full px-3 text-xs font-bold`}
                            style={jobStatusControlStyle(job.status)}
                            value={job.status}
                            onChange={(e) => updateJob(job.id, "status", e.target.value)}
                          >
                            {jobStatusOptions.map((s) => (
                              <option key={s} value={s} style={darkOptionStyle}>
                                {jobStatusLabel(s)}
                              </option>
                            ))}
                          </select>
                          {(job.manualEta || extractEta(job.updates)) && (
                            <span className="text-xs font-semibold text-slate-400">
                              ETA: {job.manualEta || extractEta(job.updates)}
                            </span>
                          )}
                        </div>
                      </Td>

                      <Td><Editable value={job.time} onChange={(v) => updateJob(job.id, "time", v)} /></Td>
                      <Td><Editable value={job.reference} onChange={(v) => updateJob(job.id, "reference", v)} /></Td>
                      <Td><Editable value={job.dispatch} onChange={(v) => updateJob(job.id, "dispatch", v)} /></Td>

                      <Td>
                        <input
                          className={`${tableControlClass} w-[320px] px-2 py-1`}
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
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100"
                            title="View Map"
                          >
                            <MapPin className="h-4 w-4" />
                          </a>
                        </div>
                      </Td>

                      <Td>
                        <select
                          className={`rounded-full border px-3 py-1 text-xs font-bold ${invoiceStyles[job.invoice] || invoiceStyles.Pending}`}
                          value={job.invoice}
                          onChange={(e) => updateJob(job.id, "invoice", e.target.value)}
                        >
                          {invoiceStatusOptions.map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </Td>

                      <Td>
                        <select
                          className={`${darkSelectClass} h-9 px-2 text-xs font-bold`}
                          value={job.paymentMethod || "Pending"}
                          onChange={(e) => updateJob(job.id, "paymentMethod", e.target.value)}
                        >
                          {paymentMethods.map((method) => (
                            <option key={method} style={darkOptionStyle}>{method}</option>
                          ))}
                        </select>
                      </Td>

                      <Td>
                        <select
                          className={`${darkSelectClass} h-9 px-2 text-xs font-bold`}
                          value={job.paymentReceiver || "A"}
                          onChange={(e) => updateJob(job.id, "paymentReceiver", e.target.value)}
                        >
                          {paymentReceivers.map((receiver) => (
                            <option key={receiver} style={darkOptionStyle}>{receiver}</option>
                          ))}
                        </select>
                      </Td>

                      <Td>
                        <button
                          type="button"
                          title={job.updates || "No updates"}
                          onClick={() => setUpdatesJob(job)}
                          className={`${tableControlClass} block w-72 truncate px-2 py-1.5 text-left text-xs font-semibold hover:border-[#2563eb]`}
                        >
                          {firstLine(job.updates) || "No updates"}
                        </button>
                      </Td>

                      {canEditJobFinancial && (
                        <Td>
                          <input
                            type="number"
                            className={`${tableControlClass} h-9 w-24 px-2 text-right font-bold`}
                            defaultValue={job.totalBill}
                            onBlur={(e) => updateJob(job.id, "totalBill", Number(e.target.value || 0))}
                          />
                        </Td>
                      )}

                      {canEditJobFinancial && (
                        <Td>
                          <input
                            type="number"
                            className={`${tableControlClass} h-9 w-24 px-2 text-right`}
                            defaultValue={job.parts}
                            onBlur={(e) => updateJob(job.id, "parts", Number(e.target.value || 0))}
                          />
                        </Td>
                      )}

                      {canEditJobFinancial && (
                        <Td>
                          <input
                            type="number"
                            className={`${tableControlClass} h-9 w-24 px-2 text-right`}
                            defaultValue={job.techLabor}
                            onBlur={(e) => updateJob(job.id, "techLabor", Number(e.target.value || 0))}
                          />
                        </Td>
                      )}

                      <Td>
                        <div className="flex items-center justify-center">
                          <select
                            className={`${darkSelectClass} h-9 w-36 rounded-xl px-2 text-center text-xs font-bold`}
                            value={job.techPaymentStatus || "Pending"}
                            onChange={(e) => updateTechPaymentStatus(job, e.target.value)}
                            disabled={!canEditJobFinancial}
                          >
                            {techPaymentStatusOptions.map((status) => (
                              <option key={status} style={darkOptionStyle}>{status}</option>
                            ))}
                          </select>
                        </div>
                      </Td>

                      {canEditJobFinancial && (
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
                        <div className="flex items-center gap-1.5">
                          <IconAction title="View" onClick={() => {
                              alert(
                                [
                                  `Invoice: ${job.reference || "N/A"}`,
                                  `Company: ${job.company || "N/A"}`,
                                  `Tech: ${job.tech || "N/A"}`,
                                  `Location: ${job.location || "N/A"}`,
                                  `Status: ${job.status || "N/A"}`,
                                ].join("\n")
                              );
                            }} className="bg-white/10 text-slate-200 hover:bg-white/15">
                            <Eye className="h-4 w-4" />
                          </IconAction>
                          <IconAction title="Edit" onClick={() => handleJobContextAction("edit", job)} className="bg-white/10 text-slate-200 hover:bg-white/15">
                            <Edit3 className="h-4 w-4" />
                          </IconAction>
                          <IconAction title="Call" onClick={() => handleJobContextAction("call", job)} className="bg-slate-100 text-slate-700 hover:bg-slate-200">
                            <Phone className="h-4 w-4" />
                          </IconAction>
                          <IconAction title="WhatsApp Customer" onClick={() => handleJobContextAction("whatsapp", job)} className="bg-emerald-100 text-emerald-700 hover:bg-emerald-200">
                            <MessageCircle className="h-4 w-4" />
                          </IconAction>
                          <IconAction title="Open Maps" onClick={() => handleJobContextAction("maps", job)} className="bg-blue-100 text-blue-700 hover:bg-blue-200">
                            <MapPin className="h-4 w-4" />
                          </IconAction>
                          <IconAction title="Assign Technician" onClick={() => setAssignmentJob(job)} className="bg-indigo-100 text-indigo-700 hover:bg-indigo-200">
                            <UserPlus className="h-4 w-4" />
                          </IconAction>
                          <label title="Upload Invoice / Photo" className="relative inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg bg-amber-100 text-amber-700 transition hover:bg-amber-200">
                            <ImageIcon className="h-4 w-4" />
                            {job.photo_url && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-emerald-500" />}
                            <input type="file" className="hidden" accept="image/*,application/pdf" onChange={(e) => uploadPhoto(job.id, e.target.files[0], "Invoice / photo")} />
                          </label>
                          <IconAction title="Documents" onClick={() => setDocumentsJob(job)} className="relative bg-purple-100 text-purple-700 hover:bg-purple-200">
                            <FileText className="h-4 w-4" />
                            {job.photo_url && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-emerald-500" />}
                          </IconAction>
                          <IconAction title="More" onClick={(event) => openJobContextMenu(event, job)} className="bg-white/10 text-slate-200 hover:bg-white/15">
                            <MoreHorizontal className="h-4 w-4" />
                          </IconAction>
                          {canDeleteJobs && (
                            <IconAction title="Delete" onClick={() => requestDelete(job)} className="bg-red-100 text-red-700 hover:bg-red-200">
                              <Trash2 className="h-4 w-4" />
                            </IconAction>
                          )}
                        </div>
                      </Td>
                    </tr>
                  ))}
                  {filteredJobs.length === 0 && (
                    <tr>
                      <td colSpan={canEditJobFinancial ? 21 : 17} className="px-4 py-10 text-center text-sm font-semibold text-slate-500">
                        No live jobs yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex flex-col gap-3 border-t border-white/10 pt-4 text-sm font-semibold text-slate-400 md:flex-row md:items-center md:justify-between">
              <span>
                Showing {filteredJobs.length ? 1 : 0} to {filteredJobs.length} of {filteredJobs.length} jobs
              </span>
              <label className="flex items-center gap-2">
                Rows per page
                <select className={`${darkSelectClass} rounded-xl px-3 py-2 text-sm font-bold`}>
                  <option style={darkOptionStyle}>25</option>
                  <option style={darkOptionStyle}>50</option>
                  <option style={darkOptionStyle}>100</option>
                </select>
              </label>
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

            {canEditJobFinancial && techPaymentJob && (
              <TechPaymentModal
                job={techPaymentJob}
                columnsAvailable={Boolean(techPaymentColumns.status)}
                columns={techPaymentColumns}
                onClose={() => setTechPaymentJob(null)}
                onSave={async (details) => {
                  const saved = await saveTechPaymentDetails(techPaymentJob.id, details);
                  if (saved) {
                    setTechPaymentJob(null);
                  }
                }}
              />
            )}

            {nearbyPartsJob && (
              <JobNearbyPartsModal
                job={nearbyPartsJob}
                onClose={() => setNearbyPartsJob(null)}
              />
            )}

            {assignmentJob && permissions.canAssignTechnicians && (
              <CompactAssignTechnicianModal
                job={assignmentJob}
                technicians={assignmentTechnicians}
                filters={assignmentFilters}
                onFiltersChange={setAssignmentFilters}
                onAssign={assignRecommendedTechnician}
                onClose={() => setAssignmentJob(null)}
              />
            )}

            {updatesJob && (
              <UpdatesModal
                job={updatesJob}
                onClose={() => setUpdatesJob(null)}
                onSave={async (value) => {
                  await updateJob(updatesJob.id, "updates", value);
                  setUpdatesJob(null);
                }}
              />
            )}

            {documentsJob && (
              <JobDocumentsModal
                job={documentsJob}
                isAdmin={canDeleteJobs}
                currentUserName={currentUserName || "Dispatcher"}
                onUpload={(file, type) => uploadPhoto(documentsJob.id, file, type)}
                onDeleted={(document, warning) => handleJobFileDeleted(documentsJob, document, warning)}
                onClose={() => setDocumentsJob(null)}
              />
            )}

            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
              <div className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 font-bold text-emerald-700 shadow-sm">
                Auto Save Enabled
              </div>
              <div className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 font-bold text-blue-700 shadow-sm">
                Cloud Backup Active
              </div>
              <div className="rounded-full border border-red-200 bg-red-50 px-3 py-1.5 font-bold text-red-700 shadow-sm">
                Delete Protection Confirmation
              </div>
            </div>

            <p className="mt-3 text-xs text-slate-500">
              All changes save automatically in the live cloud database. Jobs can still be deleted manually if someone entered a wrong work order.
            </p>
          </div>
          )}

        </div>
        </main>
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
  canEditJobFinancial,
  onSelectJob,
  onFiltersChange,
  onAssign,
  onUpdateJob,
  onOpenTable,
  onContextMenu,
  onNearbyParts,
}) {
  const selected = selectedJob || jobs[0];
  const activity = buildCockpitActivity(selected, notifications, activityLogs, changeLogs, jobs);

  return (
    <div className="order-3 col-span-full grid w-full gap-4 xl:grid-cols-[1.1fr_1.2fr_1.1fr] lg:grid-cols-2">
      <section className="rounded-2xl border border-white/10 bg-[#0b1628] p-4 shadow-xl shadow-black/10">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Live Jobs</h2>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{jobs.length} visible jobs</p>
          </div>
          <button type="button" className="rounded-xl bg-white/10 p-2 text-slate-300 hover:bg-white/15" title="Filter">
            <Filter className="h-4 w-4" />
          </button>
        </div>
        <div className="relative mb-3">
          <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
          <input className="w-full rounded-xl border border-white/10 bg-[#111f33] py-2 pl-9 pr-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-blue-400" placeholder="Search live jobs" />
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
                selected?.id === job.id ? "border-blue-400 bg-blue-500/15 shadow-sm" : "border-white/10 bg-white/[0.03] hover:bg-white/[0.07]"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-white">{job.reference || "No invoice"}</p>
                  <p className="mt-1 truncate text-sm font-semibold text-slate-300">{job.company || "No company"}</p>
                  <p className="mt-1 truncate text-xs text-slate-500">{job.location || "No location"}</p>
                  <p className="mt-2 text-xs text-slate-500">{[job.date, job.time].filter(Boolean).join(" · ") || "No date/time"}</p>
                </div>
                <JobStatusBadge status={job.status} className="shrink-0 px-2 py-1 text-[11px]" />
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
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onNearbyParts(job);
                  }}
                  className="rounded-lg bg-amber-100 p-2 text-xs font-bold text-amber-700"
                  title="Nearby Parts"
                >
                  <Search className="h-3.5 w-3.5" />
                </button>
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

      <section className="rounded-2xl border border-white/10 bg-[#0b1628] p-5 shadow-xl shadow-black/10">
        {selected ? (
          <>
            <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Job Details</p>
                <div className="flex items-center gap-2">
                  <h2 className="text-2xl font-bold text-white">{selected.company || "No company"}</h2>
                </div>
                <p className="mt-1 text-sm text-slate-500">{selected.location || "No location"}</p>
              </div>
              <div className="flex items-center gap-2">
                <JobStatusBadge status={selected.status} />
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

            {canEditJobFinancial && (
              <div className="mt-4 grid gap-3 md:grid-cols-4">
                <FinancialCard label="Total Bill" value={money(selected.totalBill)} />
                <FinancialCard label="Parts" value={money(selected.parts)} />
                <FinancialCard label="Tech Labor" value={money(selected.techLabor)} />
                <FinancialCard label="Profit" value={money(Number(selected.totalBill || 0) - Number(selected.parts || 0) - Number(selected.techLabor || 0))} accent />
              </div>
            )}

            <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Updates / Notes</p>
                <button type="button" onClick={onOpenTable} className="text-xs font-bold text-blue-700 hover:text-blue-800">Edit</button>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-slate-300">{selected.updates || "No updates yet."}</p>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <a href={customerWhatsAppLink(selected)} target="_blank" rel="noreferrer" className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700">WhatsApp Customer</a>
              <button type="button" onClick={() => alert("Customer phone is not stored on this job yet.")} className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-200">Call Customer</button>
              <a href={mapLink(selected.location)} target="_blank" rel="noreferrer" className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700">Open Maps</a>
              <button type="button" onClick={() => onNearbyParts(selected)} className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-bold text-white hover:bg-amber-600">Nearby Parts</button>
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
        <section id="cockpit-technicians" className="rounded-2xl border border-white/10 bg-[#0b1628] p-4 shadow-xl shadow-black/10">
          <div className="mb-4">
            <h2 className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Recommended Technicians</h2>
            <p className="text-xs text-slate-500">Approved technicians matched by city, state, and service when available.</p>
          </div>
          <div className="mb-4 grid gap-2 md:grid-cols-3 xl:grid-cols-1">
            <input className="rounded-xl border border-white/10 bg-[#111f33] px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:border-blue-400" placeholder="City" value={filters.city} onChange={(event) => onFiltersChange((current) => ({ ...current, city: event.target.value }))} />
            <input className="rounded-xl border border-white/10 bg-[#111f33] px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:border-blue-400" placeholder="State" value={filters.state} onChange={(event) => onFiltersChange((current) => ({ ...current, state: event.target.value }))} />
            <input className="rounded-xl border border-white/10 bg-[#111f33] px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:border-blue-400" placeholder="Service" value={filters.service} onChange={(event) => onFiltersChange((current) => ({ ...current, service: event.target.value }))} />
          </div>
          <div className="max-h-[430px] space-y-3 overflow-y-auto pr-1">
            {technicians.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">No matching approved technicians.</div>
            ) : (
              technicians.map((technician) => (
                <div key={technician.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-50 text-sm font-black text-blue-700">
                        {initials(technician.full_name)}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-bold text-white">{technician.full_name || "Unnamed technician"}</p>
                        <p className="text-xs font-semibold text-amber-500">★ {Number(technician.rating || 0).toFixed(1)}</p>
                        <p className="text-xs text-slate-500">{technician.phone || "No phone"}</p>
                        <p className="text-xs text-slate-500">{[technician.city, technician.state].filter(Boolean).join(", ") || "No location"} · Distance N/A</p>
                      </div>
                    </div>
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-700">{technician.availability || "Available"}</span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <MiniMetric label="Services" value={formatServices(technician.services)} />
                    <MiniMetric label="Rating" value={Number(technician.rating || 0).toFixed(1)} />
                    <MiniMetric label="Compliance" value={`${technicianCompliance(technician)}%`} />
                    <MiniMetric label="Availability" value={technician.availability || "Available"} />
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

        <section className="rounded-2xl border border-white/10 bg-[#0b1628] p-4 shadow-xl shadow-black/10">
          <h2 className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Activity Feed</h2>
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

function TechPaymentModal({ job, columnsAvailable, columns = {}, onClose, onSave }) {
  const [details, setDetails] = useState({
    techPaymentStatus: job.techPaymentStatus || "Pending",
    techPaymentMethod: job.techPaymentMethod || job.paymentMethod || "",
    techPaidDate: job.techPaidDate || "",
    techPaidBy: job.techPaidBy || "",
    techPaymentReference: job.techPaymentReference || "",
    techPaymentNotes: job.techPaymentNotes || "",
  });
  const missingColumns = [
    ["tech_payment_status", columns.status],
    ["tech_paid_date", columns.paidDate],
    ["tech_paid_by", columns.paidBy],
    ["tech_payment_method", columns.method],
    ["tech_payment_reference", columns.reference],
    ["tech_payment_notes", columns.notes],
  ].filter(([, available]) => !available);

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

        {columnsAvailable && missingColumns.length > 0 && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800">
            Safe mode: missing optional tech payment columns: {missingColumns.map(([column]) => column).join(", ")}.
          </div>
        )}

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <PaymentDetail label="Technician name" value={job.tech || "Not assigned"} />
          <PaymentDetail label="Invoice #" value={job.reference || job.id || "N/A"} />
          <PaymentDetail label="Job location" value={job.location || "Not recorded"} />
          <PaymentDetail label="Tech Labor" value={money(job.techLabor)} />
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="grid gap-2 text-sm font-bold text-slate-600">
            Tech Payment Status
            <select
              className={`${darkSelectClass} rounded-xl px-3 py-2 font-semibold`}
              value={details.techPaymentStatus}
              onChange={(event) => setDetails((current) => ({ ...current, techPaymentStatus: event.target.value }))}
            >
              {techPaymentStatusOptions.map((status) => (
                <option key={status} style={darkOptionStyle}>{status}</option>
              ))}
            </select>
          </label>

          <label className="grid gap-2 text-sm font-bold text-slate-600">
            Payment Method
            <select
              className={`${darkSelectClass} rounded-xl px-3 py-2 font-semibold`}
              value={details.techPaymentMethod}
              onChange={(event) => setDetails((current) => ({ ...current, techPaymentMethod: event.target.value }))}
            >
              <option value="" style={darkOptionStyle}>Not set</option>
              {techPaymentMethods.map((method) => (
                <option key={method} style={darkOptionStyle}>{method}</option>
              ))}
            </select>
          </label>

          <label className="grid gap-2 text-sm font-bold text-slate-600">
            Paid Date
            <input
              type="date"
              className="rounded-xl border border-slate-200 px-3 py-2 font-semibold text-slate-900 outline-none focus:border-blue-500"
              value={dateInputValue(details.techPaidDate)}
              onChange={(event) => setDetails((current) => ({ ...current, techPaidDate: event.target.value }))}
            />
          </label>

          <label className="grid gap-2 text-sm font-bold text-slate-600">
            Paid By
            <input
              className="rounded-xl border border-slate-200 px-3 py-2 font-semibold text-slate-900 outline-none focus:border-blue-500"
              value={details.techPaidBy || ""}
              onChange={(event) => setDetails((current) => ({ ...current, techPaidBy: event.target.value }))}
              placeholder="Admin user"
            />
          </label>

          <label className="grid gap-2 text-sm font-bold text-slate-600">
            Reference #
            <input
              className="rounded-xl border border-slate-200 px-3 py-2 font-semibold text-slate-900 outline-none focus:border-blue-500"
              value={details.techPaymentReference || ""}
              onChange={(event) => setDetails((current) => ({ ...current, techPaymentReference: event.target.value }))}
              placeholder="Confirmation, check, or transaction number"
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

function dispatchKpis(stats, isAdmin) {
  return [
    { icon: ClipboardList, label: "Total Jobs", value: stats.total, accent: "blue" },
    { icon: Clock, label: "In Progress", value: stats.inProgress + stats.working + stats.enRoute, accent: "amber" },
    { icon: CheckCircle2, label: "Completed", value: stats.completed, accent: "emerald" },
    { icon: AlertTriangle, label: "Cancelled", value: stats.canceled, accent: "red" },
    { icon: BellRing, label: "Pending", value: stats.pendingJobs, accent: "cyan" },
    { icon: Crown, label: "Dry Runs", value: stats.dryRuns, accent: "purple" },
  ];
}

function DispatchKpiCard({ icon: Icon, label, value, accent = "blue" }) {
  const accents = {
    blue: "border-blue-400/20 bg-blue-500/10 text-blue-200",
    amber: "border-amber-400/20 bg-amber-500/10 text-amber-200",
    emerald: "border-emerald-400/20 bg-emerald-500/10 text-emerald-200",
    red: "border-red-400/20 bg-red-500/10 text-red-200",
    purple: "border-purple-400/20 bg-purple-500/10 text-purple-200",
    cyan: "border-cyan-400/20 bg-cyan-500/10 text-cyan-200",
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-[#0b1628] p-4 shadow-xl shadow-black/10">
      <div className="flex items-center justify-between gap-3">
        <div className={`flex h-11 w-11 items-center justify-center rounded-xl border ${accents[accent] || accents.blue}`}>
          <Icon className="h-5 w-5" />
        </div>
        <span className="rounded-full bg-white/5 px-2 py-1 text-[11px] font-black uppercase tracking-wide text-slate-400">Live</span>
      </div>
      <p className="mt-4 text-xs font-black uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-black text-white">{value}</p>
    </div>
  );
}

function DispatchRightPanel({ isAdmin, stats, todayJobs, technicians, activeTechniciansCount, activityLogs, onAddJob, onAssign, onMap, onReport }) {
  const completedToday = todayJobs.filter((job) => job.status === "Completed").length;
  const cancelledToday = todayJobs.filter((job) => ["Canceled", "Cancelled"].includes(job.status)).length;
  const dryRunsToday = todayJobs.filter((job) => job.status === "Dry Run").length;
  const inProgressToday = todayJobs.filter((job) => ["In Progress", "Working", "En Route", "On Site"].includes(job.status)).length;
  const recentActivity = activityLogs.slice(0, 5);

  return (
    <aside className="order-1 rounded-2xl border border-white/10 bg-[#0b1628] p-5 shadow-xl shadow-black/10 xl:order-none">
      <h2 className="text-sm font-black uppercase tracking-[0.16em] text-slate-400">Quick Actions</h2>
      <div className="mt-4 grid gap-2">
        <button type="button" onClick={onAddJob} className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-black text-white hover:bg-blue-500">
          <Plus className="h-4 w-4" />
          Add New Job
        </button>
        {isAdmin ? (
          <>
            <button type="button" onClick={() => alert("Open Technician Center from the sidebar to add a technician.")} className="flex items-center gap-2 rounded-xl bg-white/10 px-4 py-3 text-sm font-black text-slate-100 hover:bg-white/15">
              <Users className="h-4 w-4" />
              Add Technician
            </button>
            <button type="button" onClick={onReport} className="flex items-center gap-2 rounded-xl bg-white/10 px-4 py-3 text-sm font-black text-slate-100 hover:bg-white/15">
              <FileSpreadsheet className="h-4 w-4" />
              Generate Report
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={onAssign} className="flex items-center gap-2 rounded-xl bg-white/10 px-4 py-3 text-sm font-black text-slate-100 hover:bg-white/15">
              <Users className="h-4 w-4" />
              Assign Technician
            </button>
            <button type="button" onClick={onMap} className="flex items-center gap-2 rounded-xl bg-white/10 px-4 py-3 text-sm font-black text-slate-100 hover:bg-white/15">
              <MapPin className="h-4 w-4" />
              View Live Map
            </button>
          </>
        )}
      </div>

      <div className="mt-6">
        <h3 className="text-sm font-black uppercase tracking-[0.16em] text-slate-400">{isAdmin ? "System Summary" : "Today's Summary"}</h3>
        <div className="mt-3 grid gap-2">
          {isAdmin ? (
            <>
              <PanelMetric label="Total Technicians" value={technicians.length} />
              <PanelMetric label="Active Technicians" value={activeTechniciansCount} />
              <PanelMetric label="Parts Inventory" value="Ready" />
              <PanelMetric label="Unread Messages" value="0" />
              <PanelMetric label="System Uptime" value="Live" />
            </>
          ) : (
            <>
              <PanelMetric label="Jobs Today" value={todayJobs.length} />
              <PanelMetric label="In Progress" value={inProgressToday} />
              <PanelMetric label="Completed" value={completedToday} />
              <PanelMetric label="Cancelled" value={cancelledToday} />
              <PanelMetric label="Dry Runs" value={dryRunsToday} />
            </>
          )}
        </div>
      </div>

      {!isAdmin && (
        <div className="mt-6">
          <h3 className="text-sm font-black uppercase tracking-[0.16em] text-slate-400">My Assignments</h3>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <PanelMetric label="In Progress" value={stats.inProgress + stats.working + stats.enRoute} />
            <PanelMetric label="Completed" value={stats.completed} />
          </div>
        </div>
      )}

      {isAdmin && (
        <div className="mt-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black uppercase tracking-[0.16em] text-slate-400">Recent Activity</h3>
            <span className="text-xs font-bold text-blue-300">View all</span>
          </div>
          <div className="mt-3 space-y-2">
            {recentActivity.length === 0 ? (
              <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm font-semibold text-slate-400">No important activity yet.</div>
            ) : (
              recentActivity.map((activity) => (
                <div key={activity.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <p className="text-sm font-bold text-slate-100">{activity.message || activity.title}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">{activity.time || "Now"}</p>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </aside>
  );
}

function PanelMetric({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
      <span className="text-xs font-bold text-slate-400">{label}</span>
      <span className="text-sm font-black text-white">{value}</span>
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
    <label className="grid gap-1 text-xs font-bold uppercase tracking-wide text-slate-300">
      <span>{label}</span>
      <input
        type={type}
        className="h-9 w-full rounded-lg border border-white/10 bg-[#111f33] px-3 text-sm font-semibold text-white outline-none placeholder:text-slate-500 focus:border-blue-400"
        placeholder={placeholder}
        list={list || undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function Select({ label, value, onChange, options }) {
  const isJobStatus = label === "Status";
  return (
    <label className="grid gap-1 text-xs font-bold uppercase tracking-wide text-slate-300">
      <span>{label}</span>
      <select
        className={`${darkSelectClass} h-9 w-full px-3 text-sm font-semibold`}
        style={isJobStatus ? jobStatusControlStyle(value) : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((option) => (
          <option style={darkOptionStyle} key={option} value={option}>
            {isJobStatus ? jobStatusLabel(option) : option}
          </option>
        ))}
      </select>
    </label>
  );
}

function CompactAssignTechnicianModal({ job, technicians, filters, onFiltersChange, onAssign, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-4xl rounded-2xl border border-white/10 bg-[#0b1628] p-4 shadow-2xl shadow-black/40">
        <div className="flex flex-col gap-3 border-b border-white/10 pb-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-blue-300">Assign Technician</p>
            <h2 className="mt-1 text-lg font-black text-white">{job?.reference || job?.company || `Job ${job?.id || ""}`}</h2>
            <p className="mt-0.5 text-xs font-semibold text-slate-400">{job?.location || "No location"} · {extractService(job)}</p>
          </div>
          <button type="button" onClick={onClose} className="h-9 rounded-lg bg-white/10 px-3 text-xs font-bold text-slate-100 hover:bg-white/15">
            Close
          </button>
        </div>

        <div className="mt-3 grid gap-2 md:grid-cols-[1fr_120px_1fr_150px_100px_100px]">
          <input className="h-9 rounded-lg border border-white/10 bg-[#111f33] px-3 text-sm font-semibold text-white outline-none placeholder:text-slate-500 focus:border-blue-400" placeholder="City" value={filters.city} onChange={(event) => onFiltersChange((current) => ({ ...current, city: event.target.value }))} />
          <input className="h-9 rounded-lg border border-white/10 bg-[#111f33] px-3 text-sm font-semibold text-white outline-none placeholder:text-slate-500 focus:border-blue-400" placeholder="State" value={filters.state} onChange={(event) => onFiltersChange((current) => ({ ...current, state: event.target.value }))} />
          <input className="h-9 rounded-lg border border-white/10 bg-[#111f33] px-3 text-sm font-semibold text-white outline-none placeholder:text-slate-500 focus:border-blue-400" placeholder="Service" value={filters.service} onChange={(event) => onFiltersChange((current) => ({ ...current, service: event.target.value }))} />
          <select className={`${darkSelectClass} h-9 px-3 text-sm font-semibold`}>
            <option style={darkOptionStyle}>Availability</option>
            <option style={darkOptionStyle}>Available</option>
            <option style={darkOptionStyle}>Busy</option>
            <option style={darkOptionStyle}>Off Duty</option>
          </select>
          <button type="button" className="h-9 rounded-lg border border-white/10 bg-white/10 px-3 text-xs font-bold text-slate-100 hover:bg-white/15">Nearby</button>
          <button type="button" className="h-9 rounded-lg border border-white/10 bg-white/10 px-3 text-xs font-bold text-slate-100 hover:bg-white/15">Favorite</button>
        </div>

        <div className="mt-3 max-h-[58vh] overflow-auto rounded-xl border border-white/10">
          {technicians.length === 0 ? (
            <div className="p-6 text-center text-sm font-semibold text-slate-400">No matching approved technicians.</div>
          ) : (
            technicians.map((technician) => (
              <div key={technician.id} className="grid gap-3 border-b border-white/10 bg-white/[0.03] px-3 py-2 text-sm last:border-b-0 md:grid-cols-[minmax(0,1fr)_130px_90px_90px_90px] md:items-center">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-500/15 text-xs font-black text-blue-100">
                    {initials(technician.full_name)}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-black text-white">{technician.full_name || "Unnamed technician"}</p>
                    <p className="truncate text-xs font-semibold text-slate-400">{technician.phone || "No phone"} · {[technician.city, technician.state].filter(Boolean).join(", ") || "No city"}</p>
                  </div>
                </div>
                <span className="text-xs font-semibold text-slate-400">Distance N/A</span>
                <span className="rounded-full bg-white/10 px-2 py-1 text-center text-xs font-bold text-slate-200">{technician.availability || "Available"}</span>
                <span className="text-center text-xs font-black text-amber-300">★ {Number(technician.rating || 0).toFixed(1)}</span>
                <button type="button" onClick={() => onAssign(job, technician)} className="h-8 rounded-lg bg-blue-600 px-3 text-xs font-bold text-white hover:bg-blue-500">
                  Assign
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function UpdatesModal({ job, onClose, onSave }) {
  const [value, setValue] = useState(job.updates || "");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-[#0b1628] p-4 shadow-2xl shadow-black/40">
        <div className="flex items-start justify-between gap-3 border-b border-white/10 pb-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-blue-300">Job Updates</p>
            <h2 className="mt-1 text-lg font-black text-white">{job.reference || job.company || `Job ${job.id}`}</h2>
          </div>
          <button type="button" onClick={onClose} className="h-9 rounded-lg bg-white/10 px-3 text-xs font-bold text-slate-100 hover:bg-white/15">Close</button>
        </div>
        <textarea
          className="mt-4 min-h-40 w-full rounded-xl border border-white/10 bg-[#111f33] p-3 text-sm font-semibold text-white outline-none focus:border-blue-400"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-9 rounded-lg border border-white/10 bg-white/10 px-4 text-sm font-bold text-slate-100 hover:bg-white/15">Cancel</button>
          <button type="button" onClick={() => onSave(value)} className="h-9 rounded-lg bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-500">Save Updates</button>
        </div>
      </div>
    </div>
  );
}

function JobDocumentsModal({ job, isAdmin, currentUserName, onUpload, onDeleted, onClose }) {
  const [documentType, setDocumentType] = useState("Invoice photo");
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [safeModeMessage, setSafeModeMessage] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);

  async function loadDocuments() {
    setLoading(true);
    setSafeModeMessage("");
    const fallbackDocument = fallbackJobDocument(job);
    const { data, error } = await supabase
      .from("job_files")
      .select("*")
      .eq("job_id", job.id)
      .order("created_at", { ascending: false });

    if (error) {
      const fallbackDocuments = fallbackDocument ? [fallbackDocument] : [];
      setSafeModeMessage(`Safe mode: job_files table is unavailable. Showing job photo reference only. ${error.message}`);
      setDocuments(fallbackDocuments);
      setLoading(false);
      return fallbackDocuments;
    }

    const fileRows = Array.isArray(data) ? data.map(normalizeJobFileRecord) : [];
    const hasFallback = fallbackDocument && !fileRows.some((document) => document.url === fallbackDocument.url);
    const nextDocuments = hasFallback ? [...fileRows, fallbackDocument] : fileRows;
    setDocuments(nextDocuments);
    setLoading(false);
    return nextDocuments;
  }

  useEffect(() => {
    loadDocuments();
  }, [job]);

  function canDeleteDocument(document) {
    if (isAdmin) return true;
    if (!document || !currentUserName) return false;
    const uploadedBy = document.uploadedBy || document.uploaded_by || "";
    if (!uploadedBy) return false;
    return normalizeText(uploadedBy) === normalizeText(currentUserName);
  }

  async function confirmDeleteDocument() {
    if (!deleteTarget) return;
    if (!canDeleteDocument(deleteTarget)) {
      alert("You can only delete files you uploaded.");
      setDeleteTarget(null);
      return;
    }

    let warning = "";
    if (deleteTarget.recordId) {
      const { error: deleteRecordError } = await supabase
        .from("job_files")
        .delete()
        .eq("id", deleteTarget.recordId);
      if (deleteRecordError) {
        alert(deleteRecordError.message);
        setDeleteTarget(null);
        return;
      }
    } else if (!deleteTarget.isFallback) {
      alert("Safe mode: no file record was found to delete.");
      setDeleteTarget(null);
      return;
    }

    const storagePath = deleteTarget.storagePath || storagePathFromPublicUrl(deleteTarget.url);
    if (storagePath) {
      const { error: removeError } = await supabase.storage.from("job-photos").remove([storagePath]);
      if (removeError) {
        warning = `File deleted successfully. Warning: ${removeError.message}`;
        setSafeModeMessage(`Storage delete warning: ${removeError.message}`);
      }
    } else {
      warning = "File deleted successfully. Warning: storage path was not available.";
    }

    const remainingDocuments = documents.filter((document) => document.id !== deleteTarget.id);
    setDocuments(remainingDocuments);
    await onDeleted(deleteTarget, warning, remainingDocuments);
    setDeleteTarget(null);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[92vh] w-full max-w-3xl overflow-auto rounded-2xl border border-white/10 bg-[#0b1628] p-4 shadow-2xl shadow-black/40">
        <div className="flex flex-col gap-3 border-b border-white/10 pb-3 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-blue-300">Documents</p>
            <h2 className="mt-1 text-lg font-black text-white">{job.reference || job.company || `Job ${job.id}`}</h2>
            <p className="mt-0.5 text-xs font-semibold text-slate-400">Invoice photos, job photos, receipts, PDFs, and related files.</p>
          </div>
          <button type="button" onClick={onClose} className="h-9 rounded-lg bg-white/10 px-3 text-xs font-bold text-slate-100 hover:bg-white/15">Close</button>
        </div>

        <div className="mt-4 grid gap-2 rounded-xl border border-white/10 bg-white/5 p-3 md:grid-cols-[180px_1fr] md:items-center">
          <select value={documentType} onChange={(event) => setDocumentType(event.target.value)} className={`${darkSelectClass} h-9 px-3 text-sm font-bold`}>
            {["Invoice photo", "Receipt", "Job photo", "Damage photo", "Before/after photo", "Other document"].map((type) => (
              <option key={type} style={darkOptionStyle}>{type}</option>
            ))}
          </select>
          <label className="inline-flex h-9 cursor-pointer items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-500">
            Upload Invoice / Photo
            <input type="file" className="hidden" accept="image/*,application/pdf" onChange={async (event) => {
              await onUpload(event.target.files[0], documentType);
              event.target.value = "";
            }} />
          </label>
        </div>

        {safeModeMessage && (
          <div className="mt-4 rounded-xl border border-amber-300/30 bg-amber-500/10 p-3 text-sm font-semibold text-amber-100">
            {safeModeMessage}
          </div>
        )}

        <div className="mt-4 overflow-hidden rounded-xl border border-white/10">
          {loading ? (
            <div className="p-6 text-center text-sm font-semibold text-slate-400">Loading documents...</div>
          ) : documents.length === 0 ? (
            <div className="p-6 text-center text-sm font-semibold text-slate-400">
              No uploaded invoice photos, receipts, PDFs, or job photos found for this job.
            </div>
          ) : (
            documents.map((document) => (
              <div key={document.id} className="grid gap-3 border-b border-white/10 bg-white/[0.03] p-3 text-sm last:border-b-0 md:grid-cols-[1fr_120px_150px_120px] md:items-center">
                <div className="min-w-0">
                  <p className="truncate font-black text-white">{document.name}</p>
                  <p className="text-xs font-semibold text-slate-400">{document.type} · Uploaded by {document.uploadedBy}</p>
                </div>
                <span className="text-xs font-semibold text-slate-400">{document.uploadedAt ? new Date(document.uploadedAt).toLocaleString() : "Date not stored"}</span>
                <a href={document.url} target="_blank" rel="noreferrer" className="h-9 rounded-lg bg-white/10 px-3 py-2 text-center text-xs font-bold text-slate-100 hover:bg-white/15">
                  Preview / Open
                </a>
                {canDeleteDocument(document) ? (
                  <button type="button" onClick={() => setDeleteTarget(document)} className="h-9 rounded-lg bg-red-600 px-3 text-xs font-bold text-white hover:bg-red-500">
                    Delete
                  </button>
                ) : (
                  <span className="text-center text-xs font-bold text-slate-500">View only</span>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {deleteTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <h3 className="text-xl font-black text-slate-950">Delete File</h3>
            <p className="mt-2 text-sm text-slate-600">Are you sure you want to delete this uploaded file?</p>
            <p className="mt-3 truncate rounded-xl bg-slate-50 p-3 text-sm font-bold text-slate-700">{deleteTarget.name}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setDeleteTarget(null)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">
                Cancel
              </button>
              <button type="button" onClick={confirmDeleteDocument} className="rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Editable({ value, onChange }) {
  return (
    <input
      className={`${tableControlClass} w-32 px-2 py-1`}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function MoneyInput({ value, onChange, className = "" }) {
  return (
    <input
      type="number"
      className={`${tableControlClass} w-24 px-2 py-1 ${className}`}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function MiniMetric({ label, value }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5">
      <p className="text-[10px] font-black uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-0.5 truncate text-xs font-semibold text-slate-200">{value}</p>
    </div>
  );
}

function JobNearbyPartsModal({ job, onClose }) {
  const defaultLocation = jobPartsLocation(job);
  const [searchLocation, setSearchLocation] = useState(defaultLocation);
  const location = searchLocation.trim() || defaultLocation;
  const categories = useMemo(() => nearbyPartsResults(location, job), [job, location]);
  const jobLabel = job?.reference || job?.id || "Job";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
      <div className="max-h-[92vh] w-full max-w-4xl overflow-auto rounded-3xl bg-white p-6 shadow-2xl">
        <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-950">Nearby Parts for Job #{jobLabel}</h2>
            <p className="mt-1 text-sm text-slate-500">{location || "No location selected"}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">Close</button>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
          <label className="space-y-1 text-sm font-medium">
            Custom search location
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <input
                className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 outline-none focus:border-blue-500"
                value={searchLocation}
                onChange={(event) => setSearchLocation(event.target.value)}
                placeholder="El Paso, TX"
              />
            </div>
          </label>
          {location && (
            <a href={mapLink(location)} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700">
              <MapPin className="h-4 w-4" />
              Open Google Maps
            </a>
          )}
        </div>

        {!location ? (
          <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-700">No location available for parts search.</div>
        ) : (
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {categories.map((item) => (
              <a key={item.category} href={item.mapUrl} target="_blank" rel="noreferrer" className="inline-flex items-center justify-between gap-3 rounded-2xl border border-slate-200 p-4 text-left font-bold text-slate-800 hover:border-blue-300 hover:bg-blue-50">
                <span>{item.category}</span>
                <MapPin className="h-4 w-4 shrink-0 text-blue-600" />
              </a>
            ))}
          </div>
        )}
      </div>
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
      <p className="mt-1 max-h-16 overflow-auto whitespace-pre-wrap text-sm font-semibold text-slate-200">{value || "Not provided"}</p>
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

function googleMapsNearbyLink(category, location) {
  const searchTerm = category === "Road Service" ? "mobile truck repair" : category;
  return `https://www.google.com/maps/search/${encodeURIComponent(`${searchTerm} near ${location || ""}`).replace(/%20/g, "+")}`;
}

function jobPartsLocation(job) {
  const exactLocation = String(job?.location || "").trim();
  if (exactLocation) return exactLocation;

  const parsed = parseLocation(job?.location);
  const parsedLocation = [parsed.city, parsed.state].filter(Boolean).join(", ");
  if (parsedLocation) return parsedLocation;

  return [job?.city, job?.state].filter(Boolean).join(", ");
}

function nearbyPartsResults(location, job) {
  const normalizedLocation = String(location || "").trim();
  const cacheKey = `${normalizedLocation.toLowerCase()}|${jobPartsSignal(job)}`;
  if (nearbyPartsCache.has(cacheKey)) return nearbyPartsCache.get(cacheKey);

  const results = prioritizedPartsCategories(job).map((category) => ({
    category,
    mapUrl: googleMapsNearbyLink(category, normalizedLocation),
  }));

  nearbyPartsCache.set(cacheKey, results);
  return results;
}

function prioritizedPartsCategories(job) {
  const text = jobPartsSignal(job);
  const priority = [];

  if (/\b(tire|tires|llanta|flat)\b/i.test(text)) priority.push("Commercial Tire Shops");
  if (/\b(brake|brakes|air leak|chamber)\b/i.test(text)) priority.push("Truck Parts Suppliers", "Trailer Parts");
  if (/\b(battery|no start)\b/i.test(text)) priority.push("Battery Suppliers");
  if (/\b(hose|hydraulic)\b/i.test(text)) priority.push("Hydraulic Hose Shops");

  return [...new Set([...priority, ...nearbyPartsCategories])];
}

function jobPartsSignal(job) {
  return [job?.updates, job?.services, job?.service, job?.status, job?.company, job?.location]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
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
  const importantActions = new Set(["created", "updated", "status_changed", "assigned", "tech_payment", "deleted"]);
  const importantFields = new Set(["job", "status", "technician", "invoice", "techPaymentStatus", "photo_url"]);
  const importantChangeLogs = changeLogs
    .filter((item) => importantActions.has(item.action) || importantFields.has(item.field_name))
    .slice(0, 8);
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
    ...importantChangeLogs.map((item) => ({
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
    technician.full_name,
    technician.phone,
    technician.city,
    technician.state,
    technician.availability,
    splitServices(technician.services).length,
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

function technicianCoverageText(technician) {
  return [technician.coverage, technician.coverage_areas]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function technicianAssignmentScore(technician, city, state) {
  const homeCity = String(technician.city || "").trim().toLowerCase();
  const homeState = String(technician.state || "").trim().toLowerCase();
  const coverage = technicianCoverageText(technician);
  let score = 0;

  if (city && coverage.includes(city)) score += 50;
  if (state && coverage.includes(state)) score += 25;
  if (city && homeCity === city) score += 20;
  if (state && homeState === state) score += 10;
  return score;
}

function technicianAvailabilityRank(status) {
  const normalized = String(status || "").toLowerCase();
  if (normalized.includes("available")) return 4;
  if (normalized.includes("busy")) return 3;
  if (normalized.includes("off")) return 2;
  return 1;
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

function firstLine(value) {
  return String(value || "").split(/\r?\n/).find((line) => line.trim())?.trim() || "";
}

function fileNameFromUrl(url) {
  try {
    return decodeURIComponent(new URL(url).pathname.split("/").pop() || "Uploaded file");
  } catch {
    return String(url || "").split("/").pop() || "Uploaded file";
  }
}

function documentTypeFromUrl(url) {
  return String(url || "").toLowerCase().includes(".pdf") ? "PDF" : "Image";
}

function fallbackJobDocument(job) {
  if (!job?.photo_url) return null;
  return {
    id: `photo-url-${job.id}`,
    recordId: "",
    name: fileNameFromUrl(job.photo_url),
    url: job.photo_url,
    type: documentTypeFromUrl(job.photo_url),
    uploadedAt: job.updatedAt || job.createdAt || "",
    uploadedBy: "Not stored",
    storagePath: storagePathFromPublicUrl(job.photo_url),
    isFallback: true,
  };
}

function normalizeJobFileRecord(row) {
  const url = row.file_url || row.url || row.photo_url || row.public_url || "";
  return {
    id: `job-file-${row.id || url}`,
    recordId: row.id || "",
    name: row.file_name || row.name || fileNameFromUrl(url),
    url,
    type: row.document_type || row.file_type || documentTypeFromUrl(url),
    uploadedAt: row.created_at || row.uploaded_at || "",
    uploadedBy: row.uploaded_by || row.created_by || "Not stored",
    storagePath: row.storage_path || storagePathFromPublicUrl(url),
    isFallback: false,
  };
}

function storagePathFromPublicUrl(url) {
  const marker = "/job-photos/";
  const value = String(url || "");
  if (!value.includes(marker)) return "";
  return decodeURIComponent(value.split(marker).pop() || "");
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
  return <th className="whitespace-nowrap border-b border-white/10 px-4 py-2.5 text-[11px] font-black">{children}</th>;
}

function Td({ children, className = "" }) {
  return <td className={`border-b border-white/10 px-4 py-1.5 align-middle ${className}`}>{children}</td>;
}

function IconAction({ title, onClick, className = "", children }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-lg transition ${className}`}
    >
      {children}
    </button>
  );
}

function canonicalJobStatus(status) {
  const value = String(status || "New").trim().toLowerCase();
  const aliases = {
    canceled: "Cancelled",
    cancelled: "Cancelled",
    declined: "Cancelled",
    working: "In Progress",
    assigned: "In Progress",
    "tech accepted": "In Progress",
    invoiced: "Completed",
    paid: "Completed",
    "dry run": "Dry Run",
    "need review": "Need Review",
    "waiting parts": "Waiting Parts",
    "on site": "On Site",
    "en route": "En Route",
    pending: "Pending",
    completed: "Completed",
    new: "New",
  };
  return aliases[value] || status || "New";
}

function jobStatusVisual(status) {
  return jobStatusVisuals[canonicalJobStatus(status)] || jobStatusVisuals.New;
}

function jobStatusControlStyle(status) {
  const visual = jobStatusVisual(status);
  return {
    backgroundColor: visual.background,
    borderColor: visual.border,
    color: visual.text,
    transition: "background-color 0.2s ease, border-color 0.2s ease",
  };
}

function jobStatusLabel(status) {
  const label = status || "New";
  return `${jobStatusVisual(label).dot} ${label}`;
}

function JobStatusBadge({ status, className = "" }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-bold ${className}`}
      style={jobStatusControlStyle(status)}
      title={`${jobStatusVisual(status).icon} ${status || "New"}`}
    >
      {jobStatusLabel(status)}
    </span>
  );
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

function buildJobActivityMessage(field, oldValue, value, userName) {
  if (field === "status") return `${userName} changed job status to "${value}"`;
  if (field === "invoice") return `${userName} updated invoice status to "${value}"`;
  if (String(field).toLowerCase().includes("eta")) return `${userName} updated ETA`;
  return `${userName} updated ${titleFromText(field)}`;
}

function isPaidStatus(value) {
  return String(value || "").trim().toLowerCase() === "paid";
}

function dateInputValue(value) {
  if (!value) return "";
  return String(value).slice(0, 10);
}

function valueActuallyChanged(oldValue, newValue) {
  return String(oldValue ?? "").trim() !== String(newValue ?? "").trim();
}

function titleFromText(value) {
  return String(value || "")
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function extractEta(updates) {
  const match = String(updates || "").match(/eta\s*:?\s*([^\n\r]+)/i);
  return match?.[1]?.trim() || "";
}
