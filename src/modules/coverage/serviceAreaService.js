import { supabase } from "../../lib/supabase";
import { normalizeCoverageCity, normalizeState } from "./coverageCityService";

export async function loadServiceAreaConfiguration({ includeInactive = false } = {}) {
  let areaQuery = supabase.from("service_areas").select("*");
  if (!includeInactive) areaQuery = areaQuery.eq("is_active", true);
  const [{ data: areas, error: areaError }, { data: aliases, error: aliasError }] = await Promise.all([
    areaQuery.order("state").order("area_name"),
    supabase.from("service_area_city_aliases").select("*").order("state").order("city"),
  ]);
  if (areaError) throw areaError;
  if (aliasError) throw aliasError;
  return { areas: areas || [], aliases: aliases || [] };
}

export async function saveServiceArea(area) {
  const payload = {
    area_name: String(area.area_name || "").trim(),
    primary_city: String(area.primary_city || "").trim(),
    state: normalizeState(area.state),
    normalized_primary_city: normalizeCoverageCity(area.primary_city),
    latitude: nullableNumber(area.latitude),
    longitude: nullableNumber(area.longitude),
    coverage_radius_miles: nullableNumber(area.coverage_radius_miles) || 75,
    is_active: area.is_active !== false,
    updated_at: new Date().toISOString(),
  };
  const query = area.id
    ? supabase.from("service_areas").update(payload).eq("id", area.id).select().single()
    : supabase.from("service_areas").insert(payload).select().single();
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function addServiceAreaAlias(serviceAreaId, city, state) {
  const { data, error } = await supabase.from("service_area_city_aliases").insert({
    service_area_id: serviceAreaId,
    city: String(city || "").trim(),
    state: normalizeState(state),
    normalized_city: normalizeCoverageCity(city),
    assignment_type: "manual",
  }).select().single();
  if (error) throw error;
  return data;
}

export async function removeServiceAreaAlias(id) {
  const { error } = await supabase.from("service_area_city_aliases").delete().eq("id", id);
  if (error) throw error;
}

export async function assignJobServiceArea(jobId, serviceAreaId) {
  const { error } = await supabase.from("jobs").update({
    service_area_id: serviceAreaId || null,
    service_area_assignment_method: serviceAreaId ? "manual" : "unassigned",
    service_area_distance_miles: null,
    service_area_assigned_at: new Date().toISOString(),
  }).eq("id", jobId);
  if (error) throw error;
}

export function assignServiceArea(job, areas, aliases) {
  const stored = areas.find((area) => String(area.id) === String(job.serviceAreaId));
  if (stored) return assignment(stored, job.serviceAreaMethod || "manual", job.serviceAreaDistance);
  const city = normalizeCoverageCity(job.city);
  const state = normalizeState(job.state);
  const alias = aliases.find((item) => item.normalized_city === city && normalizeState(item.state) === state);
  const aliasArea = alias && areas.find((area) => area.id === alias.service_area_id && area.is_active !== false);
  if (aliasArea) return assignment(aliasArea, "alias", 0);
  const primary = areas.find((area) => area.is_active !== false && area.normalized_primary_city === city && normalizeState(area.state) === state);
  if (primary) return assignment(primary, "primary_city", 0);
  if (Number.isFinite(job.latitude) && Number.isFinite(job.longitude)) {
    const nearest = areas
      .filter((area) => area.is_active !== false && finite(area.latitude) && finite(area.longitude))
      .map((area) => ({ area, distance: haversineMiles(job.latitude, job.longitude, Number(area.latitude), Number(area.longitude)) }))
      .sort((a, b) => a.distance - b.distance)[0];
    if (nearest && nearest.distance <= Number(nearest.area.coverage_radius_miles || 75)) {
      return assignment(nearest.area, "nearest_radius", nearest.distance);
    }
    return { area: null, method: "unassigned", distance: null, closestArea: nearest?.area || null, closestDistance: nearest?.distance ?? null };
  }
  return { area: null, method: "unassigned", distance: null, closestArea: null, closestDistance: null };
}

export function buildServiceAreaRows({ jobs, previousJobs, areas, aliases, technicians }) {
  const allJobs = jobs.map((job) => ({ ...job, areaAssignment: assignServiceArea(job, areas, aliases) }));
  const prior = previousJobs.map((job) => ({ ...job, areaAssignment: assignServiceArea(job, areas, aliases) }));
  const total = allJobs.length;
  const rows = areas.filter((area) => area.is_active !== false).map((area) => {
    const areaJobs = allJobs.filter((job) => job.areaAssignment.area?.id === area.id);
    const priorCount = prior.filter((job) => job.areaAssignment.area?.id === area.id).length;
    const counts = statusCounts(areaJobs);
    const includedCities = [...new Set(aliases.filter((item) => item.service_area_id === area.id).map((item) => item.city))].sort();
    const activeTechnicians = technicians.filter((tech) => tech.isActive !== false && (
      normalizeCoverageCity(tech.city) === area.normalized_primary_city && normalizeState(tech.state) === normalizeState(area.state)
      || aliases.some((alias) => alias.service_area_id === area.id && alias.normalized_city === normalizeCoverageCity(tech.city) && normalizeState(alias.state) === normalizeState(tech.state))
    ));
    const lastJobDate = areaJobs.map((job) => job.date).filter(Boolean).sort().at(-1) || "";
    return {
      ...area,
      ...counts,
      jobs: areaJobs,
      exactCities: includedCities,
      activeTechnicians,
      lastJobDate,
      daysSinceLastJob: daysSince(lastJobDate),
      percentage: total ? (areaJobs.length / total) * 100 : 0,
      previousTotal: priorCount,
      change: priorCount ? ((areaJobs.length - priorCount) / priorCount) * 100 : areaJobs.length ? 100 : 0,
    };
  });
  const unassignedJobs = allJobs.filter((job) => !job.areaAssignment.area);
  return { rows, unassignedJobs, assignedJobs: allJobs };
}

export function statusCounts(jobs) {
  const result = { total: jobs.length, completed: 0, cancelled: 0, dryRuns: 0, active: 0, pending: 0, inProgress: 0, other: 0 };
  jobs.forEach((job) => { result[coverageStatusBucket(job.status)] += 1; });
  return result;
}

export function coverageStatusBucket(status) {
  const value = String(status || "").toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  const compact = value.replace(/\s/g, "");
  if (["completed", "complete", "finished", "terminado"].includes(value)) return "completed";
  if (["cancelled", "canceled", "cancelado"].includes(value)) return "cancelled";
  if (compact === "dryrun") return "dryRuns";
  if (["active", "activo"].includes(value)) return "active";
  if (value === "pending") return "pending";
  if (["in progress", "working", "on site"].includes(value)) return "inProgress";
  return "other";
}

export function previousDateRange(range) {
  const from = new Date(`${range.from}T00:00:00`);
  const to = new Date(`${range.to}T00:00:00`);
  if (Number.isNaN(from.valueOf()) || Number.isNaN(to.valueOf())) return { from: "", to: "" };
  const days = Math.max(1, Math.round((to - from) / 86400000) + 1);
  const previousTo = new Date(from);
  previousTo.setDate(previousTo.getDate() - 1);
  const previousFrom = new Date(previousTo);
  previousFrom.setDate(previousFrom.getDate() - days + 1);
  return { from: localDate(previousFrom), to: localDate(previousTo) };
}

export function haversineMiles(lat1, lon1, lat2, lon2) {
  const radians = (degrees) => degrees * Math.PI / 180;
  const dLat = radians(lat2 - lat1);
  const dLon = radians(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLon / 2) ** 2;
  return 3958.7613 * 2 * Math.asin(Math.sqrt(a));
}

function assignment(area, method, distance) {
  return { area, method, distance: distance === null || distance === undefined ? null : Number(distance), closestArea: area, closestDistance: distance };
}
function nullableNumber(value) { return value === "" || value === null || value === undefined ? null : Number(value); }
function finite(value) { return Number.isFinite(Number(value)); }
function daysSince(value) { return value ? Math.max(0, Math.floor((Date.now() - new Date(`${value}T00:00:00`)) / 86400000)) : null; }
function localDate(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
