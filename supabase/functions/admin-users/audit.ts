// Called only with the server's service-role client after admin authorization.
export async function audit(client: any, action: string, target: string, actor: string, details: Record<string, unknown> = {}) {
  try {
    const { error } = await client.from("activity_log").insert({
      entity_type: "user",
      entity_id: target,
      action,
      description: action.replaceAll("_", " "),
      created_by: actor,
      metadata: { ...details, target_user_id: target, performed_by: actor },
    });
    if (error) throw error;
    return true;
  } catch (error) {
    const failure = error as { code?: string; message?: string; details?: string; hint?: string };
    console.error("admin-users audit insert failed", {
      action, target_user_id: target, actor_auth_user_id: actor,
      code: failure?.code ?? null,
      message: failure?.message ?? String(error),
      details: failure?.details ?? null,
      hint: failure?.hint ?? null,
    });
    return false;
  }
}
