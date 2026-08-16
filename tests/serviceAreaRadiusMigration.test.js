import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL("../supabase/migrations/20260816000300_set_service_area_radius_150.sql", import.meta.url);

test("service area radius migration updates existing rows and enforces future writes", async () => {
  const sql = await readFile(migrationUrl, "utf8");

  assert.match(sql, /update public\.service_areas\s+set coverage_radius_miles = 150/i);
  assert.match(sql, /alter column coverage_radius_miles set default 150/i);
  assert.match(sql, /new\.coverage_radius_miles := 150/i);
  assert.match(sql, /before insert or update of coverage_radius_miles/i);
  assert.doesNotMatch(sql, /delete\s+from\s+public\.service_areas/i);
});
