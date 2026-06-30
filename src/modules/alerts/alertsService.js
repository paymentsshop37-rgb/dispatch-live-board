import { logActivity } from "../activity";

const ALERT_LOG_PREFIX = "nttr-smart-alert-log";

export const ALERT_TYPES = {
  JOB_WITHOUT_TECHNICIAN: "Job Without Technician",
  JOB_WITHOUT_UPDATES: "Job Without Updates",
  OLD_JOB_STILL_OPEN: "Old Job Still Open",
  NEED_REVIEW_INVOICE: "Need Review Invoice",
  PENDING_INVOICE: "Pending Invoice",
  PENDING_TECH_PAYMENT: "Pending Tech Payment",
  CANCELLED_JOB: "Cancelled Jobs",
  DRY_RUN: "Dry Runs",
};

const DISPATCHER_ALERT_TYPES = new Set([
  ALERT_TYPES.JOB_WITHOUT_TECHNICIAN,
  ALERT_TYPES.JOB_WITHOUT_UPDATES,
  ALERT_TYPES.OLD_JOB_STILL_OPEN,
  ALERT_TYPES.NEED_REVIEW_INVOICE,
  ALERT_TYPES.PENDING_INVOICE,
]);

export function buildSmartAlerts(jobs = [], { role = "dispatcher" } = {}) {
  const isAdmin = normalize(role) === "admin";
  return jobs.flatMap((job) => buildJobAlerts(normalizeJob(job), { isAdmin }));
}

export function getVisibleAlerts(alerts = [], { role = "dispatcher" } = {}) {
  if (normalize(role) === "admin") return alerts;
  return alerts.filter((alert) => DISPATCHER_ALERT_TYPES.has(alert.type));
}

export function summarizeAlerts(alerts = []) {
  return {
    total: alerts.length,
    high: alerts.filter((alert) => alert.severity === "High").length,
    medium: alerts.filter((alert) => alert.severity === "Medium").length,
    low: alerts.filter((alert) => alert.severity === "Low").length,
  };
}

export function filterAlerts(alerts = [], { severity = "All", type = "All" } = {}) {
  return alerts.filter((alert) => {
    const severityMatch = severity === "All" || alert.severity === severity;
    const typeMatch = type === "All" || alert.type === type;
    return severityMatch && typeMatch;
  });
}

export async function logNewHighSeverityAlerts(alerts = [], { createdBy = "System" } = {}) {
  const today = localDate(new Date());
  const highAlerts = alerts.filter((alert) => alert.severity === "High");

  await Promise.all(
    highAlerts.map(async (alert) => {
      const key = `${ALERT_LOG_PREFIX}:${today}:${alert.jobId}:${alert.type}`;
      if (localStorage.getItem(key)) return;

      const logged = await logActivity({
        entityType: "job",
        entityId: alert.jobId,
        action: "Smart Alert triggered",
        description: `Smart Alert triggered: ${alert.title}`,
        createdBy,
        metadata: {
          alertType: alert.type,
          severity: alert.severity,
          invoice: alert.invoice,
          company: alert.company,
        },
      });

      if (logged) localStorage.setItem(key, "1");
    })
  );
}

function buildJobAlerts(job, { isAdmin }) {
  const alerts = [];
  const openStatuses = ["pending", "new", "in progress", "assigned"];

  if (openStatuses.includes(job.normalizedStatus) && !job.technician) {
    alerts.push(createAlert(job, ALERT_TYPES.JOB_WITHOUT_TECHNICIAN, "High", "Job needs technician assignment."));
  }

  if (!job.updates) {
    alerts.push(createAlert(job, ALERT_TYPES.JOB_WITHOUT_UPDATES, "Medium", "Job has no dispatcher updates."));
  }

  if (isOldOpenJob(job)) {
    alerts.push(createAlert(job, ALERT_TYPES.OLD_JOB_STILL_OPEN, "High", "Open job is older than 24 hours."));
  }

  if (job.normalizedInvoiceStatus === "need review") {
    alerts.push(createAlert(job, ALERT_TYPES.NEED_REVIEW_INVOICE, "High", "Invoice needs review."));
  }

  if (["pending", "sent"].includes(job.normalizedInvoiceStatus)) {
    alerts.push(createAlert(job, ALERT_TYPES.PENDING_INVOICE, "Medium", "Invoice is pending or sent."));
  }

  if (isAdmin && ["pending", "reviewing", "approved", "hold"].includes(job.normalizedTechPaymentStatus)) {
    alerts.push(createAlert(job, ALERT_TYPES.PENDING_TECH_PAYMENT, "Medium", "Technician payment needs attention."));
  }

  if (job.normalizedStatus === "cancelled" || job.normalizedStatus === "canceled") {
    alerts.push(createAlert(job, ALERT_TYPES.CANCELLED_JOB, "Low", "Job is cancelled."));
  }

  if (job.normalizedStatus === "dry run") {
    alerts.push(createAlert(job, ALERT_TYPES.DRY_RUN, "Low", "Job was marked as a dry run."));
  }

  return alerts;
}

function createAlert(job, type, severity, description) {
  return {
    id: `${job.id || job.invoice || "job"}-${type}`,
    type,
    severity,
    title: type,
    description,
    jobId: job.id,
    invoice: job.invoice || job.reference || "No invoice",
    company: job.company || "No company",
    location: job.location || "No location",
    createdAt: job.createdAt || job.date || "",
    updatedAt: job.updatedAt || job.createdAt || job.date || "",
    job,
  };
}

function normalizeJob(job) {
  const status = read(job, ["status", "job_status"]) || "New";
  const invoiceStatus = read(job, ["invoice", "invoice_status", "billing_status"]) || "Pending";
  const techPaymentStatus = read(job, ["techPaymentStatus", "tech_payment_status"]) || "Pending";
  const technician = read(job, ["tech", "technician", "technician_name", "full_name"]);

  return {
    id: read(job, ["id"]),
    invoice: read(job, ["reference", "invoice_number", "invoice", "invoice_no"]),
    company: read(job, ["company", "company_name", "customer"]),
    location: read(job, ["location", "address", "service_location"]),
    technician,
    status,
    normalizedStatus: normalize(status),
    invoiceStatus,
    normalizedInvoiceStatus: normalize(invoiceStatus),
    techPaymentStatus,
    normalizedTechPaymentStatus: normalize(techPaymentStatus),
    updates: read(job, ["updates", "notes", "job_notes"]),
    date: dateOnly(read(job, ["date", "job_date", "created_at"])),
    createdAt: read(job, ["createdAt", "created_at", "date", "job_date"]),
    updatedAt: read(job, ["updatedAt", "updated_at", "createdAt", "created_at", "date", "job_date"]),
    raw: job,
  };
}

function isOldOpenJob(job) {
  const closedStatuses = ["completed", "cancelled", "canceled", "paid", "invoiced"];
  if (closedStatuses.includes(job.normalizedStatus)) return false;

  const dateValue = job.createdAt || job.date;
  const createdDate = new Date(dateValue);
  if (Number.isNaN(createdDate.getTime())) return false;

  return Date.now() - createdDate.getTime() > 24 * 60 * 60 * 1000;
}

function read(row, aliases) {
  for (const alias of aliases) {
    if (row?.[alias] !== undefined && row?.[alias] !== null) return stringValue(row[alias]);
  }
  return "";
}

function stringValue(value) {
  if (Array.isArray(value)) return value.join(", ");
  return String(value ?? "").trim();
}

function normalize(value) {
  return stringValue(value).toLowerCase().replace(/_/g, " ").replace(/\s+/g, " ").trim();
}

function dateOnly(value) {
  if (!value) return "";
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? "" : localDate(parsed);
}

function localDate(date) {
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 10);
}
