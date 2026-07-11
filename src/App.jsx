import React, { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Activity,
  AlertTriangle,
  Bell,
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
  X,
} from "lucide-react";
import DispatchLiveUpdatesPage from "./DispatchLiveUpdatesPage.jsx";
import { clearAuthSession, loadCurrentProfile, profileToSession } from "./authUsers";
import { ActivityLogPage, logActivity } from "./modules/activity";
import { AdministrationDashboard } from "./modules/administration";
import { BillingDashboard } from "./modules/billing";
import { CustomerCRM } from "./modules/customers";
import { ExecutiveDashboard } from "./modules/executive";
import { TechnicianCenter, TechnicianRegistrationPortal } from "./modules/technicians";
import { UserManagement } from "./modules/users";
import { getPermissions, normalizeRole } from "./modules/permissions";
import { supabase } from "./lib/supabase";
import {
  buildSmartAlerts,
  getVisibleAlerts,
  logNewHighSeverityAlerts,
  summarizeAlerts,
} from "./modules/alerts";

const sidebarItems = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["admin", "dispatcher"] },
  { id: "dispatch", label: "Dispatch Center", icon: ClipboardList },
  { id: "technicians", label: "Technician Center", icon: Users, requires: "canViewTechnicianCenter" },
  { id: "customers", label: "Customers", icon: Building2, roles: ["admin", "dispatcher"] },
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
      { id: "customers", label: "Customers", icon: Building2, roles: ["admin", "dispatcher"] },
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
  const [session, setSession] = useState(emptySession());
  const [authLoading, setAuthLoading] = useState(true);
  const [authMessage, setAuthMessage] = useState("");
  const [alertJobs, setAlertJobs] = useState([]);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const isPublicRegistration = window.location.pathname === "/technician-registration";
  const isAuthenticated = Boolean(session.isAuthenticated);

  useEffect(() => {
    let mounted = true;
    async function validate(authSession) {
      if (!authSession?.user) {
        if (mounted) { setSession(emptySession()); setAuthLoading(false); }
        return;
      }
      try {
        const profile = await loadCurrentProfile(authSession.user.id);
        if (profile.status !== "Active") {
          await supabase.auth.signOut();
          if (mounted) setAuthMessage("Your account is inactive. Contact an administrator.");
          return;
        }
        if (!['admin', 'dispatcher'].includes(String(profile.role).toLowerCase())) {
          await supabase.auth.signOut();
          if (mounted) setAuthMessage("You do not have permission to access this application.");
          return;
        }
        await supabase.from("app_users").update({ last_login_at: new Date().toISOString() }).eq("id", authSession.user.id);
        if (mounted) setSession(profileToSession(profile, authSession));
      } catch {
        await supabase.auth.signOut();
        if (mounted) setAuthMessage("Unable to verify your account profile.");
      } finally {
        if (mounted) setAuthLoading(false);
      }
    }
    supabase.auth.getSession().then(({ data }) => validate(data?.session));
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      window.setTimeout(() => validate(nextSession), 0);
    });
    return () => { mounted = false; data?.subscription?.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!session.id) return undefined;
    const channel = supabase.channel(`profile-access-${session.id}`).on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "app_users", filter: `id=eq.${session.id}` },
      async ({ new: profile }) => {
        if (profile?.status !== "Active") {
          setAuthMessage("Your account is inactive. Contact an administrator.");
          await supabase.auth.signOut();
        } else {
          setSession((current) => ({ ...current, ...profileToSession(profile, { user: { id: current.id, email: current.email } }) }));
        }
      }
    ).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [session.id]);

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
  const smartAlerts = useMemo(
    () => getVisibleAlerts(buildSmartAlerts(alertJobs, { role }), { role }),
    [alertJobs, role]
  );
  const alertSummary = useMemo(() => summarizeAlerts(smartAlerts), [smartAlerts]);

  useEffect(() => {
    if (!isAuthenticated || isPublicRegistration) {
      setAlertJobs([]);
      return undefined;
    }

    let mounted = true;

    async function loadAlertJobs() {
      const { data, error } = await supabase.from("jobs").select("*");
      if (!mounted) return;
      setAlertJobs(error ? [] : data || []);
    }

    loadAlertJobs();

    const channel = supabase
      .channel("app-smart-alerts")
      .on("postgres_changes", { event: "*", schema: "public", table: "jobs" }, loadAlertJobs)
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [isAuthenticated, isPublicRegistration]);

  useEffect(() => {
    if (!isAuthenticated || !smartAlerts.length) return;
    logNewHighSeverityAlerts(smartAlerts, { createdBy: session.name || session.username || "System" });
  }, [isAuthenticated, smartAlerts, session.name, session.username]);

  function openAlertJob(alert) {
    if (alert?.jobId) {
      localStorage.setItem("nttr-open-job-id", String(alert.jobId));
    }
    setAlertsOpen(false);
    setActiveView("dispatch");
  }

  useEffect(() => {
    if (!role && !visibleItems.some((item) => item.id === activeView)) {
      setActiveView("dispatch");
    }
  }, [activeView, role, visibleItems]);

  if (isPublicRegistration) {
    return <TechnicianRegistrationPortal />;
  }

  if (authLoading) return <div className="flex min-h-screen items-center justify-center bg-slate-950 font-bold text-white">Loading...</div>;

  if (isAuthenticated && session.forcePasswordChange) {
    return <ChangePasswordScreen userId={session.id} onComplete={() => setSession((current) => ({ ...current, forcePasswordChange: false }))} />;
  }

  if (!isAuthenticated) {
    return <LoginScreen message={authMessage} onMessage={setAuthMessage} />;
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
            <div className="flex items-center gap-3">
              <NotificationBell count={smartAlerts.length} onClick={() => setAlertsOpen(true)} />
              <div className="hidden rounded-2xl bg-white/10 px-4 py-2 text-sm font-bold capitalize text-slate-100 md:block">
                <p className="leading-tight">{session.name || session.username || "Not signed in"}</p>
                <p className="text-xs font-semibold text-slate-400">{roleLabel(role)}</p>
              </div>
            </div>
          </div>
        </div>

        <AlertsSlideOver
          open={alertsOpen}
          alerts={smartAlerts}
          summary={alertSummary}
          onClose={() => setAlertsOpen(false)}
          onViewJob={openAlertJob}
        />

        {!canAccessActiveView && <AccessDenied view={viewTitle(activeView)} />}
        {canAccessActiveView && activeView === "dashboard" && (isAdmin ? <ExecutiveDashboard onOpenActivity={() => setActiveView("activity")} /> : <DispatcherDashboard />)}
        {canAccessActiveView && activeView === "dispatch" && <DispatchLiveUpdatesPage currentUser={session} />}
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
  if (view === "customers") return role === "admin" || role === "dispatcher";
  if (["billing", "administration", "users", "reports", "settings"].includes(view)) {
    return role === "admin";
  }
  return false;
}

function roleLabel(role) {
  if (role === "admin") return "Administrator";
  if (role === "dispatcher") return "Dispatcher";
  return "Access required";
}

function emptySession() {
  return {
    id: "", username: "", email: "", name: "", role: "", status: "Inactive", forcePasswordChange: false, isAuthenticated: false,
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

function LoginScreen({ message, onMessage }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleLogin() {
    if (!email.trim() || !password) return onMessage("Email and password are required.");
    setSubmitting(true); onMessage("");
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    setSubmitting(false);
    if (error) onMessage("Invalid email or password.");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6">
      <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-2xl">
        <h1 className="text-3xl font-bold text-slate-900">Dispatch Live Access</h1>
        <p className="mt-2 text-sm text-slate-500">Sign in with your Supabase account.</p>
        {message && <div className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{message}</div>}

        <input
          type="email"
          className="mt-6 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-900"
          placeholder="Email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <input
          type="password"
          className="mt-3 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-900"
          placeholder="Password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") handleLogin();
          }}
        />

        <button
          type="button"
          onClick={handleLogin}
          disabled={submitting}
          className="mt-4 w-full rounded-xl bg-slate-950 px-4 py-3 font-bold text-white hover:bg-slate-800 disabled:bg-slate-400"
        >
          {submitting ? "Signing in..." : "Enter System"}
        </button>
      </div>
    </div>
  );
}

function ChangePasswordScreen({ userId, onComplete }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  async function submit(event) {
    event.preventDefault();
    if (password.length < 8) return setMessage("The password must contain at least 8 characters.");
    if (password !== confirm) return setMessage("Passwords do not match.");
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (!error) {
      const result = await supabase.from("app_users").update({ force_password_change: false }).eq("id", userId);
      if (!result.error) onComplete(); else setMessage("Unable to finish the password change.");
    } else setMessage("Unable to change password.");
    setSaving(false);
  }
  return <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6"><form onSubmit={submit} className="w-full max-w-md rounded-3xl bg-white p-8 shadow-2xl"><h1 className="text-3xl font-bold">Change password</h1><p className="mt-2 text-sm text-slate-500">You must set a new password before continuing.</p>{message && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{message}</p>}<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="New Password" className="mt-6 w-full rounded-xl border px-4 py-3"/><input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Confirm New Password" className="mt-3 w-full rounded-xl border px-4 py-3"/><button disabled={saving} className="mt-4 w-full rounded-xl bg-blue-600 px-4 py-3 font-bold text-white disabled:bg-slate-400">{saving ? "Updating..." : "Change Password"}</button></form></div>;
}

function NotificationBell({ count, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 text-slate-100 transition hover:bg-white/15"
      title="Attention Required"
    >
      <Bell className="h-5 w-5" />
      {count > 0 && (
        <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-black text-white shadow-lg">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </button>
  );
}

function AlertsSlideOver({ open, alerts, summary, onClose, onViewJob }) {
  const grouped = {
    High: alerts.filter((alert) => alert.severity === "High"),
    Medium: alerts.filter((alert) => alert.severity === "Medium"),
    Low: alerts.filter((alert) => alert.severity === "Low"),
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90]">
      <button type="button" aria-label="Close alerts" className="absolute inset-0 bg-slate-950/50" onClick={onClose} />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-xl flex-col bg-white shadow-2xl">
        <div className="border-b border-slate-200 bg-[#0b1628] p-5 text-white">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-300">NTTR Notifications</p>
              <h2 className="mt-1 text-2xl font-black">Attention Required</h2>
              <p className="mt-1 text-sm font-semibold text-slate-400">
                {summary.total} alerts · {summary.high} high · {summary.medium} medium · {summary.low} low
              </p>
            </div>
            <button type="button" onClick={onClose} className="rounded-xl bg-white/10 p-2 text-slate-100 hover:bg-white/15" title="Close">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto bg-slate-50 p-5">
          {alerts.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm font-bold text-slate-500">
              All clear. No alerts need attention.
            </div>
          ) : (
            ["High", "Medium", "Low"].map((severity) => (
              <AlertSeverityGroup
                key={severity}
                severity={severity}
                alerts={grouped[severity]}
                onViewJob={onViewJob}
              />
            ))
          )}
        </div>
      </aside>
    </div>
  );
}

function AlertSeverityGroup({ severity, alerts, onViewJob }) {
  if (!alerts.length) return null;

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">{severity}</h3>
        <span className={alertSeverityClass(severity)}>{alerts.length}</span>
      </div>
      <div className="space-y-3">
        {alerts.map((alert) => (
          <AlertPanelItem key={alert.id} alert={alert} onViewJob={onViewJob} />
        ))}
      </div>
    </section>
  );
}

function AlertPanelItem({ alert, onViewJob }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600">
          <AlertTriangle className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-black text-slate-950">{alert.title}</p>
            <span className={alertSeverityClass(alert.severity)}>{alert.severity}</span>
          </div>
          <p className="mt-1 truncate text-sm font-semibold text-slate-700">{alert.invoice || "No invoice"} · {alert.company || "No company"}</p>
          <p className="mt-1 truncate text-xs text-slate-500">{alert.location || "No location"}</p>
          <p className="mt-2 text-[11px] font-black uppercase tracking-wide text-slate-400">
            Last updated: {formatAlertDate(alert.updatedAt || alert.createdAt)}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => onViewJob(alert)}
        className="mt-3 w-full rounded-xl bg-blue-600 px-3 py-2 text-xs font-black text-white hover:bg-blue-700"
      >
        View Job
      </button>
    </div>
  );
}

function alertSeverityClass(severity) {
  const styles = {
    High: "shrink-0 rounded-full border border-red-200 bg-red-50 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-red-700",
    Medium: "shrink-0 rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-amber-700",
    Low: "shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-slate-700",
  };
  return styles[severity] || styles.Medium;
}

function formatAlertDate(value) {
  if (!value) return "N/A";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
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
