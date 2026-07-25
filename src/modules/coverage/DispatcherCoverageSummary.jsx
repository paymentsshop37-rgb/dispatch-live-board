import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { loadTechnicians } from "../technicians/technicianService";
import GeographicCoverageAnalysis from "./GeographicCoverageAnalysis";
import { buildServiceAreaRows, loadServiceAreaConfiguration, previousDateRange } from "./serviceAreaService";

export default function DispatcherCoverageSummary() {
  const [jobs, setJobs] = useState([]);
  const [areas, setAreas] = useState([]);
  const [aliases, setAliases] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [error, setError] = useState("");
  const [selection, setSelection] = useState(null);
  const range = useMemo(currentWeek, []);
  useEffect(() => {
    Promise.all([
      supabase.from("jobs").select("*"),
      loadServiceAreaConfiguration(),
      loadTechnicians(),
    ]).then(([jobResult, configuration, techRows]) => {
      if (jobResult.error) throw jobResult.error;
      setJobs((jobResult.data || []).map(normalize));
      setAreas(configuration.areas);
      setAliases(configuration.aliases);
      setTechnicians(techRows);
    }).catch((loadError) => setError(loadError.message));
  }, []);
  const filtered = jobs.filter((job) => job.date >= range.from && job.date <= range.to);
  const priorRange = previousDateRange(range);
  const prior = jobs.filter((job) => job.date >= priorRange.from && job.date <= priorRange.to);
  const analysis = buildServiceAreaRows({ jobs: filtered, previousJobs: prior, areas, aliases, technicians });
  if (error) return <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 font-bold text-amber-800">Coverage analysis unavailable: {error}</div>;
  return <div className="text-slate-100"><GeographicCoverageAnalysis showExact={false} defaultTab="areas" serviceAreaRows={analysis.rows} unassignedJobs={analysis.unassignedJobs} rangeLabel="This Week" onDrilldown={setSelection} />{selection && <DispatcherJobs selection={selection} onClose={() => setSelection(null)} />}</div>;
}

function DispatcherJobs({ selection, onClose }) {
  const jobs = selection.bucket === "total" ? selection.row.jobs : selection.row.jobs.filter((job) => bucket(job.status) === selection.bucket);
  return <div className="fixed inset-0 z-[160] bg-black/70" onClick={onClose}><aside className="ml-auto h-full w-full max-w-xl overflow-y-auto bg-[#091827] p-5" onClick={(event) => event.stopPropagation()}><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black uppercase text-blue-300">This Week</p><h3 className="text-2xl font-black">{selection.row.area_name}</h3><p className="text-slate-400">{jobs.length} matching jobs</p></div><button type="button" onClick={onClose} className="min-h-11 rounded-xl bg-white/10 px-4 font-black">Close</button></div><div className="mt-5 space-y-2">{jobs.map((job) => <div key={job.id} className="rounded-xl border border-white/10 bg-white/5 p-3"><strong className="text-blue-200">{job.invoiceNumber || job.id}</strong><p className="text-sm text-slate-400">{job.city}, {job.state} · {job.date}</p><span className="text-xs font-black uppercase">{job.status}</span></div>)}</div></aside></div>;
}
function bucket(status) { const value = String(status || "").toLowerCase().replace(/\s+/g, " ").trim(); if (["completed", "complete", "finished", "terminado"].includes(value)) return "completed"; if (["cancelled", "canceled", "cancelado"].includes(value)) return "cancelled"; if (value.replace(/\s/g, "") === "dryrun") return "dryRuns"; if (["active", "activo"].includes(value)) return "active"; if (value === "pending") return "pending"; if (["in progress", "working", "on site"].includes(value)) return "inProgress"; return "other"; }

function normalize(row) {
  const location = String(row.location || row.address || "");
  const parts = location.split(",").map((part) => part.trim());
  const latitude = row.latitude === null || row.latitude === undefined ? null : Number(row.latitude);
  const longitude = row.longitude === null || row.longitude === undefined ? null : Number(row.longitude);
  return {
    raw: row,
    id: row.id,
    date: String(row.job_date || row.date || row.created_at || "").slice(0, 10),
    invoiceNumber: row.invoice_number || row.reference || "",
    city: row.job_city || row.city || parts[0] || "",
    state: row.job_state || row.state || parts[1] || "",
    status: row.status || "Pending",
    totalBill: Number(row.total_bill || row.amount || 0),
    parts: Number(row.parts || row.parts_cost || 0),
    techLabor: Number(row.tech_labor || row.labor_cost || 0),
    profit: Number(row.total_bill || row.amount || 0) - Number(row.parts || row.parts_cost || 0) - Number(row.tech_labor || row.labor_cost || 0),
    latitude: Number.isFinite(latitude) ? latitude : null,
    longitude: Number.isFinite(longitude) ? longitude : null,
    serviceAreaId: row.service_area_id || null,
    serviceAreaMethod: row.service_area_assignment_method || "",
    serviceAreaDistance: row.service_area_distance_miles,
  };
}
function currentWeek() { const now = new Date(); const from = new Date(now); from.setDate(now.getDate() - now.getDay()); const to = new Date(from); to.setDate(from.getDate() + 6); const local = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; return { from: local(from), to: local(to) }; }
