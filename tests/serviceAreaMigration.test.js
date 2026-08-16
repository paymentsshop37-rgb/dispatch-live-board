import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260816000100_normalize_service_area_state_on_write.sql", import.meta.url),
  "utf8",
);

test("service area writes normalize state before database constraints run", () => {
  assert.match(migration, /normalized_state_value\s*:=\s*upper\(trim\(coalesce\(new\.state,\s*''\)\)\)/i);
  assert.match(migration, /new\.state\s*:=\s*normalized_state_value/i);
  assert.match(migration, /new\.normalized_state\s*:=\s*normalized_state_value/i);
  assert.match(migration, /before insert or update on public\.service_areas/i);
});

test("service area state remains required at the database boundary", () => {
  assert.match(migration, /if normalized_state_value = '' then[\s\S]*raise exception 'State is required'/i);
  assert.doesNotMatch(migration, /drop not null|alter column normalized_state drop not null/i);
});
