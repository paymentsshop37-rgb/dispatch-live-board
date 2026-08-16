export function normalizeCoverageCity(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/\bALBURQUERQUE\b/g, "ALBUQUERQUE")
    .replace(/\bFT[.\s]+/g, "FORT ")
    .replace(/[^A-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^FORT\s+WORTH$/, "FORT WORTH")
    .replace(/^FORT\s+STOCKTON$/, "FORT STOCKTON");
}

export function normalizeState(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2);
}
