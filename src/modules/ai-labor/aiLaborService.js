import { supabase } from "../../lib/supabase";

export async function requestLaborEstimate(payload) {
  const { data, error } = await supabase.functions.invoke("ai-labor-guide", { body: payload });
  if (error) {
    let structured = data;
    if (!structured && error.context?.json) {
      try { structured = await error.context.json(); } catch { /* The fallback below preserves the transport error. */ }
    }
    throw laborGuideError(structured, error);
  }
  if (data?.success === false || data?.error) throw laborGuideError(data);
  return data;
}

function laborGuideError(payload, transportError) {
  const message = payload?.error || transportError?.message || "AI Labor Guide is temporarily unavailable.";
  const context = [
    payload?.stage && `Stage: ${payload.stage}`,
    payload?.status && `Status: ${payload.status}`,
    payload?.details && `Details: ${typeof payload.details === "string" ? payload.details : JSON.stringify(payload.details)}`,
  ].filter(Boolean).join(" · ");
  const error = new Error(context ? `${message} (${context})` : message);
  error.stage = payload?.stage || "transport";
  error.status = payload?.status || transportError?.context?.status || 0;
  error.details = payload?.details || "";
  return error;
}

export async function loadLaborHistory() {
  const { data, error } = await supabase.from("ai_labor_estimates").select("*").order("generated_at", { ascending: false }).limit(500);
  if (error) throw error;
  return data || [];
}

export async function attachLaborEstimate(id, jobId) {
  if (!jobId) throw new Error("A job number is required before attaching an estimate.");
  const { data, error } = await supabase.from("ai_labor_estimates").update({
    job_id: jobId, attached_to_job: true, attached_at: new Date().toISOString(),
  }).eq("id", id).select("*").single();
  if (error) throw error;
  return data;
}

export async function reviewLaborEstimate(id, patch) {
  const { data: { user } } = await supabase.auth.getUser();
  const payload = patch.approval_status ? {
    ...patch, approved_by: user?.id || null, approved_at: new Date().toISOString(),
  } : patch;
  const { data, error } = await supabase.from("ai_labor_estimates").update(payload).eq("id", id).select("*").single();
  if (error) throw error;
  return data;
}

export async function loadLaborSettings() {
  const { data, error } = await supabase.from("ai_labor_guide_settings").select("*").eq("id", true).single();
  if (error) throw error;
  return data;
}

export async function saveLaborSettings(patch) {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase.from("ai_labor_guide_settings").update({
    ...patch, updated_by: user?.id || null, updated_at: new Date().toISOString(),
  }).eq("id", true).select("*").single();
  if (error) throw error;
  return data;
}
