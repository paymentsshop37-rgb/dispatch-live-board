import { SERVICE_AREA_RADIUS_MILES } from "./coverageConstants.js";

export class ServiceAreaValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ServiceAreaValidationError";
  }
}

export function normalizeServiceAreaState(value) {
  return String(value ?? "").trim().toUpperCase();
}

export function validateServiceArea(area) {
  if (!String(area?.area_name ?? "").trim()) return "Area name is required.";
  if (!String(area?.primary_city ?? "").trim()) return "Primary city is required.";

  const state = normalizeServiceAreaState(area?.state);
  if (!state) return "State is required. Enter a two-letter abbreviation, such as TX.";
  if (!/^[A-Z]{2}$/.test(state)) return "State must be a valid two-letter abbreviation, such as TX.";

  const latitudeError = validateCoordinate(area?.latitude, "Latitude", -90, 90);
  if (latitudeError) return latitudeError;
  return validateCoordinate(area?.longitude, "Longitude", -180, 180);
}

export function buildServiceAreaPayload(area, updatedAt = new Date().toISOString()) {
  const validationMessage = validateServiceArea(area);
  if (validationMessage) throw new ServiceAreaValidationError(validationMessage);

  const normalizedState = String(area.state ?? "").trim().toUpperCase();
  return {
    area_name: String(area.area_name).trim(),
    primary_city: String(area.primary_city).trim(),
    state: normalizedState,
    normalized_state: normalizedState,
    normalized_primary_city: normalizePrimaryCity(area.primary_city),
    latitude: nullableNumber(area.latitude),
    longitude: nullableNumber(area.longitude),
    coverage_radius_miles: SERVICE_AREA_RADIUS_MILES,
    is_active: area.is_active !== false,
    updated_at: updatedAt,
  };
}

function validateCoordinate(value, label, minimum, maximum) {
  if (value === "" || value === null || value === undefined) return "";
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum || number > maximum) {
    return `${label} must be a number between ${minimum} and ${maximum}.`;
  }
  return "";
}

function normalizePrimaryCity(value) {
  return String(value ?? "")
    .toUpperCase()
    .replace(/\bALBURQUERQUE\b/g, "ALBUQUERQUE")
    .replace(/\bFT[.\s]+/g, "FORT ")
    .replace(/[^A-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^FORT\s+WORTH$/, "FORT WORTH")
    .replace(/^FORT\s+STOCKTON$/, "FORT STOCKTON");
}

function nullableNumber(value) {
  return value === "" || value === null || value === undefined ? null : Number(value);
}
