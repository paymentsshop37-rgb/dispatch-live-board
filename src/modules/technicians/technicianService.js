import { supabase } from "../../lib/supabase";

const DEFAULT_COLUMNS = [
  "name",
  "phone",
  "email",
  "city",
  "state",
  "service_area",
  "specialties",
  "status",
  "notes",
];

const fieldAliases = {
  name: ["name", "full_name", "technician_name"],
  phone: ["phone", "phone_number", "mobile"],
  email: ["email"],
  company: ["company", "company_name", "business_name"],
  city: ["city"],
  state: ["state"],
  serviceArea: ["service_area", "serviceArea", "coverage_area", "area"],
  specialties: ["specialties", "skills", "services"],
  status: ["status"],
  notes: ["notes"],
  taxId: ["tax_id", "taxId", "ein", "ssn_last4"],
  w9Url: ["w9_url", "w9Url", "w9", "w9_uploaded"],
  insuranceUrl: ["insurance_url", "insuranceUrl", "insurance", "insurance_uploaded"],
  driverLicenseUrl: ["driver_license_url", "driverLicenseUrl", "driver_license", "license_uploaded"],
  paymentMethod: ["payment_method", "paymentMethod", "payment_type"],
  paymentDetails: ["payment_details", "paymentDetails", "bank_info", "zelle"],
  agreementAccepted: ["agreement_accepted", "agreementAccepted", "agreement"],
  digitalSignature: ["digital_signature", "digitalSignature", "signature"],
  rating: ["rating", "average_rating", "avg_rating"],
  completedJobs: ["completed_jobs", "completedJobs", "jobs_completed"],
  totalPaid: ["total_paid", "totalPaid", "paid_total"],
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
  const digitalSignature = firstValue(row, fieldAliases.digitalSignature);
  const agreementAccepted = firstValue(row, fieldAliases.agreementAccepted);

  return {
    raw: row,
    id: row.id,
    name: firstValue(row, fieldAliases.name),
    phone: firstValue(row, fieldAliases.phone),
    email: firstValue(row, fieldAliases.email),
    company: firstValue(row, fieldAliases.company),
    city: firstValue(row, fieldAliases.city),
    state: firstValue(row, fieldAliases.state),
    serviceArea: firstValue(row, fieldAliases.serviceArea),
    specialties: firstValue(row, fieldAliases.specialties),
    status: firstValue(row, fieldAliases.status, "Active"),
    notes,
    taxId: firstValue(row, fieldAliases.taxId),
    w9Url: firstValue(row, fieldAliases.w9Url),
    insuranceUrl: firstValue(row, fieldAliases.insuranceUrl),
    driverLicenseUrl: firstValue(row, fieldAliases.driverLicenseUrl),
    paymentMethod: firstValue(row, fieldAliases.paymentMethod),
    paymentDetails: firstValue(row, fieldAliases.paymentDetails),
    agreementAccepted: isPresent(agreementAccepted) || hasNoteFlag(notes, "Agreement accepted: Yes"),
    digitalSignature: digitalSignature || (hasNoteFlag(notes, "Digital signature:") ? "On file" : ""),
    rating: Number(firstValue(row, fieldAliases.rating, 0) || 0),
    completedJobs: Number(firstValue(row, fieldAliases.completedJobs, 0) || 0),
    totalPaid: Number(firstValue(row, fieldAliases.totalPaid, 0) || 0),
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
    if (knownColumns.includes(column)) {
      payload[column] = technician[field] ?? "";
    }
  });

  return payload;
}

export async function loadTechnicians() {
  const { data, error } = await supabase
    .from("technicians")
    .select("*")
    .order("name", { ascending: true });

  if (error) {
    throw error;
  }

  return (data || []).map(normalizeTechnician);
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

export async function deleteTechnician(id) {
  const { error } = await supabase.from("technicians").delete().eq("id", id);

  if (error) {
    throw error;
  }
}

export function getKnownColumns(technicians) {
  const columns = new Set(DEFAULT_COLUMNS);

  technicians.forEach((technician) => {
    Object.keys(technician.raw || {}).forEach((column) => columns.add(column));
  });

  return [...columns];
}
