import { supabase } from "../../lib/supabase";

export async function requestLaborEstimate(payload) {
  const { data, error } = await supabase.functions.invoke("ai-labor-guide", { body: payload });
  if (error) throw new Error(data?.error || error.message || "AI Labor Guide is temporarily unavailable.");
  if (data?.error) throw new Error(data.error);
  return data;
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
