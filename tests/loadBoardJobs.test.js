import assert from "node:assert/strict";
import test from "node:test";
import { clearPendingBoardJobs, loadBoardJobs } from "../src/modules/jobs/loadBoardJobs.js";

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

test("concurrent board and alert reads share every page, but later reads are fresh", async () => {
  const rows = Array.from({ length: 1005 }, (_, id) => ({ id }));
  const client = clientFor(rows);
  const results = await Promise.all([loadBoardJobs(client), loadBoardJobs(client)]);
  assert.deepEqual(results, [rows, rows]);
  assert.equal(client.ranges.length, 3);
  rows.push({ id: 1005 });
  assert.equal((await loadBoardJobs(client)).length, 1006);
  assert.equal(client.ranges.length, 6);
});

test("reads after edits and authentication changes do not reuse older pending reads", async () => {
  const client = clientFor([{ id: 1 }]);
  const oldRead = loadBoardJobs(client);
  const afterEdit = loadBoardJobs(client, { deduplicate: false });
  clearPendingBoardJobs(client);
  const afterLogin = loadBoardJobs(client);
  await Promise.all([oldRead, afterEdit, afterLogin]);
  assert.equal(client.ranges.length, 3);
});

test("failed shared reads are cleared so the next refresh retries", async () => {
  const client = clientFor([], 0);
  const results = await Promise.allSettled([loadBoardJobs(client), loadBoardJobs(client)]);
  assert.ok(results.every(result => result.status === "rejected"));
  assert.equal(client.ranges.length, 1);
  await assert.rejects(loadBoardJobs(client), /Connection interrupted/);
  assert.equal(client.ranges.length, 2);
});

test("different clients never share pending job reads", async () => {
  const first = clientFor([{ id: 1 }]);
  const second = clientFor([{ id: 2 }]);
  assert.deepEqual(await Promise.all([loadBoardJobs(first), loadBoardJobs(second)]), [[{ id: 1 }], [{ id: 2 }]]);
});
