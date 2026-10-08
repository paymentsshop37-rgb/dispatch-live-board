import assert from "node:assert/strict";
import test from "node:test";
import { loadBoardJobs } from "../src/modules/jobs/loadBoardJobs.js";

function clientFor(rows, failAt = -1) {
  const ranges = [];
  const orders = [];
  return {
    ranges, orders,
    from(table) {
      assert.equal(table, "jobs");
      const query = {
        select(columns) { assert.equal(columns, "*"); return query; },
        order(column, options) { orders.push([column, options]); return query; },
        async range(from, to) {
          ranges.push([from, to]);
          return from === failAt
            ? { data: null, error: new Error("Connection interrupted") }
            : { data: rows.slice(from, to + 1), error: null };
        },
      };
      return query;
    },
  };
}

test("includes today's five jobs after the first 1,000 older jobs", async () => {
  const rows = Array.from({ length: 1005 }, (_, id) => ({ id, job_date: id < 1000 ? "2026-10-07" : "2026-10-08" }));
  const client = clientFor(rows);
  assert.deepEqual(await loadBoardJobs(client), rows);
  assert.deepEqual(client.ranges, [[0, 499], [500, 999], [1000, 1499]]);
  assert.deepEqual(client.orders.slice(0, 2), [["job_date", { ascending: true }], ["id", { ascending: true }]]);
});

test("handles empty boards and exact page boundaries", async () => {
  assert.deepEqual(await loadBoardJobs(clientFor([])), []);
  const rows = Array.from({ length: 1000 }, (_, id) => ({ id }));
  assert.deepEqual(await loadBoardJobs(clientFor(rows)), rows);
});

test("rejects a failed later page instead of showing an incomplete board", async () => {
  const client = clientFor(Array.from({ length: 1005 }, (_, id) => ({ id })), 500);
  await assert.rejects(loadBoardJobs(client), /Connection interrupted/);
});
