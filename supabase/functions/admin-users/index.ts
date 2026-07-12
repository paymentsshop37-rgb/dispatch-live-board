import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const clean = (value: unknown) => String(value ?? "").trim();
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
    if (!caller || caller.status !== "Active" || caller.role !== "admin") return json({ error: "You do not have permission to perform this action." }, 403);

    const body = req.method === "GET" ? {} : await req.json();
    if (req.method === "GET") {
      const [{ data: profiles, error }, { data: authData }] = await Promise.all([admin.from("app_users").select("*").order("created_at", { ascending: false }), admin.auth.admin.listUsers({ perPage: 1000 })]);
      if (error) throw error;
      const authById = new Map((authData?.users || []).map((item) => [item.id, item]));
      return json({
        users: (profiles || []).map((profile) => {
          const authUser = authById.get(profile.auth_user_id || profile.id);
          return {
            ...profile,
            auth_exists: Boolean(authUser),
            is_desynced: !profile.auth_user_id || !authUser,
            last_login_at: authUser?.last_sign_in_at || profile.last_login_at,
          };
        }),
      });
    }
    if (req.method === "POST" && body.action === "reset-password") {
      const target = await findProfile(admin, clean(body.id));
      if (!target) return json({ error: "User not found." }, 404);
      const authUserId = clean(target.auth_user_id);
      if (!authUserId) return json({ error: "This user is out of sync. Sync the user with Supabase Auth before resetting the password.", code: "USER_DESYNCED" }, 409);
      if (clean(body.password).length < 8) return json({ error: "The password must contain at least 8 characters." }, 400);
      const { error } = await admin.auth.admin.updateUserById(authUserId, { password: body.password });
      if (error) return json({ error: error.message || "Unable to reset password." }, 500);
      const { error: profileError } = await admin.from("app_users").update({ force_password_change: body.forcePasswordChange !== false }).eq("id", target.id);
      if (profileError) return json({ error: profileError.message || "Unable to reset password." }, 500);
      await audit(admin, "PASSWORD_RESET", target.id, user.id, { auth_user_id: authUserId });
      return json({ ok: true });
    }
    if (req.method === "POST" && body.action === "sync-auth") {
      const target = await findProfile(admin, clean(body.id));
      if (!target) return json({ error: "User not found." }, 404);
      if (target.auth_user_id) return json({ error: "This user is already linked to Supabase Auth." }, 400);
      const password = String(body.temporaryPassword || "");
      if (password.length < 8) return json({ error: "The password must contain at least 8 characters." }, 400);
      const email = clean(target.email).toLowerCase();
      if (!emailPattern.test(email)) return json({ error: "This profile needs a valid email before it can be synced." }, 400);
      const role = clean(target.role);
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
      const name = clean(body.name), username = clean(body.username), email = clean(body.email).toLowerCase(), password = String(body.temporaryPassword || ""), role = clean(body.role), status = clean(body.status);
      if (!name || !username || !email || !password || !["admin", "dispatcher"].includes(role) || !["Active", "Inactive"].includes(status)) return json({ error: "Invalid user data." }, 400);
      if (!emailPattern.test(email)) return json({ error: "Invalid email address." }, 400);
      if (password.length < 8) return json({ error: "The password must contain at least 8 characters." }, 400);
      const [{ data: duplicateEmail }, { data: duplicateUsername }] = await Promise.all([
        admin.from("app_users").select("id").eq("email", email).maybeSingle(),
        admin.from("app_users").select("id").eq("username", username).maybeSingle(),
      ]);
      if (duplicateEmail) return json({ error: "This email is already registered." }, 409);
      if (duplicateUsername) return json({ error: "This username is already in use." }, 409);
      const { data: created, error: createError } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { username, name, role } });
      if (createError || !created.user) return json({ error: createError?.message?.toLowerCase().includes("registered") ? "This email is already registered." : "Unable to create user." }, createError?.message?.toLowerCase().includes("registered") ? 409 : 400);
      const { error: profileError } = await admin.from("app_users").insert({ id: created.user.id, auth_user_id: created.user.id, username, name, email, role, status, notes: clean(body.notes), force_password_change: body.forcePasswordChange !== false });
      if (profileError) {
        await admin.auth.admin.deleteUser(created.user.id);
        const details = `${profileError.message || ""} ${profileError.details || ""}`.toLowerCase();
        const duplicateMessage = details.includes("email") ? "This email is already registered." : "This username is already in use.";
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
      const authUserId = clean(target.auth_user_id);
      if (authUserId === user.id || target.id === user.id) return json({ error: "You cannot delete your own account while signed in." }, 400);
      if (!authUserId) {
        if (!body.profileOnly) {
          return json({
            error: "This user is out of sync: there is no linked Supabase Auth account. Sync the user or delete only the profile.",
            code: "USER_DESYNCED",
          }, 409);
        }
        await audit(admin, "USER_PROFILE_DELETED", target.id, user.id, { reason: "missing_auth_user_id" });
        const { error: profileOnlyError } = await admin.from("app_users").delete().eq("id", target.id);
        if (profileOnlyError) return json({ error: profileOnlyError.message || "Unable to delete user profile." }, 500);
        return json({ ok: true, profileOnly: true });
      }
      await audit(admin, "USER_DELETED", target.id, user.id, { auth_user_id: authUserId });
      const { error } = await admin.auth.admin.deleteUser(authUserId);
      if (error) {
        const message = String(error.message || "");
        if (!body.profileOnly && message.toLowerCase().includes("not found")) {
          return json({
            error: "This user is out of sync: the linked Supabase Auth account was not found. Sync the user or delete only the profile.",
            code: "USER_DESYNCED",
          }, 409);
        }
        if (!body.profileOnly) return json({ error: message || "Unable to delete user." }, 500);
      }
      const { error: profileDeleteError } = await admin.from("app_users").delete().eq("id", target.id);
      if (profileDeleteError) return json({ error: profileDeleteError.message || "Unable to delete user profile." }, 500);
      return json({ ok: true });
    }
    if (req.method === "PATCH") {
      const allowed: Record<string, unknown> = {};
      for (const key of ["name", "username", "notes"]) if (body[key] !== undefined) allowed[key] = clean(body[key]);
      if (body.role !== undefined) { if (!["admin", "dispatcher"].includes(body.role)) return json({ error: "Invalid role." }, 400); allowed.role = body.role; }
      if (body.status !== undefined) { if (!["Active", "Inactive"].includes(body.status)) return json({ error: "Invalid status." }, 400); allowed.status = body.status; }
      if (body.forcePasswordChange !== undefined) allowed.force_password_change = Boolean(body.forcePasswordChange);
      const before = await findProfile(admin, targetId);
      if (!before) return json({ error: "User not found." }, 404);
      if (allowed.name !== undefined && !allowed.name) return json({ error: "Invalid user data." }, 400);
      if (allowed.username !== undefined && !allowed.username) return json({ error: "Invalid user data." }, 400);
      const { error } = await admin.from("app_users").update(allowed).eq("id", before.id);
      if (error) {
        const details = `${error.message || ""} ${error.details || ""}`.toLowerCase();
        const duplicateMessage = details.includes("email") ? "This email is already registered." : "This username is already in use.";
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

async function audit(client: any, action: string, target: string, actor: string, details: Record<string, unknown> = {}) {
  try {
    const payload = { entity_type: "user", entity_id: target, action, description: action.replaceAll("_", " "), created_by: actor, metadata: { target_user_id: target, performed_by: actor, ...details } };
    const { error } = await client.from("activity_log").insert(payload);
    if (!error) return;
    const { metadata: _metadata, ...fallback } = payload;
    const fallbackResult = await client.from("activity_log").insert(fallback);
    if (fallbackResult.error) console.error("admin-users audit:", fallbackResult.error.message);
  } catch (error) {
    console.error("admin-users audit:", error instanceof Error ? error.message : error);
  }
}
