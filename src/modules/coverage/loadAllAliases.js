// Supabase caps each response. Read every page so large syncs stay visible.
export async function loadAllAliases(client, onProgress) {
  const rows = [];
  const pageSize = 500;
  // Fetch a bounded group concurrently instead of 41 serial requests for 20k rows.
  const concurrency = 4;
  for (let from = 0; ; from += pageSize * concurrency) {
    const pages = await Promise.all(Array.from({ length: concurrency }, (_, index) => {
      const offset = from + index * pageSize;
      return client.from("service_area_city_aliases").select("*")
        .order("created_at").order("id").range(offset, offset + pageSize - 1);
    }));
    for (const page of pages) if (page.error) throw page.error;
    let complete = false;
    for (const { data } of pages) {
      rows.push(...(data || []));
      if (!data || data.length < pageSize) { complete = true; break; }
    }
    onProgress?.([...rows]);
    if (complete) return rows;
  }
}
