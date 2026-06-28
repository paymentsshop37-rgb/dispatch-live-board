import React, { useEffect, useState } from "react";
import { CheckCircle2, ClipboardCheck, Send, Wrench } from "lucide-react";
import { createTechnician } from "./technicianService";
import { logActivity } from "../activity";
import {
  getInvitationByCode,
  markInvitationCompleted,
  markInvitationOpened,
} from "./technicianInvitationService";

const emptyRegistration = {
  full_name: "",
  phone: "",
  email: "",
  city: "",
  state: "",
  serviceArea: "",
  services: "",
  agreement: false,
  digitalSignature: "",
  status: "Pending",
  notes: "",
};

export default function TechnicianRegistrationPortal() {
  const [form, setForm] = useState(emptyRegistration);
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [invitation, setInvitation] = useState(null);

  useEffect(() => {
    const inviteCode = new URLSearchParams(window.location.search).get("invite");
    if (!inviteCode) return;

    let mounted = true;

    async function loadInvitation() {
      try {
        const invite = await getInvitationByCode(inviteCode);
        const openedInvite = await markInvitationOpened(invite);

        if (!mounted) return;

        const activeInvite = openedInvite || invite;
        setInvitation(activeInvite);
        setForm((current) => ({
          ...current,
          full_name: activeInvite.technicianName || current.full_name,
          phone: activeInvite.phone || current.phone,
          email: activeInvite.email || current.email,
        }));
      } catch (inviteError) {
        if (mounted) {
          setError(inviteError.message || "Unable to load invitation.");
        }
      }
    }

    loadInvitation();

    return () => {
      mounted = false;
    };
  }, []);

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function normalizeServices(value) {
    if (Array.isArray(value)) {
      return value.map((service) => String(service).trim()).filter(Boolean);
    }

    return String(value || "")
      .split(/[,\n\r]+/)
      .map((service) => service.trim())
      .filter(Boolean);
  }

  async function submitRegistration(event) {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      const technician = await createTechnician({
        ...form,
        services: normalizeServices(form.services),
        agreementAccepted: form.agreement,
        notes: [
          form.notes,
          invitation?.inviteCode ? `Invitation code: ${invitation.inviteCode}` : "",
          `Digital signature: ${form.digitalSignature}`,
          "Agreement accepted: Yes",
        ]
          .filter(Boolean)
          .join("\n"),
      });

      if (invitation?.id) {
        await markInvitationCompleted(invitation.id, technician.id);
      }

      await logActivity({
        entityType: "technician",
        entityId: technician.id,
        action: "Technician Registered",
        description: `${technician.full_name || form.full_name || "Technician"} submitted registration`,
        createdBy: "Public Registration",
        metadata: { inviteCode: invitation?.inviteCode || "" },
      });

      setForm(emptyRegistration);
      setSubmitted(true);
    } catch (registrationError) {
      setError(registrationError.message || "Unable to submit registration.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="bg-slate-950 px-4 py-8 text-white md:px-8">
        <div className="mx-auto max-w-4xl">
          <p className="text-sm font-bold uppercase tracking-[0.25em] text-emerald-300">NTTR</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight md:text-4xl">
            National Truck Trailer Repair
          </h1>
          <p className="mt-2 text-lg font-semibold text-slate-200">Technician Registration Portal</p>
        </div>
      </header>

      <main className="px-4 py-6 md:px-8">
        <div className="mx-auto max-w-4xl">
          {submitted ? (
            <section className="rounded-3xl bg-white p-8 text-center shadow-sm">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                <CheckCircle2 className="h-8 w-8" />
              </div>
              <h2 className="mt-5 text-3xl font-bold">Registration Submitted</h2>
              <p className="mt-3 text-slate-600">
                Thank you. Your information was received and is under review.
              </p>
            </section>
          ) : (
        <form onSubmit={submitRegistration} className="rounded-3xl bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <ClipboardCheck className="h-5 w-5 text-slate-700" />
              <div>
                <h2 className="text-xl font-bold">Registration Details</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Please complete this form before receiving work assignments from NTTR.
                </p>
                {invitation && (
                  <p className="mt-2 rounded-xl bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700">
                    Invitation verified for {invitation.phone || invitation.email || invitation.inviteCode}
                  </p>
                )}
              </div>
            </div>
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-700">
              Pending
            </span>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Full Name" value={form.full_name} onChange={(value) => updateField("full_name", value)} required />
            <Field label="Phone" value={form.phone} onChange={(value) => updateField("phone", value)} required />
            <Field label="Email" type="email" value={form.email} onChange={(value) => updateField("email", value)} />
            <Field label="City" value={form.city} onChange={(value) => updateField("city", value)} required />
            <Field label="State" value={form.state} onChange={(value) => updateField("state", value)} required />
            <Field
              label="Service Area"
              value={form.serviceArea}
              onChange={(value) => updateField("serviceArea", value)}
              placeholder="El Paso, West Texas, Southern NM"
            />
          </div>

          <label className="mt-4 block space-y-1 text-sm font-medium">
            Services
            <textarea
              required
              className="min-h-24 w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-slate-500"
              value={form.services}
              onChange={(event) => updateField("services", event.target.value)}
              placeholder="Tires, trailer repair, jump starts, air leaks..."
            />
          </label>

          <Field
            label="Digital Signature"
            value={form.digitalSignature}
            onChange={(value) => updateField("digitalSignature", value)}
            placeholder="Type your full legal name"
            required
          />

          <label className="mt-4 flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-medium">
            <input
              type="checkbox"
              required
              checked={form.agreement}
              onChange={(event) => updateField("agreement", event.target.checked)}
              className="mt-1 h-4 w-4"
            />
            <span>
              I certify that the information provided is accurate and agree that NTTR may review it
              before assigning work.
            </span>
          </label>

          <label className="mt-4 block space-y-1 text-sm font-medium">
            Notes
            <textarea
              className="min-h-24 w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-slate-500"
              value={form.notes}
              onChange={(event) => updateField("notes", event.target.value)}
              placeholder="Availability, payment notes, preferred regions..."
            />
          </label>

          {error && (
            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 font-bold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {saving ? <Wrench className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
            {saving ? "Submitting..." : "Submit Technician Registration"}
          </button>
        </form>
          )}
        </div>
      </main>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", placeholder = "", required = false }) {
  return (
    <label className="space-y-1 text-sm font-medium">
      {label}
      <input
        type={type}
        required={required}
        className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-slate-500"
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
