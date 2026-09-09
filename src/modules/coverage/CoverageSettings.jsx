import NearbyCities from "./NearbyCities";
import React, { useEffect, useState } from "react";
import { MapPin, Plus, Save, X } from "lucide-react";
import { addServiceAreaAlias, loadServiceAreaConfiguration, removeServiceAreaAlias, saveServiceArea, canManageServiceAreaAliases, syncNearbyCities } from "./serviceAreaService";
import { ServiceAreaValidationError, validateServiceArea } from "./serviceAreaPayload";
import { SERVICE_AREA_RADIUS_MILES } from "./coverageConstants";

const emptyArea = { area_name: "", primary_city: "", state: "", latitude: "", longitude: "", coverage_radius_miles: SERVICE_AREA_RADIUS_MILES, is_active: true };

export default function CoverageSettings({ embedded = false, onClose, onChanged }) {
  const [areas, setAreas] = useState([]);
  const [aliases, setAliases] = useState([]);
  const [editing, setEditing] = useState(null);
  const [aliasDraft, setAliasDraft] = useState({ city: "", state: "" });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [syncResults, setSyncResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    refresh();
    canManageServiceAreaAliases().then(setIsAdmin).catch(() => setIsAdmin(false));
  }, []);
  async function syncAreas(targets) {
    if (!isAdmin || busy || !window.confirm("Find and add all cities within this service radius?")) return;
    setBusy(true); setSyncResults([]); setMessage("Finding nearby cities…");
    const results = [];
    try {
      for (const area of targets) {
        try { results.push(await syncNearbyCities(area.id)); }
        catch (error) { results.push({ service_area_id: area.id, area_name: area.area_name, errors: 1, error: error.message }); }
        setSyncResults([...results]);
      }
      await refresh(); onChanged?.();
    } finally { setBusy(false); }
  }
  async function refresh() {
    setLoading(true); setLoadFailed(false);
    try {
      const result = await loadServiceAreaConfiguration({ includeInactive: true, onAreas: setAreas, onAliases: setAliases });
      setAreas(result.areas); setAliases(result.aliases); setMessage("");
    } catch (error) { setLoadFailed(true); setMessage(`Unable to finish loading coverage: ${error.message}`); }
    finally { setLoading(false); }
  }
  async function save() {
    if (!isAdmin || busy) return;
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
    if (!isAdmin || busy) return;
    if (!aliasDraft.city || !aliasDraft.state) return setMessage("Alias city and state are required.");
    setBusy(true);
    try { await addServiceAreaAlias(area.id, aliasDraft.city, aliasDraft.state); setAliasDraft({ city: "", state: "" }); await refresh(); setMessage("City alias added."); onChanged?.(); }
    catch (error) { setMessage(`Unable to add alias: ${error.message}`); }
    finally { setBusy(false); }
  }
  async function removeAlias(id) {
    if (!isAdmin || busy) return;
    setBusy(true);
    try { await removeServiceAreaAlias(id); await refresh(); setMessage("City alias removed."); onChanged?.(); }
    catch (error) { setMessage(`Unable to remove alias: ${error.message}`); }
    finally { setBusy(false); }
  }

  const content = <section className={`${embedded ? "" : "h-full"} overflow-y-auto bg-slate-50 p-4 text-slate-950 md:p-6`}>
    <header className="flex items-start justify-between gap-4">
      <div><p className="text-xs font-black uppercase tracking-[0.18em] text-blue-600">Admin Configuration</p><h2 className="mt-1 text-2xl font-black">Coverage Settings</h2><p className="mt-1 text-sm font-semibold text-slate-500">Manage service areas, radiuses, coordinates, and exact-city aliases.</p></div>
      <div className="flex flex-wrap gap-2">{isAdmin && <><button disabled={busy || !areas.length} type="button" onClick={() => syncAreas(areas)} className="min-h-11 rounded-xl bg-slate-900 px-4 font-black text-white disabled:opacity-50">Sync All Service Areas</button><button disabled={busy} type="button" onClick={() => setEditing({ ...emptyArea })} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-blue-600 px-4 font-black text-white"><Plus className="h-4 w-4" />Add Area</button></>}{onClose && <button type="button" onClick={onClose} className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-200"><X className="h-5 w-5" /></button>}</div>
    </header>
    {message && <p className="mt-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-800">{message}</p>}
    {loading && <p role="status" className="mt-4 text-sm font-semibold text-slate-600">{areas.length ? `Loading nearby cities… ${aliases.length.toLocaleString()} loaded. Service areas are available below.` : "Loading service areas…"}</p>}
    {loadFailed && <button type="button" onClick={refresh} className="mt-3 min-h-11 rounded-xl bg-blue-600 px-4 font-bold text-white">Retry loading cities</button>}
    {!loading && !loadFailed && !areas.length && <p className="mt-4 text-sm text-slate-600">No service areas found.</p>}
    <div aria-live="polite" className="mt-3 max-h-64 overflow-y-auto">{syncResults.map(result => <p key={result.service_area_id} className="mt-2 rounded-xl border bg-white p-3 text-sm"><strong>{result.area_name}</strong>: {result.error ? `Sync failed: ${result.error}. Retry is safe.` : `${result.added} cities added · ${result.already_existed} already existed · ${result.errors} errors`}</p>)}</div>
    {editing && isAdmin && <div className="mt-5 rounded-2xl border border-blue-200 bg-white p-4 shadow-sm"><h3 className="font-black">{editing.id ? "Edit Service Area" : "New Service Area"}</h3><div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4"><Field label="Area Name" value={editing.area_name} onChange={(value) => setEditing({ ...editing, area_name: value })} /><Field label="Primary City" value={editing.primary_city} onChange={(value) => setEditing({ ...editing, primary_city: value })} /><Field label="State" value={editing.state} onChange={(value) => setEditing({ ...editing, state: value.toUpperCase().slice(0, 2) })} /><Field label="Radius (miles)" type="number" value={editing.coverage_radius_miles} onChange={(value) => setEditing({ ...editing, coverage_radius_miles: value })} /><Field label="Latitude" type="number" value={editing.latitude} onChange={(value) => setEditing({ ...editing, latitude: value })} /><Field label="Longitude" type="number" value={editing.longitude} onChange={(value) => setEditing({ ...editing, longitude: value })} /><label className="flex min-h-11 items-center gap-2 pt-6 font-bold"><input type="checkbox" checked={editing.is_active !== false} onChange={(event) => setEditing({ ...editing, is_active: event.target.checked })} />Active</label><div className="flex items-end gap-2"><button disabled={busy} type="button" onClick={save} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-blue-600 px-4 font-black text-white disabled:opacity-50"><Save className="h-4 w-4" />Save</button><button type="button" onClick={() => setEditing(null)} className="min-h-11 rounded-xl bg-slate-100 px-4 font-black">Cancel</button></div></div></div>}
    <div className="mt-5 grid gap-4 xl:grid-cols-2">{areas.map((area) => <article key={area.id} className={`rounded-2xl border bg-white p-4 shadow-sm ${area.is_active ? "border-slate-200" : "border-red-200 opacity-70"}`}><div className="flex items-start justify-between gap-3"><div className="flex gap-3"><span className="rounded-xl bg-blue-50 p-3 text-blue-700"><MapPin className="h-5 w-5" /></span><div><h3 className="font-black">{area.area_name}</h3><p className="text-sm text-slate-500">{area.primary_city}, {area.state} · {area.coverage_radius_miles} miles</p><p className="text-xs text-slate-400">{area.latitude ?? "No latitude"}, {area.longitude ?? "No longitude"} · {area.is_active ? "Active" : "Inactive"}</p></div></div><button disabled={!isAdmin || busy} type="button" onClick={() => setEditing({ ...area })} className="min-h-11 rounded-xl bg-slate-100 px-4 font-black">Edit</button></div><NearbyCities loading={loading} incomplete={loadFailed} aliases={aliases.filter(alias => alias.service_area_id === area.id)} isAdmin={isAdmin} busy={busy} onRemove={removeAlias} />{isAdmin && <><div className="mt-3 grid gap-2 sm:grid-cols-[1fr_90px_auto]"><input value={aliasDraft.city} onChange={(event) => setAliasDraft({ ...aliasDraft, city: event.target.value })} placeholder="Nearby city alias" className="min-h-11 rounded-xl border border-slate-200 px-3" /><input value={aliasDraft.state} onChange={(event) => setAliasDraft({ ...aliasDraft, state: event.target.value.toUpperCase().slice(0, 2) })} placeholder="State" className="min-h-11 rounded-xl border border-slate-200 px-3" /><button disabled={busy} type="button" onClick={() => addAlias(area)} className="min-h-11 rounded-xl bg-slate-900 px-4 font-black text-white">Add Alias</button></div><button disabled={busy} type="button" onClick={() => syncAreas([area])} className="mt-3 min-h-11 rounded-xl bg-blue-600 px-4 font-black text-white disabled:opacity-50">Sync Nearby Cities</button></>}</article>)}</div>
  </section>;
  return embedded ? content : <div className="fixed inset-0 z-[150] bg-black/70" onClick={onClose}><aside className="ml-auto h-full w-full max-w-6xl" onClick={(event) => event.stopPropagation()}>{content}</aside></div>;
}

function Field({ label, value, onChange, type = "text", readOnly = false }) { return <label className="grid gap-1 text-xs font-black uppercase tracking-wide text-slate-500">{label}<input type={type} step={type === "number" ? "any" : undefined} value={value ?? ""} readOnly={readOnly} onChange={(event) => onChange?.(event.target.value)} className="min-h-11 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-950 outline-none read-only:bg-slate-100 read-only:text-slate-600 focus:border-blue-500" /></label>; }
