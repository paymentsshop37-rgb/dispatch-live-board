import { supabase } from "../../lib/supabase";
import { normalizeCoverageCity, normalizeState } from "./coverageNormalization";
import { buildServiceAreaPayload } from "./serviceAreaPayload";

export { assignJobsToServiceAreas, assignServiceArea, buildServiceAreaRows, coverageStatusBucket, haversineMiles, previousDateRange, statusCounts } from "./serviceAreaAssignment";

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
  const payload = buildServiceAreaPayload(area);
  if (import.meta.env.DEV) {
    console.debug("[CoverageSettings] final service_areas payload", {
      operation: area.id ? "update" : "insert",
      payload,
    });
  }
  const query = area.id
    ? supabase.from("service_areas").update(payload).eq("id", area.id).select().single()
    : supabase.from("service_areas").insert(payload).select().single();
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function addServiceAreaAlias(serviceAreaId, city, state) {
  const normalizedState = normalizeState(state);
  const { data, error } = await supabase.from("service_area_city_aliases").insert({
    service_area_id: serviceAreaId,
    city: String(city || "").trim(),
    state: normalizedState,
    normalized_city: normalizeCoverageCity(city),
    normalized_state: normalizedState,
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
