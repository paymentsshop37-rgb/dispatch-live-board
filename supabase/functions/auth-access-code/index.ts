import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AuthResolutionError, authErrorCategory, normalizeLoginUsername, resolveLinkedAuthIdentity } from "./auth-resolution.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const clean = (value: unknown) => String(value ?? "").trim();
const allowedApplicationRoles = new Set(["admin", "dispatcher", "supervisor", "technician_manager"]);
const canonicalRole = (value: unknown) => clean(value).toLowerCase().replace(/[\s-]+/g, "_");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SERVICE_ROLE_KEY")!;
    if (!url || !anon || !serviceKey) return json({ error: "Server configuration is incomplete." }, 500);

    const body = await req.json();
    const receivedUsername = clean(body.username || parseAccessCode(body.accessCode)[0]);
    const username = normalizeLoginUsername(receivedUsername);
    const password = String(body.password || parseAccessCode(body.accessCode)[1] || "");
    if (!username || !password) return json({ error: "Username and password are required." }, 400);

    const trace = { request_id: crypto.randomUUID(), username_received: receivedUsername, username_normalized: username };
    console.info("auth-access-code lookup", trace);

    const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: profile, error: profileError } = await admin
      .from("app_users")
      .select("id,auth_user_id,username,email,status,role,name,force_password_change,login_count")
      .ilike("username", username)
      .maybeSingle();

    if (profileError) {
      console.error("auth-access-code lookup failed", { ...trace, category: "profile_lookup_failed", code: profileError.code || null });
      return json({ error: "Unable to verify account." }, 500);
    }
    if (!profile) {
      console.info("auth-access-code denied", { ...trace, category: "profile_not_found" });
      return json({ error: "Invalid password." }, 401);
    }
    if (profile.status !== "Active") return json({ error: "Your account is inactive. Contact an administrator." }, 403);
    const role = canonicalRole(profile.role);
    if (!allowedApplicationRoles.has(role)) {
      return json({ error: "You do not have permission to access this application." }, 403);
    }

    const { data: linkedAuthData, error: linkedAuthError } = profile.auth_user_id
      ? await admin.auth.admin.getUserById(profile.auth_user_id)
      : { data: null, error: null };
    let identity;
    try {
      identity = resolveLinkedAuthIdentity(profile, linkedAuthError ? null : linkedAuthData?.user);
    } catch (error) {
      if (error instanceof AuthResolutionError) {
        console.info("auth-access-code denied", { ...trace, profile_id: profile.id, auth_user_id: profile.auth_user_id || null, category: error.category });
        return json({ error: error.message }, error.status);
      }
      throw error;
    }

    console.info("auth-access-code resolved", { ...trace, profile_id: profile.id, auth_user_id: identity.id, auth_email: identity.email, provider: identity.provider });
    const client = createClient(url, anon, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data, error } = await client.auth.signInWithPassword({ email: identity.email, password });
    if (error || !data.session) {
      console.info("auth-access-code auth result", { ...trace, auth_user_id: identity.id, auth_email: identity.email, result: "denied", status: error?.status || 401, code: error?.code || null, category: authErrorCategory(error) });
      return json({ error: "Invalid password." }, 401);
    }
    if (data.user.id !== identity.id) {
      console.error("auth-access-code auth result", { ...trace, auth_user_id: identity.id, returned_auth_user_id: data.user.id, result: "identity_mismatch", category: "authenticated_identity_mismatch" });
      return json({ error: "This user is out of sync. Contact an administrator." }, 409);
    }
    console.info("auth-access-code auth result", { ...trace, auth_user_id: identity.id, auth_email: identity.email, result: "success", status: 200, category: "success" });

    const loginAt = new Date().toISOString();
    const loginCount = Number(profile.login_count || 0) + 1;
    const { error: loginUpdateError } = await admin
      .from("app_users")
      .update({ last_login_at: loginAt, login_count: loginCount })
      .eq("id", profile.id);
    if (loginUpdateError) console.error("auth-access-code login update:", loginUpdateError.message);
    await recordAccessHistory(admin, {
      userId: profile.id,
      username: profile.username,
      action: "LOGIN_SUCCESS",
      createdAt: loginAt,
      ipAddress: req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || "",
      userAgent: req.headers.get("user-agent") || "",
    });

    return json({
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at,
        token_type: data.session.token_type,
      },
      profile: {
        id: profile.id,
        auth_user_id: data.user.id,
        username: profile.username,
        name: profile.name,
        role,
        status: profile.status,
        force_password_change: profile.force_password_change,
        last_login_at: loginAt,
        login_count: loginCount,
      },
    });
  } catch (error) {
    console.error("auth-access-code:", error instanceof Error ? error.message : error);
    return json({ error: "Internal server error." }, 500);
  }
});

function parseAccessCode(accessCode: string) {
  if (!accessCode) return ["", ""];
  const separator = accessCode.indexOf("/");
  if (separator === -1) return ["", ""];
  return [accessCode.slice(0, separator).trim(), accessCode.slice(separator + 1)];
}

async function recordAccessHistory(
  client: any,
  event: {
    userId: string;
    username: string;
    action: string;
    createdAt: string;
    ipAddress: string;
    userAgent: string;
  }
) {
  try {
    const { error } = await client.from("user_access_history").insert({
      user_id: event.userId,
      username: event.username,
      action: event.action,
      ip_address: event.ipAddress,
      user_agent: event.userAgent,
      created_at: event.createdAt,
    });
    if (error) console.error("auth-access-code access history:", error.message);
  } catch (error) {
    console.error("auth-access-code access history:", error instanceof Error ? error.message : error);
  }
}
