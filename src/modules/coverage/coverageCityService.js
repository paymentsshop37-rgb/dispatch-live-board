import { supabase } from "../../lib/supabase";

export {
  normalizeCoverageCity,
  normalizeState,
} from "./coverageNormalization.js";
export {
  buildCitiesWithoutJobs,
  cityParts,
  coverageCityKey,
  dateRangeForMode,
} from "./coverageCityAnalysis.js";

export async function loadCoverageCities({ includeInactive = false } = {}) {
  let query = supabase.from("coverage_cities").select("*");
  if (!includeInactive) query = query.eq("is_active", true);
  const [cityResult, areaResult, aliasResult] = await Promise.all([
    query
      .order("state", { ascending: true })
      .order("city", { ascending: true }),
    supabase.from("service_areas").select("*"),
    supabase
      .from("service_area_city_aliases")
      .select("*")
      .order("created_at", { ascending: true }),
  ]);
  if (cityResult.error) throw cityResult.error;
  if (areaResult.error) throw areaResult.error;
  if (aliasResult.error) throw aliasResult.error;
  const areasById = new Map(
    (areaResult.data || []).map((area) => [String(area.id), area]),
  );
  const aliasesByAreaId = new Map();
  (aliasResult.data || []).forEach((alias) => {
    const key = String(alias.service_area_id);
    if (!aliasesByAreaId.has(key)) aliasesByAreaId.set(key, []);
    aliasesByAreaId.get(key).push(alias);
  });
  return (cityResult.data || []).map((city) => ({
    ...city,
    serviceArea: areasById.get(String(city.service_area_id)) || null,
    serviceAreaAliases: aliasesByAreaId.get(String(city.service_area_id)) || [],
  }));
}

export async function setCoverageCityActive(id, isActive) {
  const { error } = await supabase
    .from("coverage_cities")
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}
