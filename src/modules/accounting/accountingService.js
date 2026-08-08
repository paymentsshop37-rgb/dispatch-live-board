import { supabase } from "../../lib/supabase";
import { normalizeAccountingJob } from "./accountingData.js";

export async function loadAccountingWorkspace(range) {
  const [jobsResult, allJobsResult, summaryResult, pendingTechResult, redJobsResult, settingsResult] = await Promise.all([
    supabase.rpc("get_accounting_jobs", { p_from_date: range?.from || null, p_to_date: range?.to || null }),
    range ? supabase.rpc("get_accounting_jobs", { p_from_date: null, p_to_date: null }) : Promise.resolve(null),
    supabase.rpc("get_invoice_payment_summary"),
    supabase.rpc("get_pending_technician_payment_jobs"),
    supabase.rpc("get_red_internal_control_jobs"),
    supabase.from("accounting_settings").select("*").eq("singleton", true).maybeSingle(),
  ]);
  const error = jobsResult.error || allJobsResult?.error || summaryResult.error || pendingTechResult.error || redJobsResult.error || settingsResult.error;
  if (error) throw error;
  const allRows = allJobsResult?.data || jobsResult.data || [];
  return { jobs: (jobsResult.data || []).map(normalizeAccountingJob), allJobs: allRows.map(normalizeAccountingJob), pendingTechJobs: (pendingTechResult.data || []).map(normalizeAccountingJob), redJobs: (redJobsResult.data || []).map(normalizeAccountingJob), paymentSummaries: summaryResult.data || [], settings: settingsResult.data || null };
}

export async function loadAuditPage({ page = 0, pageSize = 50 } = {}) {
  const { data, error, count } = await supabase.from("accounting_audit_log").select("*", { count: "exact" }).order("created_at", { ascending: false }).range(page * pageSize, page * pageSize + pageSize - 1);
  if (error) throw error;
  return { rows: data || [], count: count || 0 };
}

export async function loadTransactionPage(table, { page = 0, pageSize = 100, includeVoided = true } = {}) {
  let query = supabase.from(table).select("*", { count: "exact" }).order("payment_date", { ascending: false }).range(page * pageSize, page * pageSize + pageSize - 1);
  if (!includeVoided) query = query.is("voided_at", null);
  const { data, error, count } = await query;
  if (error) throw error;
  return { rows: data || [], count: count || 0 };
}

export async function loadAllTransactionRows(table) {
  const rows = []; const pageSize = 1000;
  for (let page = 0; ; page += 1) {
    const result = await loadTransactionPage(table, { page, pageSize });
    rows.push(...result.rows);
    if (rows.length >= result.count || result.rows.length < pageSize) return rows;
  }
}

export async function recordInvoicePayment(values) {
  const { data, error } = await supabase.rpc("record_invoice_payment", {
    p_job_id: values.jobId, p_payment_date: values.paymentDate, p_amount: Number(values.amount),
    p_payment_method: values.paymentMethod || null, p_confirmation_number: values.confirmationNumber || null, p_notes: values.notes || null,
  });
  if (error) throw error; return data;
}

export async function voidInvoicePayment(id, reason) { const { data, error } = await supabase.rpc("void_invoice_payment", { p_payment_id: id, p_reason: reason }); if (error) throw error; return data; }
export async function recordTechnicianPayment(values) { const { data, error } = await supabase.rpc("record_technician_payment_transaction", { p_job_id: values.jobId, p_payment_date: values.paymentDate, p_amount: Number(values.amount), p_payment_method: values.paymentMethod || null, p_confirmation_number: values.confirmationNumber || null, p_notes: values.notes || null }); if (error) throw error; return data; }
export async function voidTechnicianPayment(id, reason) { const { data, error } = await supabase.rpc("void_technician_payment_transaction", { p_transaction_id: id, p_reason: reason }); if (error) throw error; return data; }
export async function saveAccountingSettings(settings) { const { data, error } = await supabase.from("accounting_settings").update({ ...settings, updated_at: new Date().toISOString() }).eq("singleton", true).select().single(); if (error) throw error; return data; }
export async function logAccountingExport(type, filters) { const { error } = await supabase.rpc("log_accounting_export", { p_report_type: type, p_filters: filters || {} }); if (error) throw error; }
