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
    email: profile?.email || authSession?.user?.email || "",
    name: profile?.name || "",
    role: String(profile?.role || "dispatcher").toLowerCase(),
    status: profile?.status || "Inactive",
    forcePasswordChange: Boolean(profile?.force_password_change),
    loginCount: Number(profile?.login_count || 0),
    isAuthenticated: Boolean(authSession?.user && profile?.status === "Active"),
  };
}

export async function clearAuthSession() {
  await supabase.auth.signOut();
  localStorage.removeItem("currentUser");
  localStorage.removeItem("currentUserName");
  localStorage.removeItem("currentUserRole");
  window.dispatchEvent(new Event("nttr-auth-changed"));
}
