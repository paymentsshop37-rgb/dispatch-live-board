// Supabase caps each response. Read every page so large syncs stay visible.
export async function loadAllAliases(client) {
  const rows = [];
  const pageSize = 500;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await client.from("service_area_city_aliases")
      .select("*").order("created_at").order("id").range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) return rows;
  }
}
