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
  const { error } = await supabase.auth.signOut({ scope: "local" });
  clearCustomAuthStorage();
  window.dispatchEvent(new Event("nttr-auth-changed"));
  if (error) throw error;
}

export function clearCustomAuthStorage() {
  const isCustomAuthKey = (key) =>
    ["currentUser", "currentUserName", "currentUserRole"].includes(key) ||
    /^(nttr-(auth|session|user|role|access)|auth-|user-session)/i.test(key);

  [localStorage, sessionStorage].forEach((storage) => {
    Object.keys(storage).forEach((key) => {
      if (isCustomAuthKey(key)) storage.removeItem(key);
    });
  });
}
