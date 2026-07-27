export function normalizeJobDate(value) {
  const source = String(value || "").trim();
  if (!source) return "";
  const isoMatch = source.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  const usMatch = source.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (usMatch) return `${usMatch[3]}-${usMatch[1].padStart(2, "0")}-${usMatch[2].padStart(2, "0")}`;
  const parsed = new Date(source);
  if (Number.isNaN(parsed.getTime())) return "";
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
}

export function normalizeJobTime(value) {
  const source = String(value || "").trim();
  if (!source) return "";
  const isoTime = source.match(/T(\d{1,2}):(\d{2})(?::(\d{2}))?/i);
  const twelveHour = source.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AP]M)$/i);
  if (twelveHour) {
    let hour = Number(twelveHour[1]) % 12;
    if (twelveHour[4].toUpperCase() === "PM") hour += 12;
    return `${String(hour).padStart(2, "0")}:${twelveHour[2]}:${twelveHour[3] || "00"}`;
  }
  const twentyFourHour = source.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  const match = isoTime || twentyFourHour;
  if (!match) return "";
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] || 0);
  if (hour > 23 || minute > 59 || second > 59) return "";
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}`;
}

export function getJobTimestamp(job) {
  const dateOnly = normalizeJobDate(job?.date || job?.job_date);
  if (!dateOnly) return 0;
  const timeOnly = normalizeJobTime(job?.time || job?.job_time) || "00:00:00";
  const [year, month, day] = dateOnly.split("-").map(Number);
  const [hour, minute, second] = timeOnly.split(":").map(Number);
  const timestamp = new Date(year, month - 1, day, hour, minute, second).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function compareJobsChronologically(a, b) {
  const dateA = normalizeJobDate(a?.date || a?.job_date);
  const dateB = normalizeJobDate(b?.date || b?.job_date);
  if (!dateA && dateB) return 1;
  if (dateA && !dateB) return -1;
  if (dateA !== dateB) return dateA.localeCompare(dateB);

  const timeA = normalizeJobTime(a?.time || a?.job_time);
  const timeB = normalizeJobTime(b?.time || b?.job_time);
  if (!timeA && timeB) return 1;
  if (timeA && !timeB) return -1;
  if (timeA !== timeB) return timeA.localeCompare(timeB);

  const createdDifference = String(a?.createdAt || a?.created_at || "").localeCompare(String(b?.createdAt || b?.created_at || ""));
  if (createdDifference !== 0) return createdDifference;
  return String(a?.id || "").localeCompare(String(b?.id || ""));
}
