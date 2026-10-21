// Supabase limits each response. Read every page so recent jobs are not
// silently dropped once the board grows beyond that limit.
import { loadAllRows } from "../../lib/loadAllRows.js";

const pendingReads = new WeakMap();

// Keep reads within the current authenticated session. No completed results
// are cached, so a later refresh always asks the database again.
export function clearPendingBoardJobs(client) {
  pendingReads.delete(client);
}

export async function loadBoardJobs(client, { columns = "*", deduplicate = true } = {}) {
  let reads = pendingReads.get(client);
  if (!reads) {
    reads = new Map();
    pendingReads.set(client, reads);
  }
  if (deduplicate && reads.has(columns)) return reads.get(columns);
  const request = loadAllRows(() => client
      .from("jobs")
      .select(columns)
      .order("job_date", { ascending: true })
      .order("id", { ascending: true }));
  reads.set(columns, request);
  try {
    return await request;
  } finally {
    if (reads.get(columns) === request) reads.delete(columns);
  }
}
