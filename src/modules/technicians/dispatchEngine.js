import { supabase } from "../../lib/supabase";
import { loadTechnicians } from "./technicianService";

function splitServices(services) {
  if (Array.isArray(services)) {
    return services.map((service) => String(service).trim()).filter(Boolean);
  }

  return String(services || "")
    .split(/[,\n\r]+/)
    .map((service) => service.trim())
    .filter(Boolean);
}

function extractCity(location) {
  return String(location || "")
    .split(",")[0]
    .trim()
    .toLowerCase();
}

function serviceMatches(technician, requestedService) {
  const service = String(requestedService || "").trim().toLowerCase();
  if (!service) return true;
  return splitServices(technician.services).some((item) => item.toLowerCase().includes(service));
}

function coverageMatches(technician, city) {
  const requestedCity = String(city || "").trim().toLowerCase();
  if (!requestedCity) return true;

  return (
    String(technician.city || "").toLowerCase() === requestedCity ||
    String(technician.coverage || "").toLowerCase().includes(requestedCity) ||
    String(technician.coverage_areas || "").toLowerCase().includes(requestedCity)
  );
}

function estimatedDistance(technician, city) {
  const requestedCity = String(city || "").trim().toLowerCase();
  if (!requestedCity) return 999;
  if (String(technician.city || "").toLowerCase() === requestedCity) return 0;
  if (String(technician.coverage || "").toLowerCase().includes(requestedCity)) return 25;
  if (String(technician.coverage_areas || "").toLowerCase().includes(requestedCity)) return 35;
  return 999;
}

export function rankTechnicians(technicians, job) {
  const city = extractCity(job.location);
  const requestedService = job.requestedService || job.service || job.updates || "";

  return technicians
    .filter((technician) => technician.availability === "Available")
    .filter((technician) => coverageMatches(technician, city))
    .filter((technician) => serviceMatches(technician, requestedService))
    .map((technician) => ({
      ...technician,
      matchDistance: estimatedDistance(technician, city),
    }))
    .sort((a, b) => {
      return (
        a.matchDistance - b.matchDistance ||
        Number(b.rating || 0) - Number(a.rating || 0) ||
        Number(b.rating || 0) - Number(a.rating || 0)
      );
    });
}

export async function getRecommendedTechnicians(job) {
  return rankTechnicians(await loadTechnicians(), job);
}

export async function assignTechnicianToJob(job, technician, assignedBy = "Dispatcher") {
  const assignedAt = new Date().toISOString();
  const jobUpdates = {
    technician_id: technician.id,
    assigned_at: assignedAt,
    tech: technician.full_name || "",
  };

  const { error: jobError } = await supabase.from("jobs").update(jobUpdates).eq("id", job.id);
  if (jobError) throw jobError;

  return {
    assignedAt,
    technicianId: technician.id,
  };
}

export async function updateTechnicianJobStatus(technicianId, availability, action, description) {
  const { error } = await supabase
    .from("technicians")
    .update({ availability })
    .eq("id", technicianId);

  if (error) throw error;

  void action;
  void description;
}
