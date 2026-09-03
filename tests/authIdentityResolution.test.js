import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  AuthResolutionError,
  authErrorCategory,
  normalizeLoginUsername,
  resolveLinkedAuthIdentity,
} from "../supabase/functions/auth-access-code/auth-resolution.ts";

const AUTH_ID = "b280fd80-fd0b-4af3-98ac-572b6f0dac70";

test("username normalization is case-insensitive and trims surrounding whitespace", () => {
  assert.equal(normalizeLoginUsername("  DenisseDispatch02  "), "denissedispatch02");
});

test("login resolves the email from the linked Auth UUID, not stale app_users.email", () => {
  const identity = resolveLinkedAuthIdentity(
    { auth_user_id: AUTH_ID, email: "stale-old-username@nttr.local" },
    {
      id: AUTH_ID,
      email: "current-auth-identity@nttr.local",
      app_metadata: { provider: "email" },
    },
  );
  assert.deepEqual(identity, {
    id: AUTH_ID,
    email: "current-auth-identity@nttr.local",
    provider: "email",
  });
});

test("missing or mismatched linked Auth accounts fail closed", () => {
  for (const [profile, authUser, category] of [
    [{ auth_user_id: null }, null, "missing_auth_user_id"],
    [{ auth_user_id: AUTH_ID }, null, "linked_auth_user_not_found"],
    [{ auth_user_id: AUTH_ID }, { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", email: "other@nttr.local" }, "linked_auth_user_not_found"],
  ]) {
    assert.throws(
      () => resolveLinkedAuthIdentity(profile, authUser),
      (error) => error instanceof AuthResolutionError && error.category === category && error.status === 409,
    );
  }
});

test("Auth errors are logged by safe category", () => {
  assert.equal(authErrorCategory({ code: "invalid_credentials", status: 400 }), "invalid_credentials");
  assert.equal(authErrorCategory({ status: 429 }), "rate_limited");
});

test("Edge login uses the linked Auth email and never logs the password", async () => {
  const source = await readFile(new URL("../supabase/functions/auth-access-code/index.ts", import.meta.url), "utf8");
  assert.match(source, /getUserById\(profile\.auth_user_id\)/);
  assert.match(source, /signInWithPassword\(\{ email: identity\.email, password \}\)/);
  assert.doesNotMatch(source, /signInWithPassword\(\{ email: profile\.email/);
  assert.doesNotMatch(source, /console\.(?:info|error)[^\n]*password/);
  assert.ok(source.indexOf('profile.status !== "Active"') < source.indexOf("getUserById(profile.auth_user_id)"));
});

test("password reset verifies and returns the exact linked Auth UUID", async () => {
  const backend = await readFile(new URL("../supabase/functions/admin-users/index.ts", import.meta.url), "utf8");
  const ui = await readFile(new URL("../src/modules/users/UserManagement.jsx", import.meta.url), "utf8");
  assert.match(backend, /getUserById\(authUserId\)/);
  assert.match(backend, /updatedAuth\?\.user\?\.id !== authUserId/);
  assert.match(backend, /auth_user_id: authUserId, auth_email: authEmail, audit_recorded: auditRecorded/);
  assert.match(ui, /result\.auth_user_id !== resetUser\.authUserId/);
});
