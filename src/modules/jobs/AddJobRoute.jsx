import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Save, Trash2, X } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { normalizeUppercaseAddJobFields, uppercaseAddJobField } from "./addJobUppercase";
import AmPmTimeInput from "../../components/AmPmTimeInput";

const STATES = {
  AL: "AL", ALABAMA: "AL", AK: "AK", ALASKA: "AK", AZ: "AZ", ARIZONA: "AZ",
  AR: "AR", ARKANSAS: "AR", CA: "CA", CALIFORNIA: "CA", CO: "CO", COLORADO: "CO",
  CT: "CT", CONNECTICUT: "CT", DE: "DE", DELAWARE: "DE", FL: "FL", FLORIDA: "FL",
  GA: "GA", GEORGIA: "GA", HI: "HI", HAWAII: "HI", ID: "ID", IDAHO: "ID",
  IL: "IL", ILLINOIS: "IL", IN: "IN", INDIANA: "IN", IA: "IA", IOWA: "IA",
  KS: "KS", KANSAS: "KS", KY: "KY", KENTUCKY: "KY", LA: "LA", LOUISIANA: "LA",
  ME: "ME", MAINE: "ME", MD: "MD", MARYLAND: "MD", MA: "MA", MASSACHUSETTS: "MA",
  MI: "MI", MICHIGAN: "MI", MN: "MN", MINNESOTA: "MN", MS: "MS", MISSISSIPPI: "MS",
  MO: "MO", MISSOURI: "MO", MT: "MT", MONTANA: "MT", NE: "NE", NEBRASKA: "NE",
  NV: "NV", NEVADA: "NV", NH: "NH", "NEW HAMPSHIRE": "NH", NJ: "NJ", "NEW JERSEY": "NJ",
  NM: "NM", "NEW MEXICO": "NM", NY: "NY", "NEW YORK": "NY", NC: "NC", "NORTH CAROLINA": "NC",
  ND: "ND", "NORTH DAKOTA": "ND", OH: "OH", OHIO: "OH", OK: "OK", OKLAHOMA: "OK",
  OR: "OR", OREGON: "OR", PA: "PA", PENNSYLVANIA: "PA", RI: "RI", "RHODE ISLAND": "RI",
  SC: "SC", "SOUTH CAROLINA": "SC", SD: "SD", "SOUTH DAKOTA": "SD", TN: "TN", TENNESSEE: "TN",
  TX: "TX", TEXAS: "TX", UT: "UT", UTAH: "UT", VT: "VT", VERMONT: "VT",
  VA: "VA", VIRGINIA: "VA", WA: "WA", WASHINGTON: "WA", WV: "WV", "WEST VIRGINIA": "WV",
  WI: "WI", WISCONSIN: "WI", WY: "WY", WYOMING: "WY",
};

function initialForm() {
  return {
    date: new Date().toISOString().slice(0, 10), time: "", reference: "", company: "",
    dispatch: "", tech: "", location: "", jobCity: "", jobState: "", status: "New",
    rowFlag: "Normal", invoice: "Pending", paymentMethod: "Pending",
    paymentReceiver: "A", jobReference: "", poNumber: "", truckUnit: "", customerPhone: "",
    complaint: "", updates: "", parts: "", totalBill: "", techLabor: "",
    selectedFlatRateLabor: [], selectedParts: [], fromDate: "", toDate: "", periodFilter: "This Week",
  };
}

function userId(user) {
  return user?.authUserId || user?.auth_user_id || user?.user_id || user?.id || user?.email || "anonymous";
}

function normalizeCity(value) {
  const city = String(value || "").trim().replace(/\s+/g, " ").toUpperCase();
  const aliases = {
    "FT WORTH": "FORT WORTH", "FT. WORTH": "FORT WORTH", "FT STOCKTON": "FORT STOCKTON",
    "FT. STOCKTON": "FORT STOCKTON", ALBURQUERQUE: "ALBUQUERQUE", OKC: "OKLAHOMA CITY",
  };
  return aliases[city] || city;
}

function parseLocation(value) {
  const source = String(value || "").trim();
  if (!source) return { city: "", state: "" };
  const clean = source.replace(/\s+/g, " ").replace(/\s*,\s*/g, ", ");
  const stateNames = Object.keys(STATES).sort((a, b) => b.length - a.length).join("|");
  const match = clean.toUpperCase().match(new RegExp(`(?:,|\\s)(${stateNames})(?:\\s+\\d{5}(?:-\\d{4})?)?$`));
  if (!match) return { city: "", state: "" };
  const state = STATES[match[1]];
  let beforeState = clean.slice(0, match.index).replace(/[,\s]+$/, "");
  const segments = beforeState.split(",").map((part) => part.trim()).filter(Boolean);
  let city = segments.at(-1) || beforeState;
  city = city.replace(/^(?:US|I)-?\d+\s+(?:NEAR|AT)\s+/i, "");
  if (/\d/.test(city) && segments.length < 2) return { city: "", state: "" };
  city = normalizeCity(city);
  if (city === "JOPLIN" && state === "MS") return { city: "JOPLIN", state: "MO" };
  return { city, state };
}

function hasDraftData(form) {
  const defaults = initialForm();
  return Object.entries(form).some(([key, value]) =>
    !["date", "status", "rowFlag", "invoiceStatus", "jobCity", "jobState"].includes(key)
      && String(value ?? "").trim() !== String(defaults[key] ?? "").trim()
  );
}

function toDbJob(job) {
  const normalizedJob = normalizeUppercaseAddJobFields(job);
  return {
    job_date: normalizedJob.date || null, job_time: normalizedJob.time || null,
    reference_number: normalizedJob.jobReference || null, invoice_number: normalizedJob.reference || null,
    dispatch: normalizedJob.dispatch || null, company: normalizedJob.company || null, tech: normalizedJob.tech || null,
    location: normalizedJob.location || null, job_city: normalizedJob.jobCity || null, job_state: normalizedJob.jobState || null,
    status: normalizedJob.status || null, row_flag: normalizedJob.rowFlag || null,
    invoice_status: normalizedJob.invoice || "Pending", payment_method: normalizedJob.paymentMethod || "Pending",
    received: normalizedJob.paymentReceiver || null, updates: normalizedJob.updates || null,
    total_bill: Number(normalizedJob.totalBill || 0), parts: Number(normalizedJob.parts || 0), tech_labor: Number(normalizedJob.techLabor || 0),
  };
}

export default function AddJobRoute({ currentUser, onBack, onSaved }) {
  const storageKey = useMemo(() => `dispatch_add_job_draft_${userId(currentUser)}`, [currentUser]);
  const restored = useMemo(() => {
    try { return JSON.parse(sessionStorage.getItem(storageKey) || "null"); } catch { return null; }
  }, [storageKey]);
  const [form, setForm] = useState(() => {
    const saved = normalizeUppercaseAddJobFields(restored?.formData || {});
    return {
      ...initialForm(),
      ...saved,
      jobCity: saved.jobCity || saved.city || "",
      jobState: saved.jobState || saved.state || "",
    };
  });
  const [step, setStep] = useState(() => Number(restored?.currentStep || 1));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmAction, setConfirmAction] = useState("");
  const pageRef = useRef(null);
  const formRef = useRef(null);
  const draftTimerRef = useRef(null);
  const clearedRef = useRef(false);
  const latestRef = useRef({ form, step, scrollPosition: Number(restored?.scrollPosition || 0), lastFocusedField: restored?.lastFocusedField || null });

  const saveDraft = useCallback(() => {
    if (draftTimerRef.current) {
      window.clearTimeout(draftTimerRef.current);
      draftTimerRef.current = null;
    }
    latestRef.current.scrollPosition = pageRef.current?.scrollTop ?? latestRef.current.scrollPosition;
    sessionStorage.setItem(storageKey, JSON.stringify({
      isOpen: true, formData: latestRef.current.form, currentStep: latestRef.current.step,
      scrollPosition: latestRef.current.scrollPosition, lastFocusedField: latestRef.current.lastFocusedField,
      updatedAt: new Date().toISOString(),
    }));
  }, [storageKey]);

  const restorePosition = useCallback(() => {
    requestAnimationFrame(() => {
      if (pageRef.current) pageRef.current.scrollTop = latestRef.current.scrollPosition || 0;
      const name = latestRef.current.lastFocusedField;
      if (!name || !formRef.current) return;
      const field = [...formRef.current.elements].find((item) => item.name === name && !item.disabled);
      field?.focus({ preventScroll: true });
    });
  }, []);

  useEffect(() => {
    console.log("[AddJobRoute] mounted");
    console.log("[AddJobRoute] location", window.location.pathname);
    restorePosition();
    return () => {
      if (!clearedRef.current) saveDraft();
      console.trace("[AddJobRoute] unmounted", {
        pathname: window.location.pathname,
        draftCleared: clearedRef.current,
      });
    };
  }, [restorePosition, saveDraft]);

  useEffect(() => {
    latestRef.current.form = form;
    latestRef.current.step = step;
    if (draftTimerRef.current) window.clearTimeout(draftTimerRef.current);
    draftTimerRef.current = window.setTimeout(saveDraft, 800);
    return () => {
      if (draftTimerRef.current) window.clearTimeout(draftTimerRef.current);
    };
  }, [form, step, saveDraft]);

  useEffect(() => {
    const visibility = () => {
      console.log("[Visibility]", document.visibilityState);
      if (document.visibilityState === "hidden") saveDraft();
      else restorePosition();
    };
    const blur = () => saveDraft();
    const focus = () => restorePosition();
    const beforeUnload = () => saveDraft();
    const requestRouteExit = () => requestClose();
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("blur", blur);
    window.addEventListener("focus", focus);
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("add-job-route-exit-request", requestRouteExit);
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("blur", blur);
      window.removeEventListener("focus", focus);
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener("add-job-route-exit-request", requestRouteExit);
    };
  }, [restorePosition, saveDraft]);

  function update(name, value) {
    setForm((current) => {
      const normalizedValue = uppercaseAddJobField(name, value);
      const next = { ...current, [name]: normalizedValue };
      if (name === "location") {
        const parsed = parseLocation(normalizedValue);
        next.jobCity = parsed.city;
        next.jobState = parsed.state;
      }
      latestRef.current.form = next;
      return next;
    });
  }

  function requestClose() {
    const currentForm = latestRef.current.form;
    console.trace("[AddJobRoute] close requested", { hasData: hasDraftData(currentForm) });
    if (!hasDraftData(currentForm)) {
      clearedRef.current = true;
      sessionStorage.removeItem(storageKey);
      onBack();
    } else setConfirmAction("close");
  }

  function discard() {
    console.trace("[AddJobRoute] discard confirmed");
    clearedRef.current = true;
    sessionStorage.removeItem(storageKey);
    setForm(initialForm());
    setStep(1);
    latestRef.current = { form: initialForm(), step: 1, scrollPosition: 0, lastFocusedField: null };
    setConfirmAction("");
    onBack();
  }

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    saveDraft();
    const { data, error: insertError } = await supabase.from("jobs").insert([toDbJob(form)]).select("*, reference_number").single();
    if (insertError) {
      console.trace("[AddJobRoute] save failed; route preserved", insertError.message);
      setError(insertError.message || "Unable to save job.");
      setSaving(false);
      saveDraft();
      return;
    }
    console.trace("[AddJobRoute] save succeeded; navigating to Dispatch Board");
    clearedRef.current = true;
    sessionStorage.removeItem(storageKey);
    onSaved(data);
  }

  return (
    <div ref={pageRef} className="h-screen overflow-y-auto bg-[#07111f] text-white" onScroll={() => { latestRef.current.scrollPosition = pageRef.current?.scrollTop || 0; }}>
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#0b1628]/95 px-4 py-4 backdrop-blur md:px-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button type="button" onClick={requestClose} className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10" aria-label="Close Add New Job"><ArrowLeft className="h-5 w-5" /></button>
            <div><p className="text-xs font-black uppercase tracking-widest text-blue-300">Dispatch</p><h1 className="text-xl font-black md:text-2xl">Add New Job</h1></div>
          </div>
          <button type="button" onClick={requestClose} className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl p-4 pb-24 md:p-8">
        <form ref={formRef} onSubmit={submit} onBlur={saveDraft} onFocus={(event) => { if (event.target.name) latestRef.current.lastFocusedField = event.target.name; }} className="rounded-3xl border border-white/10 bg-[#0d1b2e] p-5 shadow-2xl md:p-8">
          <div className="mb-6 flex gap-2 md:hidden">
            {[1, 2, 3].map((number) => <button key={number} type="button" onClick={() => setStep(number)} className={`h-2 flex-1 rounded-full ${step === number ? "bg-blue-500" : "bg-slate-700"}`} aria-label={`Go to section ${number}`} />)}
          </div>

          <Section title="Job Information" visible={step === 1}>
            <Field label="Date"><input name="date" type="date" value={form.date} onChange={(e) => update("date", e.target.value)} /></Field>
            <Field label="Time"><AmPmTimeInput name="time" value={form.time} onChange={(value) => update("time", value)} /></Field>
            <Field label="Company"><input name="company" value={form.company} onChange={(e) => update("company", e.target.value)} /></Field>
            <Field label="Invoice #"><input name="reference" value={form.reference} onChange={(e) => update("reference", e.target.value)} /></Field>
            <Field label="Reference #"><input name="jobReference" value={form.jobReference} onChange={(e) => update("jobReference", e.target.value)} /></Field>
            <Field label="Dispatch"><input name="dispatch" value={form.dispatch} onChange={(e) => update("dispatch", e.target.value)} /></Field>
            <Field label="Selected Technician"><input name="tech" value={form.tech} onChange={(e) => update("tech", e.target.value)} /></Field>
            <Field label="Location" wide><input name="location" value={form.location} onChange={(e) => update("location", e.target.value)} /></Field>
            <Field label="Parsed City"><input name="jobCity" value={form.jobCity} onChange={(e) => update("jobCity", normalizeCity(e.target.value))} /></Field>
            <Field label="Parsed State"><input name="jobState" maxLength={2} value={form.jobState} onChange={(e) => update("jobState", e.target.value.toUpperCase())} /></Field>
          </Section>

          <Section title="Status & Billing" visible={step === 2}>
            <Field label="Status"><select name="status" value={form.status} onChange={(e) => update("status", e.target.value)}><option>Pending</option><option>Dispatched</option><option>In Progress</option><option>Completed</option><option>Cancelled</option></select></Field>
            <Field label="Priority"><select name="rowFlag" value={form.rowFlag} onChange={(e) => update("rowFlag", e.target.value)}><option>Normal</option><option>Priority</option><option>Urgent</option></select></Field>
            <Field label="Invoice Status"><select name="invoice" value={form.invoice} onChange={(e) => update("invoice", e.target.value)}><option>Pending</option><option>Invoiced</option><option>Paid</option></select></Field>
            <Field label="Payment Method"><input name="paymentMethod" value={form.paymentMethod} onChange={(e) => update("paymentMethod", e.target.value)} /></Field>
            <Field label="Payment Received By"><input name="paymentReceiver" value={form.paymentReceiver} onChange={(e) => update("paymentReceiver", e.target.value)} /></Field>
            <Field label="PO Number"><input name="poNumber" value={form.poNumber} onChange={(e) => update("poNumber", e.target.value)} /></Field>
            <Field label="Truck / Unit"><input name="truckUnit" value={form.truckUnit} onChange={(e) => update("truckUnit", e.target.value)} /></Field>
          </Section>

          <Section title="Details & Totals" visible={step === 3}>
            <Field label="Customer Phone"><input name="customerPhone" value={form.customerPhone} onChange={(e) => update("customerPhone", e.target.value)} /></Field>
            <Field label="Complaint / Notes" wide><textarea name="complaint" rows="3" value={form.complaint} onChange={(e) => update("complaint", e.target.value)} /></Field>
            <Field label="Updates" wide><textarea name="updates" rows="3" value={form.updates} onChange={(e) => update("updates", e.target.value)} /></Field>
            <Field label="Parts"><input name="parts" value={form.parts} onChange={(e) => update("parts", e.target.value)} /></Field>
            <Field label="Flat-rate Labor"><input name="techLabor" value={form.techLabor} onChange={(e) => update("techLabor", e.target.value)} /></Field>
            <Field label="Total Bill"><input name="totalBill" value={form.totalBill} onChange={(e) => update("totalBill", e.target.value)} /></Field>
          </Section>

          {error && <div className="mt-6 rounded-xl border border-red-400/30 bg-red-500/10 p-4 font-semibold text-red-200">{error}</div>}
          <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
            <button type="button" onClick={() => setConfirmAction("clear")} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-red-400/30 px-5 font-bold text-red-200"><Trash2 className="h-4 w-4" />Clear</button>
            <div className="flex flex-col-reverse gap-3 sm:flex-row">
              <button type="button" onClick={requestClose} className="min-h-12 rounded-xl border border-slate-600 px-6 font-bold">Close</button>
              {step < 3 && <button type="button" onClick={() => setStep((current) => Math.min(3, current + 1))} className="min-h-12 rounded-xl bg-slate-700 px-6 font-bold md:hidden">Next</button>}
              <button type="submit" disabled={saving} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-blue-600 px-7 font-black disabled:opacity-60"><Save className="h-4 w-4" />{saving ? "Saving..." : "Save Job"}</button>
            </div>
          </div>
        </form>
      </main>

      {confirmAction && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"><div className="w-full max-w-md rounded-3xl bg-white p-6 text-slate-950 shadow-2xl"><h2 className="text-xl font-black">Discard this unfinished job?</h2><p className="mt-2 text-sm font-semibold text-slate-600">Your saved Add Job draft will be deleted.</p><div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button type="button" onClick={() => setConfirmAction("")} className="min-h-11 rounded-xl border border-slate-300 px-5 font-bold">Keep Editing</button><button type="button" onClick={discard} className="min-h-11 rounded-xl bg-red-600 px-5 font-bold text-white">Discard Job</button></div></div></div>}
    </div>
  );
}

function Section({ title, visible, children }) {
  return <section className={`${visible ? "grid" : "hidden"} gap-4 md:grid md:grid-cols-2`}><h2 className="col-span-full mb-1 text-lg font-black text-blue-200">{title}</h2>{children}</section>;
}

function Field({ label, wide = false, children }) {
  return <label className={`grid gap-2 text-sm font-bold text-slate-300 ${wide ? "md:col-span-2" : ""}`}><span>{label}</span>{React.cloneElement(children, { className: "min-h-12 w-full rounded-xl border border-slate-600 bg-[#081423] px-3 py-2 text-base text-white outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 [&_select]:rounded-lg [&_select]:border [&_select]:border-slate-600 [&_select]:bg-[#081423] [&_select]:px-2 [&_select]:text-white" })}</label>;
}
