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
    const accessCode = clean(body.accessCode);
    if (!accessCode) return json({ error: "Password is required." }, 400);

    const [username, password] = parseAccessCode(accessCode);
    if (!username || !password) return json({ error: "Invalid password." }, 401);

    const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: profile, error: profileError } = await admin
      .from("app_users")
      .select("id,email,status,role")
      .eq("username", username)
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

    return json({
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at,
        token_type: data.session.token_type,
      },
    });
  } catch (error) {
    console.error("auth-access-code:", error instanceof Error ? error.message : error);
    return json({ error: "Internal server error." }, 500);
  }
});

function parseAccessCode(accessCode: string) {
  const separator = accessCode.indexOf("/");
  if (separator === -1) return ["", ""];
  return [accessCode.slice(0, separator).trim(), accessCode.slice(separator + 1)];
}
