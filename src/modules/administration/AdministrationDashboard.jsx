import React from "react";
import { Database, KeyRound, Lock, Route, ShieldCheck, UserCog } from "lucide-react";

const accessRules = [
  { label: "Public Registration", value: "/technician-registration", status: "Public route" },
  { label: "Dispatch Center", value: "Access code required", status: "Protected" },
  { label: "Technician Center", value: "Admin and dispatcher", status: "Role gated" },
  { label: "Billing", value: "Admin only", status: "Role gated" },
  { label: "Executive Dashboard", value: "Admin only", status: "Role gated" },
];

const systemRules = [
  "Supabase client reads only Vite public environment variables.",
  ".env is ignored locally and must not be committed.",
  "Dispatch Board changes must preserve existing job creation and editing.",
  "Technician Registration remains public for shared SMS and WhatsApp links.",
];

export default function AdministrationDashboard({ session, role }) {
  return (
    <div className="min-h-screen w-full max-w-none bg-slate-100 p-4 md:p-8">
      <div className="space-y-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-600">Administration</p>
          <h1 className="mt-1 text-3xl font-black text-slate-950">Command Center Controls</h1>
          <p className="mt-2 max-w-3xl text-sm font-medium text-slate-500">
            Production access, security posture, route protection, and platform operating rules for NTTR Command Center.
          </p>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <AdminMetric icon={UserCog} label="Signed In User" value={session?.name || session?.username || "Admin"} detail={role === "admin" ? "Administrator" : role || "Role not set"} />
          <AdminMetric icon={ShieldCheck} label="Role Policy" value="Enabled" detail="Admin and dispatcher permissions active" />
          <AdminMetric icon={Route} label="Public Route" value="Active" detail="/technician-registration" />
          <AdminMetric icon={Lock} label="Dispatch Access" value="Protected" detail="Access code required" />
        </section>

        <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-3">
              <div className="rounded-xl bg-blue-50 p-3 text-blue-700">
                <KeyRound className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-xl font-black text-slate-950">Access Matrix</h2>
                <p className="text-sm font-medium text-slate-500">Current production route and role protections.</p>
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-200">
              <table className="w-full min-w-[720px] table-auto text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-black">Area</th>
                    <th className="px-4 py-3 font-black">Access</th>
                    <th className="px-4 py-3 font-black">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {accessRules.map((rule) => (
                    <tr key={rule.label} className="border-t border-slate-200">
                      <td className="px-4 py-3 font-bold text-slate-900">{rule.label}</td>
                      <td className="px-4 py-3 text-slate-600">{rule.value}</td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black uppercase tracking-wide text-emerald-700">
                          {rule.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-3">
              <div className="rounded-xl bg-slate-100 p-3 text-slate-700">
                <Database className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-xl font-black text-slate-950">Production Rules</h2>
                <p className="text-sm font-medium text-slate-500">Rules to keep the platform stable.</p>
              </div>
            </div>

            <div className="grid gap-3">
              {systemRules.map((rule) => (
                <div key={rule} className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-700">
                  {rule}
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function AdminMetric({ icon: Icon, label, value, detail }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="rounded-2xl bg-blue-50 p-3 text-blue-700">
          <Icon className="h-5 w-5" />
        </div>
        <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black uppercase tracking-wide text-emerald-700">
          Active
        </span>
      </div>
      <p className="mt-4 text-xs font-black uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-black text-slate-950">{value}</p>
      <p className="mt-1 text-sm font-semibold text-slate-500">{detail}</p>
    </div>
  );
}
