export const normalizeLoginUsername = (value: unknown) => String(value ?? "").trim().toLowerCase();

export type ResolvedAuthIdentity = {
  id: string;
  email: string;
  provider: string;
};

export class AuthResolutionError extends Error {
  category: string;
  status: number;

  constructor(message: string, category: string, status: number) {
    super(message);
    this.name = "AuthResolutionError";
    this.category = category;
    this.status = status;
  }
}

export function resolveLinkedAuthIdentity(profile: any, authUser: any): ResolvedAuthIdentity {
  const linkedId = String(profile?.auth_user_id ?? "").trim();
  if (!linkedId) {
    throw new AuthResolutionError("This user is out of sync. Contact an administrator.", "missing_auth_user_id", 409);
  }
  if (!authUser?.id || authUser.id !== linkedId) {
    throw new AuthResolutionError("This user is out of sync. Contact an administrator.", "linked_auth_user_not_found", 409);
  }

  const email = String(authUser.email ?? "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    throw new AuthResolutionError("This user is out of sync. Contact an administrator.", "linked_auth_email_missing", 409);
  }

  return {
    id: authUser.id,
    email,
    provider: String(authUser.app_metadata?.provider || authUser.identities?.[0]?.provider || "unknown"),
  };
}

export function authErrorCategory(error: any) {
  const code = String(error?.code || "").trim().toLowerCase();
  if (code) return code;
  const status = Number(error?.status || 0);
  if (status === 400) return "invalid_credentials";
  if (status === 429) return "rate_limited";
  return status ? `auth_http_${status}` : "auth_unknown";
}
