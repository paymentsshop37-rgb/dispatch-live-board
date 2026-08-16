import React, { useEffect, useState } from "react";
import { MapPin, Plus, Save, Trash2, X } from "lucide-react";
import { addServiceAreaAlias, loadServiceAreaConfiguration, removeServiceAreaAlias, saveServiceArea } from "./serviceAreaService";
import { ServiceAreaValidationError, validateServiceArea } from "./serviceAreaPayload";

const emptyArea = { area_name: "", primary_city: "", state: "", latitude: "", longitude: "", coverage_radius_miles: 75, is_active: true };

export default function CoverageSettings({ embedded = false, onClose, onChanged }) {
  const [areas, setAreas] = useState([]);
  const [aliases, setAliases] = useState([]);
  const [editing, setEditing] = useState(null);
  const [aliasDraft, setAliasDraft] = useState({ city: "", state: "" });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { refresh(); }, []);
  async function refresh() {
    try {
      const result = await loadServiceAreaConfiguration({ includeInactive: true });
      setAreas(result.areas); setAliases(result.aliases); setMessage("");
    } catch (error) { setMessage(`Unable to load service areas: ${error.message}`); }
  }
  async function save() {
    const validationMessage = validateServiceArea(editing);
    if (validationMessage) return setMessage(validationMessage);
    setBusy(true);
    try { await saveServiceArea(editing); await refresh(); setEditing(null); setMessage("Service area saved."); onChanged?.(); }
    catch (error) {
      if (import.meta.env.DEV) console.error("[CoverageSettings] service area save failed", error);
      setMessage(error instanceof ServiceAreaValidationError ? error.message : "Unable to save service area. Please verify the information and try again.");
    }
    finally { setBusy(false); }
  }
  async function addAlias(area) {
    if (!aliasDraft.city || !aliasDraft.state) return setMessage("Alias city and state are required.");
    setBusy(true);
    try { await addServiceAreaAlias(area.id, aliasDraft.city, aliasDraft.state); setAliasDraft({ city: "", state: "" }); await refresh(); setMessage("City alias added."); onChanged?.(); }
    catch (error) { setMessage(`Unable to add alias: ${error.message}`); }
    finally { setBusy(false); }
  }
  async function removeAlias(id) {
    setBusy(true);
    try { await removeServiceAreaAlias(id); await refresh(); setMessage("City alias removed."); onChanged?.(); }
    catch (error) { setMessage(`Unable to remove alias: ${error.message}`); }
    finally { setBusy(false); }
  }

  const content = <section className={`${embedded ? "" : "h-full"} overflow-y-auto bg-slate-50 p-4 text-slate-950 md:p-6`}>
    <header className="flex items-start justify-between gap-4">
      <div><p className="text-xs font-black uppercase tracking-[0.18em] text-blue-600">Admin Configuration</p><h2 className="mt-1 text-2xl font-black">Coverage Settings</h2><p className="mt-1 text-sm font-semibold text-slate-500">Manage service areas, radiuses, coordinates, and exact-city aliases.</p></div>
      <div className="flex gap-2"><button type="button" onClick={() => setEditing({ ...emptyArea })} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-blue-600 px-4 font-black text-white"><Plus className="h-4 w-4" />Add Area</button>{onClose && <button type="button" onClick={onClose} className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-200"><X className="h-5 w-5" /></button>}</div>
    </header>
    {message && <p className="mt-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-800">{message}</p>}
    {editing && <div className="mt-5 rounded-2xl border border-blue-200 bg-white p-4 shadow-sm"><h3 className="font-black">{editing.id ? "Edit Service Area" : "New Service Area"}</h3><div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4"><Field label="Area Name" value={editing.area_name} onChange={(value) => setEditing({ ...editing, area_name: value })} /><Field label="Primary City" value={editing.primary_city} onChange={(value) => setEditing({ ...editing, primary_city: value })} /><Field label="State" value={editing.state} onChange={(value) => setEditing({ ...editing, state: value.toUpperCase().slice(0, 2) })} /><Field label="Radius (miles)" type="number" value={editing.coverage_radius_miles} onChange={(value) => setEditing({ ...editing, coverage_radius_miles: value })} /><Field label="Latitude" type="number" value={editing.latitude} onChange={(value) => setEditing({ ...editing, latitude: value })} /><Field label="Longitude" type="number" value={editing.longitude} onChange={(value) => setEditing({ ...editing, longitude: value })} /><label className="flex min-h-11 items-center gap-2 pt-6 font-bold"><input type="checkbox" checked={editing.is_active !== false} onChange={(event) => setEditing({ ...editing, is_active: event.target.checked })} />Active</label><div className="flex items-end gap-2"><button disabled={busy} type="button" onClick={save} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-blue-600 px-4 font-black text-white disabled:opacity-50"><Save className="h-4 w-4" />Save</button><button type="button" onClick={() => setEditing(null)} className="min-h-11 rounded-xl bg-slate-100 px-4 font-black">Cancel</button></div></div></div>}
    <div className="mt-5 grid gap-4 xl:grid-cols-2">{areas.map((area) => <article key={area.id} className={`rounded-2xl border bg-white p-4 shadow-sm ${area.is_active ? "border-slate-200" : "border-red-200 opacity-70"}`}><div className="flex items-start justify-between gap-3"><div className="flex gap-3"><span className="rounded-xl bg-blue-50 p-3 text-blue-700"><MapPin className="h-5 w-5" /></span><div><h3 className="font-black">{area.area_name}</h3><p className="text-sm text-slate-500">{area.primary_city}, {area.state} · {area.coverage_radius_miles} miles</p><p className="text-xs text-slate-400">{area.latitude ?? "No latitude"}, {area.longitude ?? "No longitude"} · {area.is_active ? "Active" : "Inactive"}</p></div></div><button type="button" onClick={() => setEditing({ ...area })} className="min-h-11 rounded-xl bg-slate-100 px-4 font-black">Edit</button></div><div className="mt-4 flex flex-wrap gap-2">{aliases.filter((alias) => alias.service_area_id === area.id).map((alias) => <span key={alias.id} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-slate-100 px-3 text-sm font-bold">{alias.city}, {alias.state}<button disabled={busy || alias.assignment_type === "primary"} type="button" onClick={() => removeAlias(alias.id)} className="text-red-600 disabled:opacity-30" aria-label={`Remove ${alias.city}`}><Trash2 className="h-4 w-4" /></button></span>)}</div><div className="mt-3 grid gap-2 sm:grid-cols-[1fr_90px_auto]"><input value={aliasDraft.city} onChange={(event) => setAliasDraft({ ...aliasDraft, city: event.target.value })} placeholder="Nearby city alias" className="min-h-11 rounded-xl border border-slate-200 px-3" /><input value={aliasDraft.state} onChange={(event) => setAliasDraft({ ...aliasDraft, state: event.target.value.toUpperCase().slice(0, 2) })} placeholder="State" className="min-h-11 rounded-xl border border-slate-200 px-3" /><button disabled={busy} type="button" onClick={() => addAlias(area)} className="min-h-11 rounded-xl bg-slate-900 px-4 font-black text-white">Add Alias</button></div></article>)}</div>
  </section>;
  return embedded ? content : <div className="fixed inset-0 z-[150] bg-black/70" onClick={onClose}><aside className="ml-auto h-full w-full max-w-6xl" onClick={(event) => event.stopPropagation()}>{content}</aside></div>;
}

function Field({ label, value, onChange, type = "text" }) { return <label className="grid gap-1 text-xs font-black uppercase tracking-wide text-slate-500">{label}<input type={type} step={type === "number" ? "any" : undefined} value={value ?? ""} onChange={(event) => onChange(event.target.value)} className="min-h-11 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-950 outline-none focus:border-blue-500" /></label>; }
