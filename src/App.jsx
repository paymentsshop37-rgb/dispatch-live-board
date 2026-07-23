import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  BookOpen,
  PackageSearch,
  HelpCircle,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  Search,
  Save,
  Settings,
  Shield,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import DispatchLiveUpdatesPage from "./DispatchLiveUpdatesPage.jsx";
import { clearAuthSession, clearCustomAuthStorage, finishSessionAudit, loadCurrentProfile, profileToSession, startSessionAudit } from "./authUsers";
import { ActivityLogPage } from "./modules/activity";
import { AdministrationDashboard } from "./modules/administration";
import { BillingDashboard } from "./modules/billing";
import { CustomerCRM } from "./modules/customers";
import { ExecutiveDashboard } from "./modules/executive";
import { TechnicianCenter, TechnicianRegistrationPortal } from "./modules/technicians";
import { UserManagement } from "./modules/users";
import { FlatRateGuide } from "./modules/flat-rate";
import { PartsIntelligence } from "./modules/parts";
import { getPermissions, normalizeRole } from "./modules/permissions";
import { supabase } from "./lib/supabase";
import {
  buildSmartAlerts,
  getVisibleAlerts,
  logNewHighSeverityAlerts,
  summarizeAlerts,
} from "./modules/alerts";

const sidebarItems = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["admin", "dispatcher", "supervisor"] },
  { id: "dispatch", label: "Dispatch Center", icon: ClipboardList },
  { id: "technicians", label: "Technician Center", icon: Users, requires: "canViewTechnicianCenter" },
  { id: "customers", label: "Customers", icon: Building2, roles: ["admin", "dispatcher", "supervisor"] },
  { id: "billing", label: "Billing", icon: CreditCard, adminOnly: true },
  { id: "administration", label: "Administration", icon: Shield, adminOnly: true },
  { id: "users", label: "Users", icon: Users, adminOnly: true },
  { id: "activity", label: "Activity Log", icon: Activity, roles: ["admin", "dispatcher", "supervisor"] },
  { id: "reports", label: "Reports", icon: BarChart3, target: "dashboard", adminOnly: true },
  { id: "settings", label: "Settings", icon: Settings, target: "administration", adminOnly: true },
];

const inactivityWarningMs = 28 * 60 * 1000;
const inactivityLogoutMs = 30 * 60 * 1000;
const logoutChannelName = "dispatch-live-session-security";

const sidebarSections = [
  {
    label: "Dispatch",
    items: [
      { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["admin", "dispatcher", "supervisor"] },
      { id: "dispatch", label: "Dispatch Board", icon: ClipboardList },
      { id: "technicians-quick", label: "Technicians", icon: Users, target: "technicians", requires: "canViewTechnicianCenter" },
      { id: "activity", label: "Activity Log", icon: Activity, roles: ["admin", "dispatcher", "supervisor"] },
      { id: "customers", label: "Customers", icon: Building2, roles: ["admin", "dispatcher", "supervisor"] },
      { id: "reports", label: "Reports", icon: BarChart3, target: "dashboard", adminOnly: true },
    ],
  },
  {
    label: "Operations",
    items: [
      { id: "technicians", label: "Technician Center", icon: Users, requires: "canViewTechnicianCenter" },
      { id: "billing", label: "Billing", icon: CreditCard, adminOnly: true },
      { id: "flat-rate", label: "Flat Rate Guide", icon: BookOpen, roles: ["admin", "dispatcher", "supervisor"] },
      { id: "parts-intelligence", label: "Parts Intelligence", icon: PackageSearch, roles: ["admin", "dispatcher", "supervisor"] },
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [addJobRequest, setAddJobRequest] = useState(0);
  const [jobSearchRequest, setJobSearchRequest] = useState(0);
  const [sessionWarningOpen, setSessionWarningOpen] = useState(false);
  const [networkLocked, setNetworkLocked] = useState(() => !navigator.onLine);
  const [inactivityResetKey, setInactivityResetKey] = useState(0);
  const authValidationId = useRef(0);
  const manualLogout = useRef(false);
  const logoutInProgress = useRef(false);
  const logoutChannel = useRef(null);
  const isPublicRegistration = window.location.pathname === "/technician-registration";
  const isAuthenticated = Boolean(session.isAuthenticated);

  const resetApplicationState = useCallback(() => {
    authValidationId.current += 1;
    setSession(emptySession());
    setActiveView("dispatch");
    setAlertJobs([]);
    setAlertsOpen(false);
    setAuthLoading(false);
  }, []);

  const redirectToLogin = useCallback(() => {
    if (window.location.pathname !== "/login") {
      window.history.replaceState({}, "", "/login");
    }
  }, []);

  const handleLogout = useCallback(async (reason = "manual_logout", message = "", broadcast = true) => {
    if (logoutInProgress.current) return;
    logoutInProgress.current = true;
    manualLogout.current = true;
    resetApplicationState();
    redirectToLogin();
    setSessionWarningOpen(false);
    setNetworkLocked(false);
    if (message) setAuthMessage(message);
    if (broadcast) {
      logoutChannel.current?.postMessage({ type: "logout", reason, message });
      try {
        localStorage.setItem("nttr-logout-signal", JSON.stringify({ reason, message, at: Date.now() }));
        localStorage.removeItem("nttr-logout-signal");
      } catch {
        // BroadcastChannel remains the primary synchronization mechanism.
      }
    }
    try {
      await finishSessionAudit(reason);
      await clearAuthSession();
    } catch {
      // Local state and storage are already cleared; remain safely signed out.
    } finally {
      window.setTimeout(() => { logoutInProgress.current = false; }, 0);
    }
  }, [redirectToLogin, resetApplicationState]);

  const beginLogin = useCallback(() => {
    manualLogout.current = false;
  }, []);

  useEffect(() => {
    let mounted = true;
    async function validate(authSession) {
      const validationId = ++authValidationId.current;
      if (!authSession?.user) {
        if (mounted) {
          resetApplicationState();
          redirectToLogin();
        }
        return;
      }
      try {
        const profile = await loadCurrentProfile(authSession.user.id);
        if (profile.status !== "Active") {
          if (mounted) await handleLogout("session_invalid", "Your account is inactive. Contact an administrator.");
          return;
        }
        if (!["admin", "dispatcher", "supervisor"].includes(String(profile.role).toLowerCase())) {
          if (mounted) await handleLogout("session_invalid", "You do not have permission to access this application.");
          return;
        }
        if (mounted && !manualLogout.current && validationId === authValidationId.current) {
          const verifiedSession = profileToSession(profile, authSession);
          setSession(verifiedSession);
          void startSessionAudit(verifiedSession);
          if (window.location.pathname === "/login") window.history.replaceState({}, "", "/");
        }
      } catch {
        if (mounted) await handleLogout("session_invalid", "Unable to verify your account profile.");
      } finally {
        if (mounted && validationId === authValidationId.current) setAuthLoading(false);
      }
    }
    supabase.auth.getSession().then(({ data }) => validate(data?.session));
    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === "SIGNED_OUT") {
        manualLogout.current = true;
        clearCustomAuthStorage();
        resetApplicationState();
        redirectToLogin();
        return;
      }
      if (nextSession?.user) setAuthLoading(true);
      window.setTimeout(() => validate(nextSession), 0);
    });
    return () => { mounted = false; data?.subscription?.unsubscribe(); };
  }, [handleLogout, redirectToLogin, resetApplicationState]);

  useEffect(() => {
    const authUserId = session.authUserId || session.id;
    if (!authUserId) return undefined;
    const channel = supabase.channel(`profile-access-${authUserId}`).on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "app_users", filter: `auth_user_id=eq.${authUserId}` },
      async ({ new: profile }) => {
        if (profile?.status !== "Active") {
          await handleLogout("admin_forced_logout", "Your account is inactive. Contact an administrator.");
        } else {
          setSession((current) => current.isAuthenticated
            ? { ...current, ...profileToSession(profile, { user: { id: current.id } }) }
            : current);
        }
      }
    ).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [handleLogout, session.authUserId, session.id]);

  useEffect(() => {
    if (!authLoading && !isAuthenticated && !isPublicRegistration) redirectToLogin();
  }, [authLoading, isAuthenticated, isPublicRegistration, redirectToLogin]);

  useEffect(() => {
    const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(logoutChannelName) : null;
    logoutChannel.current = channel;
    const receiveLogout = (payload) => {
      if (payload?.type !== "logout") return;
      handleLogout(payload.reason || "manual_logout", payload.message || "", false);
    };
    if (channel) channel.onmessage = (event) => receiveLogout(event.data);
    const onStorage = (event) => {
      if (event.key !== "nttr-logout-signal" || !event.newValue) return;
      try { receiveLogout({ type: "logout", ...JSON.parse(event.newValue) }); } catch { receiveLogout({ type: "logout" }); }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
      channel?.close();
      if (logoutChannel.current === channel) logoutChannel.current = null;
    };
  }, [handleLogout]);

  useEffect(() => {
    if (!isAuthenticated) return undefined;
    let warningShown = false;
    let warningTimer;
    let logoutTimer;
    let lastHandledActivity = 0;
    const schedule = () => {
      window.clearTimeout(warningTimer);
      window.clearTimeout(logoutTimer);
      warningShown = false;
      setSessionWarningOpen(false);
      warningTimer = window.setTimeout(() => {
        warningShown = true;
        setSessionWarningOpen(true);
      }, inactivityWarningMs);
      logoutTimer = window.setTimeout(() => {
        handleLogout("inactivity_timeout", "Your session expired due to inactivity. Please sign in again.");
      }, inactivityLogoutMs);
    };
    const onActivity = (event) => {
      if (!event.isTrusted || warningShown) return;
      const now = Date.now();
      if (now - lastHandledActivity < 1000) return;
      lastHandledActivity = now;
      schedule();
    };
    const activityEvents = ["mousemove", "mousedown", "click", "keydown", "touchstart", "touchmove", "scroll"];
    activityEvents.forEach((eventName) => window.addEventListener(eventName, onActivity, { passive: true }));
    schedule();
    return () => {
      window.clearTimeout(warningTimer);
      window.clearTimeout(logoutTimer);
      activityEvents.forEach((eventName) => window.removeEventListener(eventName, onActivity));
    };
  }, [handleLogout, inactivityResetKey, isAuthenticated]);

  useEffect(() => {
    let connectionLost = !navigator.onLine;
    if (connectionLost && isAuthenticated) setNetworkLocked(true);
    const onOffline = () => {
      connectionLost = true;
      if (isAuthenticated) setNetworkLocked(true);
    };
    const onOnline = () => {
      if (connectionLost && isAuthenticated) {
        handleLogout("internet_connection_lost", "Your connection was restored. Please sign in again.");
      }
      connectionLost = false;
    };
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    const onConnectionChange = () => {
      if (!navigator.onLine) onOffline();
    };
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    connection?.addEventListener?.("change", onConnectionChange);
    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
      connection?.removeEventListener?.("change", onConnectionChange);
    };
  }, [handleLogout, isAuthenticated]);

  const continueSession = useCallback(async () => {
    const { data, error } = await supabase.auth.getSession();
    const authSession = data?.session;
    if (error || !authSession?.user) {
      await handleLogout("session_invalid", "Your session is no longer valid. Please sign in again.");
      return;
    }
    try {
      const profile = await loadCurrentProfile(authSession.user.id);
      if (profile?.status !== "Active" || !["admin", "dispatcher", "supervisor"].includes(String(profile?.role || "").toLowerCase())) {
        await handleLogout("session_invalid", "Your session is no longer valid. Please sign in again.");
        return;
      }
      setSessionWarningOpen(false);
      setInactivityResetKey((value) => value + 1);
    } catch {
      await handleLogout("session_invalid", "Your session is no longer valid. Please sign in again.");
    }
  }, [handleLogout]);

  const role = normalizeRole(session.role);
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

  function openJobDetailsFromView(jobId) {
    if (!jobId) return;
    localStorage.setItem("nttr-open-job-details-id", String(jobId));
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
    return <LoginScreen message={authMessage} onMessage={setAuthMessage} onLoginStarted={beginLogin} />;
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      {networkLocked && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/95 p-6 text-center text-white">
          <div className="max-w-md rounded-3xl border border-red-400/30 bg-red-500/10 p-7 shadow-2xl">
            <AlertTriangle className="mx-auto h-10 w-10 text-red-300" />
            <h2 className="mt-4 text-2xl font-black">Connection Lost</h2>
            <p className="mt-3 font-semibold text-red-100">Internet connection lost. Your session has been locked.</p>
            <p className="mt-3 text-sm text-slate-300">When the connection returns, you will be signed out and required to enter your credentials again.</p>
          </div>
        </div>
      )}

      {sessionWarningOpen && !networkLocked && (
        <div className="fixed inset-0 z-[115] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <h2 className="text-2xl font-black text-slate-950">Session Expiring</h2>
            <p className="mt-3 text-sm font-semibold text-slate-600">Your session will expire in 2 minutes due to inactivity.</p>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => handleLogout("manual_logout")} className="min-h-11 rounded-xl border border-slate-300 px-4 font-bold text-slate-700">Log Out</button>
              <button type="button" onClick={continueSession} className="min-h-11 rounded-xl bg-blue-600 px-4 font-bold text-white">Continue Session</button>
            </div>
          </div>
        </div>
      )}
      <aside className="hidden bg-[#08111f] text-white lg:fixed lg:inset-y-0 lg:flex lg:w-60 lg:flex-col">
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
            <button type="button" onClick={() => handleLogout("manual_logout")} className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold text-slate-300 hover:bg-white/10 hover:text-white">
              <LogOut className="h-4 w-4" />
              Logout
            </button>
          </div>
        </div>
      </aside>

      <main className="app-main min-h-screen w-full max-w-none min-w-0 overflow-x-hidden pb-20 lg:pb-0 lg:pl-60">
        <div className="flex min-h-[72px] items-center border-b border-slate-800 bg-[#0b1628] px-4 py-4 text-white shadow-sm md:px-8">
          <div className="flex w-full max-w-none items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <button type="button" onClick={() => setMobileMenuOpen(true)} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10 lg:hidden" aria-label="Open navigation">
                <Menu className="h-5 w-5" />
              </button>
              <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-wide text-blue-300">NTTR Command Center</p>
              <h2 className="truncate text-xl font-bold sm:text-2xl">{activeView === "dispatch" ? "Dispatch Cockpit" : viewTitle(activeView)}</h2>
              </div>
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
        {canAccessActiveView && activeView === "dashboard" && (isAdmin ? <ExecutiveDashboard onOpenActivity={() => setActiveView("activity")} onOpenJob={openJobDetailsFromView} /> : <DispatcherDashboard />)}
        {canAccessActiveView && activeView === "dispatch" && <DispatchLiveUpdatesPage currentUser={session} addJobRequest={addJobRequest} jobSearchRequest={jobSearchRequest} onLogout={() => handleLogout("manual_logout")} onOpenFlatRate={() => setActiveView("flat-rate")} onOpenParts={() => setActiveView("parts-intelligence")} />}
        {canAccessActiveView && activeView === "technicians" && <TechnicianCenter currentUser={session} />}
        {canAccessActiveView && activeView === "customers" && <CustomerCRM onOpenJob={openJobDetailsFromView} />}
        {canAccessActiveView && activeView === "billing" && <BillingDashboard />}
        {canAccessActiveView && activeView === "administration" && <AdministrationDashboard session={session} role={role} />}
        {canAccessActiveView && activeView === "users" && <UserManagement currentUser={session} />}
        {canAccessActiveView && activeView === "activity" && <ActivityLogPage role={role} />}
        {canAccessActiveView && activeView === "flat-rate" && <FlatRateGuide session={session} role={role} onCreateJob={() => { localStorage.setItem("flat-rate-create-job", "1"); setActiveView("dispatch"); }} />}
        {canAccessActiveView && activeView === "parts-intelligence" && <PartsIntelligence session={session} role={role} />}
      </main>

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-[90] bg-black/60 lg:hidden" onClick={() => setMobileMenuOpen(false)}>
          <div className="h-full w-[86%] max-w-sm overflow-y-auto bg-[#08111f] p-5 text-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-5 flex items-center justify-between">
              <div><p className="text-2xl font-black tracking-[0.18em]">NTTR</p><p className="text-xs text-slate-400">Dispatch Live</p></div>
              <button type="button" onClick={() => setMobileMenuOpen(false)} className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10"><X className="h-5 w-5" /></button>
            </div>
            <nav className="grid gap-2">
              {visibleItems.map((item) => { const Icon = item.icon; const target = item.target || item.id; return <button key={item.id} type="button" onClick={() => { setActiveView(target); setMobileMenuOpen(false); }} className="flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 text-left font-bold text-slate-200 hover:bg-white/10"><Icon className="h-5 w-5" />{item.label}</button>; })}
              <button type="button" onClick={() => { setActiveView("flat-rate"); setMobileMenuOpen(false); }} className="flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 text-left font-bold text-slate-200 hover:bg-white/10"><BookOpen className="h-5 w-5" />Flat Rate Guide</button>
              <button type="button" onClick={() => { setActiveView("parts-intelligence"); setMobileMenuOpen(false); }} className="flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 text-left font-bold text-slate-200 hover:bg-white/10"><PackageSearch className="h-5 w-5" />Parts Intelligence</button>
              <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3"><p className="text-xs font-black uppercase text-slate-500">Profile</p><p className="mt-1 font-bold">{session.name || session.username}</p><p className="text-xs capitalize text-slate-400">{roleLabel(role)}</p></div>
              <button type="button" onClick={() => { handleLogout(); setMobileMenuOpen(false); }} className="mt-3 flex min-h-11 items-center gap-3 rounded-xl bg-red-500/10 px-3 py-2 text-left font-bold text-red-300"><LogOut className="h-5 w-5" />Log Out</button>
            </nav>
          </div>
        </div>
      )}

      <nav className="mobile-bottom-nav fixed inset-x-0 bottom-0 z-[70] grid h-20 grid-cols-5 border-t border-slate-700 bg-[#08111f]/95 px-1 pb-[env(safe-area-inset-bottom)] text-white backdrop-blur lg:hidden">
        <MobileNavButton icon={ClipboardList} label="Board" active={activeView === "dispatch"} onClick={() => setActiveView("dispatch")} />
        <MobileNavButton icon={Plus} label="Add Job" onClick={() => { setActiveView("dispatch"); setAddJobRequest((value) => value + 1); }} />
        <MobileNavButton icon={Users} label="Technicians" active={activeView === "technicians"} onClick={() => setActiveView("technicians")} />
        <MobileNavButton icon={Search} label="Search" onClick={() => { setActiveView("dispatch"); setJobSearchRequest((value) => value + 1); }} />
        <MobileNavButton icon={Menu} label="More" onClick={() => setMobileMenuOpen(true)} />
      </nav>
    </div>
  );
}

function MobileNavButton({ icon: Icon, label, active = false, onClick }) {
  return <button type="button" onClick={onClick} className={`flex min-h-11 flex-col items-center justify-center gap-1 text-[11px] font-bold ${active ? "text-blue-300" : "text-slate-400"}`}><Icon className="h-5 w-5" />{label}</button>;
}

function canShowSidebarItem(item, role, permissions) {
  if (item.adminOnly) return role === "admin";
  if (item.roles) return item.roles.includes(role);
  if (item.requires) return Boolean(permissions[item.requires]);
  return true;
}

function canAccessView(view, role, permissions) {
  if (view === "dispatch") return true;
  if (view === "dashboard") return ["admin", "dispatcher", "supervisor"].includes(role);
  if (view === "technicians") return Boolean(permissions.canViewTechnicianCenter);
  if (view === "activity") return ["admin", "dispatcher", "supervisor"].includes(role);
  if (view === "customers") return ["admin", "dispatcher", "supervisor"].includes(role);
  if (view === "flat-rate") return ["admin", "dispatcher", "supervisor"].includes(role);
  if (view === "parts-intelligence") return ["admin", "dispatcher", "supervisor"].includes(role);
  if (["billing", "administration", "users", "reports", "settings"].includes(view)) {
    return role === "admin";
  }
  return false;
}

function roleLabel(role) {
  if (role === "admin") return "Administrator";
  if (role === "dispatcher") return "Dispatcher";
  if (role === "supervisor") return "Supervisor";
  return "Access required";
}

function emptySession() {
  return {
    id: "", authUserId: "", username: "", name: "", role: "", status: "Inactive", forcePasswordChange: false, isAuthenticated: false,
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
    "flat-rate": "Flat Rate Guide",
    "parts-intelligence": "Parts Intelligence",
  };

  return titles[view] || "Dispatch Center";
}

function LoginScreen({ message, onMessage, onLoginStarted }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleLogin() {
    if (!username.trim() || !password) return onMessage("Username and password are required.");
    setSubmitting(true);
    onMessage("");

    const { data, error } = await supabase.functions.invoke("auth-access-code", {
      body: { username: username.trim(), password },
    });

    if (error || data?.error || !data?.session?.access_token || !data?.session?.refresh_token) {
      setSubmitting(false);
      const message = data?.error || (await readFunctionError(error)) || "Invalid username or password.";
      return onMessage(message);
    }

    onLoginStarted();
    const { error: sessionError } = await supabase.auth.setSession({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    });

    setSubmitting(false);
    if (sessionError) onMessage("Unable to start session.");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6">
      <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-2xl">
        <h1 className="text-3xl font-bold text-slate-900">Dispatch Live Access</h1>
        <p className="mt-2 text-sm text-slate-500">Enter your username and password to continue.</p>
        {message && <div className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{message}</div>}

        <input
          type="text"
          className="mt-6 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-900"
          placeholder="Username"
          autoComplete="username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
        />
        <input
          type="password"
          className="mt-3 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-900"
          placeholder="Password"
          autoComplete="current-password"
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

async function readFunctionError(error) {
  const message = error?.message || "";
  const response = error?.context;
  if (response?.clone) {
    try {
      const details = await response.clone().json();
      if (details?.error) return details.error;
    } catch {
      // Keep the SDK message when the response body is not JSON.
    }
  }
  if (message.toLowerCase().includes("edge function")) {
    return "Login service is not deployed yet. Deploy the auth-access-code Edge Function and try again.";
  }
  return message;
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
