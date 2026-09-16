import test from "node:test";
import assert from "node:assert/strict";
import { audit } from "../supabase/functions/admin-users/audit.ts";

const target = "11111111-1111-4111-8111-111111111111";
const actor = "22222222-2222-4222-8222-222222222222";

test("all admin actions preserve UUID attribution and structured details", async () => {
  for (const action of ["PASSWORD_RESET", "USER_DELETED", "USER_PROFILE_DELETED", "USER_CREATED", "USER_SYNCED", "USER_ROLE_CHANGED", "USER_UPDATED", "USER_ACTIVATED", "USER_DEACTIVATED"]) {
    const rows = [];
    const client = { from(table) {
      assert.equal(table, "activity_log");
      return { async insert(row) { rows.push(row); return { error: null }; } };
    } };
    assert.equal(await audit(client, action, target, actor, { auth_user_id: target }), true);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].entity_id, target);
    assert.equal(rows[0].created_by, actor);
    assert.deepEqual(rows[0].metadata, { auth_user_id: target, target_user_id: target, performed_by: actor });
  }
});

test("audit failure exposes original Postgres diagnostics without a metadata-dropping retry", async (t) => {
  const logs = [];
  t.mock.method(console, "error", (...args) => logs.push(args));
  const error = { code: "22P02", message: "invalid input syntax for type bigint", details: "Type mismatch", hint: "Check entity_id" };
  let inserts = 0;
  const client = { from() { return { async insert() { inserts++; return { error }; } }; } };
  assert.equal(await audit(client, "PASSWORD_RESET", target, actor), false);
  assert.equal(inserts, 1);
  assert.deepEqual(logs[0][1], { action: "PASSWORD_RESET", target_user_id: target, actor_auth_user_id: actor, ...error });
});

test("a thrown transport error reports failure without changing the completed admin action", async (t) => {
  t.mock.method(console, "error", () => {});
  const client = { from() { throw new Error("network unavailable"); } };
  assert.equal(await audit(client, "USER_DELETED", target, actor), false);
});
