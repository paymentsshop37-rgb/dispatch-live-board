const UPPERCASE_ADD_JOB_FIELDS = new Set([
  "company",
  "contactName",
  "jobReference",
  "location",
  "address",
  "jobCity",
  "jobState",
  "unitNumber",
  "truckUnit",
  "truckNumber",
  "trailerNumber",
  "vin",
  "problemDescription",
  "complaint",
  "serviceRequested",
  "notes",
  "internalNotes",
  "updates",
  "partsDescription",
]);

export function uppercaseAddJobField(name, value) {
  if (!UPPERCASE_ADD_JOB_FIELDS.has(name) || typeof value !== "string") return value;
  return value.toLocaleUpperCase();
}

export function normalizeUppercaseAddJobFields(values) {
  return Object.fromEntries(
    Object.entries(values || {}).map(([name, value]) => [name, uppercaseAddJobField(name, value)])
  );
}
