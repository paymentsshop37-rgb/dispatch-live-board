import { supabase } from "../../lib/supabase";

const ACTIVITY_TABLE = "activity_log";

export const SYSTEM_ACTIVITY_ACTIONS = [
  "Job Created",
  "Job Deleted",
  "Technician Invited",
  "Technician Registered",
  "Technician Approved",
  "Technician Deleted",
  "Technician Deactivated",
  "Technician Restored",
  "Technician Permanently Deleted",
  "User Created",
  "User Disabled",
  "Invoice Paid",
  "Technician Paid",
  "Tech Payment Pending",
  "Tech Payment Reviewing",
  "Tech Payment Approved",
  "Tech Payment Paid",
  "Tech Payment Hold",
  "Invoice Status changed",
  "Payment Method changed",
  "Total Bill changed",
  "Parts changed",
  "Tech Labor changed",
  "Smart Alert triggered",
  "Login Success",
  "Login Failure",
];

export const JOB_TIMELINE_ACTIONS = [
  "Job Created",
  "Dispatcher Updates",
  "Technician Assigned",
  "Status Changes",
  "ETA Updates",
  "Completion",
  "Invoice Paid",
  "Technician Paid",
];

function warnActivity(error) {
  console.warn("Activity log safe mode:", error?.message || error);
}

export async function logActivity({ entityType, entityId, action, description, createdBy, metadata } = {}) {
  try {
    const payload = {
      entity_type: entityType || "system",
      entity_id: entityId ? String(entityId) : "",
      action: action || "Activity",
      description: description || "",
      created_by: createdBy || "",
      metadata: metadata || null,
    };

    const { error } = await supabase.from(ACTIVITY_TABLE).insert([payload]);
    if (!error) return true;

    if (String(error.message || "").toLowerCase().includes("metadata")) {
      const { metadata: _metadata, ...fallbackPayload } = payload;
      const { error: fallbackError } = await supabase.from(ACTIVITY_TABLE).insert([fallbackPayload]);
      if (!fallbackError) return true;
      warnActivity(fallbackError);
      return false;
    }

    warnActivity(error);
    return false;
  } catch (error) {
    warnActivity(error);
    return false;
  }
}

export async function getRecentActivity({ limit = 100 } = {}) {
  try {
    const { data, error } = await supabase
      .from(ACTIVITY_TABLE)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      warnActivity(error);
      return [];
    }

    return data || [];
  } catch (error) {
    warnActivity(error);
    return [];
  }
}

export async function getActivityByEntity(entityType, entityId) {
  try {
    const { data, error } = await supabase
      .from(ACTIVITY_TABLE)
      .select("*")
      .eq("entity_type", entityType)
      .eq("entity_id", String(entityId || ""))
      .order("created_at", { ascending: false });

    if (error) {
      warnActivity(error);
      return [];
    }

    return data || [];
  } catch (error) {
    warnActivity(error);
    return [];
  }
}
