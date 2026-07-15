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

const componentDefaults = {
  Controls: { fn: "Operator control for air-brake delivery, park, release, or warning behavior.", normal: "Control moves freely and sends the expected air signal without leakage.", symptoms: "Air leak, stuck control, wrong delivery pressure, or no system response.", inspect: "Verify supply pressure, operate the control, listen for leaks, and compare output pressure to the diagram circuit.", causes: "Internal seal leak, contamination, loose fitting, blocked line, or low supply pressure.", repair: "Repair the line/fitting or replace the control valve and retest." },
  Valves: { fn: "Routes, meters, relays, checks, or exhausts air pressure in the Bendix circuit.", normal: "Valve receives input air and delivers/exhausts air according to the selected operating state.", symptoms: "Slow apply/release, constant exhaust leak, backfeed, locked brakes, or no delivery.", inspect: "Check inlet, delivery, control, and exhaust ports with the related circuit pressurized.", causes: "Contamination, failed diaphragm, worn seat, incorrect plumbing, or damaged valve body.", repair: "Replace or service the valve and verify line routing." },
  Reservoirs: { fn: "Stores compressed air for the assigned brake circuit.", normal: "Reservoir charges, holds pressure, and drains cleanly.", symptoms: "Low pressure, repeated compressor cycling, visible damage, water/oil contamination, or drain leak.", inspect: "Pressure test tank, fittings, drain, check valves, and connected delivery lines.", causes: "Tank corrosion, cracked fitting, leaking drain, failed check valve, or upstream dryer issue.", repair: "Repair fittings/drain or replace reservoir; service upstream air dryer if contaminated." },
  Lines: { fn: "Carries circuit pressure between Bendix components.", normal: "Line holds pressure and routes air to the correct destination with no rubbing, kinks, or leaks.", symptoms: "Leak, restricted airflow, wrong circuit behavior, low delivery pressure, or delayed brake response.", inspect: "Trace the line visually and verify pressure at both ends during the matching brake operation.", causes: "Damaged hose, bad gladhand seal, kinked nylon line, cracked fitting, or wrong connection.", repair: "Repair or replace the damaged line and verify pressure delivery." },
  Brakes: { fn: "Converts air pressure into brake application or spring brake release force.", normal: "Chamber applies/releases smoothly with correct pushrod stroke and no leaks.", symptoms: "Air leak, locked wheel, weak braking, excessive stroke, dragging brakes, or chamber damage.", inspect: "Apply/release brakes, listen for leaks, inspect chamber condition, and measure stroke.", causes: "Diaphragm leak, broken spring, foundation brake issue, relay valve issue, or low delivery pressure.", repair: "Replace damaged chamber and inspect related foundation brake hardware." },
  Charging: { fn: "Builds, dries, governs, stores, or protects system air supply.", normal: "System builds to cut-out pressure in normal time and purges/holds pressure correctly.", symptoms: "Slow build, no build, wet tanks, continuous purge, overpressure, or low-air warning.", inspect: "Measure build rate, governor cut-in/cut-out, dryer purge, and reservoir retention.", causes: "Worn compressor, bad governor, dryer restriction, leaking safety valve, or supply leak.", repair: "Repair the charging fault and verify normal build/cut-out." },
};

const components = [
  c("mv3-control-module", "MV-3 Control Module", "Modulo de control MV-3", "Truck / Tractor System", "Controls", "parkSupply", 650, 670, ["system-park-control", "trailer-park-control", "trailer-release-control"]),
  c("system-park-control", "System Park control", "Control parqueo sistema", "Truck / Tractor System", "Controls", "parkingControl", 1050, 440, ["mv3-control-module", "pp1-valve"]),
  c("trailer-park-control", "Trailer Park control", "Control parqueo trailer", "Truck / Tractor System", "Controls", "trailerParking", 1200, 440, ["mv3-control-module", "pp7-valve"]),
  c("trailer-release-control", "Trailer Release control", "Control liberacion trailer", "Truck / Tractor System", "Controls", "trailerSupply", 1370, 440, ["mv3-control-module", "tp3-tractor-protection-valve"]),
  c("pp1-valve", "PP-1 valve", "Valvula PP-1", "Truck / Tractor System", "Valves", "parkingControl", 970, 675, ["system-park-control", "sr1-spring-brake-valve"]),
  c("pp7-valve", "PP-7 valve", "Valvula PP-7", "Truck / Tractor System", "Valves", "parkSupply", 1155, 725, ["trailer-park-control", "tp3-tractor-protection-valve"]),
  c("dc3-stop-light-valve", "DC-3 Double Check and Stop Light", "DC-3 doble check y luz de freno", "Truck / Tractor System", "Valves", "secondary", 1890, 675, ["e7-e6-brake-valve", "tp3-tractor-protection-valve"]),
  c("tp3-tractor-protection-valve", "TP-3 Tractor Protection", "TP-3 proteccion del tractor", "Truck / Tractor System", "Valves", "parkSupply", 2325, 635, ["trailer-supply-line", "trailer-service-line"]),
  c("brake-chambers", "Brake Chambers", "Camaras de freno", "Truck / Tractor System", "Brakes", "secondary", 670, 1190, ["qr1-quick-release-valve"]),
  c("qr1-quick-release-valve", "QR-1 Quick Release Valve", "Valvula QR-1 escape rapido", "Truck / Tractor System", "Valves", "secondary", 790, 1785, ["brake-chambers"]),
  c("lq5-bobtail-ratio-valve", "LQ-5 Bobtail Ratio Valve", "Valvula LQ-5 bobtail ratio", "Truck / Tractor System", "Valves", "secondary", 1165, 1390, ["trailer-control-valve", "qr1-quick-release-valve"]),
  c("trailer-control-valve", "Trailer Control Valve", "Valvula control trailer", "Truck / Tractor System", "Valves", "secondary", 1735, 1415, ["e7-e6-brake-valve", "tp3-tractor-protection-valve"]),
  c("e7-e6-brake-valve", "E-7 / E-6 Brake Valve", "Valvula de freno E-7 / E-6", "Truck / Tractor System", "Controls", "primary", 1775, 1240, ["front-axle-service-reservoir", "rear-axle-service-reservoir"]),
  c("sr1-spring-brake-valve", "SR-1 Spring Brake Valve", "Valvula SR-1 spring brake", "Truck / Tractor System", "Valves", "parkingControl", 2580, 1110, ["tractor-spring-brake-chambers"]),
  c("dc4-double-check-valve", "DC-4 Double Check Valve", "Valvula DC-4 doble check", "Truck / Tractor System", "Valves", "primary", 2040, 1710, ["rear-axle-service-reservoir", "r14-relay-valve"]),
  c("compressor", "Compressor", "Compresor", "Truck / Tractor System", "Charging", "charging", 1025, 2400, ["d2-governor", "air-dryer"]),
  c("d2-governor", "D-2 Governor", "Gobernador D-2", "Truck / Tractor System", "Charging", "charging", 1230, 2410, ["compressor"]),
  c("air-dryer", "Air Dryer", "Secador de aire", "Truck / Tractor System", "Charging", "charging", 1160, 2075, ["supply-reservoir"]),
  c("safety-valve", "Safety Valve", "Valvula de seguridad", "Truck / Tractor System", "Valves", "charging", 1455, 2050, ["supply-reservoir"]),
  c("supply-reservoir", "Supply Reservoir", "Tanque de suministro", "Truck / Tractor System", "Reservoirs", "charging", 1615, 2190, ["front-axle-service-reservoir", "rear-axle-service-reservoir"]),
  c("check-valve", "Check Valve", "Valvula check", "Truck / Tractor System", "Valves", "charging", 1880, 2290, ["supply-reservoir"]),
  c("front-axle-service-reservoir", "Front Axle Service Reservoir", "Tanque servicio eje delantero", "Truck / Tractor System", "Reservoirs", "secondary", 2440, 1995, ["e7-e6-brake-valve"]),
  c("rear-axle-service-reservoir", "Rear Axle Service Reservoir", "Tanque servicio eje trasero", "Truck / Tractor System", "Reservoirs", "primary", 2190, 2425, ["r14-relay-valve"]),
  c("lp3-low-pressure-indicator", "LP-3 Low Pressure Indicator", "Indicador baja presion LP-3", "Truck / Tractor System", "Controls", "secondary", 2150, 2305, ["pressure-gauges"]),
  c("pressure-gauges", "Pressure Gauges", "Manometros de presion", "Truck / Tractor System", "Controls", "primary", 2490, 1840, ["lp3-low-pressure-indicator"]),
  c("r14-relay-valve", "R-14 Relay Valve", "Valvula relay R-14", "Truck / Tractor System", "Valves", "primary", 3220, 1810, ["tractor-spring-brake-chambers"]),
  c("bpr1-bobtail-proportioning-relay-valve", "BP-R1 Bobtail Proportioning Relay Valve", "Valvula BP-R1 proporcionadora bobtail", "Truck / Tractor System", "Valves", "primary", 3810, 1780, ["r14-relay-valve"]),
  c("tractor-spring-brake-chambers", "Tractor Spring Brake Chambers", "Camaras spring brake tractor", "Truck / Tractor System", "Brakes", "parkingControl", 3370, 2165, ["sr1-spring-brake-valve", "r14-relay-valve"]),
  c("trailer-air-dryer", "Trailer Air Dryer", "Secador de aire trailer", "Trailer System", "Charging", "trailerSupply", 4210, 1070, ["trailer-supply-line"]),
  c("trailer-supply-line", "Red Trailer Supply Line", "Linea roja suministro trailer", "Trailer System", "Lines", "trailerSupply", 4650, 760, ["trailer-air-dryer", "sr5-trailer-spring-brake-valve"]),
  c("trailer-service-line", "Blue Trailer Service Line", "Linea azul servicio trailer", "Trailer System", "Lines", "trailerControl", 4640, 675, ["r12-relay-valve"]),
  c("anti-compound-line", "Anti-Compound Line", "Linea anti-compound", "Trailer System", "Lines", "antiCompound", 4520, 1670, ["sr5-trailer-spring-brake-valve"]),
  c("sr5-trailer-spring-brake-valve", "SR-5 Trailer Spring Brake Valve", "Valvula SR-5 spring brake trailer", "Trailer System", "Valves", "trailerParking", 4840, 1780, ["trailer-reservoirs", "trailer-upper-left-spring-brake-chamber", "trailer-lower-left-spring-brake-chamber"]),
  c("r12-relay-valve", "R-12 Relay Valve", "Valvula relay R-12", "Trailer System", "Valves", "trailerControl", 5435, 1780, ["trailer-upper-right-spring-brake-chamber", "trailer-lower-right-spring-brake-chamber"]),
  c("trailer-reservoirs", "Trailer Reservoirs", "Tanques del trailer", "Trailer System", "Reservoirs", "trailerSupply", 5060, 1740, ["r12-relay-valve", "sr5-trailer-spring-brake-valve"]),
  c("trailer-upper-left-spring-brake-chamber", "Upper-left Spring Brake Chamber", "Camara spring brake superior izquierda", "Trailer System", "Brakes", "trailerParking", 5170, 1160, ["sr5-trailer-spring-brake-valve"]),
  c("trailer-upper-right-spring-brake-chamber", "Upper-right Spring Brake Chamber", "Camara spring brake superior derecha", "Trailer System", "Brakes", "trailerControl", 6120, 1160, ["r12-relay-valve"]),
  c("trailer-lower-left-spring-brake-chamber", "Lower-left Spring Brake Chamber", "Camara spring brake inferior izquierda", "Trailer System", "Brakes", "trailerParking", 5170, 2400, ["sr5-trailer-spring-brake-valve"]),
  c("trailer-lower-right-spring-brake-chamber", "Lower-right Spring Brake Chamber", "Camara spring brake inferior derecha", "Trailer System", "Brakes", "trailerControl", 6120, 2400, ["r12-relay-valve"]),
  c("towing-r12p-pilot-relay-valve", "R-12P Pilot Relay Valve", "Valvula relay piloto R-12P", "Towing Trailer", "Valves", "trailerControl", 1390, 3490, ["towing-service-line", "towing-r12-relay-valve"]),
  c("towing-sr5-valve", "SR-5 Valve", "Valvula SR-5", "Towing Trailer", "Valves", "trailerParking", 1660, 4000, ["towing-upper-brake-chamber", "towing-lower-brake-chamber"]),
  c("towing-r12-relay-valve", "R-12 Relay Valve", "Valvula relay R-12", "Towing Trailer", "Valves", "trailerControl", 2180, 4080, ["towing-upper-brake-chamber", "towing-lower-brake-chamber"]),
  c("towing-quick-release-valve", "Quick Release Valve", "Valvula escape rapido", "Towing Trailer", "Valves", "trailerSupply", 2715, 4240, ["towing-pintle-hook-clamping-chamber"]),
  c("towing-pintle-hook-clamping-chamber", "Pintle Hook Clamping Chamber", "Camara abrazadera pintle hook", "Towing Trailer", "Brakes", "trailerSupply", 3025, 4120, ["towing-quick-release-valve"]),
  c("towing-service-line", "Service Line", "Linea de servicio", "Towing Trailer", "Lines", "trailerControl", 1040, 3500, ["towing-r12p-pilot-relay-valve"]),
  c("towing-supply-line", "Supply Line", "Linea de suministro", "Towing Trailer", "Lines", "trailerSupply", 1010, 4500, ["towing-sr5-valve"]),
  c("towing-check-valve", "Check Valve", "Valvula check", "Towing Trailer", "Valves", "trailerSupply", 2525, 3510, ["towing-supply-line"]),
  c("towing-upper-brake-chamber", "Upper Brake Chamber", "Camara de freno superior", "Towing Trailer", "Brakes", "trailerParking", 2070, 3150, ["towing-sr5-valve", "towing-r12-relay-valve"]),
  c("towing-lower-brake-chamber", "Lower Brake Chamber", "Camara de freno inferior", "Towing Trailer", "Brakes", "trailerParking", 2075, 4800, ["towing-sr5-valve", "towing-r12-relay-valve"]),
  c("dolly-r12p-pilot-relay-valve", "R-12P Pilot Relay Valve", "Valvula relay piloto R-12P", "Converter Dolly", "Valves", "trailerControl", 4100, 3500, ["dolly-service-line", "dolly-re6nc-relay-emergency-valve"]),
  c("dolly-check-valve", "Check Valve", "Valvula check", "Converter Dolly", "Valves", "trailerSupply", 4200, 3635, ["dolly-supply-line"]),
  c("dolly-pr3-reservoir-control", "PR-3 Reservoir Control", "Control reservorio PR-3", "Converter Dolly", "Valves", "trailerSupply", 5200, 3710, ["dolly-reservoir"]),
  c("dolly-reservoir", "Reservoir", "Reservorio", "Converter Dolly", "Reservoirs", "trailerSupply", 5370, 3915, ["dolly-re6nc-relay-emergency-valve"]),
  c("dolly-re6nc-relay-emergency-valve", "RE-6NC Relay Emergency Valve", "Valvula emergencia RE-6NC", "Converter Dolly", "Valves", "trailerSupply", 5860, 4070, ["dolly-upper-brake-chamber", "dolly-lower-brake-chamber"]),
  c("dolly-sv1-synchro-valve", "SV-1 Synchro Valve", "Valvula synchro SV-1", "Converter Dolly", "Valves", "trailerSupply", 4235, 4220, ["dolly-pp1-control"]),
  c("dolly-pp1-control", "PP-1 Control", "Control PP-1", "Converter Dolly", "Controls", "trailerSupply", 3850, 4760, ["dolly-sv1-synchro-valve"]),
  c("dolly-supply-line-check-valve", "Supply Line Check Valve", "Valvula check linea suministro", "Converter Dolly", "Valves", "trailerSupply", 3975, 4475, ["dolly-supply-line"]),
  c("dolly-service-line", "Service Line", "Linea de servicio", "Converter Dolly", "Lines", "trailerControl", 3780, 3750, ["dolly-r12p-pilot-relay-valve"]),
  c("dolly-supply-line", "Supply Line", "Linea de suministro", "Converter Dolly", "Lines", "trailerSupply", 3770, 4490, ["dolly-pr3-reservoir-control"]),
  c("dolly-upper-brake-chamber", "Upper Brake Chamber", "Camara de freno superior", "Converter Dolly", "Brakes", "trailerControl", 5480, 3090, ["dolly-re6nc-relay-emergency-valve"]),
  c("dolly-lower-brake-chamber", "Lower Brake Chamber", "Camara de freno inferior", "Converter Dolly", "Brakes", "trailerControl", 5480, 4775, ["dolly-re6nc-relay-emergency-valve"]),
];

const lines = [
  l("truck-charging", "Compressor to supply reservoir", "charging", "compressor", "supply-reservoir", "M 1025 2400 C 1120 2070 1320 1940 1615 2190", 115),
  l("truck-secondary", "Front axle secondary circuit", "secondary", "front-axle-service-reservoir", "e7-e6-brake-valve", "M 2440 1995 C 2320 1750 2050 1400 1775 1240", 110),
  l("truck-primary", "Rear axle primary circuit", "primary", "rear-axle-service-reservoir", "r14-relay-valve", "M 2190 2425 C 2680 2380 3000 2100 3220 1810", 110),
  l("truck-parking", "Tractor spring brake control", "parkingControl", "sr1-spring-brake-valve", "tractor-spring-brake-chambers", "M 2580 1110 C 2980 1280 3220 1720 3370 2165", 95),
  l("tractor-service-line", "Blue service line", "trailerControl", "tp3-tractor-protection-valve", "trailer-service-line", "M 2325 635 C 3100 650 3850 655 4640 675", 85),
  l("tractor-supply-line", "Red supply line", "trailerSupply", "tp3-tractor-protection-valve", "trailer-supply-line", "M 2325 760 C 3100 770 3850 760 4650 760", 110),
  l("trailer-supply", "Trailer red supply to SR-5", "trailerSupply", "trailer-supply-line", "sr5-trailer-spring-brake-valve", "M 4650 760 C 4780 1250 4820 1550 4840 1780", 105),
  l("trailer-service", "Trailer blue service to R-12", "trailerControl", "trailer-service-line", "r12-relay-valve", "M 4640 675 C 4800 1250 5150 1550 5435 1780", 80),
  l("trailer-reservoir-feed", "Trailer reservoir feed", "trailerSupply", "trailer-reservoirs", "r12-relay-valve", "M 5060 1740 C 5200 1740 5320 1760 5435 1780", 105),
  l("trailer-brake-delivery", "R-12 to trailer chambers", "trailerControl", "r12-relay-valve", "trailer-upper-right-spring-brake-chamber", "M 5435 1780 C 5660 1480 5900 1200 6120 1160", 80),
  l("trailer-spring-delivery", "SR-5 to trailer spring chambers", "trailerParking", "sr5-trailer-spring-brake-valve", "trailer-lower-left-spring-brake-chamber", "M 4840 1780 C 4920 2100 5050 2300 5170 2400", 95),
  l("towing-service", "Towing trailer service line", "trailerControl", "towing-service-line", "towing-r12p-pilot-relay-valve", "M 1040 3500 C 1180 3500 1300 3500 1390 3490", 80),
  l("towing-supply", "Towing trailer supply line", "trailerSupply", "towing-supply-line", "towing-sr5-valve", "M 1010 4500 C 1280 4500 1500 4260 1660 4000", 105),
  l("dolly-service", "Converter dolly service line", "trailerControl", "dolly-service-line", "dolly-r12p-pilot-relay-valve", "M 3780 3750 C 3890 3610 3980 3530 4100 3500", 80),
  l("dolly-supply", "Converter dolly supply line", "trailerSupply", "dolly-supply-line", "dolly-pr3-reservoir-control", "M 3770 4490 C 4300 4380 4880 4050 5200 3710", 105),
];

function c(id, name, nameEs, section, category, circuit, x, y, related = []) {
  const defaults = componentDefaults[category] || componentDefaults.Valves;
  return {
    id,
    key: id,
    name,
    nameEs,
    section,
    category,
    location: `${section} - ${name}`,
    circuit,
    function: defaults.fn,
    normal: defaults.normal,
    symptoms: defaults.symptoms,
    inspect: defaults.inspect,
    causes: defaults.causes,
    repair: defaults.repair,
    related,
    x,
    y,
  };
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
const diagramImageSrc = "/air-system/bendix-air-system-page-1.png";
const diagramWidth = 6600;
const diagramHeight = 5100;
const imageHotspots = [
  h("mv3-control-module", 470, 545, 340, 275),
  h("system-park-control", 1010, 385, 90, 90),
  h("trailer-park-control", 1170, 385, 90, 90),
  h("trailer-release-control", 1335, 385, 90, 90),
  h("pp1-valve", 900, 600, 125, 220),
  h("pp7-valve", 1075, 620, 155, 250),
  h("dc3-stop-light-valve", 1660, 610, 380, 235),
  h("tp3-tractor-protection-valve", 2160, 575, 470, 180),
  h("brake-chambers", 500, 965, 310, 520),
  h("qr1-quick-release-valve", 720, 1640, 170, 280),
  h("lq5-bobtail-ratio-valve", 1040, 1320, 195, 180),
  h("trailer-control-valve", 1560, 1320, 265, 215),
  h("e7-e6-brake-valve", 1675, 1100, 310, 265),
  h("sr1-spring-brake-valve", 2460, 975, 290, 240),
  h("dc4-double-check-valve", 1900, 1625, 270, 250),
  h("compressor", 915, 2300, 245, 210),
  h("d2-governor", 1125, 2335, 260, 145),
  h("air-dryer", 1050, 1900, 270, 350),
  h("safety-valve", 1335, 1960, 190, 230),
  h("supply-reservoir", 1480, 2030, 390, 310),
  h("check-valve", 1810, 2215, 160, 170),
  h("front-axle-service-reservoir", 2150, 1830, 520, 300),
  h("rear-axle-service-reservoir", 1840, 2310, 525, 320),
  h("lp3-low-pressure-indicator", 2040, 2220, 170, 190),
  h("pressure-gauges", 2380, 1735, 225, 215),
  h("r14-relay-valve", 3060, 1690, 240, 240),
  h("bpr1-bobtail-proportioning-relay-valve", 3620, 1620, 360, 325),
  h("tractor-spring-brake-chambers", 2920, 1000, 920, 1560),
  h("trailer-air-dryer", 4070, 875, 190, 370),
  h("trailer-supply-line", 4280, 735, 1180, 70),
  h("trailer-service-line", 4270, 620, 1180, 70),
  h("anti-compound-line", 4210, 1580, 510, 100),
  h("sr5-trailer-spring-brake-valve", 4660, 1660, 310, 330),
  h("r12-relay-valve", 5285, 1625, 290, 360),
  h("trailer-reservoirs", 4870, 1490, 900, 620),
  h("trailer-upper-left-spring-brake-chamber", 5000, 980, 350, 350),
  h("trailer-upper-right-spring-brake-chamber", 5920, 980, 350, 350),
  h("trailer-lower-left-spring-brake-chamber", 4990, 2260, 360, 350),
  h("trailer-lower-right-spring-brake-chamber", 5920, 2260, 360, 350),
  h("towing-r12p-pilot-relay-valve", 1300, 3380, 210, 205),
  h("towing-sr5-valve", 1540, 3880, 280, 270),
  h("towing-r12-relay-valve", 2080, 3920, 210, 285),
  h("towing-quick-release-valve", 2640, 4090, 170, 280),
  h("towing-pintle-hook-clamping-chamber", 2880, 3940, 310, 370),
  h("towing-service-line", 850, 3440, 580, 80),
  h("towing-supply-line", 850, 4450, 1620, 80),
  h("towing-check-valve", 2460, 3400, 170, 160),
  h("towing-upper-brake-chamber", 1870, 2980, 380, 360),
  h("towing-lower-brake-chamber", 1880, 4620, 380, 360),
  h("dolly-r12p-pilot-relay-valve", 3990, 3400, 230, 210),
  h("dolly-check-valve", 4100, 3530, 170, 170),
  h("dolly-pr3-reservoir-control", 5090, 3580, 260, 210),
  h("dolly-reservoir", 5200, 3710, 340, 590),
  h("dolly-re6nc-relay-emergency-valve", 5740, 3890, 360, 360),
  h("dolly-sv1-synchro-valve", 4140, 4080, 210, 300),
  h("dolly-pp1-control", 3710, 4580, 280, 300),
  h("dolly-supply-line-check-valve", 3880, 4370, 210, 190),
  h("dolly-service-line", 3600, 3640, 650, 95),
  h("dolly-supply-line", 3500, 4400, 1850, 90),
  h("dolly-upper-brake-chamber", 5290, 2910, 380, 360),
  h("dolly-lower-brake-chamber", 5290, 4600, 380, 360),
];
const hotspotByKey = new Map(imageHotspots.map((hotspot) => [hotspot.key, hotspot]));

function h(key, x, y, width, height) {
  return { key, x, y, width, height, points: `${x},${y} ${x + width},${y} ${x + width},${y + height} ${x},${y + height}` };
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
  const [showHotspots, setShowHotspots] = useState(false);
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
      const text = `${component.name} ${component.nameEs} ${component.section} ${component.category} ${component.location}`.toLowerCase();
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
    const link = document.createElement("a");
    link.href = diagramImageSrc;
    link.download = "bendix-air-system-page-1.png";
    link.click();
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
              showHotspots={showHotspots}
              language={language}
              onSearch={handleSearch}
              onFilter={setFilter}
              onZoom={setZoom}
              onPanMode={setPanMode}
              onShowHotspots={setShowHotspots}
              onLanguage={setLanguage}
              onFull={() => setFullScreen((value) => !value)}
              onFit={() => setZoom(0.18)}
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
              showHotspots={showHotspots}
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

function Toolbar({ search, filter, zoom, panMode, showHotspots, language, fullScreen, onSearch, onFilter, onZoom, onPanMode, onShowHotspots, onLanguage, onFull, onFit, onExportSvg, onExportPng, onPrintPdf }) {
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
        <IconButton title="Zoom in" onClick={() => onZoom((value) => Math.min(6, Number((value + 0.25).toFixed(2))))}><ZoomIn className="h-4 w-4" /></IconButton>
        <button type="button" onClick={() => onZoom(1)} className="h-9 rounded-xl border border-slate-200 px-3 text-xs font-black text-slate-700">Reset View</button>
        <button type="button" onClick={onFit} className="h-9 rounded-xl border border-slate-200 px-3 text-xs font-black text-slate-700">Fit Diagram</button>
        <button type="button" onClick={onFull} className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-black text-slate-700"><Maximize2 className="h-4 w-4" />{fullScreen ? "Exit Full" : "Full Screen"}</button>
        <button type="button" onClick={() => onPanMode((value) => !value)} className={`inline-flex h-9 items-center gap-2 rounded-xl px-3 text-xs font-black ${panMode ? "bg-blue-600 text-white" : "border border-slate-200 text-slate-700"}`}><Move className="h-4 w-4" />Pan Mode</button>
        <button type="button" onClick={() => onShowHotspots((value) => !value)} className={`h-9 rounded-xl px-3 text-xs font-black ${showHotspots ? "bg-orange-500 text-white" : "border border-slate-200 text-slate-700"}`}>Show Hotspots</button>
        <button type="button" onClick={() => onLanguage(language === "en" ? "es" : "en")} className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-black text-slate-700"><Languages className="h-4 w-4" />{language === "en" ? "English" : "Espanol"}</button>
        <button type="button" onClick={onExportSvg} className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-black text-slate-700"><Download className="h-4 w-4" />SVG</button>
        <button type="button" onClick={onExportPng} className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-black text-slate-700"><Download className="h-4 w-4" />PNG</button>
        <button type="button" onClick={onPrintPdf} className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-black text-slate-700"><FileText className="h-4 w-4" />PDF</button>
      </div>
    </section>
  );
}

function AirBrakeSvg({ diagramRef, components, selectedKey, selectedLineId, connectedLines, simulation, zoom, panMode, showHotspots, language, onSelect, onLineSelect }) {
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
      className={`max-h-[82vh] overflow-auto rounded-2xl border border-slate-200 bg-white shadow-sm ${panMode ? "cursor-grab active:cursor-grabbing" : ""}`}
    >
      <div
        className="diagram-stage relative origin-top-left bg-white"
        style={{
          width: `${diagramWidth}px`,
          height: `${diagramHeight}px`,
          transform: `scale(${zoom})`,
          transformOrigin: "top left",
        }}
      >
        <img
          src={diagramImageSrc}
          width={diagramWidth}
          height={diagramHeight}
          alt="Bendix truck tractor trailer towing trailer and converter dolly air brake system diagram"
          draggable="false"
          className="block h-full w-full select-none bg-white"
          style={{ imageRendering: "auto" }}
        />
        <svg
          id="air-system-svg"
          viewBox={`0 0 ${diagramWidth} ${diagramHeight}`}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label="Selectable air brake system component overlay"
          className="component-overlay absolute inset-0 h-full w-full"
        >
          <defs>
            <marker id="air-arrow" markerWidth="14" markerHeight="14" refX="12" refY="7" orient="auto">
              <path d="M 0 0 L 14 7 L 0 14 z" fill="#0f172a" />
            </marker>
            <style>{`
              .air-flow { stroke-dasharray: 42 32; animation: airFlow 1.05s linear infinite; }
              .air-fault { animation: airFault 0.8s ease-in-out infinite; }
              @keyframes airFlow { to { stroke-dashoffset: -140; } }
              @keyframes airFault { 0%,100% { opacity: 1; } 50% { opacity: .25; } }
            `}</style>
          </defs>

          {lines.map((line) => {
            const isSelected = selectedLineId === line.id || connectedIds.has(line.id);
            const isFaulted = simulation.fault && faultTarget(simulation.fault).lineId === line.id;
            const active = linePressure(line, simulation) > 15;
            return (
              <g key={line.id} className={isSelected ? "opacity-100" : selectedComponent ? "opacity-0" : "opacity-20"}>
                <path
                  id={`svg-line-${line.id}`}
                  d={line.path}
                  fill="none"
                  stroke={circuitStyles[line.circuit]?.color || "#64748b"}
                  strokeWidth={isSelected ? 30 : 18}
                  strokeLinecap="round"
                  markerEnd={active ? "url(#air-arrow)" : ""}
                  className={`${active ? "air-flow" : ""} ${isFaulted ? "air-fault" : ""} cursor-pointer transition-all`}
                  onClick={() => onLineSelect(line.id)}
                >
                  <title>{`${line.name} - ${circuitStyles[line.circuit]?.name || line.circuit} - ${linePressure(line, simulation)} PSI`}</title>
                </path>
                {isSelected && <text x={labelPoint(line.path).x} y={labelPoint(line.path).y} className="pointer-events-none fill-slate-900 text-[62px] font-black">
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
            const hotspot = hotspotByKey.get(component.key) || h(component.key, component.x - 80, component.y - 60, 160, 120);
            const debugFill = showHotspots ? "rgba(249,115,22,0.22)" : "transparent";
            return (
              <g
                key={component.key}
                id={`svg-${component.key}`}
                data-component-id={component.key}
                data-component-key={component.key}
                tabIndex="0"
                role="button"
                onClick={() => onSelect(component.key)}
                onTouchStart={() => onSelect(component.key)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") onSelect(component.key);
                }}
                className={`cursor-pointer transition-opacity ${!isVisible || faded ? "opacity-25" : "opacity-100"} ${isFaulted ? "air-fault" : ""}`}
              >
                <polygon
                  id={`component-${component.key}`}
                  data-component-id={component.key}
                  points={hotspot.points}
                  fill={isSelected ? "rgba(37,99,235,0.26)" : debugFill}
                  stroke={isSelected ? "#2563eb" : related ? "#0ea5e9" : showHotspots ? "#f97316" : "transparent"}
                  strokeWidth={isSelected ? 14 : related ? 10 : showHotspots ? 7 : 0}
                  className="transition-all hover:fill-blue-500/20 hover:stroke-blue-500"
                />
                {(isSelected || showHotspots) && (
                  <text x={hotspot.x + hotspot.width / 2} y={Math.max(60, hotspot.y - 24)} textAnchor="middle" className={`pointer-events-none text-[58px] font-black ${isSelected ? "fill-blue-700" : "fill-orange-700"}`}>
                    {showHotspots ? component.key : label}
                  </text>
                )}
                <title>{`${component.name} / ${component.nameEs}. ${component.section}. ${circuitStyles[component.circuit]?.name || component.circuit}. ${componentPsi(component, simulation)} PSI`}</title>
              </g>
            );
          })}
        </svg>
      </div>
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
      <InfoBlock label="Section" value={component.section || "Truck / Tractor System"} />
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
  if (normalized.includes("compressor")) return { componentKey: "compressor", lineId: "truck-charging", pressure: { supply: 20, primary: 0, secondary: 0, trailer: 0 } };
  if (normalized.includes("governor")) return { componentKey: "d2-governor", lineId: "truck-charging", pressure: { supply: 150, primary: 95, secondary: 95 } };
  if (normalized.includes("dryer")) return { componentKey: "air-dryer", lineId: "truck-charging", pressure: { supply: 45, primary: 25, secondary: 25 } };
  if (normalized.includes("supply reservoir")) return { componentKey: "supply-reservoir", lineId: "truck-charging", pressure: { supply: 30, primary: 35, secondary: 35 } };
  if (normalized.includes("front axle")) return { componentKey: "front-axle-service-reservoir", lineId: "truck-secondary", pressure: { secondary: 25 } };
  if (normalized.includes("rear axle")) return { componentKey: "rear-axle-service-reservoir", lineId: "truck-primary", pressure: { primary: 25 } };
  if (normalized.includes("foot")) return { componentKey: "e7-e6-brake-valve", lineId: "truck-secondary", pressure: { primary: 70, secondary: 70 } };
  if (normalized.includes("tp-3") || normalized.includes("tractor protection")) return { componentKey: "tp3-tractor-protection-valve", lineId: "tractor-supply-line", pressure: { trailer: 0 } };
  if (normalized.includes("red")) return { componentKey: "trailer-supply-line", lineId: "tractor-supply-line", pressure: { trailer: 0 } };
  if (normalized.includes("blue")) return { componentKey: "trailer-service-line", lineId: "tractor-service-line", pressure: { trailer: 90 } };
  if (normalized.includes("r-12")) return { componentKey: "r12-relay-valve", lineId: "trailer-service", pressure: { trailer: 55 } };
  if (normalized.includes("r-14")) return { componentKey: "r14-relay-valve", lineId: "truck-primary", pressure: { primary: 60 } };
  if (normalized.includes("brake chamber")) return { componentKey: "trailer-lower-right-spring-brake-chamber", lineId: "trailer-brake-delivery", pressure: { trailer: 45 } };
  if (normalized.includes("spring brake")) return { componentKey: "sr5-trailer-spring-brake-valve", lineId: "trailer-spring-delivery", pressure: { trailer: 35 } };
  if (normalized.includes("trailer brakes locked")) return { componentKey: "sr5-trailer-spring-brake-valve", lineId: "trailer-supply", pressure: { trailer: 20 } };
  if (normalized.includes("trailer brakes not applying")) return { componentKey: "r12-relay-valve", lineId: "trailer-service", pressure: { trailer: 75 } };
  return { componentKey: "lp3-low-pressure-indicator", lineId: "truck-charging", pressure: { supply: 65, primary: 60, secondary: 60, trailer: 35 } };
}

function buildInspectionPayload({ component, condition, notes, simulation, job, currentUser, diagnosticResults, connectedLines }) {
  return {
    job_id: job?.id || null,
    created_by: currentUser?.id || currentUser?.authUserId || null,
    assigned_technician_id: job?.technician_id || null,
    vehicle_section: component.section || "Truck / Tractor System",
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
