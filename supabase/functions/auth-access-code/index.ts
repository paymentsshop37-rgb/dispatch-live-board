import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const clean = (value: unknown) => String(value ?? "").trim();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!url || !anon || !serviceKey) return json({ error: "Server configuration is incomplete." }, 500);

    const body = await req.json();
    const username = clean(body.username || parseAccessCode(body.accessCode)[0]);
    const password = String(body.password || parseAccessCode(body.accessCode)[1] || "");
    if (!username || !password) return json({ error: "Username and password are required." }, 400);

    const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: profile, error: profileError } = await admin
      .from("app_users")
      .select("id,username,email,status,role,name,force_password_change,login_count")
      .ilike("username", username)
      .maybeSingle();

    if (profileError) return json({ error: "Unable to verify account." }, 500);
    if (!profile) return json({ error: "Invalid password." }, 401);
    if (profile.status !== "Active") return json({ error: "Your account is inactive. Contact an administrator." }, 403);
    if (!["admin", "dispatcher"].includes(String(profile.role || "").toLowerCase())) {
      return json({ error: "You do not have permission to access this application." }, 403);
    }

    const client = createClient(url, anon, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data, error } = await client.auth.signInWithPassword({ email: profile.email, password });
    if (error || !data.session) return json({ error: "Invalid password." }, 401);

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
        username: profile.username,
        name: profile.name,
        email: profile.email,
        role: profile.role,
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
