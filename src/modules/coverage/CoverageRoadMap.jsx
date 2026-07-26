import React, { useEffect, useMemo, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { Crosshair, LocateFixed, X } from "lucide-react";
import { coverageStatusBucket } from "./serviceAreaService";

const EMPTY_COLLECTION = { type: "FeatureCollection", features: [] };
const STATUS_OPTIONS = [
  ["All", "All statuses"], ["completed", "Completed"], ["cancelled", "Cancelled"],
  ["dryRuns", "Dry Runs"], ["active", "Active"], ["pending", "Pending"],
  ["inProgress", "In Progress"], ["other", "Other"],
];

export default function CoverageRoadMap({ rows, unassignedJobs, onDrilldown, onExport }) {
  const token = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const loadedRef = useRef(false);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState("");
  const [selected, setSelected] = useState(null);
  const [state, setState] = useState("All");
  const [areaId, setAreaId] = useState("All");
  const [status, setStatus] = useState("All");
  const [includeCancelled, setIncludeCancelled] = useState(true);
  const [includeDryRuns, setIncludeDryRuns] = useState(true);
  const [showRadius, setShowRadius] = useState(true);
  const [showJobs, setShowJobs] = useState(false);
  const [showTechs, setShowTechs] = useState(false);
  const [heatMap, setHeatMap] = useState(false);
  const [cluster, setCluster] = useState(true);

  const states = useMemo(() => ["All", ...new Set(rows.map((row) => row.state).filter(Boolean))].sort(), [rows]);
  const filteredRows = useMemo(() => rows.filter((row) =>
    (state === "All" || row.state === state) && (areaId === "All" || String(row.id) === String(areaId))
  ), [areaId, rows, state]);
  const filteredAreaJobs = useMemo(() => filteredRows.map((row) => ({
    ...row,
    mapJobs: row.jobs.filter((job) => jobIncluded(job, status, includeCancelled, includeDryRuns)),
  })), [filteredRows, includeCancelled, includeDryRuns, status]);
  const activityAverage = useMemo(() => {
    if (!filteredAreaJobs.length) return 0;
    return filteredAreaJobs.reduce((sum, row) => sum + row.mapJobs.length, 0) / filteredAreaJobs.length;
  }, [filteredAreaJobs]);

  const mapData = useMemo(() => buildMapData(filteredAreaJobs, activityAverage), [activityAverage, filteredAreaJobs]);

  useEffect(() => {
    if (!token || !containerRef.current || mapRef.current) return undefined;
    mapboxgl.accessToken = token;
    let fallbackTried = false;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/navigation-night-v1",
      center: [-98.5, 38.2],
      zoom: 3.2,
      minZoom: 2.2,
      maxZoom: 18,
      attributionControl: true,
      cooperativeGestures: false,
    });
    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), "top-right");
    map.addControl(new mapboxgl.FullscreenControl(), "top-right");

    map.on("load", () => {
      loadedRef.current = true;
      addStaticSourcesAndLayers(map, mapData);
      addJobLayers(map, mapData.jobs, cluster);
      bindMapClicks(map, {
        onArea: (id) => setSelected(rows.find((row) => String(row.id) === String(id)) || null),
        onJob: showJobPopup,
        onTech: showTechPopup,
      });
      setMapReady(true);
      fitRows(map, filteredRows);
    });
    map.on("error", (event) => {
      const message = event?.error?.message || "Mapbox could not load the coverage map.";
      if (!loadedRef.current && !fallbackTried) {
        fallbackTried = true;
        try {
          map.setStyle("mapbox://styles/mapbox/dark-v11");
          return;
        } catch {
          // Continue to the safe error state.
        }
      }
      if (!loadedRef.current) setMapError(message);
    });
    return () => {
      loadedRef.current = false;
      map.remove();
      mapRef.current = null;
    };
  // Map creation is intentionally independent of dashboard refreshes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    setSourceData(map, "coverage-radii", mapData.radii);
    setSourceData(map, "service-areas", mapData.areas);
    setSourceData(map, "technicians", mapData.techs);
    rebuildJobLayers(map, mapData.jobs, cluster);
    setVisibility(map, "coverage-radius-fill", showRadius);
    setVisibility(map, "coverage-radius-line", showRadius);
    ["job-clusters", "job-cluster-count", "job-points"].forEach((id) => setVisibility(map, id, showJobs));
    setVisibility(map, "job-heat", heatMap);
    setVisibility(map, "technician-points", showTechs);
    if (areaId !== "All") {
      const area = filteredRows[0];
      if (hasCoordinates(area)) map.flyTo({ center: [Number(area.longitude), Number(area.latitude)], zoom: 8 });
    }
  }, [areaId, cluster, filteredRows, heatMap, mapData, mapReady, showJobs, showRadius, showTechs]);

  if (!token) {
    return <MapUnavailable message="Coverage map unavailable. Add VITE_MAPBOX_ACCESS_TOKEN to Vercel." />;
  }

  return (
    <div className="min-w-0">
      <div className="sticky top-0 z-20 mb-4 rounded-2xl border border-white/10 bg-[#0a1830]/95 p-3 backdrop-blur">
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <select value={state} onChange={(event) => setState(event.target.value)} className={selectClass}>{states.map((value) => <option key={value}>{value}</option>)}</select>
          <select value={areaId} onChange={(event) => setAreaId(event.target.value)} className={selectClass}><option value="All">All service areas</option>{rows.map((row) => <option key={row.id} value={row.id}>{row.area_name}</option>)}</select>
          <select value={status} onChange={(event) => setStatus(event.target.value)} className={selectClass}>{STATUS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          <button type="button" onClick={onExport} className="min-h-11 rounded-xl bg-blue-500 px-4 font-black text-white">Export Coverage PDF</button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {[
            ["Include Cancelled", includeCancelled, setIncludeCancelled],
            ["Include Dry Runs", includeDryRuns, setIncludeDryRuns],
            ["Coverage Radius", showRadius, setShowRadius],
            ["Exact Job Locations", showJobs, setShowJobs],
            ["Active Technicians", showTechs, setShowTechs],
            ["Heat Map View", heatMap, setHeatMap],
            ["Cluster View", cluster, setCluster],
          ].map(([label, value, setter]) => <Toggle key={label} label={label} value={value} onChange={() => setter(!value)} />)}
        </div>
      </div>

      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#071421]">
        {!mapReady && !mapError && <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#071421] font-black text-blue-200">Loading professional coverage map...</div>}
        {mapError && <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#071421] p-6 text-center font-black text-red-200">Coverage map unavailable. {mapError}</div>}
        <div ref={containerRef} className="h-[62vh] min-h-[440px] w-full md:h-[680px]" aria-label="Interactive NTTR coverage road map" />
        <div className="absolute bottom-4 left-4 z-10 flex gap-2">
          <MapButton label="Recenter continental United States" onClick={() => mapRef.current?.flyTo({ center: [-98.5, 38.2], zoom: 3.2 })}><Crosshair className="h-4 w-4" /></MapButton>
          <MapButton label="Fit all active service areas" onClick={() => fitRows(mapRef.current, filteredRows)}><LocateFixed className="h-4 w-4" /></MapButton>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-4 rounded-xl border border-white/10 bg-white/5 p-3 text-xs font-bold text-slate-300">
        <Legend color="#22c55e" label="Green: activity in selected period" />
        <Legend color="#facc15" label="Yellow: moderate activity" />
        <Legend color="#ef4444" label="Red: zero jobs" />
        <Legend color="#3b82f6" label="Blue: exact job locations" />
        <Legend color="#22d3ee" label="Cyan: active technicians" />
        <Legend color="rgba(59,130,246,.25)" label="Shaded circle: coverage radius" />
      </div>

      <button type="button" onClick={() => setSelected(unassignedRow(unassignedJobs))} className="mt-4 flex min-h-12 w-full items-center justify-between rounded-xl border border-red-400/30 bg-red-500/10 px-4 font-black text-red-100"><span>Outside Coverage / Unassigned</span><span>{unassignedJobs.length}</span></button>
      {selected && <AreaSheet row={selected} onClose={() => setSelected(null)} onDrilldown={onDrilldown} onFit={() => {
        if (hasCoordinates(selected)) mapRef.current?.flyTo({ center: [Number(selected.longitude), Number(selected.latitude)], zoom: 9 });
      }} />}
    </div>
  );
}

const selectClass = "min-h-11 rounded-xl border border-white/10 bg-[#111f33] px-3 font-bold text-white";

function buildMapData(rows, average) {
  const areas = [];
  const radii = [];
  const jobs = [];
  const techs = [];
  rows.forEach((row) => {
    if (!hasCoordinates(row)) return;
    const count = row.mapJobs.length;
    const color = count === 0 ? "#ef4444" : count < average * 0.5 ? "#facc15" : "#22c55e";
    areas.push(pointFeature(row.longitude, row.latitude, {
      id: String(row.id), areaName: row.area_name, count, color,
    }));
    radii.push(circleFeature(Number(row.longitude), Number(row.latitude), Number(row.coverage_radius_miles || 75), {
      id: String(row.id), color,
    }));
    row.mapJobs.forEach((job) => {
      if (!hasCoordinates(job)) return;
      jobs.push(pointFeature(job.longitude, job.latitude, {
        id: String(job.id), jobNumber: job.invoiceNumber || job.reference || String(job.id),
        status: job.status || "Unknown", city: job.city || "Unknown", state: job.state || "",
        serviceArea: row.area_name,
      }));
    });
    row.activeTechnicians.forEach((tech) => {
      const latitude = finiteCoordinate(tech.latitude ?? tech.raw?.latitude ?? tech.raw?.current_latitude);
      const longitude = finiteCoordinate(tech.longitude ?? tech.raw?.longitude ?? tech.raw?.current_longitude);
      if (latitude === null || longitude === null) return;
      techs.push(pointFeature(longitude, latitude, {
        id: String(tech.id), name: tech.full_name || "Technician", city: tech.city || "",
        state: tech.state || "", availability: tech.availability || "Unknown", serviceArea: row.area_name,
      }));
    });
  });
  return {
    areas: collection(areas), radii: collection(radii), jobs: collection(jobs), techs: collection(techs),
  };
}

function addStaticSourcesAndLayers(map, data) {
  map.addSource("coverage-radii", { type: "geojson", data: data.radii });
  map.addLayer({ id: "coverage-radius-fill", type: "fill", source: "coverage-radii", paint: { "fill-color": ["get", "color"], "fill-opacity": 0.13 } });
  map.addLayer({ id: "coverage-radius-line", type: "line", source: "coverage-radii", paint: { "line-color": ["get", "color"], "line-width": 1.5, "line-opacity": 0.65 } });
  map.addSource("service-areas", { type: "geojson", data: data.areas });
  map.addLayer({
    id: "service-area-points", type: "circle", source: "service-areas",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["get", "count"], 0, 10, 5, 16, 25, 28, 100, 42],
      "circle-color": ["get", "color"], "circle-stroke-color": "#ffffff", "circle-stroke-width": 2,
      "circle-opacity": 0.92,
    },
  });
  map.addLayer({ id: "service-area-counts", type: "symbol", source: "service-areas", layout: { "text-field": ["to-string", ["get", "count"]], "text-size": 12 }, paint: { "text-color": "#ffffff", "text-halo-color": "#0f172a", "text-halo-width": 1 } });
  map.addSource("technicians", { type: "geojson", data: data.techs });
  map.addLayer({ id: "technician-points", type: "circle", source: "technicians", layout: { visibility: "none" }, paint: { "circle-radius": 7, "circle-color": "#22d3ee", "circle-stroke-color": "#ffffff", "circle-stroke-width": 2 } });
}

function addJobLayers(map, data, clustered) {
  map.addSource("coverage-jobs", { type: "geojson", data, cluster: clustered, clusterMaxZoom: 13, clusterRadius: 48 });
  map.addLayer({ id: "job-heat", type: "heatmap", source: "coverage-jobs", maxzoom: 15, layout: { visibility: "none" }, paint: { "heatmap-weight": 1, "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 2, 0.6, 12, 2.5], "heatmap-color": ["interpolate", ["linear"], ["heatmap-density"], 0, "rgba(59,130,246,0)", 0.25, "#2563eb", 0.5, "#22d3ee", 0.75, "#facc15", 1, "#ef4444"], "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 2, 12, 12, 32], "heatmap-opacity": 0.72 } });
  if (clustered) {
    map.addLayer({ id: "job-clusters", type: "circle", source: "coverage-jobs", filter: ["has", "point_count"], layout: { visibility: "none" }, paint: { "circle-color": "#2563eb", "circle-radius": ["step", ["get", "point_count"], 14, 10, 20, 50, 28], "circle-stroke-color": "#bfdbfe", "circle-stroke-width": 2 } });
    map.addLayer({ id: "job-cluster-count", type: "symbol", source: "coverage-jobs", filter: ["has", "point_count"], layout: { visibility: "none", "text-field": ["get", "point_count_abbreviated"], "text-size": 12 }, paint: { "text-color": "#ffffff" } });
  }
  map.addLayer({ id: "job-points", type: "circle", source: "coverage-jobs", filter: clustered ? ["!", ["has", "point_count"]] : undefined, layout: { visibility: "none" }, paint: { "circle-radius": 5, "circle-color": "#3b82f6", "circle-stroke-color": "#dbeafe", "circle-stroke-width": 1.5 } });
}

function rebuildJobLayers(map, data, clustered) {
  ["job-cluster-count", "job-clusters", "job-points", "job-heat"].forEach((id) => { if (map.getLayer(id)) map.removeLayer(id); });
  if (map.getSource("coverage-jobs")) map.removeSource("coverage-jobs");
  addJobLayers(map, data, clustered);
}

function bindMapClicks(map, handlers) {
  map.on("click", "service-area-points", (event) => handlers.onArea(event.features?.[0]?.properties?.id));
  map.on("click", "service-area-counts", (event) => handlers.onArea(event.features?.[0]?.properties?.id));
  map.on("click", "job-points", (event) => handlers.onJob(map, event));
  map.on("click", "technician-points", (event) => handlers.onTech(map, event));
  map.on("click", "job-clusters", async (event) => {
    const feature = event.features?.[0];
    const source = map.getSource("coverage-jobs");
    if (!feature || !source?.getClusterExpansionZoom) return;
    const zoom = await source.getClusterExpansionZoom(feature.properties.cluster_id);
    map.easeTo({ center: feature.geometry.coordinates, zoom });
  });
  ["service-area-points", "service-area-counts", "job-points", "job-clusters", "technician-points"].forEach((layer) => {
    map.on("mouseenter", layer, () => { map.getCanvas().style.cursor = "pointer"; });
    map.on("mouseleave", layer, () => { map.getCanvas().style.cursor = ""; });
  });
}

function showJobPopup(map, event) {
  const p = event.features?.[0]?.properties;
  if (!p) return;
  new mapboxgl.Popup().setLngLat(event.lngLat).setHTML(
    `<strong>Job ${escapeHtml(p.jobNumber)}</strong><br>${escapeHtml(p.status)}<br>${escapeHtml(p.city)}, ${escapeHtml(p.state)}<br>${escapeHtml(p.serviceArea)}`
  ).addTo(map);
}

function showTechPopup(map, event) {
  const p = event.features?.[0]?.properties;
  if (!p) return;
  new mapboxgl.Popup().setLngLat(event.lngLat).setHTML(
    `<strong>${escapeHtml(p.name)}</strong><br>${escapeHtml(p.city)}, ${escapeHtml(p.state)}<br>${escapeHtml(p.availability)}<br>${escapeHtml(p.serviceArea)}`
  ).addTo(map);
}

function AreaSheet({ row, onClose, onDrilldown, onFit }) {
  const metrics = [
    ["total", "Total Jobs"], ["completed", "Completed"], ["cancelled", "Cancelled"],
    ["dryRuns", "Dry Runs"], ["active", "Active"], ["pending", "Pending"],
  ];
  return <div className="fixed inset-0 z-[140] bg-black/70" onClick={onClose}><aside className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-3xl bg-[#091827] p-5 text-white shadow-2xl md:inset-y-0 md:left-auto md:w-full md:max-w-xl md:rounded-none" onClick={(event) => event.stopPropagation()}><header className="flex items-start justify-between gap-4"><div><p className="text-xs font-black uppercase text-blue-300">Service Area</p><h3 className="mt-1 text-2xl font-black">{row.area_name}</h3><p className="text-slate-400">{row.primary_city ? `${row.primary_city}, ${row.state}` : "Jobs requiring geographic review"}</p></div><button type="button" onClick={onClose} className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10"><X className="h-5 w-5" /></button></header>{hasCoordinates(row) && <button type="button" onClick={onFit} className="mt-4 min-h-11 rounded-xl bg-blue-500 px-4 font-black">Fit selected service area</button>}<div className="mt-5 grid grid-cols-2 gap-3">{metrics.map(([key, label]) => <button key={key} type="button" onClick={() => onDrilldown({ row, bucket: key })} className="rounded-xl bg-white/5 p-3 text-left"><span className="block text-[10px] font-black uppercase text-slate-500">{label}</span><strong className="text-xl text-blue-300">{row[key] ?? (key === "total" ? row.jobs?.length : 0)}</strong></button>)}</div><div className="mt-5 grid gap-3 sm:grid-cols-2"><Info label="Exact cities included" value={row.exactCities?.join(", ") || "None"} /><Info label="Active technicians" value={row.activeTechnicians?.length || 0} /><Info label="Last job date" value={row.lastJobDate || "Never"} /><Info label="Coverage radius" value={row.coverage_radius_miles ? `${row.coverage_radius_miles} miles` : "Not configured"} /></div></aside></div>;
}

function Toggle({ label, value, onChange }) { return <button type="button" onClick={onChange} className={`min-h-11 rounded-xl border px-3 text-xs font-black ${value ? "border-blue-400 bg-blue-500/20 text-blue-200" : "border-white/10 bg-white/5 text-slate-400"}`}>{label}</button>; }
function MapButton({ label, onClick, children }) { return <button type="button" aria-label={label} title={label} onClick={onClick} className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/15 bg-[#0a1830] text-white shadow-lg hover:bg-blue-600">{children}</button>; }
function Legend({ color, label }) { return <span className="inline-flex items-center gap-2"><i className="h-3 w-3 rounded-full" style={{ backgroundColor: color }} />{label}</span>; }
function Info({ label, value }) { return <div className="rounded-xl bg-white/5 p-3"><p className="text-[10px] font-black uppercase text-slate-500">{label}</p><p className="mt-1 font-black text-white">{value}</p></div>; }
function MapUnavailable({ message }) { return <div className="flex min-h-[440px] items-center justify-center rounded-2xl border border-amber-400/20 bg-[#071421] p-8 text-center font-black text-amber-200">{message}</div>; }
function setVisibility(map, id, visible) { if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", visible ? "visible" : "none"); }
function setSourceData(map, id, data) { map.getSource(id)?.setData(data); }
function collection(features) { return { type: "FeatureCollection", features }; }
function pointFeature(longitude, latitude, properties) { return { type: "Feature", properties, geometry: { type: "Point", coordinates: [Number(longitude), Number(latitude)] } }; }
function hasCoordinates(value) { return finiteCoordinate(value?.latitude) !== null && finiteCoordinate(value?.longitude) !== null; }
function finiteCoordinate(value) { if (value === null || value === undefined || value === "") return null; const number = Number(value); return Number.isFinite(number) ? number : null; }
function jobIncluded(job, status, includeCancelled, includeDryRuns) { const bucket = coverageStatusBucket(job.status); return (includeCancelled || bucket !== "cancelled") && (includeDryRuns || bucket !== "dryRuns") && (status === "All" || bucket === status); }
function circleFeature(longitude, latitude, radiusMiles, properties) {
  const earthRadius = 3958.7613;
  const angular = radiusMiles / earthRadius;
  const lat1 = latitude * Math.PI / 180;
  const lon1 = longitude * Math.PI / 180;
  const coordinates = Array.from({ length: 65 }, (_, index) => {
    const bearing = (index / 64) * Math.PI * 2;
    const lat2 = Math.asin(Math.sin(lat1) * Math.cos(angular) + Math.cos(lat1) * Math.sin(angular) * Math.cos(bearing));
    const lon2 = lon1 + Math.atan2(Math.sin(bearing) * Math.sin(angular) * Math.cos(lat1), Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2));
    return [lon2 * 180 / Math.PI, lat2 * 180 / Math.PI];
  });
  return { type: "Feature", properties, geometry: { type: "Polygon", coordinates: [coordinates] } };
}
function fitRows(map, rows) {
  if (!map) return;
  const coordinates = rows.filter(hasCoordinates).map((row) => [Number(row.longitude), Number(row.latitude)]);
  if (!coordinates.length) { map.flyTo({ center: [-98.5, 38.2], zoom: 3.2 }); return; }
  if (coordinates.length === 1) { map.flyTo({ center: coordinates[0], zoom: 8 }); return; }
  const bounds = coordinates.reduce((value, coordinate) => value.extend(coordinate), new mapboxgl.LngLatBounds(coordinates[0], coordinates[0]));
  map.fitBounds(bounds, { padding: 70, maxZoom: 8 });
}
function unassignedRow(jobs) { return { area_name: "Outside Coverage / Unassigned", jobs, total: jobs.length, completed: jobs.filter((job) => coverageStatusBucket(job.status) === "completed").length, cancelled: jobs.filter((job) => coverageStatusBucket(job.status) === "cancelled").length, dryRuns: jobs.filter((job) => coverageStatusBucket(job.status) === "dryRuns").length, active: jobs.filter((job) => coverageStatusBucket(job.status) === "active").length, pending: jobs.filter((job) => coverageStatusBucket(job.status) === "pending").length, exactCities: [], activeTechnicians: [] }; }
function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[character])); }

