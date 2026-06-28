import React, { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
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
import { AdministrationDashboard } from "./modules/administration";
import { BillingDashboard } from "./modules/billing";
import { CustomerCRM } from "./modules/customers";
import { ExecutiveDashboard } from "./modules/executive";
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

const sidebarSections = [
  {
    label: "Dispatch",
    items: [
      { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, adminOnly: true },
      { id: "dispatch", label: "Dispatch Board", icon: ClipboardList },
      { id: "technicians-quick", label: "Technicians", icon: Users, target: "technicians", requires: "canViewTechnicianCenter" },
      { id: "customers", label: "Customers", icon: Building2, requires: "canViewCustomers" },
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
      { id: "settings", label: "Settings", icon: Settings, target: "administration", adminOnly: true },
    ],
  },
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
      <aside className="flex bg-[#08111f] text-white lg:fixed lg:inset-y-0 lg:w-60 lg:flex-col">
        <div className="flex w-full flex-col gap-4 p-4 lg:min-h-screen">
          <div className="border-b border-white/10 pb-5">
            <p className="text-3xl font-black tracking-[0.18em] text-white">NTTR</p>
            <p className="mt-2 text-xs font-semibold leading-5 text-slate-400">National Truck Trailer Repair</p>
          </div>

          <nav className="flex gap-3 overflow-x-auto lg:flex-1 lg:flex-col lg:overflow-visible">
            {sidebarSections.map((section) => (
              <div key={section.label} className="min-w-max lg:min-w-0">
                <p className="mb-2 px-3 text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">{section.label}</p>
                <div className="flex gap-2 lg:flex-col">
                  {section.items.filter((item) => canShowSidebarItem(item, isAdmin, permissions)).map((item) => {
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

          <div className="grid gap-2 border-t border-white/10 pt-4">
            <button type="button" className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold text-slate-300 hover:bg-white/10 hover:text-white">
              <HelpCircle className="h-4 w-4" />
              Help Center
            </button>
            <button type="button" className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold text-slate-300 hover:bg-white/10 hover:text-white">
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
                {role === "admin" ? "Admin / Administrator" : role || "guest"}
              </div>
            </div>
          </div>
        </div>

        {activeView === "dashboard" && isAdmin && <ExecutiveDashboard />}
        {activeView === "dispatch" && <DispatchLiveUpdatesPage />}
        {activeView === "technicians" && permissions.canViewTechnicianCenter && <TechnicianCenter />}
        {activeView === "customers" && permissions.canViewCustomers && <CustomerCRM />}
        {activeView === "billing" && isAdmin && <BillingDashboard />}
        {activeView === "administration" && isAdmin && <AdministrationDashboard session={session} role={role} />}
      </main>
    </div>
  );
}

function canShowSidebarItem(item, isAdmin, permissions) {
  if (item.adminOnly) return isAdmin;
  if (item.requires) return Boolean(permissions[item.requires]);
  return true;
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
  };

  return titles[view] || "Dispatch Center";
}
