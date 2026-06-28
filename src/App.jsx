import React, { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  ClipboardList,
  Cloud,
  CreditCard,
  Database,
  Building2,
  LayoutDashboard,
  Save,
  Settings,
  Shield,
  ShieldCheck,
  Users,
} from "lucide-react";
import DispatchLiveUpdatesPage from "./DispatchLiveUpdatesPage.jsx";
import { BillingDashboard } from "./modules/billing";
import { CustomerCRM } from "./modules/customers";
import { TechnicianCenter, TechnicianRegistrationPortal } from "./modules/technicians";
import { getPermissions, normalizeRole } from "./modules/permissions";

const sidebarItems = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, adminOnly: true },
  { id: "dispatch", label: "Dispatch Center", icon: ClipboardList },
  { id: "technicians", label: "Technician Center", icon: Users, requires: "canViewTechnicianCenter" },
  { id: "customers", label: "Customers", icon: Building2, requires: "canViewCustomers" },
  { id: "billing", label: "Billing", icon: CreditCard, adminOnly: true },
  { id: "administration", label: "Administration", icon: Shield, adminOnly: true },
  { id: "reports", label: "Reports", icon: BarChart3, adminOnly: true },
  { id: "settings", label: "Settings", icon: Settings, adminOnly: true },
];

export default function App() {
  const [activeView, setActiveView] = useState("dispatch");
  const [session, setSession] = useState(getSession());
  const isPublicRegistration = window.location.pathname === "/technician-registration";

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

  const permissions = useMemo(() => getPermissions(session.role), [session.role]);
  const role = normalizeRole(session.role);
  const isAdmin = role === "admin";

  const visibleItems = sidebarItems.filter((item) => {
    if (item.adminOnly) return isAdmin;
    if (item.requires) return Boolean(permissions[item.requires]);
    if (item.id === "dispatch") return true;
    return true;
  });

  useEffect(() => {
    if (!visibleItems.some((item) => item.id === activeView)) {
      setActiveView("dispatch");
    }
  }, [activeView, visibleItems]);

  if (isPublicRegistration) {
    return <TechnicianRegistrationPortal />;
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <aside className="flex bg-slate-950 text-white lg:fixed lg:inset-y-0 lg:w-72 lg:flex-col">
        <div className="flex w-full flex-col gap-4 p-4 lg:min-h-screen">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-2xl font-black tracking-[0.25em] text-white">NTTR</p>
            <p className="mt-2 text-xs font-bold uppercase tracking-[0.2em] text-blue-300">Command Center</p>
          </div>

          <nav className="flex gap-2 overflow-x-auto lg:flex-1 lg:flex-col lg:overflow-visible">
            {visibleItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeView === item.id;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveView(item.id)}
                  className={`flex shrink-0 items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-bold transition ${
                    isActive
                      ? "bg-white text-slate-950 shadow-sm"
                      : "text-slate-300 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  {item.label}
                </button>
              );
            })}
          </nav>

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

          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Signed In</p>
            <p className="mt-2 truncate text-sm font-bold">{session.name || "PRESTIGE T"}</p>
            <p className="mt-1 text-xs capitalize text-slate-400">{role === "admin" ? "Administrator" : role || "Administrator"}</p>
            <div className="mt-3 flex items-center gap-2 text-xs font-bold text-emerald-300">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              Online
            </div>
          </div>
        </div>
      </aside>

      <main className="min-h-screen w-full max-w-none min-w-0 overflow-x-hidden lg:pl-72">
        <div className="border-b border-slate-200 bg-white px-4 py-4 shadow-sm md:px-8">
          <div className="flex w-full max-w-none items-center justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">NTTR Command Center</p>
              <h2 className="text-2xl font-bold">{viewTitle(activeView)}</h2>
            </div>
            <div className="hidden rounded-2xl bg-slate-100 px-4 py-2 text-sm font-bold capitalize text-slate-700 md:block">
              {role || "guest"}
            </div>
          </div>
        </div>

        {activeView === "dashboard" && <PlaceholderPage title="Dashboard" />}
        {activeView === "dispatch" && <DispatchLiveUpdatesPage />}
        {activeView === "technicians" && permissions.canViewTechnicianCenter && <TechnicianCenter />}
        {activeView === "customers" && permissions.canViewCustomers && <CustomerCRM />}
        {activeView === "billing" && isAdmin && <BillingDashboard />}
        {activeView === "administration" && isAdmin && <PlaceholderPage title="Administration" />}
        {activeView === "reports" && isAdmin && <PlaceholderPage title="Reports" />}
        {activeView === "settings" && isAdmin && <PlaceholderPage title="Settings" />}
      </main>
    </div>
  );
}

function getSession() {
  return {
    username: localStorage.getItem("currentUser") || "",
    name: localStorage.getItem("currentUserName") || "",
    role: localStorage.getItem("currentUserRole") || "",
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
    reports: "Reports",
    settings: "Settings",
  };

  return titles[view] || "Dispatch Center";
}

function PlaceholderPage({ title }) {
  return (
    <div className="p-4 md:p-8">
      <div className="mx-auto max-w-7xl rounded-3xl bg-white p-8 shadow-sm">
        <h3 className="text-2xl font-bold">{title}</h3>
        <p className="mt-2 text-sm text-slate-500">This module is reserved for the next implementation phase.</p>
      </div>
    </div>
  );
}
