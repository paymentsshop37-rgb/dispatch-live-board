function timeParts(value) {
  if (value === null || value === undefined || value === "") return null;
  const text = String(value).trim();
  const twelveHour = text.match(/^(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?\s*([AP]M)$/i);
  if (twelveHour) {
    const hour = Number(twelveHour[1]);
    const minute = Number(twelveHour[2]);
    if (hour < 1 || hour > 12 || minute > 59) return null;
    return { hour24: (hour % 12) + (twelveHour[3].toUpperCase() === "PM" ? 12 : 0), minute };
  }
  const timeOnly = text.match(/^(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/);
  if (timeOnly) {
    const hour24 = Number(timeOnly[1]);
    const minute = Number(timeOnly[2]);
    return hour24 <= 23 && minute <= 59 ? { hour24, minute } : null;
  }
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : { hour24: date.getHours(), minute: date.getMinutes() };
}

export function formatTime12Hour(value) {
  const parts = timeParts(value);
  if (!parts) return value ? String(value) : "";
  return `${String(parts.hour24 % 12 || 12).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")} ${parts.hour24 >= 12 ? "PM" : "AM"}`;
}

export function normalizeTimeForStorage(value) {
  const parts = timeParts(value);
  return parts ? `${String(parts.hour24).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}` : "";
}

export function timeInputParts(value) {
  const parts = timeParts(value) || { hour24: 0, minute: 0 };
  return { hour: String(parts.hour24 % 12 || 12), minute: String(parts.minute).padStart(2, "0"), period: parts.hour24 >= 12 ? "PM" : "AM" };
}

export function timeFromInputParts(hour, minute, period) {
  const hourNumber = Math.min(12, Math.max(1, Number(hour) || 12));
  const minuteNumber = Math.min(59, Math.max(0, Number(minute) || 0));
  const hour24 = (hourNumber % 12) + (period === "PM" ? 12 : 0);
  return `${String(hour24).padStart(2, "0")}:${String(minuteNumber).padStart(2, "0")}`;
}

export function formatDateTime12Hour(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString([], { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: true });
}
