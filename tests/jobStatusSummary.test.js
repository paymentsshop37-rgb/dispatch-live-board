import assert from "node:assert/strict";
import test from "node:test";
import { jobStatusSummary } from "../src/modules/jobs/jobStatusSummary.js";

test("every status contributes once to the same card and chart totals", () => {
  const jobs = ["Completed", " complete ", "Paid", "Canceled", "Cancelled", "VOID", "Dry Run", "New", "Pending", "Open", "Assigned", "En Route", "Working", "In Progress", "Need Review", "Declined"].map(status => ({ status }));
  const result = jobStatusSummary(jobs);
  assert.deepEqual(result, { total: 16, completed: 3, cancelled: 3, dryRuns: 1, pending: 3, inProgress: 6 });
  assert.equal(result.total, result.completed + result.cancelled + result.dryRuns + result.pending + result.inProgress);
});

test("empty data and missing status remain consistent", () => {
  assert.equal(jobStatusSummary([]).total, 0);
  assert.equal(jobStatusSummary([{}]).pending, 1);
});
