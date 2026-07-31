import React, { useEffect, useMemo, useState } from "react";
import { Bot, CheckCircle2, Clock3, History, Link2, Loader2, Search, Settings2, ShieldAlert, Sparkles, X } from "lucide-react";
import { formatDateTime12Hour } from "../../utils/timeFormat";
import { attachLaborEstimate, loadLaborHistory, loadLaborSettings, requestLaborEstimate, reviewLaborEstimate, saveLaborSettings } from "./aiLaborService";

const DISCLAIMER = "AI-generated labor-time estimate for dispatch guidance only. Actual repair time may vary based on vehicle configuration, condition, access, corrosion, diagnosis and roadside conditions.";
const emptyVehicle = { vehicle_type: "", year: "", make: "", model: "", engine: "", axle_position: "", component_location: "", service_context: "", component_count: "" };
const starters = [
  "How long to replace a brake chamber on a trailer?",
  "How long to replace a drive-axle wheel seal?",
  "How long to replace a trailer ABS modulator valve?",
  "How long to replace a slack adjuster?",
  "How long to replace a suspension airbag?",
  "How long to replace an air dryer?",
  "How long to replace a starter on a Freightliner Cascadia?",
  "How long to replace an alternator?",
  "How long to diagnose a trailer ABS light?",
  "How long to replace a landing gear assembly?",
];

export default function AiLaborGuide({ session, role, initialJob = null, panel = false, onClose }) {
  const [tab, setTab] = useState("ask");
  const [question, setQuestion] = useState(initialQuestion(initialJob));
  const [vehicle, setVehicle] = useState(() => vehicleFromJob(initialJob));
  const [result, setResult] = useState(null);
  const [record, setRecord] = useState(null);
  const [cached, setCached] = useState(false);
  const [disclaimer, setDisclaimer] = useState(DISCLAIMER);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [filters, setFilters] = useState({ search: "", confidence: "All", vehicle: "All", date: "" });
  const [settings, setSettings] = useState(null);
  const canApprove = ["admin", "supervisor"].includes(role);
  const isAdmin = role === "admin";

  useEffect(() => { if (tab === "history") refreshHistory(); if (tab === "settings" && isAdmin) refreshSettings(); }, [tab]);

  async function generate(event) {
    event?.preventDefault();
    setLoading(true); setError(""); setNotice("");
    try {
      const response = await requestLaborEstimate({ question, vehicle, job_id: initialJob?.id || null });
      setResult(response.estimate); setRecord(response.record); setCached(Boolean(response.cached)); setDisclaimer(response.disclaimer || DISCLAIMER);
    } catch (requestError) {
      setError(requestError.message || "AI Labor Guide is temporarily unavailable. Do not quote a labor time until the estimate can be reviewed.");
    } finally { setLoading(false); }
  }
  async function refreshHistory() { setLoading(true); setError(""); try { setHistory(await loadLaborHistory()); } catch (e) { setError(e.message); } finally { setLoading(false); } }
  async function refreshSettings() { try { setSettings(await loadLaborSettings()); } catch (e) { setError(e.message); } }
  async function attach() {
    try { const saved = await attachLaborEstimate(record.id, initialJob?.id); setRecord(saved); setNotice("AI labor estimate attached to this job."); } catch (e) { setError(e.message); }
  }
  async function review(approval_status) {
    try { const saved = await reviewLaborEstimate(record.id, { approval_status }); setRecord(saved); setNotice(`Estimate ${approval_status}.`); } catch (e) { setError(e.message); }
  }
  async function saveSettings() {
    try { setSettings(await saveLaborSettings(settings)); setNotice("AI Labor Guide settings saved."); } catch (e) { setError(e.message); }
  }
  const visibleHistory = useMemo(() => history.filter((item) => {
    const haystack = [item.service_name,item.question,item.user_name,item.user_email,item.job_id,item.vehicle_type].join(" ").toLowerCase();
    return (!filters.search || haystack.includes(filters.search.toLowerCase()))
      && (filters.confidence === "All" || item.confidence_level === filters.confidence)
      && (filters.vehicle === "All" || item.vehicle_type === filters.vehicle)
      && (!filters.date || String(item.generated_at).slice(0, 10) === filters.date);
  }), [history, filters]);

  const content = (
    <div className={`${panel ? "h-full" : "min-h-screen"} overflow-y-auto bg-[#06111f] p-4 text-white md:p-6`}>
      <div className="mx-auto max-w-7xl">
        <header className="rounded-3xl border border-blue-400/20 bg-gradient-to-br from-[#10294c] to-[#091728] p-5 shadow-2xl md:p-7">
          <div className="flex items-start justify-between gap-4">
            <div><p className="text-xs font-black uppercase tracking-[.22em] text-blue-300">NTTR Command Center</p><h1 className="mt-2 flex items-center gap-3 text-2xl font-black md:text-4xl"><Bot className="h-8 w-8 text-blue-400" />NTTR AI LABOR GUIDE</h1><p className="mt-2 font-semibold text-slate-400">Truck & Trailer AI Flat-Rate Estimates</p></div>
            {onClose && <button onClick={onClose} className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10" aria-label="Close AI Labor Guide"><X /></button>}
          </div>
          <nav className="mt-5 flex flex-wrap gap-2">
            <Tab active={tab === "ask"} onClick={() => setTab("ask")} icon={Sparkles}>Ask AI</Tab>
            <Tab active={tab === "history"} onClick={() => setTab("history")} icon={History}>AI Estimate History</Tab>
            {isAdmin && <Tab active={tab === "settings"} onClick={() => setTab("settings")} icon={Settings2}>Settings</Tab>}
          </nav>
        </header>
        {error && <div className="mt-4 rounded-2xl border border-red-400/30 bg-red-500/10 p-4 font-bold text-red-200">{error}</div>}
        {notice && <div className="mt-4 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-4 font-bold text-emerald-200">{notice}</div>}

        {tab === "ask" && <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,.8fr)_minmax(420px,1.2fr)]">
          <form onSubmit={generate} className="space-y-5">
            <section className="rounded-3xl border border-white/10 bg-[#0b1b2e] p-5">
              <h2 className="text-sm font-black uppercase tracking-[.18em] text-blue-300">Ask About a Repair</h2>
              <textarea required value={question} onChange={(e) => setQuestion(e.target.value)} rows="5" maxLength="4000" placeholder="Example: How long does it take to replace a brake chamber on a trailer?" className="mt-4 w-full rounded-2xl border border-slate-600 bg-[#06111f] p-4 text-lg font-semibold outline-none focus:border-blue-400" />
              <div className="mt-3 flex flex-wrap gap-2">{starters.slice(0, 5).map((item) => <button key={item} type="button" onClick={() => setQuestion(item)} className="rounded-full bg-white/5 px-3 py-2 text-left text-xs font-bold text-slate-300 hover:bg-white/10">{item}</button>)}</div>
            </section>
            <section className="rounded-3xl border border-white/10 bg-[#0b1b2e] p-5">
              <h2 className="text-sm font-black uppercase tracking-[.18em] text-blue-300">Vehicle Details <span className="text-slate-500">(optional)</span></h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">{vehicleFields.map(([key,label,options]) => <label key={key} className="grid gap-1 text-xs font-black uppercase text-slate-400">{label}{options ? <select value={vehicle[key]} onChange={(e) => setVehicle({ ...vehicle, [key]: e.target.value })} className={inputClass}><option value="">Not specified</option>{options.map((option) => <option key={option}>{option}</option>)}</select> : <input value={vehicle[key]} onChange={(e) => setVehicle({ ...vehicle, [key]: e.target.value })} className={inputClass} />}</label>)}</div>
            </section>
            <button disabled={loading || !question.trim()} className="flex min-h-14 w-full items-center justify-center gap-3 rounded-2xl bg-blue-600 text-lg font-black shadow-lg shadow-blue-950/50 hover:bg-blue-500 disabled:opacity-50">{loading ? <Loader2 className="animate-spin" /> : <Sparkles />}Generate AI Labor Estimate</button>
          </form>
          <section>{result ? <EstimateCard estimate={result} record={record} cached={cached} disclaimer={disclaimer} canApprove={canApprove} canAttach={Boolean(initialJob?.id)} onAttach={attach} onReview={review} /> : <EmptyEstimate loading={loading} />}</section>
        </div>}
        {tab === "history" && <HistoryView rows={visibleHistory} filters={filters} setFilters={setFilters} loading={loading} onSelect={(item) => { setResult(item.exact_ai_response); setRecord(item); setCached(Boolean(item.cached_from_estimate_id)); setTab("ask"); }} />}
        {tab === "settings" && isAdmin && <SettingsView settings={settings} setSettings={setSettings} onSave={saveSettings} />}
      </div>
    </div>
  );
  return panel ? <div className="fixed inset-0 z-[210] bg-black/75 p-0 md:p-5" onClick={onClose}><aside className="ml-auto h-full w-full max-w-6xl overflow-hidden md:rounded-3xl" onClick={(e) => e.stopPropagation()}>{content}</aside></div> : content;
}

const vehicleFields = [
  ["vehicle_type","Vehicle Type",["Truck","Trailer","Reefer","Liftgate"]],
  ["year","Year"],["make","Make"],["model","Model"],["engine","Engine"],["axle_position","Axle Position"],
  ["component_location","Component Location"],["service_context","Roadside or Shop",["Roadside","Shop"]],
  ["component_count","Components",["Single Component","Multiple Components"]],
];
const inputClass = "min-h-11 rounded-xl border border-slate-600 bg-[#06111f] px-3 text-sm font-semibold normal-case text-white outline-none focus:border-blue-400";

function EstimateCard({ estimate, record, cached, disclaimer, canApprove, canAttach, onAttach, onReview }) {
  return <article className="overflow-hidden rounded-3xl border border-blue-400/25 bg-[#0b1b2e] shadow-2xl">
    <div className="bg-gradient-to-r from-blue-600/25 to-cyan-500/10 p-5"><p className="text-xs font-black uppercase tracking-[.2em] text-blue-300">{cached ? "AI ESTIMATE — PREVIOUSLY GENERATED" : "NTTR AI LABOR ESTIMATE"}</p><h2 className="mt-2 text-2xl font-black">{estimate.service_name}</h2><p className="mt-1 font-semibold text-slate-400">{estimate.vehicle_type}</p>
      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4"><Big label="AI Flat-Rate Estimate" value={`${hours(estimate.estimated_hours)} HOURS`} /><Big label="Typical Range" value={`${hours(estimate.minimum_hours)}–${hours(estimate.maximum_hours)} HOURS`} /><Big label="Diagnostic Time" value={`${hours(estimate.diagnostic_hours)} HOURS`} /><Big label="AI Confidence" value={estimate.confidence_level} /></div>
    </div>
    <div className="grid gap-4 p-5 md:grid-cols-2"><List title="Includes" items={estimate.included_operations} /><List title="Does Not Include" items={estimate.excluded_operations} /><List title="May Require Additional Time" items={estimate.factors_that_increase_time} /><List title="Assumptions" items={estimate.assumptions} /><List title="Related Repairs" items={estimate.related_repairs} /><List title="Required Information" items={estimate.required_information} /></div>
    <div className="mx-5 mb-5 rounded-2xl border border-amber-400/25 bg-amber-500/10 p-4"><p className="font-black text-amber-200">Safety warning</p><p className="mt-1 text-sm text-amber-100">{estimate.safety_warning}</p></div>
    <div className="border-t border-white/10 p-5"><p className="font-black">Estimate summary</p><p className="mt-1 text-sm text-slate-300">{estimate.estimate_summary}</p><p className="mt-4 text-xs font-semibold text-slate-500">{disclaimer}</p>
      <div className="mt-4 flex flex-wrap gap-2">{canAttach && !record?.attached_to_job && <button onClick={onAttach} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-black"><Link2 className="mr-2 inline h-4 w-4" />Attach to Job</button>}{record?.attached_to_job && <span className="rounded-xl bg-emerald-500/15 px-4 py-2 text-sm font-black text-emerald-300"><CheckCircle2 className="mr-2 inline h-4 w-4" />Attached</span>}{canApprove && <><button onClick={() => onReview("approved")} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-black">Approve</button><button onClick={() => onReview("rejected")} className="rounded-xl bg-red-600 px-4 py-2 text-sm font-black">Reject</button></>}</div>
    </div>
  </article>;
}
function HistoryView({ rows, filters, setFilters, loading, onSelect }) {
  const vehicles = [...new Set(rows.map((row) => row.vehicle_type).filter(Boolean))];
  return <section className="mt-5 rounded-3xl border border-white/10 bg-[#0b1b2e] p-5"><h2 className="text-xl font-black">AI Estimate History</h2><p className="mt-1 text-sm text-slate-400">Immutable audit history. Saved estimates are never used to calculate future estimates.</p><div className="mt-4 grid gap-2 md:grid-cols-4"><label className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-500" /><input value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} placeholder="Dispatcher, job, service…" className={`${inputClass} w-full pl-9`} /></label><select value={filters.confidence} onChange={(e) => setFilters({ ...filters, confidence: e.target.value })} className={inputClass}>{["All","HIGH","MODERATE","LOW"].map((x) => <option key={x}>{x}</option>)}</select><select value={filters.vehicle} onChange={(e) => setFilters({ ...filters, vehicle: e.target.value })} className={inputClass}><option>All</option>{vehicles.map((x) => <option key={x}>{x}</option>)}</select><input type="date" value={filters.date} onChange={(e) => setFilters({ ...filters, date: e.target.value })} className={inputClass} /></div><div className="mt-4 overflow-x-auto"><table className="min-w-[1000px] w-full text-left text-sm"><thead className="text-xs uppercase text-blue-300"><tr>{["Generated","Service","Vehicle","Hours","Range","Confidence","Dispatcher","Job","Status"].map((h) => <th key={h} className="border-b border-white/10 p-3">{h}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.id} onClick={() => onSelect(row)} className="cursor-pointer border-b border-white/5 hover:bg-white/5"><td className="p-3">{formatDateTime12Hour(row.generated_at)}</td><td className="p-3 font-bold text-blue-200">{row.service_name}</td><td className="p-3">{row.vehicle_type || "—"}</td><td className="p-3 font-black">{hours(row.estimated_hours)}</td><td className="p-3">{hours(row.minimum_hours)}–{hours(row.maximum_hours)}</td><td className="p-3">{row.confidence_level}</td><td className="p-3">{row.user_name || row.user_email}</td><td className="p-3">{row.job_id || "—"}</td><td className="p-3">{row.approval_status}</td></tr>)}</tbody></table>{!loading && !rows.length && <p className="p-10 text-center font-bold text-slate-500">No AI estimates match these filters.</p>}</div></section>;
}
function SettingsView({ settings, setSettings, onSave }) {
  if (!settings) return <div className="mt-5 text-slate-400">Loading settings…</div>;
  const toggleRole = (role) => setSettings({ ...settings, allowed_roles: settings.allowed_roles.includes(role) ? settings.allowed_roles.filter((item) => item !== role) : [...settings.allowed_roles, role] });
  return <section className="mt-5 max-w-3xl rounded-3xl border border-white/10 bg-[#0b1b2e] p-5"><h2 className="text-xl font-black">AI Labor Guide Settings</h2><div className="mt-5 space-y-4"><SettingCheck label="Enable AI Labor Guide" checked={settings.enabled} onChange={(value) => setSettings({ ...settings, enabled: value })} /><label className="grid gap-1 text-sm font-bold">Maximum requests per user per day<input type="number" min="1" max="1000" value={settings.max_requests_per_user_per_day} onChange={(e) => setSettings({ ...settings, max_requests_per_user_per_day: Number(e.target.value) })} className={inputClass} /></label><SettingCheck label="Require job number before attaching" checked={settings.require_job_before_attach} onChange={(value) => setSettings({ ...settings, require_job_before_attach: value })} /><SettingCheck label="Require supervisor approval for low-confidence estimates" checked={settings.require_supervisor_for_low_confidence} onChange={(value) => setSettings({ ...settings, require_supervisor_for_low_confidence: value })} /><div><p className="text-sm font-bold">Allowed roles</p><div className="mt-2 flex flex-wrap gap-2">{["admin","supervisor","dispatcher","technician_manager"].map((item) => <button key={item} onClick={() => toggleRole(item)} className={`rounded-xl px-3 py-2 text-sm font-bold ${settings.allowed_roles.includes(item) ? "bg-blue-600" : "bg-white/10"}`}>{item.replace("_"," ")}</button>)}</div></div><label className="grid gap-1 text-sm font-bold">Disclaimer<textarea rows="4" value={settings.disclaimer} onChange={(e) => setSettings({ ...settings, disclaimer: e.target.value })} className={`${inputClass} p-3`} /></label><p className="text-sm text-slate-500">The model is selected only through the secure server environment variable OPENAI_LABOR_GUIDE_MODEL.</p><button onClick={onSave} className="rounded-xl bg-blue-600 px-5 py-3 font-black">Save Settings</button></div></section>;
}
function EmptyEstimate({ loading }) { return <div className="flex min-h-[420px] items-center justify-center rounded-3xl border border-dashed border-white/15 bg-white/[.025] p-10 text-center"><div>{loading ? <Loader2 className="mx-auto h-12 w-12 animate-spin text-blue-400" /> : <Clock3 className="mx-auto h-12 w-12 text-slate-600" />}<h2 className="mt-4 text-xl font-black">{loading ? "Generating structured estimate…" : "AI estimate will appear here"}</h2><p className="mt-2 max-w-md text-sm text-slate-500">The estimate is generated only from your repair question and vehicle information.</p></div></div>; }
function Tab({ active, onClick, icon: Icon, children }) { return <button onClick={onClick} className={`flex min-h-11 items-center gap-2 rounded-xl px-4 text-sm font-black ${active ? "bg-blue-600" : "bg-white/10 hover:bg-white/15"}`}><Icon className="h-4 w-4" />{children}</button>; }
function Big({ label, value }) { return <div className="rounded-2xl border border-white/10 bg-black/15 p-3"><p className="text-[10px] font-black uppercase text-slate-400">{label}</p><p className="mt-1 text-xl font-black">{value}</p></div>; }
function List({ title, items }) { return <div className="rounded-2xl bg-white/[.035] p-4"><h3 className="text-xs font-black uppercase tracking-wide text-blue-300">{title}</h3><ul className="mt-2 space-y-2 text-sm text-slate-300">{(items || []).map((item, index) => <li key={`${item}-${index}`} className="flex gap-2"><span className="text-blue-400">•</span><span>{item}</span></li>)}{!items?.length && <li>None specified.</li>}</ul></div>; }
function SettingCheck({ label, checked, onChange }) { return <label className="flex items-center justify-between gap-4 rounded-xl bg-white/5 p-3 font-bold">{label}<input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-5 w-5" /></label>; }
function hours(value) { return Number(value || 0).toFixed(2).replace(/\.00$/, ".0").replace(/0$/, ""); }
function initialQuestion(job) { return job ? String(job.complaint || job.updates || "") : ""; }
function vehicleFromJob(job) { const raw = job?.raw || job || {}; return { ...emptyVehicle, vehicle_type: raw.vehicle_type || raw.unit_type || "", year: raw.year || "", make: raw.make || "", model: raw.model || "", engine: raw.engine || "", component_location: raw.component_location || "", service_context: raw.service_context || "" }; }
