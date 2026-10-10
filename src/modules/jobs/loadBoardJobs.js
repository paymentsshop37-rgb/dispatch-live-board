// Supabase limits each response. Read every page so recent jobs are not
// silently dropped once the board grows beyond that limit.
import { loadAllRows } from "../../lib/loadAllRows.js";

export async function loadBoardJobs(client, { columns = "*" } = {}) {
  return loadAllRows(() => client
      .from("jobs")
      .select(columns)
      .order("job_date", { ascending: true })
      .order("id", { ascending: true }));
}
