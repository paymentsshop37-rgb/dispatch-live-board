import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260816000200_normalize_service_area_alias_on_write.sql", import.meta.url),
  "utf8",
);

test("service area aliases normalize city and state before database constraints", () => {
  assert.match(migration, /new\.normalized_city\s*:=\s*public\.normalize_location_text\(new\.city\)/i);
  assert.match(migration, /new\.normalized_state\s*:=\s*new\.state/i);
  assert.match(migration, /before insert or update on public\.service_area_city_aliases/i);
});
