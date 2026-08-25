import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  AUTH_STATUS,
  DELETION_TYPE,
  UserDeletionError,
  authStatusForProfile,
  deleteUserSafely,
  isActiveAdmin,
} from "../supabase/functions/admin-users/delete-user.ts";

const ACTOR_PROFILE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ACTOR_AUTH_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const TARGET_PROFILE_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const TARGET_AUTH_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const TIMESTAMP = "2026-08-19T12:00:00.000Z";

function operations({ authExistsInitially }) {
  const calls = [];
  const audits = [];
  let authExists = authExistsInitially;
  let profileExists = true;

  return {
    calls,
    audits,
    handlers: {
      authUserExists: async (id) => {
        calls.push(`find-auth:${id}`);
        return authExists;
      },
      deleteAuthUser: async (id) => {
        calls.push(`delete-auth:${id}`);
        authExists = false;
      },
      deleteProfile: async (id) => {
        calls.push(`delete-profile:${id}`);
        profileExists = false;
      },
      profileExists: async (id) => {
        calls.push(`find-profile:${id}`);
        return profileExists;
      },
      writeAudit: async (entry) => {
        calls.push("write-audit");
        audits.push(entry);
      },
      now: () => TIMESTAMP,
    },
  };
}

test("linked user deletes Auth first, then profile, verifies both, and audits FULL_ACCOUNT", async () => {
  const ops = operations({ authExistsInitially: true });
  const result = await deleteUserSafely(
    { id: TARGET_PROFILE_ID, auth_user_id: TARGET_AUTH_ID, username: "linked.user" },
    { profileId: ACTOR_PROFILE_ID, authUserId: ACTOR_AUTH_ID },
    ops.handlers
  );

  assert.equal(result.deletionType, DELETION_TYPE.FULL_ACCOUNT);
  assert.deepEqual(ops.calls, [
    `find-auth:${TARGET_AUTH_ID}`,
    `delete-auth:${TARGET_AUTH_ID}`,
    `find-auth:${TARGET_AUTH_ID}`,
    `delete-profile:${TARGET_PROFILE_ID}`,
    `find-profile:${TARGET_PROFILE_ID}`,
    "write-audit",
  ]);
  assert.deepEqual(ops.audits[0], {
    action: "USER_DELETED",
    target: TARGET_PROFILE_ID,
    details: {
      administrator_profile_id: ACTOR_PROFILE_ID,
      administrator_auth_user_id: ACTOR_AUTH_ID,
      deleted_username: "linked.user",
      profile_id: TARGET_PROFILE_ID,
      auth_user_id: TARGET_AUTH_ID,
      deletion_type: "FULL_ACCOUNT",
      timestamp: TIMESTAMP,
    },
  });
});

test("profile whose stored Auth UUID no longer exists deletes only the orphan profile", async () => {
  const ops = operations({ authExistsInitially: false });
  const result = await deleteUserSafely(
    { id: TARGET_PROFILE_ID, auth_user_id: TARGET_AUTH_ID, username: "orphan.user" },
    { profileId: ACTOR_PROFILE_ID, authUserId: ACTOR_AUTH_ID },
    ops.handlers
  );

  assert.equal(result.deletionType, DELETION_TYPE.ORPHAN_PROFILE);
  assert.deepEqual(ops.calls, [
    `find-auth:${TARGET_AUTH_ID}`,
    `delete-profile:${TARGET_PROFILE_ID}`,
    `find-profile:${TARGET_PROFILE_ID}`,
    "write-audit",
  ]);
  assert.equal(ops.audits[0].details.deletion_type, "ORPHAN_PROFILE");
  assert.equal(ops.audits[0].details.auth_user_id, TARGET_AUTH_ID);
});

test("profile with no stored Auth UUID deletes as ORPHAN_PROFILE without any Auth operation", async () => {
  const ops = operations({ authExistsInitially: false });
  const result = await deleteUserSafely(
    { id: TARGET_PROFILE_ID, auth_user_id: null, username: "legacy.user" },
    { profileId: ACTOR_PROFILE_ID, authUserId: ACTOR_AUTH_ID },
    ops.handlers
  );

  assert.equal(result.deletionType, DELETION_TYPE.ORPHAN_PROFILE);
  assert.deepEqual(ops.calls, [`delete-profile:${TARGET_PROFILE_ID}`, `find-profile:${TARGET_PROFILE_ID}`, "write-audit"]);
  assert.equal(ops.audits[0].details.auth_user_id, null);
});

test("currently signed-in administrator cannot delete their profile or Auth account", async () => {
  for (const target of [
    { id: ACTOR_PROFILE_ID, auth_user_id: TARGET_AUTH_ID, username: "admin" },
    { id: TARGET_PROFILE_ID, auth_user_id: ACTOR_AUTH_ID, username: "admin" },
  ]) {
    const ops = operations({ authExistsInitially: true });
    await assert.rejects(
      deleteUserSafely(target, { profileId: ACTOR_PROFILE_ID, authUserId: ACTOR_AUTH_ID }, ops.handlers),
      (error) => error instanceof UserDeletionError && error.status === 400 && /cannot delete your own account/i.test(error.message)
    );
    assert.deepEqual(ops.calls, []);
  }
});

test("Auth statuses distinguish linked, missing linked account, and no Auth ID", () => {
  assert.equal(authStatusForProfile(TARGET_AUTH_ID, true), AUTH_STATUS.LINKED);
  assert.equal(authStatusForProfile(TARGET_AUTH_ID, false), AUTH_STATUS.OUT_OF_SYNC);
  assert.equal(authStatusForProfile(null, false), AUTH_STATUS.NO_AUTH);
  assert.equal(authStatusForProfile("not-a-uuid", true), AUTH_STATUS.OUT_OF_SYNC);
});

test("only an active administrator passes the backend authorization rule", () => {
  assert.equal(isActiveAdmin({ role: "admin", status: "Active" }), true);
  assert.equal(isActiveAdmin({ role: "dispatcher", status: "Active" }), false);
  assert.equal(isActiveAdmin({ role: "admin", status: "Inactive" }), false);
  assert.equal(isActiveAdmin(null), false);
});

test("Admin Users UI delegates deletion choice to the Edge Function and contains required copy", async () => {
  const ui = await readFile(new URL("../src/modules/users/UserManagement.jsx", import.meta.url), "utf8");
  assert.match(ui, /request\("DELETE", \{ id: target\.id \}\)/);
  assert.doesNotMatch(ui, /profileOnly/);
  assert.match(ui, /This will permanently delete the user's login account and application profile\./);
  assert.match(ui, /This user has no linked login account\. Only the application profile will be deleted\./);
  assert.match(ui, /deleteUser\.authStatus === "LINKED" \? "Delete User" : "Delete Profile"/);
  assert.match(ui, /setUsers\(\(list\) => list\.filter\(\(user\) => user\.id !== target\.id\)\)/);
  assert.match(ui, /"OUT OF SYNC"/);
  assert.match(ui, /"NO AUTH"/);
  assert.doesNotMatch(ui, /SUPABASE_SERVICE_ROLE_KEY|SERVICE_ROLE_KEY/);
});

test("Edge Function enforces admin access, reuses exact unclaimed Auth matches, and sanitizes deletion errors", async () => {
  const backend = await readFile(new URL("../supabase/functions/admin-users/index.ts", import.meta.url), "utf8");
  assert.match(backend, /if \(!isActiveAdmin\(caller\)\).*403/);
  assert.match(backend, /existingAuthUser = authUsers\.find/);
  assert.match(backend, /claimedProfile && claimedProfile\.id !== target\.id/);
  assert.match(backend, /reused_existing_auth: true/);
  assert.match(backend, /admin\.auth\.admin\.deleteUser\(authUserId\)/);
  assert.match(backend, /admin\.rpc\("delete_app_user_profile"/);
  assert.doesNotMatch(backend, /throw new UserDeletionError\(error\.message/);
});

test("migration preserves related history with explicit detachment rules", async () => {
  const migration = await readFile(new URL("../supabase/migrations/20260824000100_safe_app_user_deletion.sql", import.meta.url), "utf8");
  assert.match(migration, /\('job_parts', 'created_by'\)/);
  assert.match(migration, /\('technician_audit_log', 'actor_user_id'\)/);
  assert.match(migration, /references auth\.users\(id\) on delete set null/i);
  assert.match(migration, /create or replace function public\.delete_app_user_profile/);
  assert.match(migration, /grant execute on function public\.delete_app_user_profile\(uuid, uuid\) to service_role/);
  assert.match(migration, /app\.user_profile_delete/);
  assert.doesNotMatch(migration, /alter table public\.session_audit_log/i);
});

test("follow-up migration updates the trigger function actually attached to paid jobs", async () => {
  const migration = await readFile(new URL("../supabase/migrations/20260824000200_allow_user_detach_from_paid_jobs.sql", import.meta.url), "utf8");
  assert.match(migration, /create or replace function public\.protect_technician_payment_fields\(\)/);
  assert.match(migration, /app\.user_profile_delete/);
  assert.match(migration, /old\.tech_payment_paid_by is not null/);
  assert.match(migration, /new\.tech_payment_paid_by is null/);
  assert.match(migration, /new\.tech_payment_paid_at is not distinct from old\.tech_payment_paid_at/);
  assert.match(migration, /new\.tech_payment_status is not distinct from old\.tech_payment_status/);
});
