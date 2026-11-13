import { normalizeCoverageCity, normalizeState } from "../coverage/coverageNormalization.js";
import { coverageStatusBucket, previousDateRange } from "../coverage/serviceAreaAssignment.js";
import { normalizeAccountingJob } from "../accounting/accountingData.js";

export function intelligenceRange(days = 30, now = new Date()) {
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const from = new Date(to); from.setDate(from.getDate() - days + 1);
  return { from: localDate(from), to: localDate(to) };
}
function localDate(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
export function validDate(value) {
  const date = String(value || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "";
  const parsed = new Date(`${date}T12:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === date ? date : "";
}
export function locationParts(row) {
  const parts = String(row.location || "").split(",").map(part => part.trim());
  return { city: normalizeCoverageCity(row.job_city || row.city || parts[0]), state: normalizeState(row.job_state || row.state || parts[1]) };
}
function cityKey(row) { const p = locationParts(row); return p.city && p.state ? `${p.city}|${p.state}` : ""; }
const textKey = value => String(value || "").trim().toUpperCase();
const presentNumber = value => value !== null && value !== undefined && String(value).trim() !== "" && Number.isFinite(Number(value));
export function financialMetrics(jobs) {
  const completed = jobs.filter(job => coverageStatusBucket(job.status) === "completed");
  const known = completed.filter(job => [job.raw.total_bill, job.raw.parts, job.raw.tech_labor].every(presentNumber));
  const billed = known.reduce((sum, job) => sum + job.totalBill, 0);
  const profit = known.reduce((sum, job) => sum + job.totalBill - job.parts - job.techLabor, 0);
  return { billed, profit, margin: billed > 0 ? profit / billed * 100 : null, measured: known.length, missing: completed.length - known.length };
}
export function metrics(jobs) {
  return { total: jobs.length, completed: jobs.filter(j => coverageStatusBucket(j.status) === "completed").length,
    cancelled: jobs.filter(j => coverageStatusBucket(j.status) === "cancelled").length,
    dryRuns: jobs.filter(j => coverageStatusBucket(j.status) === "dryRuns").length,
    ...financialMetrics(jobs) };
}

export function buildIntelligence({ rawJobs = [], coverageCities = [], areas = [], aliases = [], technicians = [], range, state = "", techniciansAvailable = true }) {
  if (!validDate(range?.from) || !validDate(range?.to) || range.from > range.to) throw new Error("Select a valid date range.");
  const previous = previousDateRange(range);
  const all = rawJobs.map(raw => ({ ...normalizeAccountingJob(raw), ...locationParts(raw), date: validDate(raw.job_date) }));
  const scoped = all.filter(job => !state || job.state === state);
  const inRange = (job, dates) => job.date && job.date >= dates.from && job.date <= dates.to;
  const jobs = scoped.filter(job => inRange(job, range));
  const priorJobs = scoped.filter(job => inRange(job, previous));
  const cityMap = new Map();
  function addCity(record, configured = false) {
    const key = cityKey(record); if (!key) return;
    const parts = locationParts(record);
    if (state && parts.state !== state) return;
    const city = cityMap.get(key) || { key, ...parts, configured: false, jobs: [], previousJobs: [], history: [], technicians: [] };
    city.configured ||= configured; cityMap.set(key, city);
  }
  const activeAreas = areas.filter(area => area.is_active !== false);
  const activeIds = new Set(activeAreas.map(area => String(area.id)));
  coverageCities.filter(city => city.is_active !== false && (!city.service_area_id || activeIds.has(String(city.service_area_id)))).forEach(city => addCity(city, true));
  activeAreas.forEach(area => addCity({ city: area.primary_city, state: area.state }, true));
  aliases.filter(alias => activeIds.has(String(alias.service_area_id))).forEach(alias => addCity(alias, true));
  scoped.filter(job => job.date && job.date <= range.to).forEach(job => addCity(job));
  const eligibleTechs = technicians.filter(tech => tech.is_active !== false && !tech.deleted_at && ["approved", "active"].includes(String(tech.status || "").trim().toLowerCase()));
  for (const job of scoped) {
    const city = cityMap.get(cityKey(job)); if (!city || !job.date || job.date > range.to) continue;
    city.history.push(job);
    if (inRange(job, range)) city.jobs.push(job);
    if (inRange(job, previous)) city.previousJobs.push(job);
  }
  for (const tech of eligibleTechs) cityMap.get(cityKey(tech))?.technicians.push(tech);
  const cities = [...cityMap.values()].map(city => {
    const counts = metrics(city.jobs);
    const previousCount = city.previousJobs.length;
    const lastDate = city.history.map(job => job.date).sort().at(-1) || "";
    const lastCompletedDate = city.history.filter(job => coverageStatusBucket(job.status) === "completed").map(job => job.date).sort().at(-1) || "";
    const change = previousCount ? (counts.total - previousCount) / previousCount * 100 : null;
    const cancellationRate = counts.total ? counts.cancelled / counts.total * 100 : 0;
    const signals = [];
    if (!counts.total) signals.push({ type: "silent", label: "No jobs", action: lastDate ? "Review historical customers and requests received in this city." : "Validate commercial coverage and start recording requests and lead sources.", evidence: `0 recorded jobs in this period; ${previousCount} in the previous period.` });
    if (previousCount >= 3 && change <= -30) signals.push({ type: "decline", label: "Activity declining", action: "Contact customers with fewer requests and review recorded reasons.", evidence: `${counts.total} jobs versus ${previousCount}: ${change.toFixed(0)}%.` });
    if (counts.total >= 4 && cancellationRate >= 25) signals.push({ type: "cancellation", label: "High cancellations", action: "Review cancelled jobs and record their reasons.", evidence: `${counts.cancelled} of ${counts.total} jobs cancelled (${cancellationRate.toFixed(0)}%).` });
    if (counts.measured && counts.profit < 0) signals.push({ type: "margin", label: "Negative margin", action: "Review pricing, parts, and technician costs on completed jobs.", evidence: `${counts.measured} completed jobs with complete financial data and a negative combined margin.` });
    if (counts.total && techniciansAvailable && !city.technicians.length) signals.push({ type: "technician", label: "No registered local technician", action: "Check technicians serving from nearby cities before recruiting.", evidence: "No active technicians registered in this exact city; radius coverage is not evaluated." });
    return { ...city, ...counts, previousCount, change, lastDate, lastCompletedDate, cancellationRate, signals, technicianCount: techniciansAvailable ? city.technicians.length : null };
  }).sort((a, b) => b.signals.length - a.signals.length || b.previousCount - a.previousCount || a.city.localeCompare(b.city));
  const groups = field => {
    const map = new Map();
    for (const job of [...jobs, ...priorJobs]) { const name = textKey(job[field]) || "NOT RECORDED"; if (!map.has(name)) map.set(name, { name, jobs: [], previousJobs: [] }); }
    for (const job of jobs) map.get(textKey(job[field]) || "NOT RECORDED").jobs.push(job);
    for (const job of priorJobs) map.get(textKey(job[field]) || "NOT RECORDED").previousJobs.push(job);
    return [...map.values()].map(group => ({ ...group, ...metrics(group.jobs), previousCount: group.previousJobs.length })).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  };
  const fieldNames = [...new Set(scoped.flatMap(job => Object.keys(job.raw)))].sort();
  const fieldAudit = fieldNames.map(name => ({ name, total: jobs.length, filled: jobs.filter(job => { const v = job.raw[name]; return v !== null && v !== undefined && String(v).trim() !== ""; }).length }));
  const trendMap = new Map();
  for (const job of jobs) { if (!trendMap.has(job.date)) trendMap.set(job.date, { date: job.date, jobs: 0, cancelled: 0 }); const point = trendMap.get(job.date); point.jobs++; point.cancelled += coverageStatusBucket(job.status) === "cancelled" ? 1 : 0; }
  const trend = []; const day = new Date(`${range.from}T12:00:00`);
  while (localDate(day) <= range.to) { const date = localDate(day); trend.push(trendMap.get(date) || { date, jobs: 0, cancelled: 0 }); day.setDate(day.getDate() + 1); }
  return { jobs, priorJobs, previous, cities, summary: metrics(jobs), trend, customers: groups("company"), dispatchers: groups("dispatcher"), technicianPerformance: groups("technician"), fieldAudit,
    quality: { invalidDates: scoped.filter(job => !job.date).length, missingGeography: jobs.filter(job => !cityKey(job)).length, missingCustomer: jobs.filter(job => !textKey(job.company)).length, unknownStatus: jobs.filter(job => coverageStatusBucket(job.status) === "other").length },
    states: [...new Set([...all.map(job => job.state), ...coverageCities.map(city => normalizeState(city.state)), ...areas.map(area => normalizeState(area.state)), ...aliases.map(alias => normalizeState(alias.state))].filter(Boolean))].sort() };
}

export function intelligenceCsv(rows) {
  const cell = value => { let s = String(value ?? ""); if (/^\s*[=+@-]/.test(s)) s = `'${s}`; return `"${s.replaceAll('"', '""')}"`; };
  return "\uFEFF" + rows.map(row => row.map(cell).join(",")).join("\r\n");
}
