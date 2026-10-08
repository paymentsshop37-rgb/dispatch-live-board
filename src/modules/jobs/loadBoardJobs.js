// Supabase limits each response. Read every page so recent jobs are not
// silently dropped once the board grows beyond that limit.
export async function loadBoardJobs(client) {
  const pageSize = 500;
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await client
      .from("jobs")
      .select("*")
      .order("job_date", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) return rows;
  }
}
