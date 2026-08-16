import {
  normalizeCoverageCity,
  normalizeState,
} from "./coverageNormalization.js";
import { assignJobsToServiceAreas } from "./serviceAreaAssignment.js";
import { SERVICE_AREA_RADIUS_MILES } from "./coverageConstants.js";

export function cityParts(record) {
  const directCity = record?.city || record?.normalized_city;
  const directState = record?.state;
  if (directCity)
    return {
      city: normalizeCoverageCity(directCity),
      state: normalizeState(directState),
    };
  const parts = String(record?.location || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return {
    city: normalizeCoverageCity(parts[0]),
    state: normalizeState(directState || parts[1]),
  };
}

export function coverageCityKey(record) {
  const parts = cityParts(record);
  return `${parts.city}|${parts.state}`;
}

export function dateRangeForMode(mode, from = "", to = "") {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const localDate = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };
  const normalizedMode = String(mode || "").replace(/([a-z])([A-Z])/g, "$1 $2");
  if (normalizedMode === "Custom Range" || from || to) return { from, to };
  if (normalizedMode === "Today")
    return { from: localDate(today), to: localDate(today) };
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - today.getDay());
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  if (normalizedMode === "This Week")
    return { from: localDate(weekStart), to: localDate(weekEnd) };
  if (normalizedMode === "Last Week") {
    const start = new Date(weekStart);
    start.setDate(start.getDate() - 7);
    const end = new Date(weekStart);
    end.setDate(end.getDate() - 1);
    return { from: localDate(start), to: localDate(end) };
  }
  if (normalizedMode === "This Month") {
    return {
      from: localDate(new Date(today.getFullYear(), today.getMonth(), 1)),
      to: localDate(new Date(today.getFullYear(), today.getMonth() + 1, 0)),
    };
  }
  if (normalizedMode === "Last Month") {
    return {
      from: localDate(new Date(today.getFullYear(), today.getMonth() - 1, 1)),
      to: localDate(new Date(today.getFullYear(), today.getMonth(), 0)),
    };
  }
  if (normalizedMode === "This Year")
    return {
      from: `${today.getFullYear()}-01-01`,
      to: `${today.getFullYear()}-12-31`,
    };
  return { from: "", to: "" };
}

export function buildCitiesWithoutJobs({
  coverageCities,
  jobs,
  technicians,
  range,
  includeCancelled,
  includeDryRuns,
}) {
  const activeCities = coverageCities.filter(
    (city) => city.is_active !== false,
  );
  const qualifyingJobs = jobs.filter((job) => {
    const date = String(job.date || job.job_date || "").slice(0, 10);
    const status = String(job.status || "").trim().toLowerCase();
    if (range.from && date < range.from) return false;
    if (range.to && date > range.to) return false;
    if (!includeCancelled && ["cancelled", "canceled"].includes(status))
      return false;
    if (!includeDryRuns && status === "dry run") return false;
    return Boolean(cityParts(job).city || hasCoordinates(job));
  });
  const { areas, aliases } = coverageConfiguration(activeCities);
  const { jobsByAreaId } = assignJobsToServiceAreas(
    qualifyingJobs,
    areas,
    aliases,
  );
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const rows = activeCities.map((coverageCity) => {
    const key = coverageCityKey(coverageCity);
    const cityJobs = [
      ...(jobsByAreaId.get(
        String(coverageCity.service_area_id || coverageCity.id),
      ) || []),
    ].sort((a, b) =>
      String(b.date || b.job_date || "").localeCompare(
        String(a.date || a.job_date || ""),
      ),
    );
    const activeTechs = technicians.filter(
      (technician) =>
        technician.isActive !== false && coverageCityKey(technician) === key,
    );
    const lastJobDate = String(
      cityJobs[0]?.date || cityJobs[0]?.job_date || "",
    ).slice(0, 10);
    const daysSinceLastJob = lastJobDate
      ? Math.max(
          0,
          Math.floor((today - new Date(`${lastJobDate}T00:00:00`)) / 86400000),
        )
      : null;
    return {
      ...coverageCity,
      normalizedCity: cityParts(coverageCity).city,
      state: cityParts(coverageCity).state,
      jobs: cityJobs.length,
      assignedJobs: cityJobs,
      activeTechnicians: activeTechs.length,
      technicians: activeTechs,
      lastJobDate,
      daysSinceLastJob,
      coverageStatus: coverageStatus(cityJobs.length, activeTechs.length),
      suggestedAction: suggestedAction(cityJobs.length, activeTechs.length),
      hasJobs: cityJobs.length > 0,
    };
  });

  const missing = rows.filter((row) => !row.hasJobs);
  return {
    rows,
    missingRows: missing,
    summary: {
      total: rows.length,
      withJobs: rows.length - missing.length,
      withoutJobs: missing.length,
      coveragePercentage: rows.length
        ? Math.round(((rows.length - missing.length) / rows.length) * 100)
        : 0,
    },
  };
}

function coverageConfiguration(coverageCities) {
  const areasById = new Map();
  const aliasesByKey = new Map();
  coverageCities.forEach((city) => {
    const id = String(city.service_area_id || city.serviceArea?.id || city.id);
    const area = city.serviceArea || {
      id,
      area_name: city.city,
      primary_city: city.city,
      normalized_primary_city: city.normalized_city,
      state: city.state,
      normalized_state: city.normalized_state,
      latitude: city.latitude,
      longitude: city.longitude,
      coverage_radius_miles: SERVICE_AREA_RADIUS_MILES,
      is_active: city.is_active,
    };
    areasById.set(id, {
      ...area,
      coverage_radius_miles: SERVICE_AREA_RADIUS_MILES,
    });
    const exactCityAlias = {
      service_area_id: id,
      city: city.city,
      normalized_city: city.normalized_city,
      state: city.state,
      normalized_state: city.normalized_state,
    };
    [exactCityAlias, ...(city.serviceAreaAliases || [])].forEach((alias) => {
      const aliasKey = `${id}|${coverageCityKey(alias)}`;
      aliasesByKey.set(aliasKey, { ...alias, service_area_id: id });
    });
  });
  return {
    areas: [...areasById.values()],
    aliases: [...aliasesByKey.values()],
  };
}

function hasCoordinates(record) {
  const latitudeValue = record?.latitude ?? record?.raw?.latitude;
  const longitudeValue = record?.longitude ?? record?.raw?.longitude;
  if (
    latitudeValue === null ||
    latitudeValue === undefined ||
    latitudeValue === ""
  )
    return false;
  if (
    longitudeValue === null ||
    longitudeValue === undefined ||
    longitudeValue === ""
  )
    return false;
  return (
    Number.isFinite(Number(latitudeValue)) &&
    Number.isFinite(Number(longitudeValue))
  );
}

function coverageStatus(jobCount, technicianCount) {
  if (jobCount && technicianCount) return "Jobs + Technician Covered";
  if (jobCount) return "Jobs Present / Coverage Gap";
  return technicianCount
    ? "No Jobs / Technician Covered"
    : "No Jobs / Coverage Gap";
}

function suggestedAction(jobCount, technicianCount) {
  if (jobCount && technicianCount)
    return "Monitor demand and technician capacity";
  if (jobCount) return "Recruit technician / review coverage";
  return technicianCount
    ? "Contact local technicians"
    : "Recruit technician / review coverage";
}
