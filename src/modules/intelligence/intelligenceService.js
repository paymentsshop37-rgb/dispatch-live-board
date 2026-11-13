// Never fall back to direct table reads: each page requires the bound CFO identity.
export async function loadIntelligenceRows(client, dataset) {
  const rows = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await client.rpc("get_intelligence_page", { dataset, page_offset: offset, page_size: 500 });
    if (error) throw error;
    if (!Array.isArray(data)) throw new Error("Invalid Intelligence data response.");
    rows.push(...data);
    if (data.length < 500) return rows;
  }
}
