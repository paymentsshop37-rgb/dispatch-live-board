import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ClipboardList,
  Download,
  FileText,
  Gauge,
  Languages,
  MapPin,
  Maximize2,
  Move,
  RefreshCw,
  Save,
  Search,
  Wind,
  Wrench,
  X,
  ZoomIn,
  ZoomOut,
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

const statusOptions = ["Passed", "Failed", "Not Tested", "Needs Technician Inspection"];
const componentFilters = ["All", "Controls", "Valves", "Reservoirs", "Lines", "Brakes", "Charging"];

const circuitStyles = {
  charging: { name: "Charging", label: "Black: Charging", color: "#111827" },
  primary: { name: "Primary", label: "Green: Primary", color: "#16a34a" },
  secondary: { name: "Secondary", label: "Orange: Secondary", color: "#f97316" },
  parkSupply: { name: "Park / Supply", label: "Dark red: Park / Supply", color: "#991b1b" },
  parkingControl: { name: "Parking / Control", label: "Yellow: Parking / Control", color: "#eab308" },
  trailerSupply: { name: "Trailer Supply", label: "Red: Trailer Supply", color: "#dc2626" },
  trailerControl: { name: "Trailer Control", label: "Blue: Trailer Control", color: "#2563eb" },
  trailerParking: { name: "Trailer Parking", label: "Yellow: Trailer Parking", color: "#eab308" },
  antiCompound: { name: "Anti-compounding", label: "Anti-compounding circuit", color: "#7c3aed" },
};

const components = [
  c("mv3-control-module", "MV-3 Control Module", "Modulo de control MV-3", "Controls", "Truck cab dash", "parkSupply", "Coordinates tractor parking brake, trailer supply, and system parking controls.", "Control knobs respond smoothly, no air leakage at dash, correct supply and exhaust.", "Air leak at dash, trailer supply will not stay in, parking controls stuck.", "Verify supply air to module, listen for dash leaks, test push-pull controls.", "Internal seal leak, contaminated valve, cracked fitting, low supply pressure.", "Replace MV-3 module or repair supply/control lines.", ["system-parking-brake", "tractor-parking-brake", "trailer-air-supply-control"], 275, 112, "wide"),
  c("system-parking-brake", "System Parking Brake", "Freno de parqueo del sistema", "Controls", "MV-3 control cluster", "parkSupply", "Applies system parking brakes by exhausting spring brake air.", "Applies and releases with correct push-pull action.", "Parking brake will not set, will not release, or leaks.", "Set and release control while checking spring brake delivery.", "MV-3 fault, spring brake valve leak, low air pressure.", "Repair control module or parking control circuit.", ["mv3-control-module", "spring-brake-valve"], 198, 68),
  c("tractor-parking-brake", "Tractor Parking Brake", "Freno de parqueo del tractor", "Controls", "Dash parking control", "parkingControl", "Controls tractor spring brake application and release.", "Spring brakes release above normal pressure and apply when exhausted.", "Tractor brakes remain locked or apply unexpectedly.", "Check delivery to tractor spring brake chambers.", "Parking valve leak, spring brake valve fault, blocked line.", "Repair tractor parking circuit.", ["pp1-parking-control-valve", "spring-brake-chambers"], 280, 62),
  c("trailer-air-supply-control", "Trailer Air Supply Control", "Control de suministro de aire al trailer", "Controls", "Dash trailer supply control", "parkSupply", "Sends supply air through the tractor protection valve to the trailer.", "Trailer supply charges and holds pressure.", "Trailer brakes locked, red line no air, control pops out.", "Check supply pressure and red glad hand delivery.", "Low air, TP-3 fault, red line leak, MV-3 fault.", "Repair supply control or tractor protection valve.", ["tp3-tractor-protection-valve", "supply-line"], 365, 70),
  c("brake-chambers", "Brake Chambers", "Camaras de freno", "Brakes", "Tractor service brake wheel ends", "primary", "Convert service air pressure into pushrod braking force.", "No leaks, correct stroke, brakes apply evenly.", "Leak on apply, weak braking, excessive stroke.", "Apply service brake and measure pushrod stroke.", "Diaphragm leak, out-of-adjustment foundation brakes, damaged chamber.", "Replace leaking chambers and inspect slack adjusters.", ["relay-valve", "quick-release-valve"], 160, 420),
  c("qr1-quick-release-valve", "QR-1 Quick Release Valve", "Valvula QR-1 escape rapido", "Valves", "Tractor spring/service release area", "parkingControl", "Exhausts air quickly to release brake chambers.", "Rapid exhaust on release, no constant leak.", "Slow release, dragging brakes, exhaust leak.", "Listen at exhaust while releasing brakes.", "Stuck diaphragm, dirt, blocked exhaust port.", "Replace QR-1 valve and clean lines.", ["spring-brake-chambers", "tractor-parking-brake"], 185, 235),
  c("lq5-double-check-valve", "LQ-5 Double Check Valve", "Valvula doble check LQ-5", "Valves", "Parking/anti-compounding circuit", "antiCompound", "Selects the higher pressure signal and protects circuits from backfeed.", "No cross-leak, correct signal delivery.", "Air backfeed, park/service conflict, dragging brakes.", "Check both inputs and output pressure.", "Internal shuttle leak, contamination, wrong plumbing.", "Replace LQ-5 and verify plumbing.", ["anti-compounding-circuit", "pp1-parking-control-valve"], 282, 215),
  c("pp1-parking-control-valve", "PP-1 Parking Control Valve", "Valvula PP-1 parqueo", "Valves", "Parking control line", "parkingControl", "Controls parking air delivery/exhaust.", "Holds pressure and exhausts correctly.", "Parking brakes will not release or set.", "Check valve inlet and delivery pressure.", "Internal seal failure, blocked exhaust, low supply.", "Replace PP-1 valve.", ["tractor-parking-brake", "spring-brake-valve"], 380, 220),
  c("tp3-tractor-protection-valve", "TP-3 Tractor Protection Valve", "Valvula TP-3 proteccion del tractor", "Valves", "Back of cab trailer connection", "parkSupply", "Protects tractor air if trailer lines fail.", "Red and blue glad hands deliver correct pressure without tractor loss.", "Air loss when connected, trailer not charging.", "Disconnect trailer and verify isolation and delivery.", "Stuck TP-3, line leak, bad supply signal.", "Replace TP-3 or repair trailer line circuit.", ["trailer-air-supply-control", "service-line", "supply-line"], 510, 175),
  c("service-line", "Service Line", "Linea de servicio", "Lines", "Blue tractor-to-trailer service circuit", "trailerControl", "Carries service brake control signal to trailer relay valve.", "Pressure rises when foot brake is applied.", "Trailer brakes not applying, leak on application.", "Apply foot brake and verify blue line pressure.", "Broken hose, blocked line, bad glad hand, foot valve fault.", "Repair service line or related control valve.", ["foot-brake-valve", "tp3-tractor-protection-valve", "trailer-control-service-line"], 555, 235, "wide"),
  c("supply-line", "Supply Line", "Linea de suministro", "Lines", "Red tractor-to-trailer supply circuit", "trailerSupply", "Charges trailer reservoir and releases trailer spring brakes.", "Maintains trailer reservoir pressure.", "Trailer brakes locked, red line leak.", "Verify red glad hand pressure and trailer reservoir fill.", "Red line leak, TP-3 fault, trailer spring valve issue.", "Repair supply line and retest trailer charge.", ["tp3-tractor-protection-valve", "trailer-supply-line"], 555, 115, "wide"),
  c("spring-brake-chambers", "Spring Brake Chambers", "Camaras spring brake", "Brakes", "Tractor spring brake wheel ends", "parkingControl", "Apply parking/emergency brakes by spring force when air is removed.", "Release with sufficient air and apply when exhausted.", "Locked brakes, air leak, sudden application.", "Verify release pressure and inspect chamber for leaks.", "Chamber leak, broken spring, parking control problem.", "Replace chamber assembly and verify release circuit.", ["qr1-quick-release-valve", "spring-brake-valve"], 405, 430),
  c("bpr1-bobtail-relay-valve", "BP-R1 Bobtail Proportioning Relay Valve", "Valvula relay proporcionadora BP-R1", "Valves", "Tractor bobtail brake circuit", "primary", "Balances brake delivery when tractor operates without trailer.", "Smooth bobtail braking with no rear wheel lockup.", "Harsh bobtail braking, uneven brake delivery.", "Check delivery pressure bobtail vs coupled.", "Valve fault, control line issue, contamination.", "Replace BP-R1 valve and confirm brake balance.", ["relay-valve", "foot-brake-valve"], 455, 330, "wide"),
  c("r14-relay-valve", "R-14 Relay Valve", "Valvula relay R-14", "Valves", "Tractor rear brake relay area", "primary", "Delivers high volume air to rear service chambers.", "Fast brake application and release.", "Brake delay, leak at exhaust, dragging brakes.", "Apply and release brakes while listening at exhaust.", "Internal relay leak, contamination, bad signal.", "Replace R-14 relay valve.", ["rear-axle-service-reservoir", "brake-chambers"], 535, 365),
  c("anti-compounding-circuit", "Anti-compounding circuit", "Circuito anti-compounding", "Lines", "Between parking and service circuits", "antiCompound", "Prevents spring and service force stacking.", "No simultaneous compounding during park/service transition.", "Dragging brakes, overheated chambers.", "Apply parking and service controls while checking chamber delivery.", "Bad double-check valve, wrong plumbing, blocked line.", "Repair anti-compounding circuit and verify operation.", ["lq5-double-check-valve", "spring-brake-valve"], 338, 276, "wide"),
  c("compressor", "Compressor", "Compresor", "Charging", "Engine accessory drive", "charging", "Builds compressed air for the air brake system.", "Builds pressure to governor cut-out in normal time.", "No pressure, slow build, oil in system.", "Measure build rate and inspect discharge line.", "Worn compressor, intake restriction, governor issue.", "Repair drive/intake or replace compressor.", ["d2-governor", "air-dryer"], 80, 115),
  c("d2-governor", "D-2 Governor", "Gobernador D-2", "Charging", "Compressor control line", "charging", "Controls compressor cut-in and cut-out.", "Cut-in/cut-out occurs at correct PSI.", "Compressor pumps constantly or never loads.", "Check governor signal and cut-out pressure.", "Bad governor, blocked unloader line, misadjustment.", "Replace D-2 governor and verify pressures.", ["compressor", "air-dryer"], 158, 115),
  c("air-dryer", "Air Dryer", "Secador de aire", "Charging", "After compressor discharge", "charging", "Removes moisture and oil vapor before reservoirs.", "Purges normally and keeps tanks dry.", "Continuous purge, wet tanks, frozen valves.", "Inspect purge cycle and drain reservoirs.", "Bad purge valve, saturated cartridge, heater issue.", "Service dryer cartridge/purge valve.", ["supply-reservoir", "safety-valve"], 245, 150),
  c("safety-valve", "Safety Valve", "Valvula de seguridad", "Valves", "Supply reservoir/dryer area", "charging", "Protects system from overpressure.", "Closed below rated relief pressure.", "Popping off, constant air loss.", "Verify system pressure and relief rating.", "Overpressure from governor fault, weak valve.", "Correct pressure issue or replace valve.", ["air-dryer", "supply-reservoir"], 340, 142),
  c("supply-reservoir", "Supply Reservoir", "Tanque de suministro", "Reservoirs", "First reservoir after dryer", "charging", "Stores charging air before primary/secondary reservoirs.", "Holds pressure with no leak.", "Low supply pressure, water contamination.", "Drain tank and pressure test fittings.", "Tank leak, drain leak, dryer failure.", "Repair leak and service dryer.", ["front-axle-service-reservoir", "rear-axle-service-reservoir"], 420, 145),
  c("front-axle-service-reservoir", "Front Axle Service Reservoir", "Tanque servicio eje delantero", "Reservoirs", "Secondary/front service circuit", "secondary", "Stores air for front axle service brakes.", "Maintains secondary PSI.", "Low secondary pressure, front brake weakness.", "Pressure test front reservoir and check valve.", "Tank leak, check valve fault, line restriction.", "Repair leak or replace reservoir/check valve.", ["foot-brake-valve", "quick-release-valve"], 310, 470, "wide"),
  c("rear-axle-service-reservoir", "Rear Axle Service Reservoir", "Tanque servicio eje trasero", "Reservoirs", "Primary/rear service circuit", "primary", "Stores air for rear axle service brakes.", "Maintains primary PSI.", "Low primary pressure, rear brake weakness.", "Pressure test rear reservoir and relay supply.", "Tank leak, check valve fault, relay leak.", "Repair leak or replace reservoir/check valve.", ["r14-relay-valve", "relay-valve"], 508, 472, "wide"),
  c("low-pressure-indicator", "Low Pressure Indicator", "Indicador de baja presion", "Controls", "Cab warning circuit", "secondary", "Warns driver when air pressure is below safe range.", "Activates below threshold and clears above normal pressure.", "No warning, false warning, warning stays on.", "Lower pressure safely and verify warning operation.", "Bad switch, wiring fault, low air.", "Repair switch/wiring and confirm pressure.", ["air-pressure-gauge", "front-axle-service-reservoir"], 190, 520),
  c("air-pressure-gauge", "Air Pressure Gauge", "Manometro de aire", "Controls", "Cab instrument panel", "primary", "Displays primary and secondary system pressure.", "Accurate readings matching test gauge.", "Incorrect PSI, stuck gauge, no movement.", "Compare to calibrated shop gauge.", "Gauge fault, sender/line restriction.", "Replace gauge/sender and verify readings.", ["low-pressure-indicator"], 90, 520),
  c("check-valve", "Check Valve", "Valvula check", "Valves", "Reservoir feed circuits", "charging", "Prevents air backflow between reservoirs.", "Holds downstream pressure when upstream drops.", "Backfeed, pressure loss across tanks.", "Leak test valve by isolating circuits.", "Worn seat, contamination.", "Replace check valve.", ["supply-reservoir"], 438, 240),
  c("foot-brake-valve", "Foot Brake Valve", "Valvula de pedal", "Controls", "Driver foot pedal", "primary", "Meters service brake pressure to tractor and trailer service circuits.", "Smooth proportional delivery.", "No service signal, leak on apply, uneven braking.", "Measure delivery pressure while applying pedal.", "Internal leak, blocked delivery, bad linkage.", "Replace valve and verify delivery.", ["service-line", "relay-valve", "quick-release-valve"], 170, 365),
  c("double-check-valve", "Double Check Valve", "Valvula doble check", "Valves", "Service signal selection circuit", "primary", "Selects higher of two service signals.", "No cross leak and correct output.", "Backfeed, uneven application.", "Check both inputs and output.", "Internal shuttle leak or contamination.", "Replace double-check valve.", ["foot-brake-valve", "relay-valve"], 312, 350),
  c("quick-release-valve", "Quick Release Valve", "Valvula escape rapido", "Valves", "Front axle service circuit", "secondary", "Exhausts front brake chamber air quickly.", "Fast release without constant exhaust leak.", "Slow front brake release, dragging.", "Release service brakes and listen at exhaust.", "Blocked exhaust, failed diaphragm.", "Replace quick release valve.", ["front-axle-service-reservoir", "brake-chambers"], 240, 420),
  c("relay-valve", "Relay Valve", "Valvula relay", "Valves", "Rear service brake circuit", "primary", "Uses reservoir air to quickly apply rear brake chambers.", "Fast rear brake application.", "Leak at exhaust, brake delay.", "Apply/release brakes and check exhaust.", "Internal relay fault, contamination.", "Replace relay valve.", ["rear-axle-service-reservoir", "brake-chambers"], 590, 420),
  c("spring-brake-valve", "Spring Brake Valve", "Valvula spring brake", "Valves", "Tractor spring brake control", "parkingControl", "Controls spring brake release/application.", "Releases above normal pressure and exhausts when parking.", "Spring brakes will not release or apply.", "Check delivery pressure to spring brake chambers.", "Valve leak, low supply, blocked line.", "Replace valve or repair delivery circuit.", ["spring-brake-chambers", "pp1-parking-control-valve"], 470, 265),
  c("tractor-brake-chamber-front-left", "Visible tractor brake chamber", "Camara visible tractor", "Brakes", "Front tractor axle", "secondary", "Visible tractor service chamber from reference diagram.", "No leak and correct stroke.", "Leak, excessive stroke.", "Inspect chamber and stroke.", "Diaphragm or foundation brake fault.", "Repair chamber/foundation brake.", ["quick-release-valve"], 75, 395),
  c("tractor-brake-chamber-rear-left", "Visible tractor brake chamber", "Camara visible tractor", "Brakes", "Rear tractor axle", "primary", "Visible tractor service/spring chamber from reference diagram.", "No leak and correct stroke.", "Leak, excessive stroke.", "Inspect chamber and stroke.", "Diaphragm or foundation brake fault.", "Repair chamber/foundation brake.", ["relay-valve"], 654, 505),
  c("tractor-brake-chamber-rear-right", "Visible tractor brake chamber", "Camara visible tractor", "Brakes", "Rear tractor axle", "primary", "Visible tractor service/spring chamber from reference diagram.", "No leak and correct stroke.", "Leak, excessive stroke.", "Inspect chamber and stroke.", "Diaphragm or foundation brake fault.", "Repair chamber/foundation brake.", ["relay-valve"], 705, 445),
  c("trailer-supply-line", "Trailer Supply Line", "Linea de suministro trailer", "Lines", "Red trailer supply circuit", "trailerSupply", "Charges trailer reservoir and releases trailer spring brakes.", "Trailer reservoir fills and holds pressure.", "Red line leak, trailer locked.", "Verify red line pressure into trailer.", "Bad glad hand, broken line, SR-5 issue.", "Repair red supply circuit.", ["trailer-reservoir", "sr5-trailer-spring-brake-valve"], 815, 116, "wide"),
  c("trailer-control-service-line", "Trailer Control / Service Line", "Linea control/servicio trailer", "Lines", "Blue trailer service circuit", "trailerControl", "Carries service brake control pressure to trailer relay valve.", "Pressure rises with foot brake.", "Trailer brakes not applying.", "Verify blue line pressure at trailer relay.", "Bad service line, TP-3/foot valve issue.", "Repair blue control circuit.", ["r12-relay-valve", "service-line"], 810, 210, "wide"),
  c("trailer-reservoir", "Trailer Reservoir", "Tanque del trailer", "Reservoirs", "Trailer frame", "trailerSupply", "Stores air for trailer brake system.", "Charges and holds normal trailer PSI.", "Low trailer pressure, spring brakes apply.", "Pressure test reservoir and drains.", "Tank leak, drain leak, supply restriction.", "Repair reservoir/fittings.", ["sr5-trailer-spring-brake-valve", "r12-relay-valve"], 928, 168),
  c("anti-compound-line", "Anti-Compound Line", "Linea anti-compound", "Lines", "Trailer service/parking interface", "antiCompound", "Prevents service and parking brake force compounding.", "No dragging during park/service transitions.", "Dragging brakes, overheated chambers.", "Check line pressure during service and parking.", "Wrong plumbing, stuck valve, restricted line.", "Repair anti-compound line.", ["sr5-trailer-spring-brake-valve"], 935, 270, "wide"),
  c("sr5-trailer-spring-brake-valve", "SR-5 Trailer Spring Brake Valve", "Valvula SR-5 spring brake trailer", "Valves", "Trailer spring brake control", "trailerParking", "Controls trailer spring brake release and emergency application.", "Releases spring brakes when trailer reservoir is charged.", "Trailer locked, not releasing, exhaust leak.", "Check reservoir supply and spring delivery.", "SR-5 fault, reservoir low, red line leak.", "Replace SR-5 valve or repair supply.", ["trailer-reservoir", "trailer-spring-brake-chambers"], 1042, 235, "wide"),
  c("r12-relay-valve", "R-12 Relay Valve", "Valvula relay R-12", "Valves", "Trailer service brake relay", "trailerControl", "Delivers trailer reservoir air to service chambers on blue signal.", "Fast trailer brake application.", "Service delay, leak, no delivery.", "Apply service signal and check relay delivery/exhaust.", "Internal valve leak, no signal, contamination.", "Replace R-12 valve.", ["trailer-control-service-line", "trailer-brake-chambers"], 1070, 360),
  c("trailer-spring-brake-chambers", "Spring Brake Chambers", "Camaras spring brake trailer", "Brakes", "Trailer axle spring brake chambers", "trailerParking", "Apply trailer parking/emergency brakes when air is removed.", "Release with charged trailer reservoir.", "Trailer locked, chamber leak.", "Check release pressure and listen for leaks.", "Spring chamber leak, SR-5 issue, low supply.", "Replace chamber or repair spring circuit.", ["sr5-trailer-spring-brake-valve"], 1210, 235, "wide"),
  c("trailer-brake-chambers", "Visible trailer brake chambers", "Camaras visibles trailer", "Brakes", "Trailer service brake chambers", "trailerControl", "Convert trailer service air into braking force.", "Apply evenly with correct stroke.", "Leak, no application, excessive stroke.", "Apply service brakes and measure stroke.", "Diaphragm leak, relay fault, foundation brake issue.", "Repair chambers/foundation brakes.", ["r12-relay-valve"], 1220, 405, "wide"),
];

const lines = [
  l("line-compressor-dryer", "Compressor to air dryer", "charging", "compressor", "air-dryer", "M 95 135 C 150 130 195 138 245 150", 115),
  l("line-governor-compressor", "D-2 governor control", "charging", "d2-governor", "compressor", "M 158 115 C 140 85 105 88 80 115", 115),
  l("line-dryer-supply", "Air dryer to supply reservoir", "charging", "air-dryer", "supply-reservoir", "M 290 155 C 335 150 375 145 420 145", 125),
  l("line-supply-front", "Supply to front axle service reservoir", "secondary", "supply-reservoir", "front-axle-service-reservoir", "M 420 170 C 385 260 330 365 310 470", 120),
  l("line-supply-rear", "Supply to rear axle service reservoir", "primary", "supply-reservoir", "rear-axle-service-reservoir", "M 445 170 C 480 255 512 360 508 472", 120),
  l("line-front-foot", "Front reservoir to foot brake valve", "secondary", "front-axle-service-reservoir", "foot-brake-valve", "M 310 470 C 250 450 195 415 170 365", 115),
  l("line-rear-relay", "Rear reservoir to R-14 relay valve", "primary", "rear-axle-service-reservoir", "r14-relay-valve", "M 508 472 C 520 430 525 392 535 365", 115),
  l("line-foot-quick", "Foot brake to quick release valve", "secondary", "foot-brake-valve", "quick-release-valve", "M 170 365 C 190 385 215 405 240 420", 85),
  l("line-foot-relay", "Foot brake to relay valves", "primary", "foot-brake-valve", "relay-valve", "M 170 365 C 310 375 460 398 590 420", 85),
  l("line-foot-service", "Foot brake to trailer service line", "trailerControl", "foot-brake-valve", "service-line", "M 170 365 C 330 295 445 260 555 235", 85),
  l("line-mv3-tp3", "Trailer supply control to TP-3", "parkSupply", "trailer-air-supply-control", "tp3-tractor-protection-valve", "M 365 70 C 430 92 480 130 510 175", 115),
  l("line-tp3-supply", "TP-3 to red trailer supply line", "trailerSupply", "tp3-tractor-protection-valve", "trailer-supply-line", "M 510 175 C 620 125 720 105 815 116", 110),
  l("line-tp3-service", "TP-3 to blue trailer service line", "trailerControl", "tp3-tractor-protection-valve", "trailer-control-service-line", "M 510 205 C 615 225 710 218 810 210", 80),
  l("line-pp1-spring", "Parking control to spring brake valve", "parkingControl", "pp1-parking-control-valve", "spring-brake-valve", "M 380 220 C 405 232 440 250 470 265", 110),
  l("line-spring-chambers", "Spring brake valve to spring chambers", "parkingControl", "spring-brake-valve", "spring-brake-chambers", "M 470 265 C 465 330 445 382 405 430", 95),
  l("line-anticompound", "Anti-compounding circuit", "antiCompound", "lq5-double-check-valve", "anti-compounding-circuit", "M 282 215 C 305 235 322 252 338 276", 95),
  l("line-trailer-supply-reservoir", "Trailer supply line to reservoir", "trailerSupply", "trailer-supply-line", "trailer-reservoir", "M 815 116 C 850 128 890 150 928 168", 108),
  l("line-trailer-reservoir-sr5", "Trailer reservoir to SR-5", "trailerSupply", "trailer-reservoir", "sr5-trailer-spring-brake-valve", "M 928 168 C 970 180 1010 205 1042 235", 105),
  l("line-service-r12", "Trailer control line to R-12", "trailerControl", "trailer-control-service-line", "r12-relay-valve", "M 810 210 C 910 270 1000 315 1070 360", 75),
  l("line-r12-chambers", "R-12 to trailer brake chambers", "trailerControl", "r12-relay-valve", "trailer-brake-chambers", "M 1070 360 C 1115 380 1168 395 1220 405", 80),
  l("line-sr5-spring-chambers", "SR-5 to trailer spring brake chambers", "trailerParking", "sr5-trailer-spring-brake-valve", "trailer-spring-brake-chambers", "M 1042 235 C 1095 230 1155 232 1210 235", 95),
  l("line-trailer-anti", "Trailer anti-compound line", "antiCompound", "anti-compound-line", "sr5-trailer-spring-brake-valve", "M 935 270 C 970 270 1008 258 1042 235", 85),
];

function c(id, name, nameEs, category, location, circuit, fn, normal, symptoms, inspect, causes, repair, related, x, y, size = "normal") {
  return { id, key: id, name, nameEs, category, location, circuit, function: fn, normal, symptoms, inspect, causes, repair, related, x, y, size };
}

function l(id, name, circuit, source, target, path, normalPsi) {
  return { id, name, circuit, source, target, path, normalPsi };
}

const diagnosticProblems = [
  {
    label: "Trailer brakes will not release",
    steps: [
      "Verify tractor air pressure.",
      "Verify red trailer supply line pressure.",
      "Inspect glad hand seals and supply hose.",
      "Check trailer reservoir pressure.",
      "Check SR-5 trailer spring brake valve.",
      "Check trailer spring brake chambers.",
      "Record findings.",
    ],
  },
  {
    label: "Trailer brakes not applying",
    steps: [
      "Verify primary and secondary pressure.",
      "Apply foot brake and confirm blue service line pressure.",
      "Inspect TP-3 tractor protection valve.",
      "Check R-12 relay valve delivery.",
      "Measure trailer brake chamber stroke.",
      "Record findings.",
    ],
  },
  {
    label: "Low-air warning",
    steps: [
      "Start compressor and verify build rate.",
      "Check D-2 governor cut-in and cut-out.",
      "Inspect air dryer and safety valve.",
      "Pressure test supply, front axle, and rear axle reservoirs.",
      "Record findings.",
    ],
  },
];

const faultSimulations = [
  "Compressor not building pressure",
  "Governor failure",
  "Air dryer restriction",
  "Supply reservoir leak",
  "Front axle service reservoir leak",
  "Rear axle service reservoir leak",
  "Foot valve leak",
  "TP-3 tractor protection valve failure",
  "Red trailer supply line leak",
  "Blue trailer service line leak",
  "Broken air line",
  "Restricted air line",
  "R-12 relay valve leaking",
  "R-14 relay valve not delivering air",
  "Brake chamber diaphragm leak",
  "Spring brake not releasing",
  "Trailer brakes locked",
  "Trailer brakes not applying",
  "Uneven braking",
  "Low-air warning",
];

const allComponents = components;
const diagramImageSrc = "/air-system-diagram.png";
const diagramWidth = 732;
const diagramHeight = 296;
const xScale = diagramWidth / 1350;
const yScale = diagramHeight / 620;
const imageHotspots = [
  h("mv3-control-module", 62, 61, 44, 28),
  h("system-parking-brake", 117, 53, 16, 22),
  h("tractor-parking-brake", 146, 53, 16, 22),
  h("trailer-air-supply-control", 173, 53, 16, 22),
  h("brake-chambers", 67, 98, 28, 90),
  h("qr1-quick-release-valve", 74, 178, 30, 28),
  h("lq5-double-check-valve", 108, 137, 36, 24),
  h("pp1-parking-control-valve", 153, 134, 36, 25),
  h("tp3-tractor-protection-valve", 349, 69, 52, 18),
  h("service-line", 405, 64, 120, 12),
  h("supply-line", 405, 78, 120, 12),
  h("spring-brake-chambers", 414, 214, 74, 64),
  h("bpr1-bobtail-relay-valve", 414, 148, 42, 33),
  h("r14-relay-valve", 399, 133, 38, 28),
  h("anti-compounding-circuit", 481, 168, 78, 16),
  h("compressor", 108, 251, 43, 24),
  h("d2-governor", 133, 262, 48, 18),
  h("air-dryer", 103, 215, 44, 32),
  h("safety-valve", 145, 217, 34, 24),
  h("supply-reservoir", 179, 219, 55, 35),
  h("front-axle-service-reservoir", 228, 246, 74, 28),
  h("rear-axle-service-reservoir", 228, 201, 74, 29),
  h("low-pressure-indicator", 253, 232, 34, 20),
  h("air-pressure-gauge", 270, 245, 24, 18),
  h("check-valve", 230, 155, 26, 19),
  h("foot-brake-valve", 261, 151, 42, 25),
  h("double-check-valve", 229, 170, 36, 22),
  h("quick-release-valve", 354, 133, 33, 23),
  h("relay-valve", 425, 128, 38, 31),
  h("spring-brake-valve", 368, 125, 42, 31),
  h("tractor-brake-chamber-front-left", 69, 76, 32, 42),
  h("tractor-brake-chamber-rear-left", 421, 99, 70, 55),
  h("tractor-brake-chamber-rear-right", 415, 225, 76, 52),
  h("trailer-supply-line", 492, 76, 86, 13),
  h("trailer-control-service-line", 487, 64, 92, 13),
  h("trailer-reservoir", 624, 191, 49, 67),
  h("anti-compound-line", 506, 173, 72, 14),
  h("sr5-trailer-spring-brake-valve", 536, 186, 45, 32),
  h("r12-relay-valve", 581, 173, 38, 32),
  h("trailer-spring-brake-chambers", 606, 94, 170, 178),
  h("trailer-brake-chambers", 607, 95, 170, 178),
];
const hotspotByKey = new Map(imageHotspots.map((hotspot) => [hotspot.key, hotspot]));

function h(key, x, y, width, height) {
  return { key, x, y, width, height };
}

export default function AirSystemModule({ currentUser }) {
  const diagramRef = useRef(null);
  const fileInputRef = useRef(null);
  const [selectedKey, setSelectedKey] = useState("compressor");
  const [selectedLineId, setSelectedLineId] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");
  const [zoom, setZoom] = useState(1);
  const [fullScreen, setFullScreen] = useState(false);
  const [panMode, setPanMode] = useState(false);
  const [language, setLanguage] = useState("en");
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
  const [diagnosticProblem, setDiagnosticProblem] = useState(diagnosticProblems[0].label);
  const [diagnosticResults, setDiagnosticResults] = useState(Object.fromEntries(diagnosticProblems[0].steps.map((step) => [step, "Not Tested"])));
  const [simulation, setSimulation] = useState({
    supply: 0,
    primary: 0,
    secondary: 0,
    trailer: 0,
    state: "System inactive",
    fault: "",
    serviceApplied: false,
    parkingSet: true,
    trailerSupplied: false,
    compressorRunning: false,
  });

  const selectedComponent = allComponents.find((item) => item.key === selectedKey) || allComponents[0];
  const connectedLines = useMemo(() => lines.filter((line) => line.source === selectedComponent.key || line.target === selectedComponent.key), [selectedComponent.key]);
  const activeProblem = diagnosticProblems.find((item) => item.label === diagnosticProblem) || diagnosticProblems[0];
  const visibleComponents = useMemo(() => {
    return allComponents.filter((component) => {
      const text = `${component.name} ${component.nameEs} ${component.category} ${component.location}`.toLowerCase();
      const matchesSearch = !search || text.includes(search.toLowerCase());
      const matchesFilter = filter === "All" || component.category === filter;
      return matchesSearch && matchesFilter;
    });
  }, [filter, search]);
  const filteredJobs = useMemo(() => {
    const term = jobSearch.trim().toLowerCase();
    return jobs
      .filter((job) => ["new", "pending", "assigned", "en route", "on site", "in progress", "waiting parts", "working"].includes(String(job.status || "").toLowerCase()))
      .filter((job) => {
        if (!term) return true;
        return [job.invoice_number, job.company, job.location, job.tech, job.dispatch].filter(Boolean).join(" ").toLowerCase().includes(term);
      });
  }, [jobSearch, jobs]);

  useEffect(() => {
    loadJobs();
    loadInspections();
  }, []);

  useEffect(() => {
    const problem = diagnosticProblems.find((item) => item.label === diagnosticProblem) || diagnosticProblems[0];
    setDiagnosticResults(Object.fromEntries(problem.steps.map((step) => [step, "Not Tested"])));
  }, [diagnosticProblem]);

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
      .limit(60);
    setInspections(data || []);
  }

  function selectComponent(componentKey) {
    setSelectedKey(componentKey);
    setSelectedLineId("");
    const component = allComponents.find((item) => item.key === componentKey);
    if (component && diagramRef.current) {
      setZoom((current) => Math.max(current, 2));
      window.setTimeout(() => {
        document.getElementById(`svg-${componentKey}`)?.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
      }, 80);
    }
  }

  function handleSearch(value) {
    setSearch(value);
    const term = value.trim().toLowerCase();
    if (!term) return;
    const match = allComponents.find((component) => `${component.name} ${component.nameEs}`.toLowerCase().includes(term));
    if (match) selectComponent(match.key);
  }

  function runSimulation(action) {
    setSimulation((current) => applySimulation(current, action));
  }

  function selectFault(fault) {
    const target = faultTarget(fault);
    if (target.componentKey) selectComponent(target.componentKey);
    if (target.lineId) setSelectedLineId(target.lineId);
    setSimulation((current) => ({
      ...current,
      fault,
      state: fault,
      supply: target.pressure?.supply ?? current.supply,
      primary: target.pressure?.primary ?? current.primary,
      secondary: target.pressure?.secondary ?? current.secondary,
      trailer: target.pressure?.trailer ?? current.trailer,
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
      diagnosticResults,
      connectedLines,
    });
    const { data, error } = await supabase.from("air_system_inspections").insert(payload).select().single();
    if (error) {
      setSaving(false);
      setMessage(`Unable to save inspection: ${error.message}`);
      return null;
    }
    await uploadInspectionPhotos(data.id);
    if (job?.id) await appendInspectionToJob(job, data);
    await logActivity({
      entityType: "air_system_inspection",
      entityId: data.id,
      action: "Air System Inspection Created",
      description: `${currentUser?.name || currentUser?.username || "Dispatcher"} inspected ${selectedComponent.name} (${condition})${job?.invoice_number ? ` for job ${job.invoice_number}` : ""}.`,
      createdBy: currentUser?.name || currentUser?.username || "Dispatcher",
      metadata: {
        job_id: job?.id || null,
        svg_component_id: selectedComponent.key,
        component: selectedComponent.name,
        related_lines: connectedLines.map((line) => line.id),
        condition,
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
        records.push({ inspection_id: inspectionId, storage_path: path, uploaded_by: currentUser?.id || currentUser?.authUserId || null });
      }
    }
    if (records.length) await supabase.from("air_system_inspection_photos").insert(records);
  }

  async function appendInspectionToJob(job, inspection) {
    const block = [
      "",
      "Air System Inspection",
      `SVG Component ID: ${selectedComponent.key}`,
      `Component: ${selectedComponent.name} / ${selectedComponent.nameEs}`,
      `Circuit: ${circuitStyles[selectedComponent.circuit]?.name || selectedComponent.circuit}`,
      `Condition: ${condition}`,
      `Failure: ${simulation.fault || "None"}`,
      `Related lines: ${connectedLines.map((line) => line.name).join(", ") || "None"}`,
      `Diagnostic results: ${diagnosticSummary(diagnosticResults) || "No guided diagnostic completed"}`,
      `Required parts: ${selectedComponent.related.join(", ")}`,
      `Notes: ${notes || "None"}`,
      `PSI: Supply ${simulation.supply} / Primary ${simulation.primary} / Secondary ${simulation.secondary} / Trailer ${simulation.trailer}`,
      `Inspection ID: ${inspection.id}`,
      `Dispatcher: ${currentUser?.name || currentUser?.username || "Dispatcher"}`,
      `Date: ${new Date().toLocaleString()}`,
    ].join("\n");
    await supabase.from("jobs").update({ updates: `${job.updates || ""}${block}` }).eq("id", job.id);
  }

  function exportSvg() {
    const svg = document.getElementById("air-system-svg");
    if (!svg) return;
    const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "air-system-diagram.svg";
    link.click();
    URL.revokeObjectURL(url);
  }

  function exportPng() {
    const svg = document.getElementById("air-system-svg");
    if (!svg) return;
    const serialized = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([serialized], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 2700;
      canvas.height = 1240;
      const context = canvas.getContext("2d");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      const link = document.createElement("a");
      link.href = canvas.toDataURL("image/png");
      link.download = "air-system-diagram.png";
      link.click();
    };
    image.src = url;
  }

  function printPdf() {
    window.print();
  }

  return (
    <div className="min-h-screen bg-slate-100 p-4 text-slate-950 md:p-6 xl:p-8">
      <div className="mx-auto max-w-[1900px] space-y-5">
        <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-600">Diagnostics</p>
              <h1 className="mt-1 text-3xl font-black">Truck & Trailer Air System</h1>
              <p className="mt-2 max-w-3xl text-sm font-semibold text-slate-500">
                Uploaded truck/tractor and trailer air-brake diagram with aligned interactive hotspots, diagnostics, PSI simulations, and job attachment tools.
              </p>
            </div>
            <div className="grid grid-cols-4 gap-2 rounded-2xl bg-slate-50 p-2 text-center text-xs font-black text-slate-600">
              <PsiBadge label="Supply" value={simulation.supply} />
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

        <div className={`grid gap-5 ${fullScreen ? "" : "xl:grid-cols-[minmax(0,1fr)_420px]"}`}>
          <main className="space-y-4">
            <Toolbar
              search={search}
              filter={filter}
              zoom={zoom}
              panMode={panMode}
              language={language}
              onSearch={handleSearch}
              onFilter={setFilter}
              onZoom={setZoom}
              onPanMode={setPanMode}
              onLanguage={setLanguage}
              onFull={() => setFullScreen((value) => !value)}
              onFit={() => setZoom(0.85)}
              onExportSvg={exportSvg}
              onExportPng={exportPng}
              onPrintPdf={printPdf}
              fullScreen={fullScreen}
            />

            <AirBrakeSvg
              diagramRef={diagramRef}
              components={visibleComponents}
              selectedKey={selectedKey}
              selectedLineId={selectedLineId}
              connectedLines={connectedLines}
              simulation={simulation}
              zoom={zoom}
              panMode={panMode}
              language={language}
              onSelect={selectComponent}
              onLineSelect={setSelectedLineId}
            />

            <ColorLegend />

            <DiagnosticsPanel
              simulation={simulation}
              problem={activeProblem}
              selectedProblem={diagnosticProblem}
              results={diagnosticResults}
              onProblem={setDiagnosticProblem}
              onResult={(step, result) => setDiagnosticResults((current) => ({ ...current, [step]: result }))}
              onAction={runSimulation}
              onFault={selectFault}
            />

            <SavedInspections inspections={inspections} jobs={jobs} onRefresh={loadInspections} onOpen={(componentId) => componentId && selectComponent(componentId)} />
          </main>

          {!fullScreen && (
            <ComponentPanel
              component={selectedComponent}
              condition={condition}
              notes={notes}
              photos={photos}
              saving={saving}
              simulation={simulation}
              connectedLines={connectedLines}
              diagnosticResults={diagnosticResults}
              language={language}
              fileInputRef={fileInputRef}
              onCondition={setCondition}
              onNotes={setNotes}
              onPhotos={setPhotos}
              onSave={() => saveInspection()}
              onAddJob={() => setJobModalOpen(true)}
              onNearby={() => setNearbyModalOpen(true)}
            />
          )}
        </div>

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
            const line = `\nAir System Nearby Parts Search\nSVG Component ID: ${selectedComponent.key}\nComponent: ${selectedComponent.name}\nSearch: ${query}\nDate: ${new Date().toLocaleString()}\n`;
            await supabase.from("jobs").update({ updates: `${job.updates || ""}${line}` }).eq("id", job.id);
            window.open(googleMapsNearbyLink(selectedComponent.name, job.location || job.company || ""), "_blank", "noopener,noreferrer");
            setNearbyModalOpen(false);
          }}
        />
      )}
    </div>
  );
}

function Toolbar({ search, filter, zoom, panMode, language, fullScreen, onSearch, onFilter, onZoom, onPanMode, onLanguage, onFull, onFit, onExportSvg, onExportPng, onPrintPdf }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="grid gap-3 xl:grid-cols-[1fr_auto] xl:items-center">
        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
          <input
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder="Search exact diagram component..."
            className="h-10 w-full rounded-xl border border-slate-200 pl-9 pr-3 text-sm font-semibold outline-none focus:border-blue-500"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {componentFilters.map((item) => (
            <button key={item} type="button" onClick={() => onFilter(item)} className={`h-10 rounded-xl px-3 text-xs font-black ${filter === item ? "bg-slate-950 text-white" : "border border-slate-200 bg-white text-slate-600"}`}>
              {item}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <IconButton title="Zoom out" onClick={() => onZoom((value) => Math.max(0.5, Number((value - 0.25).toFixed(2))))}><ZoomOut className="h-4 w-4" /></IconButton>
        <span className="flex h-9 items-center rounded-xl bg-slate-100 px-3 text-xs font-black text-slate-600">{Math.round(zoom * 100)}%</span>
        <IconButton title="Zoom in" onClick={() => onZoom((value) => Math.min(5, Number((value + 0.25).toFixed(2))))}><ZoomIn className="h-4 w-4" /></IconButton>
        <button type="button" onClick={() => onZoom(1)} className="h-9 rounded-xl border border-slate-200 px-3 text-xs font-black text-slate-700">Reset View</button>
        <button type="button" onClick={onFit} className="h-9 rounded-xl border border-slate-200 px-3 text-xs font-black text-slate-700">Fit Diagram</button>
        <button type="button" onClick={onFull} className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-black text-slate-700"><Maximize2 className="h-4 w-4" />{fullScreen ? "Exit Full" : "Full Screen"}</button>
        <button type="button" onClick={() => onPanMode((value) => !value)} className={`inline-flex h-9 items-center gap-2 rounded-xl px-3 text-xs font-black ${panMode ? "bg-blue-600 text-white" : "border border-slate-200 text-slate-700"}`}><Move className="h-4 w-4" />Pan Mode</button>
        <button type="button" onClick={() => onLanguage(language === "en" ? "es" : "en")} className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-black text-slate-700"><Languages className="h-4 w-4" />{language === "en" ? "English" : "Espanol"}</button>
        <button type="button" onClick={onExportSvg} className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-black text-slate-700"><Download className="h-4 w-4" />SVG</button>
        <button type="button" onClick={onExportPng} className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-black text-slate-700"><Download className="h-4 w-4" />PNG</button>
        <button type="button" onClick={onPrintPdf} className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-black text-slate-700"><FileText className="h-4 w-4" />PDF</button>
      </div>
    </section>
  );
}

function AirBrakeSvg({ diagramRef, components, selectedKey, selectedLineId, connectedLines, simulation, zoom, panMode, language, onSelect, onLineSelect }) {
  const dragRef = useRef({ active: false, x: 0, y: 0, left: 0, top: 0 });
  const visibleIds = new Set(components.map((component) => component.key));
  const connectedIds = new Set(connectedLines.map((line) => line.id));
  const selectedComponent = allComponents.find((item) => item.key === selectedKey);
  function startPan(event) {
    if (!panMode || !diagramRef.current) return;
    dragRef.current = {
      active: true,
      x: event.clientX,
      y: event.clientY,
      left: diagramRef.current.scrollLeft,
      top: diagramRef.current.scrollTop,
    };
  }
  function movePan(event) {
    if (!dragRef.current.active || !diagramRef.current) return;
    diagramRef.current.scrollLeft = dragRef.current.left - (event.clientX - dragRef.current.x);
    diagramRef.current.scrollTop = dragRef.current.top - (event.clientY - dragRef.current.y);
  }
  function stopPan() {
    dragRef.current.active = false;
  }
  return (
    <section
      ref={diagramRef}
      onMouseDown={startPan}
      onMouseMove={movePan}
      onMouseUp={stopPan}
      onMouseLeave={stopPan}
      className={`max-h-[78vh] overflow-auto rounded-2xl border border-slate-200 bg-white shadow-sm ${panMode ? "cursor-grab active:cursor-grabbing" : ""}`}
    >
      <svg
        id="air-system-svg"
        viewBox={`0 0 ${diagramWidth} ${diagramHeight}`}
        role="img"
        aria-label="Interactive truck tractor and trailer air brake system diagram"
        className="block h-auto min-w-[1180px] origin-top-left bg-white"
        style={{ transform: `scale(${zoom})`, transformOrigin: "top left" }}
      >
        <defs>
          <marker id="air-arrow" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto">
            <path d="M 0 0 L 9 4.5 L 0 9 z" fill="#0f172a" />
          </marker>
          <style>{`
            .air-flow { stroke-dasharray: 12 10; animation: airFlow 1.05s linear infinite; }
            .air-fault { animation: airFault 0.8s ease-in-out infinite; }
            @keyframes airFlow { to { stroke-dashoffset: -44; } }
            @keyframes airFault { 0%,100% { opacity: 1; } 50% { opacity: .25; } }
          `}</style>
        </defs>
        <rect x="0" y="0" width={diagramWidth} height={diagramHeight} fill="#ffffff" />
        <image href={diagramImageSrc} x="0" y="0" width={diagramWidth} height={diagramHeight} preserveAspectRatio="xMidYMid meet" />

        {lines.map((line) => {
          const isSelected = selectedLineId === line.id || connectedIds.has(line.id);
          const isFaulted = simulation.fault && faultTarget(simulation.fault).lineId === line.id;
          const active = linePressure(line, simulation) > 15;
          return (
            <g key={line.id} transform={`scale(${xScale} ${yScale})`} className={isSelected ? "opacity-100" : selectedComponent ? "opacity-0" : "opacity-20"}>
              <path
                id={`svg-line-${line.id}`}
                d={line.path}
                fill="none"
                stroke={circuitStyles[line.circuit]?.color || "#64748b"}
                strokeWidth={isSelected ? 10 : 6}
                strokeLinecap="round"
                markerEnd={active ? "url(#air-arrow)" : ""}
                className={`${active ? "air-flow" : ""} ${isFaulted ? "air-fault" : ""} cursor-pointer transition-all hover:stroke-[12px]`}
                onClick={() => onLineSelect(line.id)}
              >
                <title>{`${line.name} - ${circuitStyles[line.circuit]?.name || line.circuit} - ${linePressure(line, simulation)} PSI`}</title>
              </path>
              {isSelected && <text x={labelPoint(line.path).x} y={labelPoint(line.path).y} className="pointer-events-none fill-slate-900 text-[16px] font-black">
                {line.name} - {linePressure(line, simulation)} PSI
              </text>}
            </g>
          );
        })}

        {allComponents.map((component) => {
          const isVisible = visibleIds.has(component.key);
          const isSelected = selectedKey === component.key;
          const related = connectedLines.some((line) => line.source === component.key || line.target === component.key);
          const faded = selectedComponent && !isSelected && !related;
          const isFaulted = simulation.fault && faultTarget(simulation.fault).componentKey === component.key;
          const label = language === "es" ? component.nameEs : component.name;
          const hotspot = hotspotByKey.get(component.key) || {
            x: component.x * xScale - 20,
            y: component.y * yScale - 12,
            width: component.size === "wide" ? 70 : 44,
            height: 28,
          };
          return (
            <g
              key={component.key}
              id={`svg-${component.key}`}
              data-component-key={component.key}
              tabIndex="0"
              role="button"
              onClick={() => onSelect(component.key)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") onSelect(component.key);
              }}
              className={`cursor-pointer transition-opacity ${!isVisible || faded ? "opacity-25" : "opacity-100"} ${isFaulted ? "air-fault" : ""}`}
            >
              <rect
                x={hotspot.x}
                y={hotspot.y}
                width={hotspot.width}
                height={hotspot.height}
                rx="4"
                fill={isSelected ? "rgba(37,99,235,0.18)" : "transparent"}
                stroke={isSelected ? "#2563eb" : related ? "#0ea5e9" : "transparent"}
                strokeWidth={isSelected ? 2.5 : 1.8}
                className="transition-all hover:fill-blue-500/10 hover:stroke-blue-500"
              />
              {isSelected && (
                <text x={hotspot.x + hotspot.width / 2} y={Math.max(12, hotspot.y - 4)} textAnchor="middle" className="pointer-events-none fill-blue-700 text-[10px] font-black">
                  {label}
                </text>
              )}
              <title>{`${component.name} / ${component.nameEs}. ${circuitStyles[component.circuit]?.name || component.circuit}. ${componentPsi(component, simulation)} PSI`}</title>
            </g>
          );
        })}
      </svg>
    </section>
  );
}

function ComponentPanel({ component, condition, notes, photos, saving, simulation, connectedLines, diagnosticResults, language, fileInputRef, onCondition, onNotes, onPhotos, onSave, onAddJob, onNearby }) {
  const displayName = language === "es" ? component.nameEs : component.name;
  const secondaryName = language === "es" ? component.name : component.nameEs;
  const inputs = connectedLines.filter((line) => line.target === component.key).map((line) => line.name).join(", ") || "Manual/linked circuit";
  const outputs = connectedLines.filter((line) => line.source === component.key).map((line) => line.name).join(", ") || "Downstream components";
  return (
    <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:sticky xl:top-4 xl:self-start">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-blue-600">{component.category}</p>
          <h2 className="mt-1 text-2xl font-black">{displayName}</h2>
          <p className="text-sm font-bold text-slate-500">{secondaryName}</p>
        </div>
        <Wind className="h-6 w-6 text-blue-600" />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <InfoPill label="SVG ID" value={component.key} />
        <InfoPill label="Current PSI" value={`${componentPsi(component, simulation)} PSI`} />
      </div>
      <InfoBlock label="Exact system location" value={component.location} />
      <InfoBlock label="Circuit" value={circuitStyles[component.circuit]?.name || component.circuit} />
      <InfoBlock label="Function" value={component.function} />
      <InfoBlock label="Air input source" value={inputs} />
      <InfoBlock label="Air output destination" value={outputs} />
      <InfoBlock label="Normal condition" value={component.normal} />
      <InfoBlock label="Common failure symptoms" value={component.symptoms} />
      <InfoBlock label="Inspection steps" value={component.inspect} />
      <InfoBlock label="Possible causes" value={component.causes} />
      <InfoBlock label="Recommended repair" value={component.repair} />
      <InfoBlock label="Related components" value={component.related.join(", ")} />
      <InfoBlock label="Related lines" value={connectedLines.map((line) => line.name).join(", ") || "None"} />
      <InfoBlock label="Diagnostic results" value={diagnosticSummary(diagnosticResults) || "No guided diagnostic steps marked yet."} />

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

      <input ref={fileInputRef} type="file" multiple accept="image/*" className="hidden" onChange={(event) => onPhotos(Array.from(event.target.files || []))} />
      <button type="button" onClick={() => fileInputRef.current?.click()} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-black text-slate-700 hover:bg-slate-50">
        Upload Photo {photos.length ? `(${photos.length})` : ""}
      </button>
      <div className="mt-4 grid gap-2">
        <PrimaryAction onClick={onAddJob} icon={<ClipboardList className="h-4 w-4" />} label="Add to Job" />
        <PrimaryAction onClick={onAddJob} icon={<Wrench className="h-4 w-4" />} label="Add Diagnosis" />
        <PrimaryAction onClick={onNearby} icon={<MapPin className="h-4 w-4" />} label="Add to Nearby Parts" tone="amber" />
        <PrimaryAction onClick={onSave} icon={<Save className="h-4 w-4" />} label={saving ? "Saving..." : "Save Inspection"} tone="green" disabled={saving} />
      </div>
    </aside>
  );
}

function DiagnosticsPanel({ simulation, problem, selectedProblem, results, onProblem, onResult, onAction, onFault }) {
  const actions = [
    "Start Engine / Compressor",
    "Stop Compressor",
    "Build Air Pressure",
    "Apply Foot Brake",
    "Release Foot Brake",
    "Set Tractor Parking Brakes",
    "Release Tractor Parking Brakes",
    "Supply Air to Trailer",
    "Pull Trailer Supply Valve",
    "Drain Supply Tank",
    "Drain Primary Tank",
    "Drain Secondary Tank",
    "Reset System",
  ];
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <Gauge className="h-5 w-5 text-blue-600" />
        <div>
          <h2 className="text-lg font-black">Pressure Simulation and Diagnostic Mode</h2>
          <p className="text-sm font-semibold text-slate-500">{simulation.state}</p>
        </div>
      </div>
      <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-6">
        {actions.map((action) => (
          <button key={action} type="button" onClick={() => onAction(action)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-700 hover:border-blue-300 hover:bg-blue-50">
            {action}
          </button>
        ))}
      </div>
      <h3 className="mt-5 text-sm font-black uppercase tracking-wide text-slate-500">Failure simulations</h3>
      <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-5">
        {faultSimulations.map((fault) => (
          <button key={fault} type="button" onClick={() => onFault(fault)} className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs font-black text-red-700 hover:bg-red-100">
            {fault}
          </button>
        ))}
      </div>
      <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div className="grid gap-3 lg:grid-cols-[280px_minmax(0,1fr)]">
          <label className="text-xs font-black uppercase tracking-wide text-slate-500">
            Guided diagnostic mode
            <select value={selectedProblem} onChange={(event) => onProblem(event.target.value)} className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold outline-none focus:border-blue-500">
              {diagnosticProblems.map((item) => <option key={item.label}>{item.label}</option>)}
            </select>
          </label>
          <div className="grid gap-2">
            {problem.steps.map((step, index) => (
              <div key={step} className="grid gap-2 rounded-xl bg-white p-3 md:grid-cols-[1fr_190px] md:items-center">
                <p className="text-sm font-bold text-slate-700">{index + 1}. {step}</p>
                <select value={results[step] || "Not Tested"} onChange={(event) => onResult(step, event.target.value)} className="h-9 rounded-xl border border-slate-200 px-2 text-xs font-black text-slate-700">
                  {statusOptions.map((item) => <option key={item}>{item}</option>)}
                </select>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function SavedInspections({ inspections, jobs, onRefresh, onOpen }) {
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
            <button key={item.id} type="button" onClick={() => onOpen(item.svg_component_id || item.component_key)} className="rounded-2xl border border-slate-200 p-4 text-left hover:bg-blue-50">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-black">{item.component_name}</p>
                  <p className="text-sm font-semibold text-slate-500">{item.component_name_es || item.vehicle_section}</p>
                </div>
                <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black text-slate-600">{item.condition}</span>
              </div>
              <p className="mt-2 text-xs font-bold text-blue-700">{item.svg_component_id || item.component_key}</p>
              <p className="mt-3 text-sm font-semibold text-slate-600">{item.recommendation}</p>
              <p className="mt-3 text-xs font-bold text-slate-400">{job ? `${job.invoice_number || job.id} - ${job.company || ""}` : "No job attached"} - {formatDate(item.created_at)}</p>
            </button>
          );
        })}
        {!inspections.length && <p className="rounded-xl bg-slate-50 p-4 text-sm font-bold text-slate-500">No saved inspections yet.</p>}
      </div>
    </section>
  );
}

function JobSelectorModal({ jobs, search, saving, onSearch, onSelect, onClose }) {
  return (
    <Modal title="Attach Air System Diagnosis to Job" onClose={onClose}>
      <div className="relative">
        <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
        <input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Invoice, customer, location, technician..." className="h-10 w-full rounded-xl border border-slate-200 pl-9 pr-3 text-sm font-semibold outline-none focus:border-blue-500" />
      </div>
      <div className="mt-4 max-h-[55vh] space-y-2 overflow-auto">
        {jobs.map((job) => (
          <button key={job.id} type="button" onClick={() => onSelect(job)} disabled={saving} className="w-full rounded-xl border border-slate-200 p-3 text-left hover:bg-blue-50 disabled:opacity-60">
            <p className="font-black">{job.invoice_number || job.id} - {job.company || "No company"}</p>
            <p className="mt-1 text-sm font-semibold text-slate-500">{job.location || "No location"} - {job.tech || "No tech"} - {job.status || "No status"}</p>
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
              <p className="font-black">{job.invoice_number || job.id} - {job.company || "No company"}</p>
              <p className="text-sm font-semibold text-slate-500">{job.location || "No location"}</p>
            </button>
          ))}
        </div>
      </div>
    </Modal>
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

function PsiBadge({ label, value }) {
  const tone = value >= 90 ? "text-emerald-700" : value >= 60 ? "text-amber-700" : "text-red-700";
  return (
    <div className="rounded-xl bg-white px-3 py-2 shadow-sm">
      <p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`text-xl font-black ${tone}`}>{value}</p>
    </div>
  );
}

function ColorLegend() {
  return (
    <div className="sticky bottom-0 z-10 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-sm backdrop-blur">
      <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">Color legend</p>
      <div className="flex flex-wrap gap-2">
        {Object.entries(circuitStyles).map(([key, item]) => (
          <span key={key} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-700">
            <span className="h-2.5 w-8 rounded-full" style={{ backgroundColor: item.color }} />
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function IconButton({ title, onClick, children }) {
  return <button type="button" title={title} onClick={onClick} className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-50">{children}</button>;
}

function PrimaryAction({ onClick, icon, label, tone = "blue", disabled = false }) {
  const styles = {
    blue: "bg-blue-600 text-white hover:bg-blue-700",
    amber: "border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100",
    green: "border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
  };
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-black disabled:opacity-60 ${styles[tone] || styles.blue}`}>
      {icon}
      {label}
    </button>
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

function InfoPill({ label, value }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 break-words text-xs font-black text-slate-800">{value}</p>
    </div>
  );
}

function labelPoint(path) {
  const numbers = path.match(/-?\d+(\.\d+)?/g)?.map(Number) || [100, 100];
  const middle = Math.max(0, Math.floor(numbers.length / 2) - 1);
  return { x: numbers[middle] || 100, y: (numbers[middle + 1] || 100) - 10 };
}

function linePressure(line, simulation) {
  if (line.circuit === "charging") return simulation.supply || 0;
  if (line.circuit === "primary") return simulation.primary || 0;
  if (line.circuit === "secondary") return simulation.secondary || 0;
  if (line.circuit === "trailerSupply") return simulation.trailerSupplied ? simulation.trailer || 0 : 0;
  if (line.circuit === "trailerControl") return simulation.serviceApplied ? Math.max(0, simulation.trailer - 8) : 0;
  if (line.circuit === "parkingControl" || line.circuit === "trailerParking") return simulation.parkingSet ? 0 : simulation.primary || 0;
  if (line.circuit === "parkSupply") return simulation.supply || 0;
  if (line.circuit === "antiCompound") return simulation.serviceApplied ? simulation.primary || 0 : 0;
  return 0;
}

function componentPsi(component, simulation) {
  if (component.circuit === "charging" || component.circuit === "parkSupply") return simulation.supply;
  if (component.circuit === "primary" || component.circuit === "antiCompound") return simulation.primary;
  if (component.circuit === "secondary") return simulation.secondary;
  if (component.circuit === "trailerSupply" || component.circuit === "trailerControl" || component.circuit === "trailerParking") return simulation.trailer;
  if (component.circuit === "parkingControl") return simulation.parkingSet ? 0 : simulation.primary;
  return Math.max(simulation.supply, simulation.primary, simulation.secondary, simulation.trailer);
}

function applySimulation(current, action) {
  if (action === "Reset System") return { supply: 0, primary: 0, secondary: 0, trailer: 0, state: "System inactive", fault: "", serviceApplied: false, parkingSet: true, trailerSupplied: false, compressorRunning: false };
  if (action === "Start Engine / Compressor") return { ...current, compressorRunning: true, supply: Math.max(current.supply, 35), state: "Compressor running" };
  if (action === "Stop Compressor") return { ...current, compressorRunning: false, state: "Compressor stopped" };
  if (action === "Build Air Pressure") return { ...current, supply: 125, primary: 120, secondary: 120, trailer: current.trailerSupplied ? 110 : current.trailer, state: "Normal air pressure", fault: "" };
  if (action === "Apply Foot Brake") return { ...current, primary: Math.max(0, current.primary - 8), secondary: Math.max(0, current.secondary - 8), trailer: current.trailerSupplied ? Math.max(0, current.trailer - 6) : current.trailer, serviceApplied: true, state: "Service brakes applied" };
  if (action === "Release Foot Brake") return { ...current, serviceApplied: false, state: "Service brakes released" };
  if (action === "Set Tractor Parking Brakes") return { ...current, parkingSet: true, state: "Parking brakes set" };
  if (action === "Release Tractor Parking Brakes") return { ...current, parkingSet: false, state: "Parking brakes released" };
  if (action === "Supply Air to Trailer") return { ...current, trailerSupplied: true, trailer: current.primary > 80 ? 105 : 55, state: "Trailer supplied" };
  if (action === "Pull Trailer Supply Valve") return { ...current, trailerSupplied: false, trailer: 0, parkingSet: true, fault: action, state: "Trailer emergency brakes applied" };
  if (action === "Drain Supply Tank") return { ...current, supply: 0, primary: Math.min(current.primary, 40), secondary: Math.min(current.secondary, 40), state: "Supply tank drained", fault: "Supply reservoir leak" };
  if (action === "Drain Primary Tank") return { ...current, primary: 0, state: "Primary tank drained", fault: "Rear axle service reservoir leak" };
  if (action === "Drain Secondary Tank") return { ...current, secondary: 0, state: "Secondary tank drained", fault: "Front axle service reservoir leak" };
  return current;
}

function faultTarget(fault) {
  const normalized = String(fault || "").toLowerCase();
  if (normalized.includes("compressor")) return { componentKey: "compressor", lineId: "line-compressor-dryer", pressure: { supply: 20, primary: 0, secondary: 0, trailer: 0 } };
  if (normalized.includes("governor")) return { componentKey: "d2-governor", lineId: "line-governor-compressor", pressure: { supply: 150, primary: 95, secondary: 95 } };
  if (normalized.includes("dryer")) return { componentKey: "air-dryer", lineId: "line-dryer-supply", pressure: { supply: 45, primary: 25, secondary: 25 } };
  if (normalized.includes("supply reservoir")) return { componentKey: "supply-reservoir", lineId: "line-dryer-supply", pressure: { supply: 30, primary: 35, secondary: 35 } };
  if (normalized.includes("front axle")) return { componentKey: "front-axle-service-reservoir", lineId: "line-supply-front", pressure: { secondary: 25 } };
  if (normalized.includes("rear axle")) return { componentKey: "rear-axle-service-reservoir", lineId: "line-supply-rear", pressure: { primary: 25 } };
  if (normalized.includes("foot")) return { componentKey: "foot-brake-valve", lineId: "line-foot-service", pressure: { primary: 70, secondary: 70 } };
  if (normalized.includes("tp-3") || normalized.includes("tractor protection")) return { componentKey: "tp3-tractor-protection-valve", lineId: "line-tp3-supply", pressure: { trailer: 0 } };
  if (normalized.includes("red")) return { componentKey: "trailer-supply-line", lineId: "line-tp3-supply", pressure: { trailer: 0 } };
  if (normalized.includes("blue")) return { componentKey: "trailer-control-service-line", lineId: "line-service-r12", pressure: { trailer: 90 } };
  if (normalized.includes("r-12")) return { componentKey: "r12-relay-valve", lineId: "line-r12-chambers", pressure: { trailer: 55 } };
  if (normalized.includes("r-14")) return { componentKey: "r14-relay-valve", lineId: "line-rear-relay", pressure: { primary: 60 } };
  if (normalized.includes("brake chamber")) return { componentKey: "trailer-brake-chambers", lineId: "line-r12-chambers", pressure: { trailer: 45 } };
  if (normalized.includes("spring brake")) return { componentKey: "sr5-trailer-spring-brake-valve", lineId: "line-sr5-spring-chambers", pressure: { trailer: 35 } };
  if (normalized.includes("trailer brakes locked")) return { componentKey: "sr5-trailer-spring-brake-valve", lineId: "line-trailer-reservoir-sr5", pressure: { trailer: 20 } };
  if (normalized.includes("trailer brakes not applying")) return { componentKey: "r12-relay-valve", lineId: "line-service-r12", pressure: { trailer: 75 } };
  return { componentKey: "low-pressure-indicator", lineId: "line-dryer-supply", pressure: { supply: 65, primary: 60, secondary: 60, trailer: 35 } };
}

function buildInspectionPayload({ component, condition, notes, simulation, job, currentUser, diagnosticResults, connectedLines }) {
  return {
    job_id: job?.id || null,
    created_by: currentUser?.id || currentUser?.authUserId || null,
    assigned_technician_id: job?.technician_id || null,
    vehicle_section: component.location.includes("Trailer") ? "Trailer" : "Truck",
    component_key: component.key,
    svg_component_id: component.key,
    component_name: component.name,
    component_name_es: component.nameEs,
    condition,
    failure_type: simulation.fault || "",
    symptoms: component.symptoms,
    possible_causes: component.causes,
    recommendation: component.repair,
    dispatcher_notes: notes,
    diagnostic_results: Object.entries(diagnosticResults || {}).map(([step, result]) => ({ step, result })),
    required_parts: component.related.join(", "),
    related_line_ids: connectedLines.map((line) => line.id),
    primary_psi: simulation.primary,
    secondary_psi: simulation.secondary,
    trailer_psi: simulation.trailer,
    simulation_type: simulation.fault || simulation.state,
  };
}

function diagnosticSummary(results) {
  return Object.entries(results || {}).map(([step, result]) => `${step}: ${result}`).join("; ");
}

function googleMapsNearbyLink(term, location) {
  return `https://www.google.com/maps/search/${encodeURIComponent(`${term} near ${location || ""}`).replace(/%20/g, "+")}`;
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}
