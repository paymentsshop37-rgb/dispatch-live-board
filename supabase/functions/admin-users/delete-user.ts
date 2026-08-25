const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const AUTH_STATUS = {
  LINKED: "LINKED",
  OUT_OF_SYNC: "OUT_OF_SYNC",
  NO_AUTH: "NO_AUTH",
} as const;

export const DELETION_TYPE = {
  FULL_ACCOUNT: "FULL_ACCOUNT",
  ORPHAN_PROFILE: "ORPHAN_PROFILE",
} as const;

export class UserDeletionError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.name = "UserDeletionError";
    this.status = status;
  }
}

export function validAuthUserId(value: unknown) {
  const id = String(value ?? "").trim();
  return uuidPattern.test(id) ? id : "";
}

export function authStatusForProfile(storedAuthUserId: unknown, authExists: boolean) {
  const storedId = String(storedAuthUserId ?? "").trim();
  if (!storedId) return AUTH_STATUS.NO_AUTH;
  return validAuthUserId(storedId) && authExists ? AUTH_STATUS.LINKED : AUTH_STATUS.OUT_OF_SYNC;
}

export function isActiveAdmin(caller: { role?: unknown; status?: unknown } | null | undefined) {
  return String(caller?.role ?? "").toLowerCase() === "admin" && String(caller?.status ?? "").toLowerCase() === "active";
}

type DeleteTarget = {
  id: string;
  auth_user_id?: string | null;
  username?: string | null;
};

type DeleteActor = {
  profileId: string;
  authUserId: string;
};

type DeleteOperations = {
  authUserExists: (authUserId: string) => Promise<boolean>;
  deleteAuthUser: (authUserId: string) => Promise<void>;
  deleteProfile: (profileId: string) => Promise<void>;
  profileExists: (profileId: string) => Promise<boolean>;
  writeAudit: (entry: Record<string, unknown>) => Promise<void>;
  now?: () => string;
};

export async function deleteUserSafely(target: DeleteTarget, actor: DeleteActor, operations: DeleteOperations) {
  const profileId = String(target?.id ?? "").trim();
  const storedAuthUserId = String(target?.auth_user_id ?? "").trim();
  const authUserId = validAuthUserId(storedAuthUserId);

  if (!profileId) throw new UserDeletionError("User not found.", 404);
  if (profileId === actor.profileId || (authUserId && authUserId === actor.authUserId)) {
    throw new UserDeletionError("You cannot delete your own account while signed in.", 400);
  }

  const authExists = authUserId ? await operations.authUserExists(authUserId) : false;
  const deletionType = authExists ? DELETION_TYPE.FULL_ACCOUNT : DELETION_TYPE.ORPHAN_PROFILE;

  if (authExists) {
    await operations.deleteAuthUser(authUserId);
    if (await operations.authUserExists(authUserId)) {
      throw new UserDeletionError("Unable to verify removal of the authentication account.");
    }
  }

  await operations.deleteProfile(profileId);
  if (await operations.profileExists(profileId)) {
    throw new UserDeletionError("Unable to verify removal of the user profile.");
  }

  const timestamp = (operations.now || (() => new Date().toISOString()))();
  await operations.writeAudit({
    action: deletionType === DELETION_TYPE.FULL_ACCOUNT ? "USER_DELETED" : "USER_PROFILE_DELETED",
    target: profileId,
    details: {
      administrator_profile_id: actor.profileId,
      administrator_auth_user_id: actor.authUserId,
      deleted_username: String(target.username ?? ""),
      profile_id: profileId,
      auth_user_id: authUserId || null,
      deletion_type: deletionType,
      timestamp,
    },
  });

  return {
    ok: true,
    deletionType,
    profileId,
    authUserId: authUserId || null,
  };
}
