import React, { useState } from "react";
import { ClipboardList, UserPlus, Users } from "lucide-react";
import DispatchLiveUpdatesPage from "./DispatchLiveUpdatesPage.jsx";
import { TechnicianCenter, TechnicianPortal, TechnicianRegistrationPortal } from "./modules/technicians";

const views = [
  { id: "dispatch", label: "Dispatch Board", icon: ClipboardList },
  { id: "technicians", label: "Technician Center", icon: Users },
  { id: "registration", label: "Technician Registration", icon: UserPlus },
];

export default function App() {
  const [activeView, setActiveView] = useState("dispatch");
  const isPublicRegistration = window.location.pathname === "/technician-registration";
  const isTechnicianPortal = window.location.pathname === "/technician-portal";

  if (isPublicRegistration) {
    return <TechnicianRegistrationPortal />;
  }

  if (isTechnicianPortal) {
    return <TechnicianPortal />;
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <nav className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur md:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Dispatch Live</p>
            <h1 className="text-xl font-bold text-slate-950">Operations Workspace</h1>
          </div>

          <div className="flex gap-2 overflow-x-auto">
            {views.map((view) => {
              const Icon = view.icon;
              const isActive = activeView === view.id;

              return (
                <button
                  key={view.id}
                  type="button"
                  onClick={() => setActiveView(view.id)}
                  className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition ${
                    isActive
                      ? "bg-slate-950 text-white shadow-sm"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {view.label}
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      {activeView === "dispatch" && <DispatchLiveUpdatesPage />}
      {activeView === "technicians" && <TechnicianCenter />}
      {activeView === "registration" && <TechnicianRegistrationPortal />}
    </div>
  );
}
