import { supabase } from "./lib/supabase";

export async function loadCurrentProfile(userId) {
  if (!userId) return null;
  const { data, error } = await supabase
    .from("app_users")
    .select("*")
    .or(`auth_user_id.eq.${userId},id.eq.${userId}`)
    .single();
  if (error) throw error;
  return data;
}

export function profileToSession(profile, authSession) {
  return {
    id: profile?.id || authSession?.user?.id || "",
    authUserId: profile?.auth_user_id || authSession?.user?.id || "",
    username: profile?.username || "",
    name: profile?.name || "",
    role: String(profile?.role || "dispatcher").toLowerCase(),
    status: profile?.status || "Inactive",
    forcePasswordChange: Boolean(profile?.force_password_change),
    loginCount: Number(profile?.login_count || 0),
    isAuthenticated: Boolean(authSession?.user && profile?.status === "Active"),
  };
}

export async function clearAuthSession() {
  let signOutError;
  try {
    const { error } = await supabase.auth.signOut({ scope: "local" });
    signOutError = error;
  } finally {
    clearCustomAuthStorage();
    window.dispatchEvent(new Event("nttr-auth-changed"));
  }
  if (signOutError) throw signOutError;
}

export function clearCustomAuthStorage() {
  const isCustomAuthKey = (key) =>
    ["currentUser", "currentUserName", "currentUserRole"].includes(key) ||
    /^(nttr-(auth|session|user|role|access)|auth-|user-session)/i.test(key);

  Object.keys(localStorage).forEach((key) => {
    if (isCustomAuthKey(key) || key.startsWith("sb-")) localStorage.removeItem(key);
  });
  sessionStorage.clear();
}

const sessionAuditIdKey = "nttr-session-audit-id";
const sessionLoginTimeKey = "nttr-session-login-time";

export async function startSessionAudit(profile) {
  if (!profile?.authUserId || sessionStorage.getItem(sessionAuditIdKey)) return;
  const id = crypto.randomUUID();
  const loginTime = new Date().toISOString();
  const { error } = await supabase.from("session_audit_log").insert([{
    id,
    user_id: profile.authUserId,
    user_name: profile.name || profile.username || "User",
    role: String(profile.role || "").toLowerCase(),
    login_time: loginTime,
    browser: browserName(),
    device: deviceName(),
  }]);
  if (error) {
    console.warn("Session audit start failed:", error.message);
    return;
  }
  sessionStorage.setItem(sessionAuditIdKey, id);
  sessionStorage.setItem(sessionLoginTimeKey, loginTime);
}

export async function finishSessionAudit(logoutReason) {
  const id = sessionStorage.getItem(sessionAuditIdKey);
  const loginTime = sessionStorage.getItem(sessionLoginTimeKey);
  if (!id) return;
  const logoutTime = new Date();
  const duration = loginTime ? Math.max(0, Math.round((logoutTime.getTime() - new Date(loginTime).getTime()) / 1000)) : 0;
  const { error } = await supabase.from("session_audit_log").update({
    logout_time: logoutTime.toISOString(),
    logout_reason: logoutReason,
    session_duration: duration,
  }).eq("id", id);
  if (error) console.warn("Session audit finish failed:", error.message);
}

function browserName() {
  const agent = navigator.userAgent;
  if (agent.includes("Edg/")) return "Microsoft Edge";
  if (agent.includes("Chrome/")) return "Google Chrome";
  if (agent.includes("Firefox/")) return "Mozilla Firefox";
  if (agent.includes("Safari/") && !agent.includes("Chrome/")) return "Safari";
  return "Unknown browser";
}

function deviceName() {
  const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
  return `${mobile ? "Mobile" : "Desktop"} · ${navigator.platform || "Unknown platform"}`;
}
