import { normalizeCoverageCity, normalizeState } from "./coverageNormalization.js";

export function assignServiceArea(job, areas, aliases) {
  const activeAreas = areas.filter((area) => area.is_active !== false);
  const stored = activeAreas.find((area) => String(area.id) === String(job?.serviceAreaId));
  const storedMethod = String(job?.serviceAreaMethod || "").trim().toLowerCase();

  // An explicit Admin assignment remains authoritative. Automatic assignments
  // are recalculated so edits to aliases, coordinates, and radiuses take effect.
  if (stored && storedMethod === "manual") {
    return assignment(stored, "manual", job.serviceAreaDistance);
  }

  const location = normalizedJobLocation(job);
  const alias = aliases.find((item) => (
    normalizeCoverageCity(item.normalized_city || item.city) === location.city
    && normalizeState(item.normalized_state || item.state) === location.state
  ));
  const aliasArea = alias && activeAreas.find((area) => String(area.id) === String(alias.service_area_id));
  if (aliasArea) return assignment(aliasArea, "alias", 0);

  const primary = activeAreas.find((area) => (
    normalizeCoverageCity(area.normalized_primary_city || area.primary_city) === location.city
    && normalizeState(area.normalized_state || area.state) === location.state
  ));
  if (primary) return assignment(primary, "primary_city", 0);

  const latitude = coordinate(job?.latitude ?? job?.raw?.latitude, -90, 90);
  const longitude = coordinate(job?.longitude ?? job?.raw?.longitude, -180, 180);
  if (latitude !== null && longitude !== null) {
    const candidates = activeAreas
      .map((area) => {
        const areaLatitude = coordinate(area.latitude, -90, 90);
        const areaLongitude = coordinate(area.longitude, -180, 180);
        if (areaLatitude === null || areaLongitude === null) return null;
        return {
          area,
          distance: haversineMiles(latitude, longitude, areaLatitude, areaLongitude),
          radius: positiveNumber(area.coverage_radius_miles, 75),
        };
      })
      .filter(Boolean)
      .sort((left, right) => left.distance - right.distance);
    const qualifying = candidates.find((candidate) => candidate.distance <= candidate.radius);
    if (qualifying) return assignment(qualifying.area, "nearest_radius", qualifying.distance);
    return {
      area: null,
      method: "unassigned",
      distance: null,
      closestArea: candidates[0]?.area || null,
      closestDistance: candidates[0]?.distance ?? null,
    };
  }

  // Preserve a legacy automatic assignment only when the row has no usable
  // city/state or coordinates to recalculate from current configuration.
  if (stored) return assignment(stored, storedMethod || "stored", job.serviceAreaDistance);
  return { area: null, method: "unassigned", distance: null, closestArea: null, closestDistance: null };
}

export function buildServiceAreaRows({ jobs, previousJobs, areas, aliases, technicians }) {
  const allJobs = jobs.map((job) => ({ ...job, areaAssignment: assignServiceArea(job, areas, aliases) }));
  const prior = previousJobs.map((job) => ({ ...job, areaAssignment: assignServiceArea(job, areas, aliases) }));
  const total = allJobs.length;
  const rows = areas.filter((area) => area.is_active !== false).map((area) => {
    const areaJobs = allJobs.filter((job) => String(job.areaAssignment.area?.id) === String(area.id));
    const priorCount = prior.filter((job) => String(job.areaAssignment.area?.id) === String(area.id)).length;
    const counts = statusCounts(areaJobs);
    const includedCities = [...new Set(aliases.filter((item) => String(item.service_area_id) === String(area.id)).map((item) => item.city))].sort();
    const activeTechnicians = technicians.filter((tech) => tech.isActive !== false && (
      normalizeCoverageCity(tech.city) === normalizeCoverageCity(area.normalized_primary_city || area.primary_city)
        && normalizeState(tech.state) === normalizeState(area.normalized_state || area.state)
      || aliases.some((alias) => String(alias.service_area_id) === String(area.id)
        && normalizeCoverageCity(alias.normalized_city || alias.city) === normalizeCoverageCity(tech.city)
        && normalizeState(alias.normalized_state || alias.state) === normalizeState(tech.state))
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

function normalizedJobLocation(job) {
  const raw = job?.raw || {};
  let city = firstValue(job?.city, job?.normalized_city, raw.job_city, raw.city, raw.normalized_city);
  let state = firstValue(job?.state, job?.normalized_state, raw.job_state, raw.state, raw.normalized_state);
  if (!city || !state) {
    const parsed = parseLocation(firstValue(job?.location, raw.location, raw.address, raw.service_location));
    city ||= parsed.city;
    state ||= parsed.state;
  }
  return { city: normalizeCoverageCity(city), state: normalizeState(state) };
}

function parseLocation(value) {
  const parts = String(value || "").split(",").map((part) => part.trim()).filter(Boolean);
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const stateMatch = parts[index].toUpperCase().match(/^([A-Z]{2})(?:\s+\d{5}(?:-\d{4})?)?$/);
    if (stateMatch && index > 0) return { city: parts[index - 1], state: stateMatch[1] };
  }
  const simple = String(value || "").trim().match(/^(.+?)[,\s]+([A-Za-z]{2})(?:\s+\d{5}(?:-\d{4})?)?$/);
  return simple ? { city: simple[1], state: simple[2] } : { city: "", state: "" };
}

function assignment(area, method, distance) {
  return { area, method, distance: distance === null || distance === undefined ? null : Number(distance), closestArea: area, closestDistance: distance };
}
function firstValue(...values) { return values.find((value) => String(value ?? "").trim()) || ""; }
function coordinate(value, minimum, maximum) { const number = Number(value); return value === null || value === undefined || value === "" || !Number.isFinite(number) || number < minimum || number > maximum ? null : number; }
function positiveNumber(value, fallback) { const number = Number(value); return Number.isFinite(number) && number > 0 ? number : fallback; }
function daysSince(value) { return value ? Math.max(0, Math.floor((Date.now() - new Date(`${value}T00:00:00`)) / 86400000)) : null; }
function localDate(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
