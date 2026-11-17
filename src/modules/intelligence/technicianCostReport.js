import { validDate } from "./intelligenceModel.js";

export const costSourceLabels = {
  transaction: "Payment transaction",
  paid_status: "Job marked Paid",
  job_parts: "Parts recorded on job",
};

export async function loadTechnicianCosts(client, { from, to }) {
  const rows = [];
  let afterKey = "";
  while (true) {
    const { data, error } = await client.rpc("get_cfo_technician_cost_page", {
      from_date: from, to_date: to, after_key: afterKey,
    });
    if (error) throw error;
    if (!Array.isArray(data)) throw new Error("Invalid technician cost response.");
    rows.push(...data);
    if (data.length < 500) return rows;
    const nextKey = data.at(-1)?.movement_key;
    if (!nextKey || nextKey === afterKey) throw new Error("Invalid technician cost cursor.");
    afterKey = nextKey;
  }
}

function technicianName(row) {
  return String(row.technician ?? "").trim().replace(/\s+/g, " ");
}

export function buildTechnicianCosts(movements) {
  const idsByName = new Map();
  const namesById = new Map();
  for (const row of movements) {
    const name = technicianName(row);
    if (!row.technician_id || !name) continue;
    const key = name.toUpperCase();
    if (!idsByName.has(key)) idsByName.set(key, new Set());
    idsByName.get(key).add(row.technician_id);
    namesById.set(row.technician_id, name);
  }

  const groups = new Map();
  const totals = { transaction: 0, paid_status: 0, job_parts: 0 };
  const rows = movements.map(row => {
    const name = technicianName(row);
    const nameKey = name.toUpperCase();
    const matchingIds = idsByName.get(nameKey);
    const id = row.technician_id || (matchingIds?.size === 1 ? [...matchingIds][0] : null);
    const key = id ? `id:${id}` : `name:${nameKey}`;
    const label = namesById.get(id) || name || "Unassigned technician";
    const amount = Number(row.amount);
    const hasAmount = row.amount != null && row.amount !== "" && Number.isFinite(amount);
    const cents = hasAmount ? Math.round(amount * 100) : null;
    const issue = !validDate(row.movement_date) ? "Missing or invalid date"
      : !hasAmount || (row.source === "paid_status" && cents <= 0) ? "Missing or invalid amount" : "";
    if (!issue) {
      const group = groups.get(key) || { key, label, transaction: 0, paid_status: 0, job_parts: 0 };
      group[row.source] += cents;
      totals[row.source] += cents;
      groups.set(key, group);
    }
    return { ...row, key, label, cents, issue };
  }).sort((a, b) => (b.movement_date || "").localeCompare(a.movement_date || "") || a.label.localeCompare(b.label));
  return {
    rows,
    totals,
    reviewCount: rows.filter(row => row.issue).length,
    groups: [...groups.values()].sort((a, b) => a.label.localeCompare(b.label)),
  };
}
