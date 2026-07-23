import { supabase } from "../../lib/supabase";

const DEFAULT_COLUMNS = [
  "id",
  "created_at",
  "full_name",
  "assigned_number",
  "phone",
  "email",
  "company",
  "company_name",
  "city",
  "state",
  "address",
  "zip_code",
  "coverage",
  "coverage_areas",
  "services",
  "availability",
  "status",
  "notes",
  "rating",
  "is_active",
  "deleted_at",
  "deleted_by",
  "updated_at",
];

const fieldAliases = {
  full_name: ["full_name"],
  assigned_number: ["assigned_number", "technician_number", "display_order"],
  phone: ["phone"],
  email: ["email"],
  company: ["company", "company_name"],
  city: ["city"],
  state: ["state"],
  address: ["address"],
  zip_code: ["zip_code"],
  coverage: ["coverage"],
  coverage_areas: ["coverage_areas"],
  services: ["services"],
  availability: ["availability"],
  status: ["status"],
  notes: ["notes"],
  rating: ["rating"],
};

function firstValue(row, aliases, fallback = "") {
  const key = aliases.find((alias) => row?.[alias] !== undefined && row?.[alias] !== null);
  return key ? row[key] : fallback;
}

function isPresent(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value > 0;
  return String(value || "").trim().length > 0;
}

function hasNoteFlag(notes, label) {
  return String(notes || "").toLowerCase().includes(label.toLowerCase());
}

export function normalizeTechnician(row) {
  const notes = firstValue(row, fieldAliases.notes);

  return {
    raw: row,
    id: row.id,
    full_name: firstValue(row, fieldAliases.full_name),
    assigned_number: normalizeAssignedNumber(firstValue(row, fieldAliases.assigned_number, null)),
    phone: firstValue(row, fieldAliases.phone),
    email: firstValue(row, fieldAliases.email),
    company: firstValue(row, fieldAliases.company),
    city: firstValue(row, fieldAliases.city),
    state: firstValue(row, fieldAliases.state),
    address: firstValue(row, fieldAliases.address),
    zip_code: firstValue(row, fieldAliases.zip_code),
    coverage: firstValue(row, fieldAliases.coverage),
    coverage_areas: firstValue(row, fieldAliases.coverage_areas),
    services: firstValue(row, fieldAliases.services),
    status: firstValue(row, fieldAliases.status, "Active"),
    notes,
    availability: firstValue(row, fieldAliases.availability, "Available"),
    rating: Number(firstValue(row, fieldAliases.rating, 0) || 0),
    isActive: row.is_active !== false,
    deletedAt: row.deleted_at || "",
    deletedBy: row.deleted_by || "",
    createdAt: row.created_at || row.createdAt || "",
    updatedAt: row.updated_at || row.updatedAt || "",
  };
}

function resolveColumn(field, knownColumns) {
  const aliases = fieldAliases[field] || [field];
  return aliases.find((alias) => knownColumns.includes(alias)) || aliases[0];
}

function buildPayload(technician, knownColumns = DEFAULT_COLUMNS) {
  const payload = {};

  Object.keys(fieldAliases).forEach((field) => {
    const column = resolveColumn(field, knownColumns);
    if (knownColumns.includes(column) && Object.prototype.hasOwnProperty.call(technician, field)) {
      payload[column] = field === "assigned_number"
        ? normalizeAssignedNumber(technician[field])
        : arrayBackedField(field)
        ? splitList(technician[field], field === "services" ? /[,\n\r;]+/ : /[\n\r;]+/)
        : technician[field];
    }
  });

  return payload;
}

function arrayBackedField(field) {
  return ["services", "coverage_areas"].includes(field);
}

export async function loadTechnicians({ includeInactive = false } = {}) {
  let query = supabase
    .from("technicians")
    .select("*");

  if (!includeInactive) query = query.eq("is_active", true);

  const { data, error } = await query.order("full_name", { ascending: true });
  console.log("Technicians returned:", data);
  console.log("Count:", data?.length);
  console.log("Error:", error);

  if (error) {
    console.error("Technician load error:", error);
    throw error;
  }

  const technicians = sortTechniciansByAssignedNumber((data || []).map(normalizeTechnician));
  return technicians;
}

export async function loadTechnicianColumnSupport() {
  const checks = await Promise.all(
    DEFAULT_COLUMNS
      .filter((column) => !["id", "created_at", "updated_at"].includes(column))
      .map(async (column) => {
        const { error } = await supabase.from("technicians").select(column).limit(0);
        return { column, supported: !error };
      })
  );

  return {
    supported: checks.filter((check) => check.supported).map((check) => check.column),
    missing: checks.filter((check) => !check.supported).map((check) => check.column),
  };
}

export function subscribeToTechnicians(onChange) {
  const channel = supabase
    .channel("live-technicians")
    .on("postgres_changes", { event: "*", schema: "public", table: "technicians" }, onChange)
    .subscribe();

  return () => supabase.removeChannel(channel);
}

export async function createTechnician(technician, knownColumns = DEFAULT_COLUMNS) {
  const { data, error } = await supabase
    .from("technicians")
    .insert([buildPayload(technician, knownColumns)])
    .select()
    .single();

  if (error) {
    throw error;
  }

  return normalizeTechnician(data);
}

export async function updateTechnician(id, technician, knownColumns = DEFAULT_COLUMNS) {
  const { data, error } = await supabase
    .from("technicians")
    .update(buildPayload(technician, knownColumns))
    .eq("id", id)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return normalizeTechnician(data);
}

export async function deleteOrDeactivateTechnician(technician, userId) {
  if (!technician?.id) throw new Error("Technician ID is required.");
  if (!userId) throw new Error("The authenticated Admin user could not be identified.");

  const { data: linkedById, error: linkedByIdError } = await supabase
    .from("jobs")
    .select("id")
    .eq("technician_id", technician.id)
    .limit(1);

  if (linkedByIdError) throw linkedByIdError;

  let linkedToJobs = Boolean(linkedById?.length);
  if (!linkedToJobs && technician.full_name) {
    const { data: linkedByName, error: linkedByNameError } = await supabase
      .from("jobs")
      .select("id")
      .eq("tech", technician.full_name)
      .limit(1);
    if (linkedByNameError) throw linkedByNameError;
    linkedToJobs = Boolean(linkedByName?.length);
  }

  if (linkedToJobs) {
    const { data, error } = await supabase
      .from("technicians")
      .update({
        is_active: false,
        deleted_at: new Date().toISOString(),
        deleted_by: userId,
      })
      .eq("id", technician.id)
      .select("id")
      .single();
    if (error) throw error;
    if (!data?.id) throw new Error("Supabase did not deactivate the technician.");
    return { action: "deactivated", linkedToJobs: true };
  }

  const { data, error } = await supabase
    .from("technicians")
    .delete()
    .eq("id", technician.id)
    .select("id")
    .single();
  if (error) throw error;
  if (!data?.id) throw new Error("Supabase did not delete the technician.");
  return { action: "permanently deleted", linkedToJobs: false };
}

export async function restoreTechnician(id) {
  const { error } = await supabase
    .from("technicians")
    .update({ is_active: true, deleted_at: null, deleted_by: null, status: "Approved", availability: "Available" })
    .eq("id", id);
  if (error) throw error;
}

export async function permanentlyDeleteUnusedTechnician(technician) {
  if (!technician?.id) throw new Error("Technician ID is required.");
  const { data: linkedById, error: linkedByIdError } = await supabase
    .from("jobs")
    .select("id")
    .eq("technician_id", technician.id)
    .limit(1);
  if (linkedByIdError) throw linkedByIdError;
  if (linkedById?.length) throw new Error("Permanent deletion blocked: technician is linked to existing jobs.");

  if (technician.full_name) {
    const { data: linkedByName, error: linkedByNameError } = await supabase
      .from("jobs")
      .select("id")
      .eq("tech", technician.full_name)
      .limit(1);
    if (linkedByNameError) throw linkedByNameError;
    if (linkedByName?.length) throw new Error("Permanent deletion blocked: technician is linked to existing jobs.");
  }

  const { data, error } = await supabase
    .from("technicians")
    .delete()
    .eq("id", technician.id)
    .select("id")
    .single();
  if (error) throw error;
  if (!data?.id) throw new Error("Supabase did not delete the technician.");
  return { action: "permanently deleted", linkedToJobs: false };
}

export async function markTechnicianInvitationsDeleted(technicianId) {
  if (!technicianId) return;

  const baseUpdate = { status: "Deleted" };
  const withDeletedAt = { ...baseUpdate, deleted_at: new Date().toISOString() };
  const { error } = await supabase
    .from("technician_invitations")
    .update(withDeletedAt)
    .eq("technician_id", technicianId);

  if (!error) return "";

  const errorText = `${error.message || ""} ${error.details || ""} ${error.hint || ""}`.toLowerCase();
  if (errorText.includes("deleted_at") || errorText.includes("column")) {
    const { error: fallbackError } = await supabase
      .from("technician_invitations")
      .update(baseUpdate)
      .eq("technician_id", technicianId);

    if (fallbackError) {
      console.warn("Technician invitation status cleanup skipped:", fallbackError);
      return fallbackError.message || "Invitation cleanup failed.";
    }
    return "";
  }

  console.warn("Technician invitation cleanup skipped:", error);
  return error.message || "Invitation cleanup failed.";
}

export function getKnownColumns(technicians) {
  const columns = new Set(DEFAULT_COLUMNS);

  technicians.forEach((technician) => {
    Object.keys(technician.raw || {}).forEach((column) => columns.add(column));
  });

  return [...columns];
}

function splitServices(services) {
  return splitList(services, /[,\n\r;]+/);
}

function splitList(value, separator) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  return String(value || "")
    .split(separator)
    .map((item) => item.trim())
    .filter(Boolean);
}

export async function getAvailableTechnicians(city, service) {
  const technicians = await loadTechnicians();
  const requestedCity = String(city || "").trim().toLowerCase();
  const requestedService = String(service || "").trim().toLowerCase();

  return sortTechniciansByAssignedNumber(technicians.filter((technician) => {
    const cityMatches =
      !requestedCity ||
      String(technician.city || "").toLowerCase() === requestedCity ||
      String(technician.coverage || "").toLowerCase().includes(requestedCity) ||
      String(technician.coverage_areas || "").toLowerCase().includes(requestedCity);
    const serviceMatches =
      !requestedService ||
      splitServices(technician.services).some((item) => item.toLowerCase().includes(requestedService));

    return (
      technician.isActive &&
      technician.availability === "Available" &&
      cityMatches &&
      serviceMatches
    );
  }));
}

export function getAssignedNumber(technician) {
  const dedicatedNumber = normalizeAssignedNumber(
    technician?.assigned_number ?? technician?.technician_number ?? technician?.display_order
  );
  if (dedicatedNumber !== null) return dedicatedNumber;

  const match = String(technician?.full_name || "").match(/(\d+)\s*$/);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

export function compareTechniciansByAssignedNumber(a, b) {
  const numberDifference = getAssignedNumber(a) - getAssignedNumber(b);
  if (numberDifference !== 0) return numberDifference;
  return String(a?.full_name || "").localeCompare(String(b?.full_name || ""), undefined, { numeric: true });
}

export function sortTechniciansByAssignedNumber(technicians) {
  return [...technicians].sort(compareTechniciansByAssignedNumber);
}

function normalizeAssignedNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 ? number : null;
}
