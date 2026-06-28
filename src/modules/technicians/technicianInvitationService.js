import { supabase } from "../../lib/supabase";

export const PRODUCTION_REGISTRATION_BASE_URL = "https://roadservicelive.com";

export function registrationBaseUrl() {
  const origin = window.location.origin;
  return origin.includes("localhost") || origin.includes("127.0.0.1")
    ? PRODUCTION_REGISTRATION_BASE_URL
    : PRODUCTION_REGISTRATION_BASE_URL;
}

export function registrationLink() {
  return `${registrationBaseUrl()}/technician-registration`;
}

export function generateInviteCode() {
  const randomValues = new Uint8Array(4);
  window.crypto.getRandomValues(randomValues);
  return `NTTR-${Array.from(randomValues)
    .map((value) => value.toString(36).toUpperCase().padStart(2, "0"))
    .join("")
    .slice(0, 6)}`;
}

export function registrationLinkForInvite(inviteCode) {
  return `${registrationBaseUrl()}/technician-registration?invite=${encodeURIComponent(inviteCode)}`;
}

export function inviteMessage(registrationLink) {
  return `Hello, this is NTTR - National Truck Trailer Repair. Please complete your technician registration using this secure link:\n${registrationLink}`;
}

export function normalizeInvitation(row) {
  return {
    id: row.id,
    inviteCode: row.invite_code,
    invitedBy: row.invited_by,
    technicianId: row.technician_id,
    technicianName: row.technician_name || "",
    phone: row.phone || "",
    email: row.email || "",
    status: row.status || "Pending",
    expiresAt: row.expires_at || "",
    openedAt: row.opened_at || "",
    completedAt: row.completed_at || "",
    createdAt: row.created_at || "",
    notes: row.notes || "",
    raw: row,
  };
}

export async function loadInvitations() {
  const { data, error } = await supabase
    .from("technician_invitations")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data || []).map(normalizeInvitation);
}

export async function createInvitation({ technicianName, phone, email, notes, invitedBy }) {
  const inviteCode = generateInviteCode();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("technician_invitations")
    .insert([
      {
        invite_code: inviteCode,
        invited_by: invitedBy || "",
        technician_name: technicianName || "",
        phone: phone || "",
        email: email || "",
        status: "Pending",
        expires_at: expiresAt,
        notes: notes || "",
      },
    ])
    .select()
    .single();

  if (error) {
    throw error;
  }

  return normalizeInvitation(data);
}

export async function getInvitationByCode(inviteCode) {
  if (!inviteCode) return null;

  const { data, error } = await supabase
    .from("technician_invitations")
    .select("*")
    .eq("invite_code", inviteCode)
    .single();

  if (error) {
    throw error;
  }

  return normalizeInvitation(data);
}

export async function markInvitationOpened(invitation) {
  if (!invitation || invitation.openedAt || invitation.completedAt) return invitation;
  if (["Cancelled", "Deleted"].includes(invitation.status)) {
    throw new Error("This invitation link is no longer active.");
  }

  const { data, error } = await supabase
    .from("technician_invitations")
    .update({
      opened_at: new Date().toISOString(),
      status: "Opened",
    })
    .eq("id", invitation.id)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return normalizeInvitation(data);
}

export async function cancelInvitation(invitationId) {
  const { data, error } = await supabase
    .from("technician_invitations")
    .update({ status: "Cancelled" })
    .eq("id", invitationId)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return normalizeInvitation(data);
}

export async function deleteInvitation(invitationId) {
  const { error } = await supabase
    .from("technician_invitations")
    .delete()
    .eq("id", invitationId);

  if (error) {
    throw error;
  }
}

export async function markInvitationCompleted(invitationId, technicianId) {
  if (!invitationId) return null;

  const { data, error } = await supabase
    .from("technician_invitations")
    .update({
      technician_id: technicianId || null,
      completed_at: new Date().toISOString(),
      status: "Completed",
    })
    .eq("id", invitationId)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return normalizeInvitation(data);
}
