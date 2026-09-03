import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AUTH_STATUS, UserDeletionError, authStatusForProfile, deleteUserSafely, isActiveAdmin, validAuthUserId } from "./delete-user.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const clean = (value: unknown) => String(value ?? "").trim();
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const internalEmailForUsername = (username: string) => `${username.trim().toLowerCase()}@nttr.local`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL")!, anon = Deno.env.get("SUPABASE_ANON_KEY")!, serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SERVICE_ROLE_KEY")!;
    if (!url || !anon || !serviceKey) return json({ error: "Server configuration is incomplete." }, 500);
    const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Not authenticated." }, 401);
    const authClient = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) return json({ error: "Not authenticated." }, 401);
    const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: caller } = await admin.from("app_users").select("id,auth_user_id,role,status").or(`auth_user_id.eq.${user.id},id.eq.${user.id}`).maybeSingle();
    if (!isActiveAdmin(caller)) return json({ error: "You do not have permission to perform this action." }, 403);

    const body = req.method === "GET" ? {} : await req.json();
    if (req.method === "GET") {
      const [{ data: profiles, error }, authUsers] = await Promise.all([
        admin.from("app_users").select("*").order("created_at", { ascending: false }),
        listAllAuthUsers(admin),
      ]);
      if (error) throw error;
      const authById = new Map(authUsers.map((item: any) => [item.id, item]));
      const authByEmail = new Map(authUsers.filter((item: any) => item.email).map((item: any) => [clean(item.email).toLowerCase(), item]));
      const claimedAuthIds = new Set((profiles || []).map((profile: any) => validAuthUserId(profile.auth_user_id)).filter(Boolean));
      return json({
        users: (profiles || []).map((profile) => {
          const authUserId = validAuthUserId(profile.auth_user_id);
          const authUser = authUserId ? authById.get(authUserId) : null;
          const expectedEmail = profileAuthEmail(profile);
          const exactEmailCandidate: any = expectedEmail ? authByEmail.get(expectedEmail) : null;
          const hasUnclaimedCandidate = Boolean(exactEmailCandidate && (!claimedAuthIds.has(exactEmailCandidate.id) || exactEmailCandidate.id === authUserId));
          const authStatus = authUser
            ? AUTH_STATUS.LINKED
            : hasUnclaimedCandidate || authUserId
              ? AUTH_STATUS.OUT_OF_SYNC
              : authStatusForProfile(profile.auth_user_id, false);
          return {
            ...profile,
            auth_exists: Boolean(authUser),
            auth_status: authStatus,
            is_desynced: authStatus !== AUTH_STATUS.LINKED,
            can_sync_auth: authStatus !== AUTH_STATUS.LINKED,
            last_login_at: authUser?.last_sign_in_at || profile.last_login_at,
          };
        }),
      });
    }
    if (req.method === "POST" && body.action === "reset-password") {
      const target = await findProfile(admin, clean(body.id));
      if (!target) return json({ error: "User not found." }, 404);
      const authUserId = validAuthUserId(target.auth_user_id);
      if (!authUserId) return json({ error: "This user is out of sync. Sync the user with Supabase Auth before resetting the password.", code: "USER_DESYNCED" }, 409);
      if (clean(body.password).length < 8) return json({ error: "The password must contain at least 8 characters." }, 400);
      const { data: existingAuth, error: lookupError } = await admin.auth.admin.getUserById(authUserId);
      if (lookupError || existingAuth?.user?.id !== authUserId) {
        return json({ error: "This user is out of sync. Sync the user with Supabase Auth before resetting the password.", code: "USER_DESYNCED" }, 409);
      }
      const authEmail = clean(existingAuth.user.email).toLowerCase();
      console.info("admin-users password reset target", { profile_id: target.id, username: target.username, auth_user_id: authUserId, auth_email: authEmail });
      const { data: updatedAuth, error } = await admin.auth.admin.updateUserById(authUserId, { password: body.password });
      if (error) return json({ error: error.message || "Unable to reset password." }, 500);
      if (updatedAuth?.user?.id !== authUserId) return json({ error: "Supabase Auth returned an unexpected account after the password reset." }, 502);
      const { error: profileError } = await admin.from("app_users").update({ force_password_change: body.forcePasswordChange !== false }).eq("id", target.id);
      if (profileError) return json({ error: profileError.message || "Unable to reset password." }, 500);
      const auditRecorded = await audit(admin, "PASSWORD_RESET", target.id, user.id, { auth_user_id: authUserId, auth_email: authEmail });
      console.info("admin-users password reset result", { profile_id: target.id, auth_user_id: authUserId, auth_email: authEmail, result: "success", audit_recorded: auditRecorded });
      return json({ ok: true, auth_user_id: authUserId, auth_email: authEmail, audit_recorded: auditRecorded });
    }
    if (req.method === "POST" && body.action === "sync-auth") {
      const target = await findProfile(admin, clean(body.id));
      if (!target) return json({ error: "User not found." }, 404);
      const storedAuthUserId = validAuthUserId(target.auth_user_id);
      if (storedAuthUserId && await authUserExists(admin, storedAuthUserId)) return json({ error: "This user is already linked to Supabase Auth." }, 400);
      const password = String(body.temporaryPassword || "");
      if (password.length < 8) return json({ error: "The password must contain at least 8 characters." }, 400);
      const email = profileAuthEmail(target);
      const role = clean(target.role);
      const authUsers = await listAllAuthUsers(admin);
      const existingAuthUser = authUsers.find((candidate: any) => clean(candidate.email).toLowerCase() === email);
      if (existingAuthUser) {
        const { data: claimedProfile, error: claimedError } = await admin.from("app_users").select("id").eq("auth_user_id", existingAuthUser.id).maybeSingle();
        if (claimedError) return json({ error: "Unable to verify the existing login account." }, 500);
        if (claimedProfile && claimedProfile.id !== target.id) {
          return json({ error: "The matching login account is already linked to another user profile." }, 409);
        }
        const linkUpdate = admin.from("app_users").update({ auth_user_id: existingAuthUser.id, force_password_change: body.forcePasswordChange !== false }).eq("id", target.id);
        const { data: linkedProfile, error: linkError } = target.auth_user_id
          ? await linkUpdate.eq("auth_user_id", target.auth_user_id).select("id").maybeSingle()
          : await linkUpdate.is("auth_user_id", null).select("id").maybeSingle();
        if (linkError) return json({ error: linkError.code === "23505" ? "The matching login account is already linked to another user profile." : "Unable to link the user profile." }, linkError.code === "23505" ? 409 : 500);
        if (!linkedProfile) return json({ error: "The user profile changed while it was being synced. Refresh and try again." }, 409);
        const { error: updateAuthError } = await admin.auth.admin.updateUserById(existingAuthUser.id, {
          password,
          user_metadata: { username: target.username, name: target.name, role },
          ban_duration: target.status === "Inactive" ? "876000h" : "none",
        });
        if (updateAuthError) {
          await admin.from("app_users").update({ auth_user_id: target.auth_user_id || null }).eq("id", target.id).eq("auth_user_id", existingAuthUser.id);
          return json({ error: "Unable to update the matching login account. The profile was not linked." }, 500);
        }
        await audit(admin, "USER_SYNCED", target.id, user.id, { auth_user_id: existingAuthUser.id, reused_existing_auth: true });
        return json({ ok: true, auth_user_id: existingAuthUser.id, reused_existing_auth: true });
      }
      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { username: target.username, name: target.name, role },
      });
      if (createError || !created.user) return json({ error: createError?.message || "Unable to sync user with Supabase Auth." }, 500);
      const { error: updateError } = await admin.from("app_users").update({ auth_user_id: created.user.id, force_password_change: body.forcePasswordChange !== false }).eq("id", target.id);
      if (updateError) {
        await admin.auth.admin.deleteUser(created.user.id);
        return json({ error: updateError.message || "Unable to sync user profile." }, 500);
      }
      if (target.status === "Inactive") await admin.auth.admin.updateUserById(created.user.id, { ban_duration: "876000h" });
      await audit(admin, "USER_SYNCED", target.id, user.id, { auth_user_id: created.user.id });
      return json({ ok: true, auth_user_id: created.user.id });
    }
    if (req.method === "POST") {
      const name = clean(body.name), username = clean(body.username), email = internalEmailForUsername(username), password = String(body.temporaryPassword || ""), role = clean(body.role), status = clean(body.status);
      if (!name || !username || !password || !["admin", "supervisor", "dispatcher", "technician_manager"].includes(role) || !["Active", "Inactive"].includes(status)) return json({ error: "Invalid user data." }, 400);
      if (password.length < 8) return json({ error: "The password must contain at least 8 characters." }, 400);
      const [{ data: duplicateEmail }, { data: duplicateUsername }] = await Promise.all([
        admin.from("app_users").select("id").eq("email", email).maybeSingle(),
        admin.from("app_users").select("id").eq("username", username).maybeSingle(),
      ]);
      if (duplicateEmail) return json({ error: "This username is already in use." }, 409);
      if (duplicateUsername) return json({ error: "This username is already in use." }, 409);
      const { data: created, error: createError } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { username, name, role } });
      if (createError || !created.user) return json({ error: createError?.message?.toLowerCase().includes("registered") ? "This username is already in use." : "Unable to create user." }, createError?.message?.toLowerCase().includes("registered") ? 409 : 400);
      const canViewTechPayments = role === "technician_manager" && Boolean(body.canViewTechPayments || body.canMarkTechPaymentsPaid);
      const canMarkTechPaymentsPaid = role === "technician_manager" && Boolean(body.canMarkTechPaymentsPaid);
      const canExportFinancialReports = role === "technician_manager" && Boolean(body.canExportFinancialReports);
      const { error: profileError } = await admin.from("app_users").insert({ id: created.user.id, auth_user_id: created.user.id, username, name, email, role, status, notes: clean(body.notes), force_password_change: body.forcePasswordChange !== false, can_view_tech_payments: canViewTechPayments, can_mark_tech_payments_paid: canMarkTechPaymentsPaid, can_export_financial_reports: canExportFinancialReports });
      if (profileError) {
        await admin.auth.admin.deleteUser(created.user.id);
        const details = `${profileError.message || ""} ${profileError.details || ""}`.toLowerCase();
        const duplicateMessage = "This username is already in use.";
        return json({ error: profileError.code === "23505" ? duplicateMessage : "Unable to create user." }, profileError.code === "23505" ? 409 : 500);
      }
      if (status === "Inactive") await admin.auth.admin.updateUserById(created.user.id, { ban_duration: "876000h" });
      await audit(admin, "USER_CREATED", created.user.id, user.id, { role, status });
      return json({ id: created.user.id }, 201);
    }
    const targetId = clean(body.id);
    if (!targetId) return json({ error: "User not found." }, 404);
    if (req.method === "DELETE") {
      const target = await findProfile(admin, targetId);
      if (!target) return json({ error: "User not found." }, 404);
      try {
        const result = await deleteUserSafely(
          target,
          { profileId: caller.id, authUserId: user.id },
          {
            authUserExists: (authUserId) => authUserExists(admin, authUserId),
            deleteAuthUser: async (authUserId) => {
              const { error } = await admin.auth.admin.deleteUser(authUserId);
              if (error && !isAuthUserNotFound(error)) {
                console.error("admin-users auth deletion:", error.message || error);
                throw new UserDeletionError("This user's related history could not be safely preserved. No profile was deleted. Please contact support.", 409);
              }
            },
            deleteProfile: async (profileId) => {
              const { error } = await admin.rpc("delete_app_user_profile", { p_profile_id: profileId, p_actor_auth_user_id: user.id });
              if (error) {
                console.error("admin-users profile deletion:", error.message || error);
                throw new UserDeletionError("This user's related records could not be safely updated. The profile was not deleted. Please contact support.", 409);
              }
            },
            profileExists: async (profileId) => {
              const { data, error } = await admin.from("app_users").select("id").eq("id", profileId).maybeSingle();
              if (error) {
                console.error("admin-users profile verification:", error.message || error);
                throw new UserDeletionError("Unable to verify the profile deletion. Please refresh and try again.", 503);
              }
              return Boolean(data);
            },
            writeAudit: async (entry) => {
              await audit(admin, String(entry.action), String(entry.target), user.id, entry.details as Record<string, unknown>);
            },
          }
        );
        return json(result);
      } catch (error) {
        if (error instanceof UserDeletionError) return json({ error: error.message }, error.status);
        throw error;
      }
    }
    if (req.method === "PATCH") {
      const allowed: Record<string, unknown> = {};
      for (const key of ["name", "username", "notes"]) if (body[key] !== undefined) allowed[key] = clean(body[key]);
      if (body.role !== undefined) { if (!["admin", "supervisor", "dispatcher", "technician_manager"].includes(body.role)) return json({ error: "Invalid role." }, 400); allowed.role = body.role; }
      if (body.status !== undefined) { if (!["Active", "Inactive"].includes(body.status)) return json({ error: "Invalid status." }, 400); allowed.status = body.status; }
      if (body.forcePasswordChange !== undefined) allowed.force_password_change = Boolean(body.forcePasswordChange);
      if (body.canViewTechPayments !== undefined) allowed.can_view_tech_payments = Boolean(body.canViewTechPayments);
      if (body.canMarkTechPaymentsPaid !== undefined) allowed.can_mark_tech_payments_paid = Boolean(body.canMarkTechPaymentsPaid);
      if (body.canExportFinancialReports !== undefined) allowed.can_export_financial_reports = Boolean(body.canExportFinancialReports);
      const before = await findProfile(admin, targetId);
      if (!before) return json({ error: "User not found." }, 404);
      if (allowed.name !== undefined && !allowed.name) return json({ error: "Invalid user data." }, 400);
      if (allowed.username !== undefined && !allowed.username) return json({ error: "Invalid user data." }, 400);
      const nextRole = String(allowed.role || before.role || "");
      if (nextRole !== "technician_manager") {
        allowed.can_view_tech_payments = false;
        allowed.can_mark_tech_payments_paid = false;
        allowed.can_export_financial_reports = false;
      } else if (allowed.can_mark_tech_payments_paid === true) {
        allowed.can_view_tech_payments = true;
      } else if (allowed.can_view_tech_payments === false) {
        allowed.can_mark_tech_payments_paid = false;
      }
      const { error } = await admin.from("app_users").update(allowed).eq("id", before.id);
      if (error) {
        const details = `${error.message || ""} ${error.details || ""}`.toLowerCase();
        const duplicateMessage = "This username is already in use.";
        return json({ error: error.code === "23505" ? duplicateMessage : error.message || "Unable to update user." }, error.code === "23505" ? 409 : 500);
      }
      const metadata = { ...(before as any), ...allowed };
      if (before.auth_user_id) {
        const { error: authUpdateError } = await admin.auth.admin.updateUserById(before.auth_user_id, { user_metadata: { username: metadata.username, name: metadata.name, role: metadata.role }, ...(body.status !== undefined ? { ban_duration: body.status === "Inactive" ? "876000h" : "none" } : {}) });
        if (authUpdateError) return json({ error: authUpdateError.message || "Unable to update user." }, 500);
      }
      await audit(admin, body.status ? (body.status === "Active" ? "USER_ACTIVATED" : "USER_DEACTIVATED") : body.role ? "USER_ROLE_CHANGED" : "USER_UPDATED", before.id, user.id, { auth_user_id: before.auth_user_id || null });
      return json({ ok: true });
    }
    return json({ error: "Method not allowed." }, 405);
  } catch (error) { console.error("admin-users:", error instanceof Error ? error.message : error); return json({ error: "Internal server error." }, 500); }
});

async function findProfile(client: any, id: string) {
  if (!id) return null;
  const { data, error } = await client.from("app_users").select("*").or(`id.eq.${id},auth_user_id.eq.${id}`).maybeSingle();
  if (error) throw error;
  return data;
}

async function listAllAuthUsers(client: any) {
  const users: any[] = [];
  const perPage = 1000;
  for (let page = 1; ; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const pageUsers = data?.users || [];
    users.push(...pageUsers);
    if (pageUsers.length < perPage) return users;
  }
}

async function authUserExists(client: any, authUserId: string) {
  const { data, error } = await client.auth.admin.getUserById(authUserId);
  if (error) {
    if (isAuthUserNotFound(error)) return false;
    console.error("admin-users auth lookup:", error.message || error);
    throw new UserDeletionError("Unable to verify the user's login account. Please try again.", 503);
  }
  return data?.user?.id === authUserId;
}

function profileAuthEmail(profile: any) {
  const email = clean(profile?.email).toLowerCase();
  return emailPattern.test(email) ? email : internalEmailForUsername(clean(profile?.username));
}

function isAuthUserNotFound(error: any) {
  const message = String(error?.message || "").toLowerCase();
  return error?.status === 404 || message.includes("user not found") || message.includes("not found");
}

async function audit(client: any, action: string, target: string, actor: string, details: Record<string, unknown> = {}) {
  try {
    const payload = { entity_type: "user", entity_id: target, action, description: action.replaceAll("_", " "), created_by: actor, metadata: { target_user_id: target, performed_by: actor, ...details } };
    const { error } = await client.from("activity_log").insert(payload);
    if (!error) return true;
    const { metadata: _metadata, ...fallback } = payload;
    const fallbackResult = await client.from("activity_log").insert(fallback);
    if (fallbackResult.error) {
      console.error("admin-users audit:", fallbackResult.error.message);
      return false;
    }
    return true;
  } catch (error) {
    console.error("admin-users audit:", error instanceof Error ? error.message : error);
    return false;
  }
}
