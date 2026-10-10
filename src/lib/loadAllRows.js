// Build a fresh query for each page with a stable order supplied by the caller.
export async function loadAllRows(queryFactory) {
  const rows = [];
  const pageSize = 500;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await queryFactory().range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) return rows;
  }
}
