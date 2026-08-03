import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migrationUrl = new URL("../supabase/migrations/20260802000400_restore_operational_tech_payment_updates.sql", import.meta.url);

test("backend Tech Payment rule matches the four frontend editor roles", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /lower\(role::text\) in \('admin','supervisor','dispatcher','technician_manager'\)/i);
  assert.match(sql, /create or replace function public\.can_update_technician_payment/i);
  assert.match(sql, /create policy "operational roles update jobs"[\s\S]*to authenticated/i);
  assert.match(sql, /revoke update on public\.jobs from anon/i);
});

test("audited status RPC supports every requested transition and paid metadata", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  for (const status of ["Pending", "Paid", "Cancelled"]) assert.match(sql, new RegExp(`'${status}'`));
  assert.match(sql, /insert into public\.technician_payment_audit/i);
  assert.match(sql, /tech_payment_paid_at=case when p_status='Paid'/i);
  assert.doesNotMatch(sql, /if p_status='Paid' then raise exception/i);
});

test("direct Tech Payment column changes still require the audited RPC", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /Use the audited Tech Payment action to change payment status/i);
  assert.match(sql, /current_setting\('app\.tech_payment_rpc'/i);
});

test("transaction-entry RPC delegates to the same shared role authorization", async () => {
  const sql = await readFile(new URL("../supabase/migrations/20260802000500_align_technician_payment_transaction_role.sql", import.meta.url), "utf8");
  assert.match(sql, /public\.can_update_technician_payment\(\)/i);
  assert.match(sql, /Admin, Supervisor, Dispatcher, or Technician Manager/i);
});
