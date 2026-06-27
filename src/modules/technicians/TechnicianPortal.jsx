import React, { useEffect, useState } from "react";
import { CheckCircle2, MapPin, Phone, Upload, XCircle } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { updateTechnicianJobStatus } from "./dispatchEngine";

export default function TechnicianPortal() {
  const [technician, setTechnician] = useState(null);
  const [job, setJob] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    loadPortal();

    const channel = supabase
      .channel("technician-portal-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "jobs" }, loadPortal)
      .on("postgres_changes", { event: "*", schema: "public", table: "technicians" }, loadPortal)
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  async function loadPortal() {
    const params = new URLSearchParams(window.location.search);
    const technicianId = params.get("technician");
    const phone = params.get("phone");

    if (!technicianId && !phone) {
      setError("Technician portal requires a technician id or phone number.");
      return;
    }

    const query = supabase.from("technicians").select("*").limit(1);
    const { data: techRows, error: techError } = technicianId
      ? await query.eq("id", technicianId)
      : await query.eq("phone", phone);

    if (techError) {
      setError(techError.message);
      return;
    }

    const activeTechnician = techRows?.[0];
    setTechnician(activeTechnician || null);

    if (!activeTechnician) {
      setError("Technician not found.");
      return;
    }

    const { data: jobs, error: jobError } = await supabase
      .from("jobs")
      .select("*")
      .eq("technician_id", activeTechnician.id)
      .order("assigned_at", { ascending: false })
      .limit(1);

    if (jobError) {
      setError(jobError.message);
      return;
    }

    setJob(jobs?.[0] || null);
    setError("");
  }

  async function setAvailability(availability, action) {
    await updateTechnicianJobStatus(technician.id, availability, action, `${technician.full_name || "Technician"} ${action}`);
    await loadPortal();
  }

  async function completeJob() {
    if (!job) return;
    await supabase.from("jobs").update({ status: "Completed" }).eq("id", job.id);
    await setAvailability("Available", "completed_job");
  }

  async function uploadPhoto(file) {
    if (!file || !job) return;

    const fileName = `${job.id}-${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabase.storage.from("job-photos").upload(fileName, file);
    if (uploadError) {
      setError(uploadError.message);
      return;
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 p-4 text-slate-900 md:p-8">
      <div className="mx-auto max-w-3xl rounded-3xl bg-white p-6 shadow-sm">
        <h1 className="text-3xl font-bold">Technician Portal</h1>
        <p className="mt-1 text-sm text-slate-500">Assigned work appears here in real time.</p>

        {error && <div className="mt-4 rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700">{error}</div>}

        {!error && !job && (
          <div className="mt-6 rounded-2xl border border-dashed border-slate-300 p-6 text-center text-slate-500">
            No assigned job right now.
          </div>
        )}

        {job && (
          <section className="mt-6 rounded-2xl border border-slate-200 p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase text-slate-400">New Job</p>
                <h2 className="mt-1 text-2xl font-bold">{job.company || job.invoice_number || "Assigned Job"}</h2>
                <p className="mt-2 text-sm text-slate-600">{job.location}</p>
              </div>
              <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
                {technician?.availability || "Busy"}
              </span>
            </div>

            <div className="mt-5 grid gap-2 md:grid-cols-2">
              <PortalButton icon={<CheckCircle2 />} label="Accept" onClick={() => setAvailability("Traveling", "accepted_job")} />
              <PortalButton icon={<XCircle />} label="Reject" onClick={() => setAvailability("Available", "rejected_job")} />
              <PortalButton icon={<MapPin />} label="Navigate" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(job.location || "")}`} />
              <PortalButton icon={<Phone />} label="Call Dispatcher" href={job.dispatcher_phone ? `tel:${job.dispatcher_phone}` : undefined} />
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-slate-100 px-4 py-3 font-bold text-slate-700 hover:bg-slate-200">
                <Upload className="h-5 w-5" />
                Upload Photos
                <input type="file" accept="image/*" className="hidden" onChange={(event) => uploadPhoto(event.target.files?.[0])} />
              </label>
              <PortalButton icon={<CheckCircle2 />} label="Complete Job" onClick={completeJob} />
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function PortalButton({ icon, label, onClick, href }) {
  const content = (
    <>
      {React.cloneElement(icon, { className: "h-5 w-5" })}
      {label}
    </>
  );

  if (href) {
    return (
      <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noreferrer" className="flex items-center justify-center gap-2 rounded-xl bg-slate-100 px-4 py-3 font-bold text-slate-700 hover:bg-slate-200">
        {content}
      </a>
    );
  }

  return (
    <button type="button" onClick={onClick} className="flex items-center justify-center gap-2 rounded-xl bg-slate-100 px-4 py-3 font-bold text-slate-700 hover:bg-slate-200">
      {content}
    </button>
  );
}
