import { supabase } from "../../lib/supabase";

export async function loadCoverageCities({ includeInactive = false } = {}) {
  let query = supabase.from("coverage_cities").select("*");
  if (!includeInactive) query = query.eq("is_active", true);
  const { data, error } = await query.order("state", { ascending: true }).order("city", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function setCoverageCityActive(id, isActive) {
  const { error } = await supabase
    .from("coverage_cities")
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export function normalizeCoverageCity(value) {
  let city = String(value || "")
    .toUpperCase()
    .replace(/\bALBURQUERQUE\b/g, "ALBUQUERQUE")
    .replace(/\bFT[.\s]+/g, "FORT ")
    .replace(/[^A-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  city = city.replace(/^FORT\s+WORTH$/, "FORT WORTH").replace(/^FORT\s+STOCKTON$/, "FORT STOCKTON");
  return city;
}

export function normalizeState(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2);
}

export function cityParts(record) {
  const directCity = record?.city || record?.normalized_city;
  const directState = record?.state;
  if (directCity) return { city: normalizeCoverageCity(directCity), state: normalizeState(directState) };
  const parts = String(record?.location || "").split(",").map((part) => part.trim()).filter(Boolean);
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
  if (normalizedMode === "Today") return { from: localDate(today), to: localDate(today) };
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - today.getDay());
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  if (normalizedMode === "This Week") return { from: localDate(weekStart), to: localDate(weekEnd) };
  if (normalizedMode === "Last Week") {
    const start = new Date(weekStart);
    start.setDate(start.getDate() - 7);
    const end = new Date(weekStart);
    end.setDate(end.getDate() - 1);
    return { from: localDate(start), to: localDate(end) };
  }
  if (normalizedMode === "This Month") {
    return { from: localDate(new Date(today.getFullYear(), today.getMonth(), 1)), to: localDate(new Date(today.getFullYear(), today.getMonth() + 1, 0)) };
  }
  if (normalizedMode === "Last Month") {
    return { from: localDate(new Date(today.getFullYear(), today.getMonth() - 1, 1)), to: localDate(new Date(today.getFullYear(), today.getMonth(), 0)) };
  }
  if (normalizedMode === "This Year") return { from: `${today.getFullYear()}-01-01`, to: `${today.getFullYear()}-12-31` };
  return { from: "", to: "" };
}

export function buildCitiesWithoutJobs({ coverageCities, jobs, technicians, range, includeCancelled, includeDryRuns }) {
  const activeCities = coverageCities.filter((city) => city.is_active !== false);
  const qualifyingJobs = jobs.filter((job) => {
    const date = String(job.date || job.job_date || "").slice(0, 10);
    const status = String(job.status || "").toLowerCase();
    if (range.from && date < range.from) return false;
    if (range.to && date > range.to) return false;
    if (!includeCancelled && ["cancelled", "canceled"].includes(status)) return false;
    if (!includeDryRuns && status === "dry run") return false;
    return Boolean(cityParts(job).city);
  });
  const jobKeys = new Set(qualifyingJobs.map(coverageCityKey));
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const rows = activeCities.map((coverageCity) => {
    const key = coverageCityKey(coverageCity);
    const cityJobs = jobs
      .filter((job) => coverageCityKey(job) === key)
      .sort((a, b) => String(b.date || b.job_date || "").localeCompare(String(a.date || a.job_date || "")));
    const activeTechs = technicians.filter((technician) => technician.isActive !== false && coverageCityKey(technician) === key);
    const lastJobDate = String(cityJobs[0]?.date || cityJobs[0]?.job_date || "").slice(0, 10);
    const daysSinceLastJob = lastJobDate
      ? Math.max(0, Math.floor((today - new Date(`${lastJobDate}T00:00:00`)) / 86400000))
      : null;
    return {
      ...coverageCity,
      normalizedCity: cityParts(coverageCity).city,
      state: cityParts(coverageCity).state,
      jobs: 0,
      activeTechnicians: activeTechs.length,
      technicians: activeTechs,
      lastJobDate,
      daysSinceLastJob,
      coverageStatus: activeTechs.length ? "Technician Covered" : "Coverage Gap",
      suggestedAction: activeTechs.length ? "Contact local technicians" : "Recruit technician / review coverage",
      hasJobs: jobKeys.has(key),
    };
  });

  const missing = rows.filter((row) => !row.hasJobs);
  return {
    rows: missing,
    summary: {
      total: rows.length,
      withJobs: rows.length - missing.length,
      withoutJobs: missing.length,
      coveragePercentage: rows.length ? Math.round(((rows.length - missing.length) / rows.length) * 100) : 0,
    },
  };
}
