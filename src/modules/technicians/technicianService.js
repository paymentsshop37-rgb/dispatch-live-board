import { supabase } from "../../lib/supabase";

const DEFAULT_COLUMNS = [
  "id",
  "created_at",
  "full_name",
  "phone",
  "email",
  "company_name",
  "city",
  "state",
  "zip_code",
  "services",
  "status",
  "notes",
  "ssn_last4",
  "w9_url",
  "insurance_url",
  "driver_license_url",
  "payment_method",
  "agreement_accepted",
  "digital_signature",
  "rating",
  "completed_jobs",
  "total_paid",
  "approved_at",
  "approved_by",
  "rejected_at",
  "rejected_reason",
  "inactive_at",
  "availability_status",
  "availability",
  "current_job_id",
  "profile_photo_url",
  "coverage",
  "acceptance_rate",
  "average_eta",
  "dot_certificate_url",
  "bank_zelle_info",
  "signed_agreement_url",
];

const fieldAliases = {
  full_name: ["full_name"],
  phone: ["phone", "phone_number", "mobile"],
  email: ["email"],
  company_name: ["company_name"],
  city: ["city"],
  state: ["state"],
  address: ["address", "street_address", "home_address"],
  zip_code: ["zip_code"],
  serviceArea: ["service_area", "serviceArea", "coverage_area", "area"],
  services: ["services"],
  status: ["status"],
  notes: ["notes"],
  taxId: ["ssn_last4", "tax_id", "taxId", "ein"],
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
  approvedAt: ["approved_at"],
  approvedBy: ["approved_by"],
  rejectedAt: ["rejected_at"],
  rejectedReason: ["rejected_reason"],
  inactiveAt: ["inactive_at"],
  availabilityStatus: ["availability", "availability_status"],
  currentJobId: ["current_job_id"],
  profilePhotoUrl: ["profile_photo_url"],
  coverage: ["coverage", "coverage_area"],
  acceptanceRate: ["acceptance_rate"],
  averageEta: ["average_eta"],
  dotCertificateUrl: ["dot_certificate_url"],
  bankZelleInfo: ["bank_zelle_info"],
  signedAgreementUrl: ["signed_agreement_url"],
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
    full_name: firstValue(row, fieldAliases.full_name),
    phone: firstValue(row, fieldAliases.phone),
    email: firstValue(row, fieldAliases.email),
    company_name: firstValue(row, fieldAliases.company_name),
    city: firstValue(row, fieldAliases.city),
    state: firstValue(row, fieldAliases.state),
    address: firstValue(row, fieldAliases.address),
    zip_code: firstValue(row, fieldAliases.zip_code),
    serviceArea: firstValue(row, fieldAliases.serviceArea),
    services: firstValue(row, fieldAliases.services),
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
    approvedAt: firstValue(row, fieldAliases.approvedAt),
    approvedBy: firstValue(row, fieldAliases.approvedBy),
    rejectedAt: firstValue(row, fieldAliases.rejectedAt),
    rejectedReason: firstValue(row, fieldAliases.rejectedReason),
    inactiveAt: firstValue(row, fieldAliases.inactiveAt),
    availabilityStatus: firstValue(row, fieldAliases.availabilityStatus, "Available"),
    currentJobId: firstValue(row, fieldAliases.currentJobId),
    profilePhotoUrl: firstValue(row, fieldAliases.profilePhotoUrl),
    coverage: firstValue(row, fieldAliases.coverage),
    acceptanceRate: Number(firstValue(row, fieldAliases.acceptanceRate, 0) || 0),
    averageEta: Number(firstValue(row, fieldAliases.averageEta, 0) || 0),
    dotCertificateUrl: firstValue(row, fieldAliases.dotCertificateUrl),
    bankZelleInfo: firstValue(row, fieldAliases.bankZelleInfo),
    signedAgreementUrl: firstValue(row, fieldAliases.signedAgreementUrl),
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
      payload[column] = field === "services" ? splitServices(technician[field]) : technician[field];
    }
  });

  return payload;
}

export async function loadTechnicians() {
  const { data, error } = await supabase
    .from("technicians")
    .select("*")
    .order("created_at", { ascending: false });

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
  const { data, error } = await supabase
    .from("technicians")
    .delete()
    .eq("id", id)
    .select("id");

  if (error) {
    console.error("Supabase technician delete error:", error);
    throw error;
  }

  if (!data || data.length === 0) {
    const noDeleteError = new Error("No technician was deleted. Check Supabase delete permissions or row-level security policy.");
    console.error("Supabase technician delete error:", noDeleteError);
    throw noDeleteError;
  }
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
  if (Array.isArray(services)) {
    return services.map((service) => String(service).trim()).filter(Boolean);
  }

  return String(services || "")
    .split(/[,\n\r;]+/)
    .map((service) => service.trim())
    .filter(Boolean);
}

export async function getAvailableTechnicians(city, service) {
  const technicians = await loadTechnicians();
  const requestedCity = String(city || "").trim().toLowerCase();
  const requestedService = String(service || "").trim().toLowerCase();

  return technicians.filter((technician) => {
    const cityMatches =
      !requestedCity ||
      String(technician.city || "").toLowerCase() === requestedCity ||
      String(technician.coverage || "").toLowerCase().includes(requestedCity) ||
      String(technician.serviceArea || "").toLowerCase().includes(requestedCity);
    const serviceMatches =
      !requestedService ||
      splitServices(technician.services).some((item) => item.toLowerCase().includes(requestedService));

    return (
      technician.status === "Approved" &&
      technician.availabilityStatus === "Available" &&
      cityMatches &&
      serviceMatches
    );
  });
}
