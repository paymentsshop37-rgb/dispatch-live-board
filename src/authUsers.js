import { supabase } from "./lib/supabase";

export async function loadCurrentProfile(userId) {
  if (!userId) return null;
  const { data, error } = await supabase.from("app_users").select("*").eq("id", userId).single();
  if (error) throw error;
  return data;
}

export function profileToSession(profile, authSession) {
  return {
    id: profile?.id || authSession?.user?.id || "",
    username: profile?.username || "",
    email: profile?.email || authSession?.user?.email || "",
    name: profile?.name || "",
    role: String(profile?.role || "dispatcher").toLowerCase(),
    status: profile?.status || "Inactive",
    forcePasswordChange: Boolean(profile?.force_password_change),
    isAuthenticated: Boolean(authSession?.user && profile?.status === "Active"),
  };
}

export async function clearAuthSession() {
  await supabase.auth.signOut();
  window.dispatchEvent(new Event("nttr-auth-changed"));
}
