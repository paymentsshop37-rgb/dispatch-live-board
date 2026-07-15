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
  Maximize2,
  ZoomIn,
  ZoomOut,
  Languages,
  Route,
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
const diagramSections = [
  { id: "Truck", label: "TRUCK / TRACTOR SYSTEM" },
  { id: "Trailer", label: "TRAILER SYSTEM - 53 FT DRY VAN" },
  { id: "Towing Trailer", label: "TOWING TRAILER" },
  { id: "Converter Dolly", label: "CONVERTER DOLLY" },
];
const utilityTabs = ["Diagnostics", "Saved Inspections"];
const traceCircuits = [
  "All circuits",
  "Charging circuit",
  "Primary circuit",
  "Secondary circuit",
  "Parking circuit",
  "Trailer supply circuit",
  "Trailer service circuit",
];
const circuitStyles = {
  "Charging circuit": { color: "#111827", label: "Black: Charging" },
  "Primary circuit": { color: "#16a34a", label: "Green: Primary" },
  "Secondary circuit": { color: "#f97316", label: "Orange: Secondary" },
  "Parking circuit": { color: "#eab308", label: "Yellow: Parking / Control" },
  "Park / Supply": { color: "#dc2626", label: "Red: Park / Supply" },
  "Trailer supply circuit": { color: "#dc2626", label: "Red: Trailer Supply" },
  "Trailer service circuit": { color: "#2563eb", label: "Blue: Trailer Control / Service" },
  "Trailer parking circuit": { color: "#eab308", label: "Yellow: Trailer Parking" },
};
const truckAirLines = [
  airLine("charging-1", "Compressor to air dryer", "Charging circuit", "air-compressor", "air-dryer", "M 120 180 C 180 120 240 122 300 170"),
  airLine("charging-2", "Air dryer to supply reservoir", "Charging circuit", "air-dryer", "wet-tank", "M 300 170 C 370 190 405 225 450 245"),
  airLine("primary-feed", "Supply to primary reservoir", "Primary circuit", "wet-tank", "primary-tank", "M 450 245 C 510 205 570 205 625 230"),
  airLine("secondary-feed", "Supply to secondary reservoir", "Secondary circuit", "wet-tank", "secondary-tank", "M 450 245 C 500 300 560 305 625 275"),
  airLine("primary-service", "Primary service delivery", "Primary circuit", "foot-brake-valve", "relay-valves", "M 365 320 C 475 380 590 390 690 365"),
  airLine("secondary-service", "Secondary service delivery", "Secondary circuit", "foot-brake-valve", "quick-release-valves", "M 365 320 C 435 275 500 295 560 345"),
  airLine("parking-control", "Parking control to spring brakes", "Parking circuit", "parking-brake-valve", "spring-brake-chambers", "M 465 315 C 555 315 670 415 835 405"),
  airLine("tractor-protection", "Trailer supply through tractor protection", "Trailer supply circuit", "trailer-supply-valve", "red-glad-hand", "M 585 315 C 675 245 790 245 900 225"),
  airLine("trailer-service", "Trailer service blue line", "Trailer service circuit", "foot-brake-valve", "blue-glad-hand", "M 365 320 C 550 460 760 375 900 275"),
];
const trailerAirLines = [
  airLine("trailer-supply", "Trailer red supply line", "Trailer supply circuit", "trailer-red-glad-hand", "trailer-reservoir", "M 90 190 C 220 170 330 195 420 250"),
  airLine("trailer-service", "Trailer blue service line", "Trailer service circuit", "trailer-blue-glad-hand", "relay-emergency-valve", "M 90 255 C 240 305 355 325 480 300"),
  airLine("reservoir-relay", "Reservoir to relay emergency valve", "Trailer supply circuit", "trailer-reservoir", "relay-emergency-valve", "M 420 250 C 455 250 480 265 500 300"),
  airLine("relay-service-chambers", "Relay to service brake chambers", "Trailer service circuit", "relay-emergency-valve", "trailer-brake-chambers", "M 500 300 C 615 365 700 335 780 335"),
  airLine("parking-spring", "Trailer parking spring brake control", "Trailer parking circuit", "spring-brake-control-valve", "trailer-spring-brake-chambers", "M 600 285 C 670 250 740 300 800 390"),
  airLine("abs-control", "ABS modulator control", "Trailer service circuit", "trailer-abs-ecu", "trailer-abs-modulators", "M 420 385 C 520 420 625 420 705 370"),
  airLine("suspension-air", "Suspension air supply", "Trailer supply circuit", "trailer-reservoir", "air-suspension-bags", "M 420 250 C 530 160 620 150 700 170"),
];

function airLine(id, name, circuit, source, target, path) {
  return { id, name, circuit, source, target, path };
}

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

const towingTrailerComponents = trailerComponents.map((item) => ({
  ...item,
  key: `towing-${item.key}`,
  section: "Towing Trailer",
  location: item.location.replace("trailer", "towing trailer"),
}));

const converterDollyComponents = [
  component("dolly-red-glad-hand", "Red supply glad hand", "Mano roja del dolly", "Converter Dolly", "Air Supply", "Dolly front air connection", "Receives supply air for dolly and rear trailer.", "Leak at connection, rear trailer brakes locked.", "Bad seal, cracked glad hand, damaged hose.", "Inspect seal, connection face, and supply pressure.", "Replace seal or glad hand assembly.", ["Dolly relay emergency valve", "Dolly reservoir"], 14, 42),
  component("dolly-blue-glad-hand", "Blue service glad hand", "Mano azul del dolly", "Converter Dolly", "Brakes", "Dolly front service connection", "Receives service signal from lead trailer/tractor.", "Rear trailer brakes not applying.", "Bad seal, blocked line, control loss.", "Apply service brakes and verify blue line signal.", "Repair coupling or service hose.", ["Dolly relay valve"], 14, 54),
  component("dolly-reservoir", "Dolly air reservoir", "Tanque de aire del dolly", "Converter Dolly", "Air Supply", "Dolly frame", "Stores air for dolly brake circuit.", "Low dolly pressure, spring brakes apply.", "Tank or fitting leak, supply restriction.", "Drain and pressure test dolly reservoir.", "Repair leaks or replace tank.", ["Dolly relay valve"], 42, 44),
  component("dolly-relay-valve", "Dolly relay emergency valve", "Valvula relay de emergencia del dolly", "Converter Dolly", "Brakes", "Dolly axle frame", "Delivers brake air to dolly chambers.", "Dolly brakes dragging or not applying.", "Relay valve leak, bad service signal.", "Check supply, service signal, and exhaust.", "Replace relay valve if leaking or stuck.", ["Dolly brake chambers"], 55, 58),
  component("dolly-spring-control", "Spring brake control valve", "Valvula spring brake del dolly", "Converter Dolly", "Brakes", "Dolly spring brake circuit", "Controls parking/emergency release.", "Dolly brakes locked, not releasing.", "Low supply, valve leak, chamber issue.", "Verify release pressure at spring chambers.", "Repair valve or spring brake circuit.", ["Dolly spring brake chambers"], 65, 48),
  component("dolly-abs-ecu", "ABS ECU", "Modulo ABS del dolly", "Converter Dolly", "ABS", "Dolly electrical box", "Monitors dolly wheel speed and ABS faults.", "ABS warning, intermittent fault.", "Power, ground, sensor, ECU fault.", "Scan ABS and verify sensor circuits.", "Repair wiring or replace failed component.", ["Wheel-speed sensors"], 48, 76),
  component("dolly-brake-chambers", "Service brake chambers", "Camaras de servicio del dolly", "Converter Dolly", "Brakes", "Dolly axle wheel ends", "Convert air into brake force.", "Air leak on apply, weak braking.", "Diaphragm leak, loose clamp.", "Listen for leaks and measure stroke.", "Replace chamber and verify stroke.", ["Slack adjusters", "S-cams"], 78, 60),
  component("dolly-spring-brakes", "Spring brake chambers", "Camaras spring brake del dolly", "Converter Dolly", "Brakes", "Dolly axle wheel ends", "Apply emergency/parking brake by spring.", "Locked dolly brakes, air leak.", "Low air, chamber leak, control valve fault.", "Check release pressure and leaks.", "Replace chamber or repair release circuit.", ["Spring brake control valve"], 80, 72),
  component("dolly-slack-adjusters", "Slack adjusters", "Ajustadores del dolly", "Converter Dolly", "Brakes", "Dolly brake camshafts", "Maintain dolly brake stroke.", "Excess stroke, uneven braking.", "Failed adjuster, worn clevis.", "Measure pushrod stroke.", "Replace adjuster and inspect foundation brakes.", ["S-cams"], 86, 80),
  component("dolly-drums", "Brake drums and shoes", "Tambores y zapatas del dolly", "Converter Dolly", "Brakes", "Dolly wheel ends", "Friction braking components.", "Heat damage, worn linings.", "Worn, contaminated, cracked components.", "Inspect drum, shoes, rollers, and springs.", "Replace in axle sets as needed.", ["Slack adjusters"], 90, 88),
];

const faultSimulations = [
  "Compressor not building pressure",
  "Governor failure",
  "Air dryer restriction",
  "Supply reservoir leak",
  "Primary tank leak",
  "Secondary tank leak",
  "Foot valve leak",
  "Tractor protection valve failure",
  "Red glad hand leak",
  "Blue glad hand leak",
  "Broken air line",
  "Restricted air line",
  "Relay valve leaking",
  "Relay valve not delivering air",
  "Brake chamber diaphragm leak",
  "Spring brake not releasing",
  "Trailer brakes locked",
  "Trailer brakes not applying",
  "ABS sensor failure",
  "ABS modulator failure",
  "Uneven braking",
  "Low-air warning",
];

const diagnosticProblems = [
  {
    label: "Trailer brakes will not release",
    steps: [
      "Verify tractor air pressure.",
      "Verify red supply line pressure.",
      "Inspect glad hand seals.",
      "Check trailer reservoir pressure.",
      "Check relay emergency valve.",
      "Check spring brake control valve.",
      "Check spring brake chambers.",
      "Record findings.",
    ],
  },
  {
    label: "Trailer brakes not applying",
    steps: [
      "Verify tractor primary and secondary pressure.",
      "Apply foot brake and verify blue service signal.",
      "Inspect blue glad hand and service hose.",
      "Check relay emergency valve delivery.",
      "Inspect ABS modulator valves.",
      "Measure service brake chamber stroke.",
      "Record findings.",
    ],
  },
  {
    label: "Low-air warning",
    steps: [
      "Start engine and measure compressor build rate.",
      "Check governor cut-in/cut-out.",
      "Inspect dryer purge and restrictions.",
      "Drain and inspect reservoirs.",
      "Listen for leaks in primary and secondary circuits.",
      "Record findings.",
    ],
  },
];

const allComponents = [...truckComponents, ...trailerComponents, ...towingTrailerComponents, ...converterDollyComponents];

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
  const [traceMode, setTraceMode] = useState(false);
  const [traceCircuit, setTraceCircuit] = useState("All circuits");
  const [selectedLineId, setSelectedLineId] = useState("");
  const [zoom, setZoom] = useState(1);
  const [fullScreen, setFullScreen] = useState(false);
  const [language, setLanguage] = useState("en");
  const [diagnosticProblem, setDiagnosticProblem] = useState(diagnosticProblems[0].label);
  const [diagnosticResults, setDiagnosticResults] = useState(
    Object.fromEntries(diagnosticProblems[0].steps.map((step) => [step, "Not Tested"]))
  );
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
  });
  const fileInputRef = useRef(null);

  const selectedComponent = allComponents.find((item) => item.key === selectedKey) || truckComponents[0];
  const selectedLines = useMemo(() => activeAirLines(activeTab).filter((line) => line.source === selectedComponent.key || line.target === selectedComponent.key), [activeTab, selectedComponent.key]);
  const visibleComponents = useMemo(() => {
    const base = componentsForSection(activeTab);
    return base.filter((item) => {
      const text = `${item.name} ${item.nameEs} ${item.category} ${item.section}`.toLowerCase();
      const matchesSearch = !search || text.includes(search.toLowerCase());
      const matchesFilter = filter === "All" || item.section === filter || item.category === filter;
      return matchesSearch && matchesFilter;
    });
  }, [activeTab, filter, search]);

  const activeProblem = diagnosticProblems.find((item) => item.label === diagnosticProblem) || diagnosticProblems[0];

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

  useEffect(() => {
    const problem = diagnosticProblems.find((item) => item.label === diagnosticProblem) || diagnosticProblems[0];
    setDiagnosticResults(Object.fromEntries(problem.steps.map((step) => [step, "Not Tested"])));
  }, [diagnosticProblem]);

  useEffect(() => {
    const first = componentsForSection(activeTab)[0];
    if (first && !componentsForSection(activeTab).some((item) => item.key === selectedKey)) {
      setSelectedKey(first.key);
      setSelectedLineId("");
    }
  }, [activeTab, selectedKey]);

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
    const target = faultTarget(fault);
    if (target.componentKey) setSelectedKey(target.componentKey);
    if (target.lineId) setSelectedLineId(target.lineId);
    setSimulation((current) => ({
      ...current,
      fault,
      state: fault,
      supply: target.pressure?.supply ?? current.supply,
      primary: target.pressure?.primary ?? (fault.includes("Primary") || fault.includes("Low") ? 55 : current.primary || 95),
      secondary: target.pressure?.secondary ?? (fault.includes("Secondary") || fault.includes("Low") ? 55 : current.secondary || 95),
      trailer: target.pressure?.trailer ?? (fault.includes("Trailer") || fault.includes("glad hand") ? 35 : current.trailer || 90),
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
      failure: simulation.fault,
      diagnosticResults,
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
      `Failure: ${simulation.fault || "None"}`,
      `Diagnostic results: ${diagnosticSummary(diagnosticResults) || "No guided diagnostic completed"}`,
      `Required parts: ${selectedComponent.related.join(", ")}`,
      `Notes: ${notes || "None"}`,
      `PSI: Supply ${simulation.supply} / Primary ${simulation.primary} / Secondary ${simulation.secondary} / Trailer ${simulation.trailer}`,
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
      `<div class='box'><div class='label'>Failure</div><p>${simulation.fault || "None"}</p></div>`,
      `<div class='box'><div class='label'>Diagnostic results</div><p>${diagnosticSummary(diagnosticResults) || "No guided diagnostic completed"}</p></div>`,
      `<div class='box'><div class='label'>Required parts</div><p>${selectedComponent.related.join(", ")}</p></div>`,
      `<div class='box'><div class='label'>Notes</div><p>${notes || "None"}</p></div>`,
      `<div class='box'><div class='label'>Simulation</div><p>${simulation.state}. Supply ${simulation.supply} PSI, Primary ${simulation.primary} PSI, Secondary ${simulation.secondary} PSI, Trailer ${simulation.trailer} PSI.</p></div>`,
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

        <nav className="flex flex-wrap gap-2">
          {[...diagramSections, ...utilityTabs.map((tab) => ({ id: tab, label: tab }))].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-xl px-4 py-2 text-sm font-black transition ${activeTab === tab.id ? "bg-blue-600 text-white" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {activeTab === "Saved Inspections" ? (
          <SavedInspections inspections={inspections} jobs={jobs} onRefresh={loadInspections} />
        ) : (
          <div className={`grid gap-5 ${fullScreen ? "" : "xl:grid-cols-[minmax(0,1fr)_390px]"}`}>
            <main className="space-y-5">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="grid gap-3 xl:grid-cols-[1fr_auto] xl:items-center">
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
                <div className="mt-3 grid gap-3 xl:grid-cols-[1fr_auto] xl:items-center">
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" onClick={() => setTraceMode((value) => !value)} className={`inline-flex h-9 items-center gap-2 rounded-xl px-3 text-xs font-black ${traceMode ? "bg-emerald-600 text-white" : "border border-slate-200 bg-white text-slate-600"}`}>
                      <Route className="h-4 w-4" />
                      Trace Air Flow
                    </button>
                    <select value={traceCircuit} onChange={(event) => setTraceCircuit(event.target.value)} className="h-9 rounded-xl border border-slate-200 px-3 text-xs font-black text-slate-700 outline-none focus:border-blue-500">
                      {traceCircuits.map((item) => <option key={item}>{item}</option>)}
                    </select>
                    <button type="button" onClick={() => setLanguage((value) => (value === "en" ? "es" : "en"))} className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-black text-slate-700">
                      <Languages className="h-4 w-4" />
                      {language === "en" ? "English" : "Español"}
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => setZoom((value) => Math.max(0.75, Number((value - 0.1).toFixed(2))))} className="rounded-xl border border-slate-200 p-2 text-slate-600"><ZoomOut className="h-4 w-4" /></button>
                    <span className="flex h-9 items-center rounded-xl bg-slate-100 px-3 text-xs font-black text-slate-600">{Math.round(zoom * 100)}%</span>
                    <button type="button" onClick={() => setZoom((value) => Math.min(1.8, Number((value + 0.1).toFixed(2))))} className="rounded-xl border border-slate-200 p-2 text-slate-600"><ZoomIn className="h-4 w-4" /></button>
                    <button type="button" onClick={() => setFullScreen((value) => !value)} className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-black text-slate-700"><Maximize2 className="h-4 w-4" />{fullScreen ? "Exit Full" : "Full Screen"}</button>
                  </div>
                </div>
              </div>

              <AirDiagram
                section={diagramSections.some((item) => item.id === activeTab) ? activeTab : "Truck"}
                components={visibleComponents}
                lines={activeAirLines(activeTab)}
                selectedKey={selectedKey}
                selectedLineId={selectedLineId}
                selectedLines={selectedLines}
                simulation={simulation}
                traceMode={traceMode}
                traceCircuit={traceCircuit}
                zoom={zoom}
                language={language}
                onSelect={setSelectedKey}
                onLineSelect={setSelectedLineId}
              />

              <ColorLegend />

              <ComponentGrid components={visibleComponents} selectedKey={selectedKey} onSelect={setSelectedKey} />

              {activeTab === "Diagnostics" && (
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
              )}
            </main>

            {!fullScreen && <ComponentPanel
              component={selectedComponent}
              condition={condition}
              notes={notes}
              photos={photos}
              saving={saving}
              simulation={simulation}
              connectedLines={selectedLines}
              diagnosticResults={diagnosticResults}
              language={language}
              fileInputRef={fileInputRef}
              onCondition={setCondition}
              onNotes={setNotes}
              onPhotos={setPhotos}
              onSave={() => saveInspection()}
              onAddJob={() => setJobModalOpen(true)}
              onNearby={() => setNearbyModalOpen(true)}
              onReport={generateReport}
            />}
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
  if (action === "Reset System" || action === "Reset Simulation") return { supply: 0, primary: 0, secondary: 0, trailer: 0, state: "System inactive", fault: "", serviceApplied: false, parkingSet: true, trailerSupplied: false, compressorRunning: false };
  if (action === "Start Engine / Compressor") return { ...current, compressorRunning: true, supply: Math.max(current.supply, 35), state: "Compressor running" };
  if (action === "Stop Compressor") return { ...current, compressorRunning: false, state: "Compressor stopped" };
  if (action === "Build Air Pressure") return { ...current, supply: 125, primary: 120, secondary: 120, trailer: current.trailerSupplied ? 110 : current.trailer, state: "Normal air pressure", fault: "" };
  if (action === "Apply Foot Brake" || action === "Apply Service Brakes") return { ...current, primary: Math.max(0, current.primary - 8), secondary: Math.max(0, current.secondary - 8), trailer: current.trailerSupplied ? Math.max(0, current.trailer - 6) : current.trailer, serviceApplied: true, state: "Service brakes applied" };
  if (action === "Release Foot Brake" || action === "Release Service Brakes") return { ...current, serviceApplied: false, state: "Service brakes released" };
  if (action === "Set Tractor Parking Brakes" || action === "Set Parking Brakes") return { ...current, parkingSet: true, state: "Parking brakes set" };
  if (action === "Release Tractor Parking Brakes" || action === "Release Parking Brakes") return { ...current, parkingSet: false, state: "Parking brakes released" };
  if (action === "Supply Air to Trailer") return { ...current, trailerSupplied: true, trailer: current.primary > 80 ? 105 : 55, state: "Trailer supplied" };
  if (action === "Pull Trailer Supply Valve" || action === "Disconnect Red Glad Hand" || action === "Disconnect Red Line") return { ...current, trailerSupplied: false, trailer: 0, parkingSet: true, fault: action, state: "Trailer emergency brakes applied" };
  if (action === "Disconnect Blue Glad Hand" || action === "Disconnect Blue Line") return { ...current, serviceApplied: false, fault: action, state: "Trailer service signal lost" };
  if (action === "Drain Supply Tank") return { ...current, supply: 0, primary: Math.min(current.primary, 40), secondary: Math.min(current.secondary, 40), state: "Supply tank drained", fault: "Supply reservoir leak" };
  if (action === "Drain Primary Tank") return { ...current, primary: 0, state: "Primary tank drained", fault: "Primary tank leak" };
  if (action === "Drain Secondary Tank") return { ...current, secondary: 0, state: "Secondary tank drained", fault: "Secondary tank leak" };
  if (action === "Simulate Air Leak") return { ...current, primary: Math.max(0, current.primary - 35), secondary: Math.max(0, current.secondary - 30), trailer: Math.max(0, current.trailer - 40), fault: "System air leak", state: "Air pressure dropping" };
  return current;
}

function buildInspectionPayload({ component, condition, notes, simulation, job, currentUser, failure, diagnosticResults }) {
  return {
    job_id: job?.id || null,
    created_by: currentUser?.id || currentUser?.authUserId || null,
    assigned_technician_id: job?.technician_id || null,
    vehicle_section: component.section,
    component_key: component.key,
    component_name: component.name,
    component_name_es: component.nameEs,
    condition,
    failure_type: failure || "",
    symptoms: component.symptoms,
    possible_causes: component.causes,
    recommendation: component.repair,
    dispatcher_notes: notes,
    diagnostic_results: Object.entries(diagnosticResults || {}).map(([step, result]) => ({ step, result })),
    required_parts: component.related.join(", "),
    primary_psi: simulation.primary,
    secondary_psi: simulation.secondary,
    trailer_psi: simulation.trailer,
    simulation_type: simulation.fault || simulation.state,
  };
}

function componentsForSection(section) {
  if (section === "Trailer") return trailerComponents;
  if (section === "Towing Trailer") return towingTrailerComponents;
  if (section === "Converter Dolly") return converterDollyComponents;
  if (section === "Truck") return truckComponents;
  return allComponents;
}

function activeAirLines(section) {
  if (section === "Truck") return truckAirLines;
  if (section === "Trailer") return trailerAirLines;
  if (section === "Towing Trailer") return trailerAirLines.map((line) => ({
    ...line,
    id: `towing-${line.id}`,
    source: `towing-${line.source}`,
    target: `towing-${line.target}`,
    name: line.name.replace("Trailer", "Towing trailer"),
  }));
  if (section === "Converter Dolly") return [
    airLine("dolly-supply", "Dolly red supply line", "Trailer supply circuit", "dolly-red-glad-hand", "dolly-reservoir", "M 100 210 C 245 180 335 205 420 230"),
    airLine("dolly-service", "Dolly blue service line", "Trailer service circuit", "dolly-blue-glad-hand", "dolly-relay-valve", "M 100 280 C 250 330 385 340 550 300"),
    airLine("dolly-reservoir-relay", "Dolly reservoir to relay valve", "Trailer supply circuit", "dolly-reservoir", "dolly-relay-valve", "M 420 230 C 470 245 520 265 550 300"),
    airLine("dolly-parking", "Dolly spring brake control", "Trailer parking circuit", "dolly-spring-control", "dolly-spring-brakes", "M 650 250 C 710 305 770 330 800 370"),
    airLine("dolly-service-chambers", "Dolly relay to service chambers", "Trailer service circuit", "dolly-relay-valve", "dolly-brake-chambers", "M 550 300 C 635 340 710 325 780 312"),
  ];
  return [...truckAirLines, ...trailerAirLines];
}

function linePressure(line, simulation) {
  if (line.circuit === "Charging circuit") return simulation.supply || 0;
  if (line.circuit === "Primary circuit") return simulation.primary || 0;
  if (line.circuit === "Secondary circuit") return simulation.secondary || 0;
  if (line.circuit === "Trailer supply circuit") return simulation.trailerSupplied ? simulation.trailer || 0 : 0;
  if (line.circuit === "Trailer service circuit") return simulation.serviceApplied ? Math.max(0, simulation.trailer - 8) : 0;
  if (line.circuit === "Parking circuit" || line.circuit === "Trailer parking circuit") return simulation.parkingSet ? 0 : simulation.primary || 0;
  return 0;
}

function componentCircuit(component) {
  if (component.key.includes("abs") || component.category === "ABS") return "ABS electronic control";
  if (component.key.includes("primary")) return "Primary circuit";
  if (component.key.includes("secondary")) return "Secondary circuit";
  if (component.key.includes("parking") || component.key.includes("spring")) return "Parking circuit";
  if (component.key.includes("red") || component.key.includes("supply")) return component.section === "Truck" ? "Park / Supply" : "Trailer supply circuit";
  if (component.key.includes("blue") || component.key.includes("service")) return component.section === "Truck" ? "Secondary circuit" : "Trailer service circuit";
  if (component.category === "Air Supply") return "Charging circuit";
  if (component.category === "Brakes") return "Primary circuit / Service circuit";
  return component.category;
}

function componentPsi(component, simulation) {
  const circuit = componentCircuit(component);
  if (circuit.includes("Primary")) return simulation.primary;
  if (circuit.includes("Secondary")) return simulation.secondary;
  if (circuit.includes("Trailer")) return simulation.trailer;
  if (circuit.includes("Charging") || circuit.includes("Supply")) return simulation.supply;
  if (circuit.includes("Parking")) return simulation.parkingSet ? 0 : simulation.primary;
  return Math.max(simulation.primary, simulation.secondary, simulation.trailer);
}

function faultTarget(fault) {
  const normalized = String(fault || "").toLowerCase();
  if (normalized.includes("compressor")) return { componentKey: "air-compressor", lineId: "charging-1", pressure: { supply: 20, primary: 0, secondary: 0, trailer: 0 } };
  if (normalized.includes("governor")) return { componentKey: "governor", lineId: "charging-1", pressure: { supply: 150, primary: 95, secondary: 95 } };
  if (normalized.includes("dryer")) return { componentKey: "air-dryer", lineId: "charging-2", pressure: { supply: 45, primary: 25, secondary: 25 } };
  if (normalized.includes("supply reservoir")) return { componentKey: "wet-tank", lineId: "charging-2", pressure: { supply: 30, primary: 35, secondary: 35 } };
  if (normalized.includes("primary")) return { componentKey: "primary-tank", lineId: "primary-feed", pressure: { primary: 25 } };
  if (normalized.includes("secondary")) return { componentKey: "secondary-tank", lineId: "secondary-feed", pressure: { secondary: 25 } };
  if (normalized.includes("foot")) return { componentKey: "foot-brake-valve", lineId: "primary-service", pressure: { primary: 70, secondary: 70 } };
  if (normalized.includes("tractor protection")) return { componentKey: "tractor-protection-valve", lineId: "tractor-protection", pressure: { trailer: 0 } };
  if (normalized.includes("red")) return { componentKey: "red-glad-hand", lineId: "tractor-protection", pressure: { trailer: 0 } };
  if (normalized.includes("blue")) return { componentKey: "blue-glad-hand", lineId: "trailer-service", pressure: { trailer: 90 } };
  if (normalized.includes("relay")) return { componentKey: "relay-valves", lineId: "primary-service", pressure: { primary: 75, trailer: 55 } };
  if (normalized.includes("abs sensor")) return { componentKey: "wheel-speed-sensors", lineId: "abs-control" };
  if (normalized.includes("abs modulator")) return { componentKey: "abs-modulator", lineId: "abs-control" };
  if (normalized.includes("brake chamber") || normalized.includes("spring brake")) return { componentKey: "spring-brake-chambers", lineId: "parking-control", pressure: { primary: 80, trailer: 45 } };
  if (normalized.includes("trailer brakes")) return { componentKey: "relay-emergency-valve", lineId: "trailer-supply", pressure: { trailer: 30 } };
  return { componentKey: selectedDefaultComponentForFault(), lineId: "", pressure: { supply: 75, primary: 65, secondary: 65, trailer: 45 } };
}

function selectedDefaultComponentForFault() {
  return "air-compressor";
}

function diagnosticSummary(results) {
  return Object.entries(results || {})
    .map(([step, result]) => `${step}: ${result}`)
    .join("; ");
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
  const items = [
    "Charging circuit",
    "Primary circuit",
    "Secondary circuit",
    "Park / Supply",
    "Parking circuit",
    "Trailer supply circuit",
    "Trailer service circuit",
    "Trailer parking circuit",
  ];
  return (
    <div className="sticky bottom-0 z-10 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-sm backdrop-blur">
      <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">Color legend</p>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <span key={item} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-700">
            <span className="h-2.5 w-8 rounded-full" style={{ backgroundColor: circuitStyles[item]?.color || "#64748b" }} />
            {circuitStyles[item]?.label || item}
          </span>
        ))}
      </div>
    </div>
  );
}

function WheelSvg({ x, y }) {
  return (
    <g>
      <circle cx={x} cy={y} r="38" fill="#1f2937" />
      <circle cx={x} cy={y} r="22" fill="#cbd5e1" />
      <circle cx={x} cy={y} r="8" fill="#64748b" />
    </g>
  );
}

function sectionTitle(section) {
  if (section === "Trailer") return "Trailer System - 53 ft Dry Van";
  if (section === "Towing Trailer") return "Towing Trailer Air System";
  if (section === "Converter Dolly") return "Converter Dolly Air System";
  return "Truck / Tractor Air System";
}

function lineLabelX(path) {
  const numbers = path.match(/-?\d+(\.\d+)?/g)?.map(Number) || [120];
  return numbers[Math.max(0, Math.floor(numbers.length / 2) - 1)] || 120;
}

function lineLabelY(path) {
  const numbers = path.match(/-?\d+(\.\d+)?/g)?.map(Number) || [0, 120];
  return (numbers[Math.max(1, Math.floor(numbers.length / 2))] || 120) - 10;
}

function componentFill(component) {
  if (component.category === "ABS") return "#dbeafe";
  if (component.category === "Air Supply") return "#ecfdf5";
  if (component.key.includes("spring") || component.key.includes("parking")) return "#fef3c7";
  return "#ffffff";
}

function shortLabel(value) {
  const text = String(value || "");
  return text.length > 18 ? `${text.slice(0, 17)}...` : text;
}

function AirDiagram({ section, components, lines, selectedKey, selectedLineId, selectedLines, simulation, traceMode, traceCircuit, zoom, language, onSelect, onLineSelect }) {
  const selectedLineKeys = new Set(selectedLines.map((line) => line.id));
  const selectedComponent = components.find((item) => item.key === selectedKey);
  const isTrailerLike = section !== "Truck";
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-black">{sectionTitle(section)}</h2>
          <p className="text-xs font-semibold text-slate-500">SVG schematic. Select components or air lines to trace pressure and flow.</p>
        </div>
        <Truck className="h-6 w-6 text-blue-600" />
      </div>
      <div className="overflow-auto rounded-2xl border border-slate-200 bg-white">
        <svg
          viewBox="0 0 1000 520"
          role="img"
          aria-label={`${sectionTitle(section)} interactive air-brake schematic`}
          className="min-h-[520px] min-w-[980px] origin-top-left transition-transform"
          style={{ transform: `scale(${zoom})`, transformOrigin: "top left" }}
        >
          <defs>
            <marker id="arrow-flow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
              <path d="M 0 0 L 8 4 L 0 8 z" fill="#0f172a" />
            </marker>
            <style>{`
              .air-flow { stroke-dasharray: 10 10; animation: airFlow 1.1s linear infinite; }
              .air-fault { animation: airFault 0.8s ease-in-out infinite; }
              @keyframes airFlow { to { stroke-dashoffset: -40; } }
              @keyframes airFault { 0%,100% { opacity: 1; } 50% { opacity: .28; } }
            `}</style>
          </defs>

          <rect x="20" y="20" width="960" height="470" rx="24" fill="#f8fafc" stroke="#cbd5e1" />
          {isTrailerLike ? (
            <>
              <rect x="95" y="120" width="780" height="210" rx="14" fill="#ffffff" stroke="#94a3b8" strokeWidth="4" />
              <line x1="150" y1="330" x2="850" y2="330" stroke="#64748b" strokeWidth="8" />
              {[250, 670, 790].map((x) => <WheelSvg key={x} x={x} y={395} />)}
              <text x="110" y="105" className="fill-slate-500 text-xs font-bold">{section}</text>
            </>
          ) : (
            <>
              <rect x="90" y="145" width="790" height="210" rx="70" fill="#ffffff" stroke="#94a3b8" strokeWidth="4" />
              <path d="M 95 145 L 265 145 Q 345 170 345 245 L 345 355 L 95 355 Z" fill="#f1f5f9" stroke="#94a3b8" strokeWidth="4" />
              <line x1="145" y1="355" x2="850" y2="355" stroke="#64748b" strokeWidth="8" />
              {[180, 720, 835].map((x) => <WheelSvg key={x} x={x} y={420} />)}
              <text x="110" y="130" className="fill-slate-500 text-xs font-bold">Class 8 tractor side / component schematic</text>
            </>
          )}

          {lines.map((line) => {
            const pressure = linePressure(line, simulation);
            const isSelected = selectedLineId === line.id || selectedLineKeys.has(line.id);
            const faded = traceMode && traceCircuit !== "All circuits" && line.circuit !== traceCircuit;
            const faulted = simulation.fault && (selectedLineId === line.id || faultTarget(simulation.fault).lineId === line.id);
            const active = pressure > 20 && !faded;
            const stroke = circuitStyles[line.circuit]?.color || "#64748b";
            return (
              <g key={line.id} className={faded ? "opacity-20" : "opacity-100"}>
                <path
                  d={line.path}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={isSelected ? 8 : 5}
                  strokeLinecap="round"
                  markerEnd={active ? "url(#arrow-flow)" : ""}
                  className={`${active ? "air-flow" : ""} ${faulted ? "air-fault" : ""} cursor-pointer transition-all hover:stroke-[8px]`}
                  onClick={() => onLineSelect(line.id)}
                >
                  <title>{`${line.name} - ${line.circuit} - ${pressure} PSI`}</title>
                </path>
                <text x={lineLabelX(line.path)} y={lineLabelY(line.path)} className="pointer-events-none fill-slate-700 text-[11px] font-black">
                  {line.name} · {pressure} PSI
                </text>
              </g>
            );
          })}

          {components.map((item) => {
            const isSelected = item.key === selectedKey;
            const connected = selectedLines.some((line) => line.source === item.key || line.target === item.key);
            const faded = selectedComponent && !isSelected && !connected;
            const faulted = simulation.fault && faultTarget(simulation.fault).componentKey === item.key;
            const label = language === "es" ? item.nameEs : item.name;
            return (
              <g
                key={item.key}
                onClick={() => onSelect(item.key)}
                className={`cursor-pointer transition-opacity ${faded ? "opacity-35" : "opacity-100"} ${faulted ? "air-fault" : ""}`}
              >
                <rect
                  x={item.x * 10 - 44}
                  y={item.y * 5.2 - 17}
                  width="88"
                  height="34"
                  rx="10"
                  fill={isSelected ? "#2563eb" : componentFill(item)}
                  stroke={isSelected ? "#1d4ed8" : "#64748b"}
                  strokeWidth={isSelected ? 3 : 1.5}
                />
                <text x={item.x * 10} y={item.y * 5.2 + 4} textAnchor="middle" className={`pointer-events-none text-[10px] font-black ${isSelected ? "fill-white" : "fill-slate-800"}`}>
                  {shortLabel(label)}
                </text>
                <title>{`${item.name} / ${item.nameEs}. ${componentCircuit(item)}. Current PSI: ${componentPsi(item, simulation)}`}</title>
              </g>
            );
          })}
        </svg>
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

function ComponentPanel({ component, condition, notes, photos, saving, simulation, connectedLines, diagnosticResults, language, fileInputRef, onCondition, onNotes, onPhotos, onSave, onAddJob, onNearby, onReport }) {
  const displayName = language === "es" ? component.nameEs : component.name;
  const secondaryName = language === "es" ? component.name : component.nameEs;
  const inputs = connectedLines.filter((line) => line.target === component.key).map((line) => line.name).join(", ") || "Manual/linked circuit";
  const outputs = connectedLines.filter((line) => line.source === component.key).map((line) => line.name).join(", ") || "Downstream components";
  return (
    <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:sticky xl:top-4 xl:self-start">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-blue-600">{component.section} / {component.category}</p>
          <h2 className="mt-1 text-2xl font-black">{displayName}</h2>
          <p className="text-sm font-bold text-slate-500">{secondaryName}</p>
        </div>
        <Wind className="h-6 w-6 text-blue-600" />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <InfoPill label="Circuit" value={componentCircuit(component)} />
        <InfoPill label="Current PSI" value={`${componentPsi(component, simulation)} PSI`} />
      </div>
      <InfoBlock label="Location" value={component.location} />
      <InfoBlock label="Function" value={component.function} />
      <InfoBlock label="Normal operating condition" value="90-125 PSI available, no audible leak, correct delivery and release response." />
      <InfoBlock label="Input source" value={inputs} />
      <InfoBlock label="Output destination" value={outputs} />
      <InfoBlock label="Common symptoms" value={component.symptoms} />
      <InfoBlock label="Possible causes" value={component.causes} />
      <InfoBlock label="Basic inspection" value={component.inspect} />
      <InfoBlock label="Recommended repair" value={component.repair} />
      <InfoBlock label="Related components" value={component.related.join(", ")} />
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

function InfoPill({ label, value }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-xs font-black text-slate-800">{value}</p>
    </div>
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
    "Disconnect Red Glad Hand",
    "Disconnect Blue Glad Hand",
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
              <div key={step} className="grid gap-2 rounded-xl bg-white p-3 md:grid-cols-[1fr_180px] md:items-center">
                <p className="text-sm font-bold text-slate-700">{index + 1}. {step}</p>
                <select value={results[step] || "Not Tested"} onChange={(event) => onResult(step, event.target.value)} className="h-9 rounded-xl border border-slate-200 px-2 text-xs font-black text-slate-700">
                  {["Passed", "Failed", "Not Tested", "Needs Technician Inspection"].map((item) => <option key={item}>{item}</option>)}
                </select>
              </div>
            ))}
          </div>
        </div>
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
