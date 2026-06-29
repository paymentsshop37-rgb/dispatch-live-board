import React, { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Activity,
  ClipboardList,
  Cloud,
  CreditCard,
  Building2,
  FileText,
  HelpCircle,
  LayoutDashboard,
  LogOut,
  Save,
  Settings,
  Shield,
  ShieldCheck,
  Users,
} from "lucide-react";
import DispatchLiveUpdatesPage from "./DispatchLiveUpdatesPage.jsx";
import { AUTH_USERS, clearAuthSession } from "./authUsers";
import { ActivityLogPage, logActivity } from "./modules/activity";
import { AdministrationDashboard } from "./modules/administration";
import { BillingDashboard } from "./modules/billing";
import { CustomerCRM } from "./modules/customers";
import { ExecutiveDashboard } from "./modules/executive";
import { TechnicianCenter, TechnicianRegistrationPortal } from "./modules/technicians";
import { UserManagement } from "./modules/users";
import { getPermissions, normalizeRole } from "./modules/permissions";
import { supabase } from "./lib/supabase";

const sidebarItems = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["admin", "dispatcher"] },
  { id: "dispatch", label: "Dispatch Center", icon: ClipboardList },
  { id: "technicians", label: "Technician Center", icon: Users, requires: "canViewTechnicianCenter" },
  { id: "customers", label: "Customers", icon: Building2, adminOnly: true },
  { id: "billing", label: "Billing", icon: CreditCard, adminOnly: true },
  { id: "administration", label: "Administration", icon: Shield, adminOnly: true },
  { id: "users", label: "Users", icon: Users, adminOnly: true },
  { id: "activity", label: "Activity Log", icon: Activity, roles: ["admin", "dispatcher"] },
  { id: "reports", label: "Reports", icon: BarChart3, adminOnly: true },
  { id: "settings", label: "Settings", icon: Settings, adminOnly: true },
];

const sidebarSections = [
  {
    label: "Dispatch",
    items: [
      { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["admin", "dispatcher"] },
      { id: "dispatch", label: "Dispatch Board", icon: ClipboardList },
      { id: "technicians-quick", label: "Technicians", icon: Users, target: "technicians", requires: "canViewTechnicianCenter" },
      { id: "activity", label: "Activity Log", icon: Activity, roles: ["admin", "dispatcher"] },
      { id: "customers", label: "Customers", icon: Building2, adminOnly: true },
      { id: "reports", label: "Reports", icon: BarChart3, target: "dashboard", adminOnly: true },
    ],
  },
  {
    label: "Operations",
    items: [
      { id: "technicians", label: "Technician Center", icon: Users, requires: "canViewTechnicianCenter" },
      { id: "billing", label: "Billing", icon: CreditCard, adminOnly: true },
      { id: "invoices", label: "Invoices", icon: FileText, target: "billing", adminOnly: true },
    ],
  },
  {
    label: "Administration",
    items: [
      { id: "administration", label: "Administration", icon: Shield, adminOnly: true },
      { id: "users", label: "Users", icon: Users, adminOnly: true },
      { id: "settings", label: "Settings", icon: Settings, target: "administration", adminOnly: true },
    ],
  },
];

export default function App() {
  const [activeView, setActiveView] = useState("dispatch");
  const [session, setSession] = useState(getSession());
  const isPublicRegistration = window.location.pathname === "/technician-registration";
  const isAuthenticated = Boolean(session.isAuthenticated);

  useEffect(() => {
    function syncSession() {
      setSession(getSession());
    }

    window.addEventListener("nttr-auth-changed", syncSession);
    window.addEventListener("storage", syncSession);
    window.addEventListener("focus", syncSession);

    return () => {
      window.removeEventListener("nttr-auth-changed", syncSession);
      window.removeEventListener("storage", syncSession);
      window.removeEventListener("focus", syncSession);
    };
  }, []);

  useEffect(() => {
    if (!isAuthenticated && !isPublicRegistration && window.location.pathname !== "/") {
      window.history.replaceState({}, "", "/");
    }
  }, [isAuthenticated, isPublicRegistration]);

  const role = normalizeRole(session.role) || "dispatcher";
  const permissions = useMemo(() => getPermissions(role), [role]);
  const isAdmin = role === "admin";
  const visibleSidebarSections = useMemo(
    () =>
      sidebarSections
        .map((section) => ({
          ...section,
          items: section.items.filter((item) => canShowSidebarItem(item, role, permissions)),
        }))
        .filter((section) => section.items.length > 0),
    [role, permissions]
  );

  const visibleItems = sidebarItems.filter((item) => {
    if (item.adminOnly) return isAdmin;
    if (item.roles) return item.roles.includes(role);
    if (item.requires) return Boolean(permissions[item.requires]);
    if (item.id === "dispatch") return true;
    return true;
  });
  const canAccessActiveView = canAccessView(activeView, role, permissions);

  useEffect(() => {
    if (!role && !visibleItems.some((item) => item.id === activeView)) {
      setActiveView("dispatch");
    }
  }, [activeView, role, visibleItems]);

  if (isPublicRegistration) {
    return <TechnicianRegistrationPortal />;
  }

  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <aside className="flex bg-[#08111f] text-white lg:fixed lg:inset-y-0 lg:w-60 lg:flex-col">
        <div className="flex w-full flex-col gap-4 p-4 lg:min-h-screen">
          <div className="border-b border-white/10 pb-5">
            <p className="text-3xl font-black tracking-[0.18em] text-white">NTTR</p>
            <p className="mt-2 text-xs font-semibold leading-5 text-slate-400">National Truck Trailer Repair</p>
          </div>

          <nav className="flex gap-3 overflow-x-auto lg:flex-1 lg:flex-col lg:overflow-visible">
            {visibleSidebarSections.map((section) => (
              <div key={section.label} className="min-w-max lg:min-w-0">
                <p className="mb-2 px-3 text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">{section.label}</p>
                <div className="flex gap-2 lg:flex-col">
                  {section.items.map((item) => {
                    const Icon = item.icon;
                    const target = item.target || item.id;
                    const isActive = activeView === target;

                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setActiveView(target)}
                        className={`flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-bold transition ${
                          isActive
                            ? "bg-blue-600 text-white shadow-sm"
                            : "text-slate-300 hover:bg-white/10 hover:text-white"
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          {isAdmin && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-400">System Status</p>
            <div className="grid gap-2 text-xs font-semibold text-slate-200">
              <div className="flex items-center gap-2">
                <Save className="h-4 w-4 text-emerald-300" />
                Auto Save Enabled
              </div>
              <div className="flex items-center gap-2">
                <Cloud className="h-4 w-4 text-blue-300" />
                Cloud Backup Active
              </div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-amber-300" />
                Delete Protection Enabled
              </div>
            </div>
          </div>
          )}

          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Signed In</p>
            <p className="mt-2 truncate text-sm font-bold">{session.name || "Not signed in"}</p>
            <p className="mt-1 text-xs capitalize text-slate-400">{role === "admin" ? "Administrator" : role || "Access required"}</p>
            <div className="mt-3 flex items-center gap-2 text-xs font-bold text-emerald-300">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              Online
            </div>
          </div>

          <div className="grid gap-2 border-t border-white/10 pt-4">
            <button type="button" className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold text-slate-300 hover:bg-white/10 hover:text-white">
              <HelpCircle className="h-4 w-4" />
              Help Center
            </button>
            <button type="button" onClick={clearAuthSession} className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold text-slate-300 hover:bg-white/10 hover:text-white">
              <LogOut className="h-4 w-4" />
              Logout
            </button>
          </div>
        </div>
      </aside>

      <main className="min-h-screen w-full max-w-none min-w-0 overflow-x-hidden lg:pl-60">
        <div className="flex min-h-[72px] items-center border-b border-slate-800 bg-[#0b1628] px-4 py-4 text-white shadow-sm md:px-8">
          <div className="flex w-full max-w-none items-center justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-blue-300">NTTR Command Center</p>
              <h2 className="text-2xl font-bold">{activeView === "dispatch" ? "Dispatch Cockpit" : viewTitle(activeView)}</h2>
            </div>
            <div className="hidden items-center gap-3 md:flex">
              <div className="rounded-2xl bg-white/10 px-4 py-2 text-sm font-bold capitalize text-slate-100">
                <p className="leading-tight">{session.name || session.username || "Not signed in"}</p>
                <p className="text-xs font-semibold text-slate-400">{roleLabel(role)}</p>
              </div>
            </div>
          </div>
        </div>

        {!canAccessActiveView && <AccessDenied view={viewTitle(activeView)} />}
        {canAccessActiveView && activeView === "dashboard" && (isAdmin ? <ExecutiveDashboard onOpenActivity={() => setActiveView("activity")} /> : <DispatcherDashboard />)}
        {canAccessActiveView && activeView === "dispatch" && <DispatchLiveUpdatesPage />}
        {canAccessActiveView && activeView === "technicians" && <TechnicianCenter />}
        {canAccessActiveView && activeView === "customers" && <CustomerCRM />}
        {canAccessActiveView && activeView === "billing" && <BillingDashboard />}
        {canAccessActiveView && activeView === "administration" && <AdministrationDashboard session={session} role={role} />}
        {canAccessActiveView && activeView === "users" && <UserManagement currentUser={session} />}
        {canAccessActiveView && activeView === "activity" && <ActivityLogPage role={role} />}
      </main>
    </div>
  );
}

function canShowSidebarItem(item, role, permissions) {
  if (item.adminOnly) return role === "admin";
  if (item.roles) return item.roles.includes(role);
  if (item.requires) return Boolean(permissions[item.requires]);
  return true;
}

function canAccessView(view, role, permissions) {
  if (view === "dispatch") return true;
  if (view === "dashboard") return role === "admin" || role === "dispatcher";
  if (view === "technicians") return Boolean(permissions.canViewTechnicianCenter);
  if (view === "activity") return role === "admin" || role === "dispatcher";
  if (["customers", "billing", "administration", "users", "reports", "settings"].includes(view)) {
    return role === "admin";
  }
  return false;
}

function roleLabel(role) {
  if (role === "admin") return "Administrator";
  if (role === "dispatcher") return "Dispatcher";
  return "Access required";
}

function getSession() {
  const username = localStorage.getItem("currentUser") || "";
  const storedUser = username ? AUTH_USERS[username] : null;

  if (username && !storedUser) {
    clearAuthSession();
    return {
      username: "",
      name: "",
      role: "dispatcher",
      isAuthenticated: false,
    };
  }

  return {
    username,
    name: storedUser?.name || localStorage.getItem("currentUserName") || "",
    role: storedUser?.role || localStorage.getItem("currentUserRole") || "dispatcher",
    isAuthenticated: Boolean(storedUser),
  };
}

function viewTitle(view) {
  const titles = {
    dashboard: "Dashboard",
    dispatch: "Dispatch Center",
    technicians: "Technician Center",
    customers: "Customers",
    billing: "Billing",
    administration: "Administration",
    users: "Users",
    activity: "Activity Log",
  };

  return titles[view] || "Dispatch Center";
}

function LoginScreen() {
  const [accessCode, setAccessCode] = useState("");

  function handleLogin() {
    const input = accessCode.trim();
    const userFound = Object.entries(AUTH_USERS).find(
      ([username, user]) => input === `${username}/${user.password}`
    );

    if (!userFound) {
      logActivity({
        entityType: "auth",
        entityId: "login",
        action: "Login Failure",
        description: "Invalid access code attempt",
        createdBy: "Unknown",
      });
      alert("Invalid username or password");
      return;
    }

    const [username, user] = userFound;
    localStorage.setItem("currentUser", username);
    localStorage.setItem("currentUserName", user.name);
    localStorage.setItem("currentUserRole", user.role);
    logActivity({
      entityType: "auth",
      entityId: username,
      action: "Login Success",
      description: `${user.name} signed in`,
      createdBy: user.name,
      metadata: { role: user.role },
    });
    window.dispatchEvent(new Event("nttr-auth-changed"));
  }

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
          onChange={(event) => setAccessCode(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") handleLogin();
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

function DispatcherDashboard() {
  const [jobs, setJobs] = useState([]);

  useEffect(() => {
    let mounted = true;
    async function loadOperationalSummary() {
      const { data, error } = await supabase.from("jobs").select("id,status,job_date");
      if (!mounted) return;
      setJobs(error ? [] : data || []);
    }
    loadOperationalSummary();
    return () => {
      mounted = false;
    };
  }, []);

  const today = new Date().toISOString().slice(0, 10);
  const summary = {
    totalJobs: jobs.length,
    activeJobs: jobs.filter((job) => !["completed", "cancelled", "canceled", "paid"].includes(String(job.status || "").toLowerCase())).length,
    pendingJobs: jobs.filter((job) => String(job.status || "").toLowerCase().includes("pending") || String(job.status || "").toLowerCase() === "new").length,
    completedToday: jobs.filter((job) => String(job.status || "").toLowerCase().includes("completed") && String(job.job_date || "").slice(0, 10) === today).length,
    cancelados: jobs.filter((job) => ["cancelled", "canceled", "cancelado"].some((status) => String(job.status || "").toLowerCase().includes(status))).length,
    dryRuns: jobs.filter((job) => String(job.status || "").toLowerCase().includes("dry")).length,
  };

  return (
    <div className="min-h-screen w-full max-w-none bg-slate-100 p-4 md:p-8">
      <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-600">Dispatcher Dashboard</p>
        <h1 className="mt-1 text-3xl font-black text-slate-950">Daily Dispatch Workspace</h1>
        <p className="mt-2 max-w-3xl text-sm font-medium text-slate-500">
          Use the Dispatch Board for live jobs and Technician Center for approved technician lookup.
        </p>
      </div>
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <DispatcherMetric title="Total Jobs" value={summary.totalJobs} />
        <DispatcherMetric title="Active Jobs" value={summary.activeJobs} />
        <DispatcherMetric title="Pending Jobs" value={summary.pendingJobs} />
        <DispatcherMetric title="Completed Today" value={summary.completedToday} />
        <DispatcherMetric title="Cancelados" value={summary.cancelados} />
        <DispatcherMetric title="Dry Runs" value={summary.dryRuns} />
      </section>
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <DispatcherCard title="Dispatch Board" text="Create, edit, track, and assign live jobs." />
          <DispatcherCard title="Technician Center" text="View approved technicians and dispatcher-safe technician details." />
          <DispatcherCard title="Activity Log" text="Review operational activity without financial details." />
        </div>
      </div>
      </div>
    </div>
  );
}

function DispatcherMetric({ title, value }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-black uppercase tracking-wide text-slate-500">{title}</p>
      <p className="mt-2 text-3xl font-black text-slate-950">{value}</p>
    </div>
  );
}

function DispatcherCard({ title, text }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
      <h2 className="text-lg font-black text-slate-950">{title}</h2>
      <p className="mt-2 text-sm font-medium text-slate-500">{text}</p>
    </div>
  );
}

function AccessDenied({ view }) {
  return (
    <div className="min-h-screen w-full max-w-none bg-slate-100 p-4 md:p-8">
      <div className="rounded-2xl border border-red-200 bg-white p-8 shadow-sm">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-red-600">Access Denied</p>
        <h1 className="mt-1 text-3xl font-black text-slate-950">{view}</h1>
        <p className="mt-2 max-w-2xl text-sm font-semibold text-slate-500">
          Your current role does not have permission to view this module.
        </p>
      </div>
    </div>
  );
}
