import assert from "node:assert/strict";
import test from "node:test";
import { buildServiceAreaPayload, validateServiceArea } from "../src/modules/coverage/serviceAreaPayload.js";

const validArea = {
  area_name: "West Texas",
  primary_city: "El Paso",
  state: "TX",
  latitude: "31.7619",
  longitude: "-106.4850",
  coverage_radius_miles: "75",
  is_active: true,
};

test("service area payload includes a normalized state for creates and updates", () => {
  const created = buildServiceAreaPayload({ ...validArea, state: " tx " }, "2026-08-15T00:00:00.000Z");
  const updated = buildServiceAreaPayload({ ...validArea, id: "existing-area", state: " co " }, "2026-08-15T00:00:00.000Z");

  assert.equal(created.state, "TX");
  assert.equal(created.normalized_state, "TX");
  assert.equal(updated.state, "CO");
  assert.equal(updated.normalized_state, "CO");
  assert.equal(created.coverage_radius_miles, 150);
  assert.equal(updated.coverage_radius_miles, 150);
});

test("service area payload always enforces the fixed 150-mile radius", () => {
  assert.equal(buildServiceAreaPayload({ ...validArea, coverage_radius_miles: 25 }).coverage_radius_miles, 150);
  assert.equal(buildServiceAreaPayload({ ...validArea, coverage_radius_miles: 500 }).coverage_radius_miles, 150);
});

test("service area validation requires a two-letter state", () => {
  assert.equal(validateServiceArea({ ...validArea, state: "" }), "State is required. Enter a two-letter abbreviation, such as TX.");
  assert.equal(validateServiceArea({ ...validArea, state: "Texas" }), "State must be a valid two-letter abbreviation, such as TX.");
  assert.equal(validateServiceArea({ ...validArea, state: "T1" }), "State must be a valid two-letter abbreviation, such as TX.");
});

test("negative latitude and longitude remain negative numbers in the payload", () => {
  const payload = buildServiceAreaPayload({ ...validArea, latitude: "-31.7619" }, "2026-08-15T00:00:00.000Z");

  assert.equal(payload.latitude, -31.7619);
  assert.equal(payload.longitude, -106.485);
});
