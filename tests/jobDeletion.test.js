import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migrationUrl = new URL("../supabase/migrations/20260821000100_safe_job_deletion.sql", import.meta.url);
const uiUrl = new URL("../src/DispatchLiveUpdatesPage.jsx", import.meta.url);

test("safe job deletion is an admin-only atomic RPC with financial safeguards", async () => {
  const sql = await readFile(migrationUrl, "utf8");

  assert.match(sql, /create or replace function public\.delete_job_safely\(p_job_id uuid\)/i);
  assert.match(sql, /security definer/i);
  assert.match(sql, /if not public\.is_active_admin\(\)/i);
  assert.match(sql, /from public\.jobs[\s\S]*for update/i);
  assert.match(sql, /public\.invoice_payments where job_id = p_job_id/i);
  assert.match(sql, /public\.technician_payment_transactions where job_id = p_job_id/i);
  assert.match(sql, /public\.technician_payments where job_id = p_job_id/i);
  assert.match(sql, /delete from public\.technician_payment_audit where job_id = p_job_id/i);
  assert.match(sql, /delete from public\.jobs where id = p_job_id/i);
  assert.match(sql, /when foreign_key_violation/i);
  assert.ok(
    sql.indexOf("delete from public.technician_payment_audit") < sql.indexOf("delete from public.jobs"),
    "dependent audit rows must be handled before the job"
  );
});

test("admin deletion handles every audit row owned by the target job before deleting it", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  const auditDelete = "delete from public.technician_payment_audit where job_id = p_job_id";
  const jobDelete = "delete from public.jobs where id = p_job_id";

  assert.match(sql, /technician_payment_audit\.job_id is NOT NULL and ON DELETE RESTRICT/i);
  assert.equal((sql.match(/delete from public\.technician_payment_audit where job_id = p_job_id/gi) || []).length, 1);
  assert.ok(sql.indexOf(auditDelete) < sql.indexOf(jobDelete));
  assert.doesNotMatch(sql, /from public\.technician_payment_audit[\s\S]{0,500}raise exception/i);
});

test("safe job deletion preserves documents and keeps audit mutation locked outside the RPC", async () => {
  const sql = await readFile(migrationUrl, "utf8");

  assert.match(sql, /to_regclass\('public\.job_files'\)/i);
  assert.match(sql, /files or documents/i);
  assert.match(sql, /current_setting\('app\.safe_job_delete'/i);
  assert.match(sql, /set_config\('app\.safe_job_delete', 'on', true\)/i);
  assert.match(sql, /grant execute on function public\.delete_job_safely\(uuid\) to authenticated/i);
});

test("Delete Job modal calls the RPC and never displays raw PostgreSQL errors", async () => {
  const ui = await readFile(uiUrl, "utf8");

  assert.match(ui, /supabase\.rpc\("delete_job_safely", \{ p_job_id: id \}\)/);
  assert.match(ui, /safeJobDeletionError\(error\)/);
  assert.match(ui, /role="alert"/);
  assert.match(ui, /\{isDeletingJob \? "Deleting\.\.\." : "Delete Job"\}/);
  assert.doesNotMatch(ui, /alert\("Error deleting job: " \+ error\.message\)/);
});
