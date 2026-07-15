import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ClipboardList,
  FileText,
  Gauge,
  MapPin,
  PackagePlus,
  RefreshCw,
  Save,
  Search,
  Truck,
  Wind,
  Wrench,
  X,
} from "lucide-react";
import { supabase } from "../../lib/supabase";
import { logActivity } from "../activity";

const conditions = [
  "Good",
  "Needs Inspection",
  "Leaking",
  "Damaged",
  "Blocked",
  "Not Receiving Air",
  "Not Releasing",
  "Replace Recommended",
];

const componentFilters = ["All", "Truck", "Trailer", "ABS", "Air Supply", "Brakes"];

const truckComponents = [
  component("air-compressor", "Air compressor", "Compresor de aire", "Truck", "Air Supply", "Engine accessory drive", "Builds compressed air for the brake system.", "Slow air build, oil in air system, no pressure.", "Worn compressor, intake restriction, governor issue.", "Check build rate, leaks, discharge line, and oil contamination.", "Inspect drive, governor signal, and replace compressor if output is low.", ["Governor", "Air dryer", "Wet tank"], 16, 34),
  component("governor", "Governor", "Gobernador", "Truck", "Air Supply", "Compressor control line", "Controls compressor cut-in and cut-out pressure.", "Pressure too high, pressure too low, constant pumping.", "Bad governor, blocked control line, incorrect adjustment.", "Verify cut-in/cut-out pressure and control line air.", "Replace governor and clean control line if out of range.", ["Air compressor", "Air dryer"], 23, 28),
  component("air-dryer", "Air dryer", "Secador de aire", "Truck", "Air Supply", "Frame rail after compressor", "Removes water and oil vapor before storage tanks.", "Continuous purging, moisture in tanks, frozen valves.", "Bad purge valve, saturated cartridge, heater failure.", "Drain tanks, inspect purge cycle, check heater power.", "Replace cartridge or purge valve; service heater circuit.", ["Wet tank", "Safety valve"], 31, 38),
  component("wet-tank", "Wet tank", "Tanque humedo", "Truck", "Air Supply", "First reservoir after dryer", "Collects moisture and protects downstream tanks.", "Water discharge, low pressure, safety valve opening.", "Moisture buildup, bad drain, dryer problem.", "Drain tank and inspect for contamination.", "Repair drain and service dryer before returning to service.", ["Air dryer", "Primary air tank"], 42, 45),
  component("primary-tank", "Primary air tank", "Tanque primario", "Truck", "Air Supply", "Frame rail primary circuit", "Stores air for rear/primary brake circuit.", "Low primary PSI, warning buzzer, weak brakes.", "Leak, check valve issue, damaged tank.", "Pressure test tank and fittings.", "Repair leaks or replace damaged tank.", ["Relay valves", "Brake chambers"], 52, 40),
  component("secondary-tank", "Secondary air tank", "Tanque secundario", "Truck", "Air Supply", "Frame rail secondary circuit", "Stores air for front/secondary brake circuit.", "Low secondary PSI, front brake issue.", "Leak, valve failure, tank damage.", "Pressure test secondary circuit.", "Repair leaks and verify dual-circuit protection.", ["Foot brake valve", "Quick-release valves"], 61, 40),
  component("safety-valve", "Safety valve", "Valvula de seguridad", "Truck", "Air Supply", "Reservoir or dryer area", "Protects system from overpressure.", "Valve popping, air loss.", "Overpressure, weak valve spring.", "Verify system pressure and valve rating.", "Correct overpressure cause or replace valve.", ["Governor", "Wet tank"], 47, 31),
  component("foot-brake-valve", "Foot brake valve", "Valvula de pedal", "Truck", "Brakes", "Cab floor brake pedal", "Meters service brake air pressure.", "Uneven braking, brakes drag, no service signal.", "Internal leak, contamination, linkage issue.", "Check delivery pressure while applying pedal.", "Replace valve if leaking or delivery is incorrect.", ["Service line", "Relay valves"], 36, 58),
  component("parking-brake-valve", "Parking brake valve", "Valvula de parqueo", "Truck", "Brakes", "Dash yellow control", "Controls spring brake release/application.", "Parking brakes will not release or set.", "Dash valve leak, supply issue, line blockage.", "Check supply and delivery at valve.", "Replace valve or repair supply circuit.", ["Spring brake chambers", "Trailer supply valve"], 46, 58),
  component("trailer-supply-valve", "Trailer supply valve", "Valvula de suministro al trailer", "Truck", "Air Supply", "Dash red control", "Supplies emergency air to trailer.", "Trailer brakes locked, red line no air.", "Valve leak, tractor protection valve fault.", "Check red line pressure with valve pushed in.", "Repair supply valve or tractor protection valve.", ["Tractor protection valve", "Red glad hand"], 58, 58),
  component("tractor-protection-valve", "Tractor protection valve", "Valvula de proteccion del tractor", "Truck", "Air Supply", "Back of cab", "Protects tractor air if trailer line fails.", "Trailer not supplied, air loss when connected.", "Internal leak, stuck valve, bad control signal.", "Check red and blue glad hand delivery.", "Replace valve if it fails pressure isolation.", ["Trailer supply valve", "Glad hands"], 70, 52),
  component("relay-valves", "Relay valves", "Valvulas relay", "Truck", "Brakes", "Near drive axles", "Deliver high-volume air to brake chambers.", "Brake delay, dragging, air leak.", "Leaking exhaust, contamination, bad signal.", "Apply brakes and listen at relay exhaust.", "Replace leaking relay valve and clean lines.", ["Foot brake valve", "Brake chambers"], 68, 70),
  component("quick-release-valves", "Quick-release valves", "Valvulas de escape rapido", "Truck", "Brakes", "Near brake chambers", "Exhaust air quickly to release brakes.", "Slow release, dragging brakes.", "Blocked exhaust, contamination, failed diaphragm.", "Release brakes and verify fast exhaust.", "Replace valve and inspect downstream lines.", ["Brake chambers", "Service line"], 55, 72),
  component("abs-ecu", "ABS ECU", "Modulo ABS", "Truck", "ABS", "Cab/frame electronics", "Monitors wheel speed and controls ABS events.", "ABS warning light, fault codes.", "Sensor fault, power issue, ECU fault.", "Scan ABS codes and verify power/ground.", "Repair circuit or replace failed ECU.", ["ABS modulator", "Wheel-speed sensors"], 44, 78),
  component("abs-modulator", "ABS modulator", "Modulador ABS", "Truck", "ABS", "Near axle brake circuits", "Modulates brake pressure during wheel lock.", "ABS event fault, uneven braking.", "Valve failure, wiring issue, contamination.", "Command modulator with diagnostic tool.", "Repair wiring or replace modulator.", ["ABS ECU", "Brake chambers"], 76, 78),
  component("brake-chambers", "Brake chambers", "Camaras de freno", "Truck", "Brakes", "At wheel ends", "Convert air pressure into pushrod force.", "Air leak, low stroke, weak braking.", "Diaphragm leak, loose clamp, damaged chamber.", "Listen for leaks and measure pushrod stroke.", "Replace leaking chamber and adjust brakes properly.", ["Slack adjusters", "S-cams"], 84, 67),
  component("spring-brake-chambers", "Spring brake chambers", "Camaras spring brake", "Truck", "Brakes", "Drive axle wheel ends", "Apply parking/emergency brakes by spring force.", "Will not release, air leak, sudden application.", "Spring side failure, parking circuit leak.", "Cage only if trained; verify release pressure.", "Replace chamber assembly if leaking or damaged.", ["Parking brake valve", "Relay valves"], 85, 76),
  component("slack-adjusters", "Slack adjusters", "Ajustadores de freno", "Truck", "Brakes", "Brake camshaft", "Maintain correct brake stroke.", "Excessive stroke, uneven braking.", "Failed auto adjuster, worn clevis, poor lubrication.", "Measure chamber stroke and inspect adjuster.", "Replace failed adjuster and verify foundation brakes.", ["S-cams", "Brake chambers"], 88, 84),
  component("s-cams", "S-cams", "Levas S", "Truck", "Brakes", "Drum brake spider", "Spread brake shoes against drum.", "Brake bind, uneven shoe wear.", "Worn bushings, dry cam, seized camshaft.", "Inspect free movement and bushing play.", "Lubricate or replace cam/bushings as needed.", ["Slack adjusters", "Brake shoes"], 91, 88),
  component("brake-drums", "Brake drums", "Tambores de freno", "Truck", "Brakes", "Wheel ends", "Friction surface for brake shoes.", "Cracks, heat checks, vibration.", "Overheating, wear, out-of-round drum.", "Inspect diameter, cracks, and heat damage.", "Replace drum if beyond service limits.", ["Brake shoes", "S-cams"], 94, 83),
  component("brake-shoes", "Brake shoes", "Zapatas de freno", "Truck", "Brakes", "Inside drum assemblies", "Create friction to stop vehicle.", "Thin lining, contamination, pulling.", "Worn lining, oil/grease, hardware failure.", "Inspect lining thickness and hardware.", "Replace shoes/kit in axle sets when needed.", ["Brake drums", "Slack adjusters"], 94, 91),
  component("air-disc-brakes", "Air disc brakes", "Frenos de disco de aire", "Truck", "Brakes", "Disc brake wheel ends", "Use air actuator and caliper to clamp rotor.", "Dragging, pad wear, rotor damage.", "Caliper slide issue, actuator fault.", "Inspect pads, rotor, caliper travel.", "Service caliper or replace pads/rotor by spec.", ["ABS modulator", "Brake chambers"], 80, 88),
  component("red-glad-hand", "Red glad hand", "Mano de aire roja", "Truck", "Air Supply", "Back of cab", "Connects emergency/supply air to trailer.", "Red line leak, trailer brakes locked.", "Bad seal, cracked glad hand, damaged hose.", "Inspect seal and pressure with trailer supplied.", "Replace seal, glad hand, or hose.", ["Trailer supply valve", "Tractor protection valve"], 92, 47),
  component("blue-glad-hand", "Blue glad hand", "Mano de aire azul", "Truck", "Brakes", "Back of cab", "Connects service brake signal to trailer.", "Trailer brakes not applying or leak on brake apply.", "Bad seal, blocked hose, protection valve issue.", "Apply service brakes and inspect blue line.", "Replace seal/hose or repair signal circuit.", ["Foot brake valve", "Trailer service line"], 92, 54),
];

const trailerComponents = [
  component("trailer-red-line", "Red emergency/supply line", "Linea roja emergencia/suministro", "Trailer", "Air Supply", "Front trailer to reservoir", "Supplies air to charge trailer reservoir and release spring brakes.", "Trailer brakes locked, red line leaking.", "Disconnected red line, bad glad hand, leak.", "Verify red line pressure at trailer connection.", "Repair hose/glad hand and check emergency valve.", ["Red glad hand", "Relay emergency valve"], 10, 38),
  component("trailer-blue-line", "Blue service line", "Linea azul de servicio", "Trailer", "Brakes", "Front trailer to relay valve", "Carries brake application signal from tractor.", "Trailer brakes not applying.", "Disconnected blue line, blockage, relay fault.", "Apply brake and verify signal at relay valve.", "Repair line or relay signal circuit.", ["Blue glad hand", "Relay emergency valve"], 10, 51),
  component("trailer-red-glad-hand", "Red glad hand", "Mano roja del trailer", "Trailer", "Air Supply", "Front trailer", "Connects trailer emergency/supply line.", "Air leak at front trailer, locked brakes.", "Bad seal, cracked coupling, damaged hose.", "Inspect seal and coupling face.", "Replace glad hand seal or assembly.", ["Red emergency/supply line"], 5, 38),
  component("trailer-blue-glad-hand", "Blue glad hand", "Mano azul del trailer", "Trailer", "Brakes", "Front trailer", "Connects trailer service line.", "No trailer brake response, service leak.", "Bad seal, cracked coupling, damaged hose.", "Inspect during service brake apply.", "Replace seal or glad hand.", ["Blue service line"], 5, 51),
  component("trailer-reservoir", "Trailer air reservoir", "Tanque de aire del trailer", "Trailer", "Air Supply", "Under trailer frame", "Stores air for trailer brakes and suspension controls.", "Low trailer PSI, spring brakes apply.", "Tank leak, drain leak, supply restriction.", "Drain and pressure test reservoir.", "Repair fittings or replace damaged tank.", ["Relay emergency valve", "Spring brake control valve"], 38, 45),
  component("relay-emergency-valve", "Relay emergency valve", "Valvula relay de emergencia", "Trailer", "Brakes", "Near trailer reservoir", "Controls service and emergency brake application.", "Brakes locked, not applying, leaking exhaust.", "Internal leak, contamination, control failure.", "Check supply, service signal, and exhaust leaks.", "Replace valve if leakage or delivery is incorrect.", ["Trailer reservoir", "Brake chambers"], 48, 55),
  component("spring-brake-control-valve", "Spring brake control valve", "Valvula control spring brake", "Trailer", "Brakes", "Near spring brake circuit", "Controls trailer parking brake release/application.", "Spring brakes not releasing or applying unexpectedly.", "Valve leak, low supply, blocked line.", "Verify supply and delivery to spring chambers.", "Replace valve or repair air supply.", ["Spring brake chambers", "Red emergency/supply line"], 59, 55),
  component("trailer-abs-ecu", "ABS ECU", "Modulo ABS del trailer", "Trailer", "ABS", "Trailer frame electrical box", "Monitors trailer ABS and fault codes.", "ABS warning lamp, stored fault.", "Sensor, power, ground, ECU issue.", "Scan ABS and verify power/ground.", "Repair circuit or replace ECU.", ["ABS modulator valves", "Wheel-speed sensors"], 42, 72),
  component("trailer-abs-modulators", "ABS modulator valves", "Valvulas moduladoras ABS", "Trailer", "ABS", "Near axle brake circuits", "Modulate trailer brake pressure during ABS event.", "ABS code, uneven braking.", "Valve failure, wiring, contamination.", "Command ABS valve and inspect wiring.", "Replace modulator or repair wiring.", ["ABS ECU", "Brake chambers"], 70, 72),
  component("wheel-speed-sensors", "Wheel-speed sensors", "Sensores de velocidad", "Trailer", "ABS", "At wheel hubs", "Report wheel speed to ABS ECU.", "ABS light, intermittent faults.", "Sensor gap, damaged cable, bad sensor.", "Inspect sensor gap and harness.", "Adjust/replace sensor and secure harness.", ["ABS ECU", "Tandem axles"], 80, 83),
  component("trailer-brake-chambers", "Brake chambers", "Camaras de freno", "Trailer", "Brakes", "At trailer axles", "Convert service air into brake force.", "Leak on apply, weak braking.", "Diaphragm leak, damaged chamber.", "Listen for leaks and measure stroke.", "Replace leaking chambers.", ["Slack adjusters", "Relay emergency valve"], 76, 58),
  component("trailer-spring-brake-chambers", "Spring brake chambers", "Camaras spring brake", "Trailer", "Brakes", "Trailer axle wheel ends", "Apply emergency/parking brakes by spring force.", "Trailer locked, leak, will not release.", "Low supply, chamber leak, control valve fault.", "Verify release pressure and leaks.", "Replace chamber or repair supply/control valve.", ["Spring brake control valve"], 78, 65),
  component("trailer-slack-adjusters", "Slack adjusters", "Ajustadores de freno", "Trailer", "Brakes", "Brake camshafts", "Maintain correct trailer brake stroke.", "Out of adjustment, weak braking.", "Failed adjuster, worn clevis, poor lube.", "Measure pushrod stroke.", "Replace adjuster and inspect foundation brakes.", ["S-cams", "Brake chambers"], 82, 72),
  component("trailer-s-cams", "S-cams", "Levas S", "Trailer", "Brakes", "Drum brake spider", "Spread shoes against drum.", "Dragging, uneven braking.", "Worn bushings, seized cam.", "Check cam movement and bushing play.", "Lubricate or replace cam/bushings.", ["Slack adjusters", "Brake shoes"], 86, 76),
  component("trailer-brake-drums", "Brake drums", "Tambores de freno", "Trailer", "Brakes", "Trailer wheel ends", "Friction surface for brake shoes.", "Heat damage, cracks, vibration.", "Overheat, worn drum.", "Inspect drum condition and diameter.", "Replace drums beyond limits.", ["Brake shoes"], 90, 72),
  component("trailer-brake-shoes", "Brake shoes", "Zapatas de freno", "Trailer", "Brakes", "Inside trailer drums", "Create braking friction.", "Thin lining, contamination.", "Worn or oil-soaked lining.", "Inspect lining and hardware.", "Replace shoes and hardware as needed.", ["Brake drums", "S-cams"], 90, 80),
  component("trailer-air-disc-brakes", "Air disc brakes", "Frenos de disco de aire", "Trailer", "Brakes", "Disc brake wheel ends", "Clamp rotor with air-actuated caliper.", "Dragging, pad wear, rotor damage.", "Caliper issue, actuator fault.", "Inspect pad/rotor/caliper travel.", "Service caliper or replace pads/rotor.", ["ABS modulator valves"], 72, 83),
  component("tandem-axles", "Tandem axles", "Ejes tandem", "Trailer", "Brakes", "Rear trailer axle group", "Support wheel ends, brakes, and suspension.", "Uneven braking, tire wear.", "Alignment, bearing, brake imbalance.", "Inspect axle group and wheel ends.", "Repair axle/brake issue as required.", ["Tandem slider", "Brake chambers"], 78, 90),
  component("tandem-slider", "Tandem slider", "Corredera tandem", "Trailer", "Air Supply", "Sliding axle rail", "Positions tandem axle group.", "Will not slide, air pin issue.", "Pin valve leak, stuck pins, air supply issue.", "Check slider pin air operation.", "Repair slider valve or pins.", ["Air suspension bags"], 66, 91),
  component("air-suspension-bags", "Air suspension bags", "Bolsas de suspension de aire", "Trailer", "Air Supply", "Suspension at axles", "Support trailer ride height with air pressure.", "Sagging, leak, uneven height.", "Bag leak, line leak, height valve issue.", "Inspect bags and spray for leaks.", "Replace leaking bags or repair lines.", ["Height control valve"], 70, 36),
  component("height-control-valve", "Height control valve", "Valvula niveladora", "Trailer", "Air Supply", "Suspension linkage", "Maintains trailer ride height.", "Overinflated bags, low ride height.", "Bad linkage, valve leak, blockage.", "Move linkage and verify fill/exhaust.", "Repair linkage or replace height valve.", ["Air suspension bags", "Trailer reservoir"], 61, 35),
];

const faultSimulations = [
  "No air pressure",
  "Slow pressure build-up",
  "System air leak",
  "Trailer brakes locked",
  "Trailer brakes not applying",
  "Trailer brakes not releasing",
  "Red glad hand leaking",
  "Blue glad hand leaking",
  "Brake chamber leaking",
  "Relay valve leaking",
  "Air dryer continuously purging",
  "Tractor protection valve failure",
  "ABS warning",
  "Uneven braking",
  "Low-pressure warning",
  "Spring brakes applying unexpectedly",
];

const allComponents = [...truckComponents, ...trailerComponents];

export default function AirSystemModule({ currentUser }) {
  const [activeTab, setActiveTab] = useState("Truck");
  const [selectedKey, setSelectedKey] = useState(truckComponents[0].key);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");
  const [condition, setCondition] = useState("Needs Inspection");
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [inspections, setInspections] = useState([]);
  const [jobModalOpen, setJobModalOpen] = useState(false);
  const [nearbyModalOpen, setNearbyModalOpen] = useState(false);
  const [jobSearch, setJobSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [simulation, setSimulation] = useState({
    primary: 0,
    secondary: 0,
    trailer: 0,
    state: "System inactive",
    fault: "",
    serviceApplied: false,
    parkingSet: true,
    trailerSupplied: false,
  });
  const fileInputRef = useRef(null);

  const selectedComponent = allComponents.find((item) => item.key === selectedKey) || truckComponents[0];
  const visibleComponents = useMemo(() => {
    const base = activeTab === "Trailer" ? trailerComponents : activeTab === "Truck" ? truckComponents : allComponents;
    return base.filter((item) => {
      const text = `${item.name} ${item.nameEs} ${item.category} ${item.section}`.toLowerCase();
      const matchesSearch = !search || text.includes(search.toLowerCase());
      const matchesFilter = filter === "All" || item.section === filter || item.category === filter;
      return matchesSearch && matchesFilter;
    });
  }, [activeTab, filter, search]);

  const filteredJobs = useMemo(() => {
    const term = jobSearch.trim().toLowerCase();
    return jobs
      .filter((job) => ["new", "pending", "assigned", "en route", "on site", "in progress", "waiting parts", "working"].includes(String(job.status || "").toLowerCase()))
      .filter((job) => {
        if (!term) return true;
        return [job.invoice_number, job.reference, job.company, job.location, job.tech, job.dispatch]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(term);
      });
  }, [jobSearch, jobs]);

  useEffect(() => {
    loadJobs();
    loadInspections();
  }, []);

  useEffect(() => {
    setCondition("Needs Inspection");
    setNotes("");
    setPhotos([]);
  }, [selectedKey]);

  async function loadJobs() {
    const { data } = await supabase
      .from("jobs")
      .select("id,invoice_number,company,location,tech,status,updates,technician_id,job_date")
      .order("job_date", { ascending: false })
      .limit(250);
    setJobs(data || []);
  }

  async function loadInspections() {
    const { data } = await supabase
      .from("air_system_inspections")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    setInspections(data || []);
  }

  function runSimulation(action) {
    setSimulation((current) => applySimulation(current, action));
  }

  function selectFault(fault) {
    setSimulation((current) => ({
      ...current,
      fault,
      state: fault,
      primary: fault === "No air pressure" ? 0 : fault.includes("Low") ? 65 : current.primary || 95,
      secondary: fault === "No air pressure" ? 0 : fault.includes("Low") ? 62 : current.secondary || 95,
      trailer: fault.includes("Trailer") || fault.includes("glad hand") ? 45 : current.trailer || 90,
    }));
  }

  async function saveInspection(job = null) {
    setSaving(true);
    setMessage("");
    const payload = buildInspectionPayload({
      component: selectedComponent,
      condition,
      notes,
      simulation,
      job,
      currentUser,
    });

    const { data, error } = await supabase.from("air_system_inspections").insert(payload).select().single();
    if (error) {
      setSaving(false);
      setMessage(`Unable to save inspection: ${error.message}`);
      return null;
    }

    await uploadInspectionPhotos(data.id);

    if (job?.id) {
      await appendInspectionToJob(job, data);
    }

    await logActivity({
      entityType: "air_system_inspection",
      entityId: data.id,
      action: "Air System Inspection Created",
      description: `${currentUser?.name || currentUser?.username || "Dispatcher"} inspected ${selectedComponent.name} (${condition})${job?.invoice_number ? ` for job ${job.invoice_number}` : ""}.`,
      createdBy: currentUser?.name || currentUser?.username || "Dispatcher",
      metadata: {
        job_id: job?.id || null,
        component: selectedComponent.name,
        condition,
        vehicle_section: selectedComponent.section,
      },
    });

    setSaving(false);
    setJobModalOpen(false);
    setPhotos([]);
    setMessage(job ? "Inspection saved and added to job." : "Inspection saved.");
    await loadInspections();
    return data;
  }

  async function uploadInspectionPhotos(inspectionId) {
    if (!photos.length) return;
    const records = [];
    for (const file of photos) {
      const safeName = file.name.replace(/[^\w.\-]+/g, "-");
      const path = `${inspectionId}/${Date.now()}-${safeName}`;
      const { error } = await supabase.storage.from("air-system-photos").upload(path, file);
      if (!error) {
        records.push({
          inspection_id: inspectionId,
          storage_path: path,
          uploaded_by: currentUser?.id || currentUser?.authUserId || null,
        });
      }
    }
    if (records.length) await supabase.from("air_system_inspection_photos").insert(records);
  }

  async function appendInspectionToJob(job, inspection) {
    const block = [
      "",
      "Air System Inspection",
      `Component: ${selectedComponent.name} / ${selectedComponent.nameEs}`,
      `Condition: ${condition}`,
      `Symptoms: ${selectedComponent.symptoms}`,
      `Possible causes: ${selectedComponent.causes}`,
      `Recommendation: ${selectedComponent.repair}`,
      `Notes: ${notes || "None"}`,
      `PSI: Primary ${simulation.primary} / Secondary ${simulation.secondary} / Trailer ${simulation.trailer}`,
      `Inspection ID: ${inspection.id}`,
      `Dispatcher: ${currentUser?.name || currentUser?.username || "Dispatcher"}`,
      `Date: ${new Date().toLocaleString()}`,
    ].join("\n");
    const nextUpdates = `${job.updates || ""}${block}`;
    await supabase.from("jobs").update({ updates: nextUpdates }).eq("id", job.id);
  }

  function generateReport() {
    const html = [
      "<html><head><title>Air System Diagnostic Report</title>",
      "<style>body{font-family:Arial;padding:24px;color:#0f172a}h1{margin:0 0 8px}.box{border:1px solid #cbd5e1;border-radius:12px;padding:14px;margin:12px 0}.label{font-size:12px;text-transform:uppercase;color:#64748b;font-weight:700}</style>",
      "</head><body>",
      "<h1>Truck & Trailer Air System Diagnostic Report</h1>",
      `<p>${new Date().toLocaleString()}</p>`,
      `<div class='box'><div class='label'>Component</div><h2>${selectedComponent.name}</h2><p>${selectedComponent.nameEs}</p></div>`,
      `<div class='box'><div class='label'>Condition</div><p>${condition}</p></div>`,
      `<div class='box'><div class='label'>Symptoms</div><p>${selectedComponent.symptoms}</p></div>`,
      `<div class='box'><div class='label'>Possible causes</div><p>${selectedComponent.causes}</p></div>`,
      `<div class='box'><div class='label'>Recommendation</div><p>${selectedComponent.repair}</p></div>`,
      `<div class='box'><div class='label'>Notes</div><p>${notes || "None"}</p></div>`,
      `<div class='box'><div class='label'>Simulation</div><p>${simulation.state}. Primary ${simulation.primary} PSI, Secondary ${simulation.secondary} PSI, Trailer ${simulation.trailer} PSI.</p></div>`,
      "<p><strong>Training and diagnostic reference only. Air-brake inspections and repairs must be performed by qualified personnel.</strong></p>",
      "<script>window.print()</script></body></html>",
    ].join("");
    const report = window.open("", "_blank", "noopener,noreferrer");
    if (report) {
      report.document.write(html);
      report.document.close();
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 p-4 text-slate-950 md:p-6 xl:p-8">
      <div className="mx-auto max-w-[1800px] space-y-5">
        <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-600">Diagnostics</p>
              <h1 className="mt-1 text-3xl font-black">Truck & Trailer Air System</h1>
              <p className="mt-2 max-w-3xl text-sm font-semibold text-slate-500">
                Inspect air-brake components, simulate common faults, and attach diagnostic notes to active jobs.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 rounded-2xl bg-slate-50 p-2 text-center text-xs font-black text-slate-600">
              <PsiBadge label="Primary" value={simulation.primary} />
              <PsiBadge label="Secondary" value={simulation.secondary} />
              <PsiBadge label="Trailer" value={simulation.trailer} />
            </div>
          </div>
        </header>

        {message && (
          <div className={`rounded-xl px-4 py-3 text-sm font-bold ${message.startsWith("Unable") ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>
            {message}
          </div>
        )}

        <nav className="flex flex-wrap gap-2">
          {["Truck", "Trailer", "Diagnostics", "Saved Inspections"].map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`rounded-xl px-4 py-2 text-sm font-black transition ${activeTab === tab ? "bg-blue-600 text-white" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
            >
              {tab}
            </button>
          ))}
        </nav>

        {activeTab === "Saved Inspections" ? (
          <SavedInspections inspections={inspections} jobs={jobs} onRefresh={loadInspections} />
        ) : (
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
            <main className="space-y-5">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
                  <div className="relative">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                    <input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Search components..."
                      className="h-10 w-full rounded-xl border border-slate-200 pl-9 pr-3 text-sm font-semibold outline-none focus:border-blue-500"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {componentFilters.map((item) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => setFilter(item)}
                        className={`h-10 rounded-xl px-3 text-xs font-black ${filter === item ? "bg-slate-950 text-white" : "border border-slate-200 bg-white text-slate-600"}`}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <AirDiagram
                section={activeTab === "Trailer" ? "Trailer" : "Truck"}
                components={visibleComponents}
                selectedKey={selectedKey}
                simulation={simulation}
                onSelect={setSelectedKey}
              />

              <ComponentGrid components={visibleComponents} selectedKey={selectedKey} onSelect={setSelectedKey} />

              {activeTab === "Diagnostics" && (
                <DiagnosticsPanel simulation={simulation} onAction={runSimulation} onFault={selectFault} />
              )}
            </main>

            <ComponentPanel
              component={selectedComponent}
              condition={condition}
              notes={notes}
              photos={photos}
              saving={saving}
              fileInputRef={fileInputRef}
              onCondition={setCondition}
              onNotes={setNotes}
              onPhotos={setPhotos}
              onSave={() => saveInspection()}
              onAddJob={() => setJobModalOpen(true)}
              onNearby={() => setNearbyModalOpen(true)}
              onReport={generateReport}
            />
          </div>
        )}

        <footer className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-900">
          Training and diagnostic reference only. Air-brake inspections and repairs must be performed by qualified personnel.
        </footer>
      </div>

      {jobModalOpen && (
        <JobSelectorModal
          jobs={filteredJobs}
          search={jobSearch}
          saving={saving}
          onSearch={setJobSearch}
          onClose={() => setJobModalOpen(false)}
          onSelect={saveInspection}
        />
      )}

      {nearbyModalOpen && (
        <NearbyComponentModal
          component={selectedComponent}
          jobs={filteredJobs}
          search={jobSearch}
          onSearch={setJobSearch}
          onClose={() => setNearbyModalOpen(false)}
          onAttach={async (job) => {
            const query = `${selectedComponent.name} near ${job.location || job.company || ""}`;
            const line = `\nAir System Nearby Parts Search\nComponent: ${selectedComponent.name}\nSearch: ${query}\nDate: ${new Date().toLocaleString()}\n`;
            await supabase.from("jobs").update({ updates: `${job.updates || ""}${line}` }).eq("id", job.id);
            window.open(googleMapsNearbyLink(selectedComponent.name, job.location || job.company || ""), "_blank", "noopener,noreferrer");
            setNearbyModalOpen(false);
          }}
        />
      )}
    </div>
  );
}

function component(key, name, nameEs, section, category, location, fn, symptoms, causes, inspect, repair, related, x, y) {
  return { key, name, nameEs, section, category, location, function: fn, symptoms, causes, inspect, repair, related, x, y };
}

function applySimulation(current, action) {
  if (action === "Reset Simulation") return { primary: 0, secondary: 0, trailer: 0, state: "System inactive", fault: "", serviceApplied: false, parkingSet: true, trailerSupplied: false };
  if (action === "Build Air Pressure") return { ...current, primary: 120, secondary: 120, trailer: current.trailerSupplied ? 110 : current.trailer, state: "Normal air pressure", fault: "" };
  if (action === "Apply Service Brakes") return { ...current, primary: Math.max(0, current.primary - 8), secondary: Math.max(0, current.secondary - 8), trailer: current.trailerSupplied ? Math.max(0, current.trailer - 6) : current.trailer, serviceApplied: true, state: "Service brakes applied" };
  if (action === "Release Service Brakes") return { ...current, serviceApplied: false, state: "Service brakes released" };
  if (action === "Set Parking Brakes") return { ...current, parkingSet: true, state: "Parking brakes set" };
  if (action === "Release Parking Brakes") return { ...current, parkingSet: false, state: "Parking brakes released" };
  if (action === "Supply Air to Trailer") return { ...current, trailerSupplied: true, trailer: current.primary > 80 ? 105 : 55, state: "Trailer supplied" };
  if (action === "Disconnect Red Line") return { ...current, trailerSupplied: false, trailer: 0, parkingSet: true, fault: "Red glad hand disconnected", state: "Trailer emergency brakes applied" };
  if (action === "Disconnect Blue Line") return { ...current, serviceApplied: false, fault: "Blue service line disconnected", state: "Trailer service signal lost" };
  if (action === "Simulate Air Leak") return { ...current, primary: Math.max(0, current.primary - 35), secondary: Math.max(0, current.secondary - 30), trailer: Math.max(0, current.trailer - 40), fault: "System air leak", state: "Air pressure dropping" };
  return current;
}

function buildInspectionPayload({ component, condition, notes, simulation, job, currentUser }) {
  return {
    job_id: job?.id || null,
    created_by: currentUser?.id || currentUser?.authUserId || null,
    assigned_technician_id: job?.technician_id || null,
    vehicle_section: component.section,
    component_key: component.key,
    component_name: component.name,
    component_name_es: component.nameEs,
    condition,
    symptoms: component.symptoms,
    possible_causes: component.causes,
    recommendation: component.repair,
    dispatcher_notes: notes,
    primary_psi: simulation.primary,
    secondary_psi: simulation.secondary,
    trailer_psi: simulation.trailer,
    simulation_type: simulation.fault || simulation.state,
  };
}

function PsiBadge({ label, value }) {
  const tone = value >= 90 ? "text-emerald-700" : value >= 60 ? "text-amber-700" : "text-red-700";
  return (
    <div className="rounded-xl bg-white px-3 py-2 shadow-sm">
      <p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`text-xl font-black ${tone}`}>{value}</p>
    </div>
  );
}

function AirDiagram({ section, components, selectedKey, simulation, onSelect }) {
  const lineTone = simulation.fault ? "bg-red-500 animate-pulse" : simulation.primary > 90 ? "bg-emerald-500" : simulation.primary > 0 ? "bg-amber-400" : "bg-slate-300";
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-black">{section === "Truck" ? "Class 8 Tractor Air System" : "53 ft Dry Van Trailer Air System"}</h2>
          <p className="text-xs font-semibold text-slate-500">Red: emergency/supply. Blue: service. Green: normal flow.</p>
        </div>
        <Truck className="h-6 w-6 text-blue-600" />
      </div>
      <div className="relative h-[420px] overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
        <div className="absolute left-[7%] top-[24%] h-[46%] w-[86%] rounded-[42px] border-4 border-slate-300 bg-white" />
        {section === "Truck" ? (
          <div className="absolute left-[8%] top-[18%] h-[38%] w-[28%] rounded-t-[40px] border-4 border-slate-300 bg-slate-100" />
        ) : (
          <div className="absolute left-[10%] top-[20%] h-[36%] w-[80%] rounded-lg border-4 border-slate-300 bg-white" />
        )}
        <div className="absolute left-[14%] right-[10%] top-[44%] h-1 rounded-full bg-red-500" />
        <div className="absolute left-[14%] right-[10%] top-[54%] h-1 rounded-full bg-blue-500" />
        <div className={`absolute left-[18%] right-[18%] top-[64%] h-1 rounded-full ${lineTone}`} />
        <div className="absolute bottom-[13%] left-[18%] h-16 w-16 rounded-full border-8 border-slate-700 bg-slate-200" />
        <div className="absolute bottom-[13%] right-[18%] h-16 w-16 rounded-full border-8 border-slate-700 bg-slate-200" />
        {section === "Trailer" && <div className="absolute bottom-[13%] right-[34%] h-16 w-16 rounded-full border-8 border-slate-700 bg-slate-200" />}
        {components.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => onSelect(item.key)}
            style={{ left: `${item.x}%`, top: `${item.y}%` }}
            className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full border px-2 py-1 text-[10px] font-black shadow-sm transition ${
              selectedKey === item.key ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 bg-white text-slate-700 hover:border-blue-300"
            }`}
          >
            {item.name}
          </button>
        ))}
      </div>
    </section>
  );
}

function ComponentGrid({ components, selectedKey, onSelect }) {
  return (
    <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {components.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={() => onSelect(item.key)}
          className={`rounded-2xl border p-4 text-left transition ${selectedKey === item.key ? "border-blue-400 bg-blue-50" : "border-slate-200 bg-white hover:border-blue-200"}`}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-black text-slate-950">{item.name}</p>
              <p className="mt-1 text-xs font-semibold text-slate-500">{item.nameEs}</p>
            </div>
            <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black text-slate-600">{item.category}</span>
          </div>
        </button>
      ))}
    </section>
  );
}

function ComponentPanel({ component, condition, notes, photos, saving, fileInputRef, onCondition, onNotes, onPhotos, onSave, onAddJob, onNearby, onReport }) {
  return (
    <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:sticky xl:top-4 xl:self-start">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-blue-600">{component.section} / {component.category}</p>
          <h2 className="mt-1 text-2xl font-black">{component.name}</h2>
          <p className="text-sm font-bold text-slate-500">{component.nameEs}</p>
        </div>
        <Wind className="h-6 w-6 text-blue-600" />
      </div>
      <InfoBlock label="Location" value={component.location} />
      <InfoBlock label="Function" value={component.function} />
      <InfoBlock label="Common symptoms" value={component.symptoms} />
      <InfoBlock label="Possible causes" value={component.causes} />
      <InfoBlock label="Basic inspection" value={component.inspect} />
      <InfoBlock label="Recommended repair" value={component.repair} />
      <InfoBlock label="Related components" value={component.related.join(", ")} />

      <label className="mt-4 block text-xs font-black uppercase tracking-wide text-slate-500">
        Component condition
        <select value={condition} onChange={(event) => onCondition(event.target.value)} className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold outline-none focus:border-blue-500">
          {conditions.map((item) => <option key={item}>{item}</option>)}
        </select>
      </label>

      <label className="mt-4 block text-xs font-black uppercase tracking-wide text-slate-500">
        Dispatcher notes
        <textarea value={notes} onChange={(event) => onNotes(event.target.value)} className="mt-1 min-h-24 w-full rounded-xl border border-slate-200 p-3 text-sm font-semibold outline-none focus:border-blue-500" placeholder="Add inspection notes..." />
      </label>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*"
        className="hidden"
        onChange={(event) => onPhotos(Array.from(event.target.files || []))}
      />
      <button type="button" onClick={() => fileInputRef.current?.click()} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-black text-slate-700 hover:bg-slate-50">
        <Camera className="h-4 w-4" />
        Upload Photo {photos.length ? `(${photos.length})` : ""}
      </button>

      <div className="mt-4 grid gap-2">
        <button type="button" onClick={onAddJob} className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-black text-white hover:bg-blue-700">
          <ClipboardList className="h-4 w-4" />
          Add Diagnosis to Job
        </button>
        <button type="button" onClick={onAddJob} className="flex items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-black text-blue-700 hover:bg-blue-100">
          <PackagePlus className="h-4 w-4" />
          Add Component to Job
        </button>
        <button type="button" onClick={onNearby} className="flex items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-black text-amber-700 hover:bg-amber-100">
          <MapPin className="h-4 w-4" />
          Add to Nearby Parts
        </button>
        <button type="button" onClick={onSave} disabled={saving} className="flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-black text-emerald-700 hover:bg-emerald-100 disabled:opacity-60">
          <Save className="h-4 w-4" />
          Save Inspection
        </button>
        <button type="button" onClick={onReport} className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-black text-slate-700 hover:bg-slate-50">
          <FileText className="h-4 w-4" />
          Generate Diagnostic Report
        </button>
      </div>
    </aside>
  );
}

function InfoBlock({ label, value }) {
  return (
    <div className="mt-4">
      <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-semibold leading-6 text-slate-700">{value}</p>
    </div>
  );
}

function DiagnosticsPanel({ simulation, onAction, onFault }) {
  const actions = [
    "Build Air Pressure",
    "Apply Service Brakes",
    "Release Service Brakes",
    "Set Parking Brakes",
    "Release Parking Brakes",
    "Supply Air to Trailer",
    "Disconnect Red Line",
    "Disconnect Blue Line",
    "Simulate Air Leak",
    "Reset Simulation",
  ];
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <Gauge className="h-5 w-5 text-blue-600" />
        <div>
          <h2 className="text-lg font-black">Simulation Controls</h2>
          <p className="text-sm font-semibold text-slate-500">{simulation.state}</p>
        </div>
      </div>
      <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-5">
        {actions.map((action) => (
          <button key={action} type="button" onClick={() => onAction(action)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-700 hover:border-blue-300 hover:bg-blue-50">
            {action}
          </button>
        ))}
      </div>
      <h3 className="mt-5 text-sm font-black uppercase tracking-wide text-slate-500">Fault simulations</h3>
      <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        {faultSimulations.map((fault) => (
          <button key={fault} type="button" onClick={() => onFault(fault)} className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs font-black text-red-700 hover:bg-red-100">
            {fault}
          </button>
        ))}
      </div>
    </section>
  );
}

function JobSelectorModal({ jobs, search, saving, onSearch, onSelect, onClose }) {
  return (
    <Modal title="Add Diagnosis to Job" onClose={onClose}>
      <div className="relative">
        <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
        <input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Invoice, customer, location, technician..." className="h-10 w-full rounded-xl border border-slate-200 pl-9 pr-3 text-sm font-semibold outline-none focus:border-blue-500" />
      </div>
      <div className="mt-4 max-h-[55vh] space-y-2 overflow-auto">
        {jobs.map((job) => (
          <button key={job.id} type="button" onClick={() => onSelect(job)} disabled={saving} className="w-full rounded-xl border border-slate-200 p-3 text-left hover:bg-blue-50 disabled:opacity-60">
            <p className="font-black">{job.invoice_number || job.id} · {job.company || "No company"}</p>
            <p className="mt-1 text-sm font-semibold text-slate-500">{job.location || "No location"} · {job.tech || "No tech"} · {job.status || "No status"}</p>
          </button>
        ))}
        {!jobs.length && <p className="rounded-xl bg-slate-50 p-4 text-sm font-bold text-slate-500">No active or pending jobs found.</p>}
      </div>
    </Modal>
  );
}

function NearbyComponentModal({ component, jobs, search, onSearch, onAttach, onClose }) {
  const [location, setLocation] = useState("");
  const queryLocation = location.trim();
  return (
    <Modal title="Add to Nearby Parts" onClose={onClose}>
      <p className="text-sm font-semibold text-slate-600">Search nearby suppliers for: <strong>{component.name}</strong></p>
      <label className="mt-4 block text-xs font-black uppercase tracking-wide text-slate-500">
        City or location
        <input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Indianapolis, Indiana" className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-blue-500" />
      </label>
      <a href={googleMapsNearbyLink(component.name, queryLocation)} target="_blank" rel="noreferrer" className="mt-3 flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-sm font-black text-white hover:bg-amber-600">
        <MapPin className="h-4 w-4" />
        Open Nearby Parts Search
      </a>
      <div className="mt-5">
        <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">Save search inside a job</p>
        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
          <input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Find active job..." className="h-10 w-full rounded-xl border border-slate-200 pl-9 pr-3 text-sm font-semibold outline-none focus:border-blue-500" />
        </div>
        <div className="mt-3 max-h-64 space-y-2 overflow-auto">
          {jobs.map((job) => (
            <button key={job.id} type="button" onClick={() => onAttach({ ...job, location: queryLocation || job.location })} className="w-full rounded-xl border border-slate-200 p-3 text-left hover:bg-amber-50">
              <p className="font-black">{job.invoice_number || job.id} · {job.company || "No company"}</p>
              <p className="text-sm font-semibold text-slate-500">{job.location || "No location"}</p>
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}

function SavedInspections({ inspections, jobs, onRefresh }) {
  const jobById = new Map(jobs.map((job) => [job.id, job]));
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-black">Saved Inspections</h2>
          <p className="text-sm font-semibold text-slate-500">Recent air system diagnostics saved in Supabase.</p>
        </div>
        <button type="button" onClick={onRefresh} className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-50" title="Refresh">
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {inspections.map((item) => {
          const job = jobById.get(item.job_id);
          return (
            <article key={item.id} className="rounded-2xl border border-slate-200 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-black">{item.component_name}</p>
                  <p className="text-sm font-semibold text-slate-500">{item.component_name_es || item.vehicle_section}</p>
                </div>
                <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black text-slate-600">{item.condition}</span>
              </div>
              <p className="mt-3 text-sm font-semibold text-slate-600">{item.recommendation}</p>
              <p className="mt-3 text-xs font-bold text-slate-400">
                {job ? `${job.invoice_number || job.id} · ${job.company || ""}` : "No job attached"} · {formatDate(item.created_at)}
              </p>
            </article>
          );
        })}
        {!inspections.length && <p className="rounded-xl bg-slate-50 p-4 text-sm font-bold text-slate-500">No saved inspections yet.</p>}
      </div>
    </section>
  );
}

function Modal({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/50 p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-xl font-black">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-xl bg-slate-100 p-2 text-slate-600 hover:bg-slate-200">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function googleMapsNearbyLink(term, location) {
  return `https://www.google.com/maps/search/${encodeURIComponent(`${term} near ${location || ""}`).replace(/%20/g, "+")}`;
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}
