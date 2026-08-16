import assert from "node:assert/strict";
import test from "node:test";
import { buildCitiesWithoutJobs } from "../src/modules/coverage/coverageCityAnalysis.js";

function coverageCity({ id, city, state, latitude, longitude, aliases = [] }) {
  return {
    id: `city-${id}`,
    city,
    state,
    normalized_city: city.toUpperCase(),
    normalized_state: state,
    service_area_id: id,
    is_active: true,
    serviceArea: {
      id,
      area_name: `${city} Area`,
      primary_city: city,
      normalized_primary_city: city.toUpperCase(),
      state,
      normalized_state: state,
      latitude,
      longitude,
      coverage_radius_miles: 150,
      is_active: true,
    },
    serviceAreaAliases: aliases.map((alias) => ({
      service_area_id: id,
      city: alias,
      state,
      normalized_city: alias.toUpperCase(),
      normalized_state: state,
    })),
  };
}

const allDates = { from: "", to: "" };

test("job count, last job, days, and Previous Jobs share one assigned-job set", () => {
  const dallas = coverageCity({
    id: "dallas",
    city: "Dallas",
    state: "TX",
    latitude: 32.7767,
    longitude: -96.797,
    aliases: ["Fort Worth"],
  });
  const jobs = [
    {
      id: "completed",
      date: "2026-08-15",
      city: "Fort Worth",
      state: "TX",
      status: "Completed",
    },
    {
      id: "paid",
      date: "2026-08-16",
      city: "Dallas",
      state: "TX",
      status: "Paid",
    },
  ];
  const result = buildCitiesWithoutJobs({
    coverageCities: [dallas],
    jobs,
    technicians: [],
    range: allDates,
    includeCancelled: false,
    includeDryRuns: false,
  });
  const row = result.rows[0];

  assert.equal(row.jobs, 2);
  assert.equal(row.lastJobDate, "2026-08-16");
  assert.equal(row.daysSinceLastJob, 0);
  assert.match(row.coverageStatus, /Jobs/);
  assert.deepEqual(row.assignedJobs.map((job) => job.id).sort(), [
    "completed",
    "paid",
  ]);
  assert.equal(row.hasJobs, true);
  assert.equal(result.summary.withJobs, 1);
  assert.equal(result.summary.withoutJobs, 0);
});

test("the selected date and status rules apply to every coverage metric", () => {
  const albuquerque = coverageCity({
    id: "albuquerque",
    city: "Albuquerque",
    state: "NM",
    latitude: 35.0844,
    longitude: -106.6504,
  });
  const jobs = [
    {
      id: "old",
      date: "2026-07-31",
      city: "Albuquerque",
      state: "NM",
      status: "Completed",
    },
    {
      id: "completed",
      date: "2026-08-10",
      city: "Alburquerque",
      state: "NM",
      status: "Completed",
    },
    {
      id: "active",
      date: "2026-08-11",
      city: "Albuquerque",
      state: "NM",
      status: "In Progress",
    },
    {
      id: "cancelled",
      date: "2026-08-12",
      city: "Albuquerque",
      state: "NM",
      status: "Cancelled",
    },
    {
      id: "dry",
      date: "2026-08-13",
      city: "Albuquerque",
      state: "NM",
      status: "Dry Run",
    },
  ];
  const base = {
    coverageCities: [albuquerque],
    jobs,
    technicians: [],
    range: { from: "2026-08-01", to: "2026-08-31" },
  };
  const defaultResult = buildCitiesWithoutJobs({
    ...base,
    includeCancelled: false,
    includeDryRuns: false,
  });
  const allStatuses = buildCitiesWithoutJobs({
    ...base,
    includeCancelled: true,
    includeDryRuns: true,
  });

  assert.equal(defaultResult.rows[0].jobs, 2);
  assert.equal(defaultResult.rows[0].lastJobDate, "2026-08-11");
  assert.equal(allStatuses.rows[0].jobs, 4);
  assert.equal(allStatuses.rows[0].lastJobDate, "2026-08-13");
});

test("overlapping 150-mile areas assign a coordinate job only to the nearest area", () => {
  const first = coverageCity({
    id: "first",
    city: "First",
    state: "AA",
    latitude: 0,
    longitude: 0,
  });
  const second = coverageCity({
    id: "second",
    city: "Second",
    state: "BB",
    latitude: 0,
    longitude: 1,
  });
  const job = {
    id: "coordinate-job",
    date: "2026-08-16",
    city: "Unknown",
    state: "ZZ",
    status: "Completed",
    latitude: 0,
    longitude: 0.8,
  };
  const result = buildCitiesWithoutJobs({
    coverageCities: [first, second],
    jobs: [job],
    technicians: [],
    range: allDates,
    includeCancelled: false,
    includeDryRuns: false,
  });

  assert.equal(
    result.rows.find((row) => row.service_area_id === "first").jobs,
    0,
  );
  assert.equal(
    result.rows.find((row) => row.service_area_id === "second").jobs,
    1,
  );
  assert.equal(
    result.rows.reduce((total, row) => total + row.jobs, 0),
    1,
  );
});
