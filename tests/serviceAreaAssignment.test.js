import assert from "node:assert/strict";
import test from "node:test";
import { assignServiceArea, buildServiceAreaRows } from "../src/modules/coverage/serviceAreaAssignment.js";

const dallas = {
  id: "dallas",
  area_name: "Dallas–Fort Worth Area",
  primary_city: "Dallas",
  normalized_primary_city: "DALLAS",
  state: "TX",
  normalized_state: "TX",
  latitude: "32.7767",
  longitude: "-96.7970",
  coverage_radius_miles: 150,
  is_active: true,
};
const waco = {
  id: "waco",
  area_name: "Waco Area",
  primary_city: "Waco",
  normalized_primary_city: "WACO",
  state: "TX",
  normalized_state: "TX",
  latitude: 31.5493,
  longitude: -97.1467,
  coverage_radius_miles: 150,
  is_active: true,
};
const fortWorthAlias = {
  service_area_id: "dallas",
  city: "Fort Worth",
  state: "TX",
  normalized_city: "FORT WORTH",
  normalized_state: "TX",
};

test("Fort Worth matches the configured Dallas alias without coordinates", () => {
  const result = assignServiceArea({ city: " Ft. Worth ", state: " tx " }, [dallas, waco], [fortWorthAlias]);
  assert.equal(result.area?.id, "dallas");
  assert.equal(result.method, "alias");
});

test("location-only historical jobs fall back to normalized city and state", () => {
  const result = assignServiceArea(
    { city: "", state: "", raw: { location: "123 Main St, Fort Worth, TX 76102" } },
    [dallas, waco],
    [fortWorthAlias],
  );
  assert.equal(result.area?.id, "dallas");
  assert.equal(result.method, "alias");
});

test("configured aliases override stale automatic assignments but not manual assignments", () => {
  const automatic = assignServiceArea(
    { city: "Fort Worth", state: "TX", serviceAreaId: "waco", serviceAreaMethod: "nearest_radius" },
    [dallas, waco],
    [fortWorthAlias],
  );
  const manual = assignServiceArea(
    { city: "Fort Worth", state: "TX", serviceAreaId: "waco", serviceAreaMethod: "manual" },
    [dallas, waco],
    [fortWorthAlias],
  );
  assert.equal(automatic.area?.id, "dallas");
  assert.equal(manual.area?.id, "waco");
});

test("radius matching uses 150 miles even when a stale record contains a smaller radius", () => {
  const staleRadius = { ...dallas, id: "stale", primary_city: "Stale", normalized_primary_city: "STALE", state: "AA", normalized_state: "AA", latitude: 0, longitude: 0, coverage_radius_miles: 1 };
  const result = assignServiceArea({ city: "Unknown", state: "ZZ", latitude: 0, longitude: 2 }, [staleRadius], []);
  assert.equal(result.area?.id, "stale");
  assert.equal(result.method, "nearest_radius");
});

test("overlapping radiuses assign a job once to the nearest qualifying area", () => {
  const first = { ...dallas, id: "first", primary_city: "First", normalized_primary_city: "FIRST", state: "AA", normalized_state: "AA", latitude: 0, longitude: 0 };
  const second = { ...waco, id: "second", primary_city: "Second", normalized_primary_city: "SECOND", state: "BB", normalized_state: "BB", latitude: 0, longitude: 0.2 };
  const result = buildServiceAreaRows({
    jobs: [{ id: "job", city: "Unknown", state: "ZZ", latitude: 0, longitude: 0.05, status: "Completed", date: "2026-08-16" }],
    previousJobs: [],
    areas: [first, second],
    aliases: [],
    technicians: [],
  });
  assert.equal(result.rows.find((row) => row.id === "first").total, 1);
  assert.equal(result.rows.find((row) => row.id === "second").total, 0);
  assert.equal(result.assignedJobs.length, 1);
});

test("current and previous jobs use the same alias assignment logic", () => {
  const result = buildServiceAreaRows({
    jobs: [{ id: "current", city: "Fort Worth", state: "TX", status: "Completed", date: "2026-08-16" }],
    previousJobs: [{ id: "previous", city: "Fort Worth", state: "TX", status: "Completed", date: "2026-08-09" }],
    areas: [dallas, waco],
    aliases: [fortWorthAlias],
    technicians: [],
  });
  const row = result.rows.find((area) => area.id === "dallas");
  assert.equal(row.total, 1);
  assert.equal(row.completed, 1);
  assert.equal(row.previousTotal, 1);
});
