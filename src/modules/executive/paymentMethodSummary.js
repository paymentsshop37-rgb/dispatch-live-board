const label = (value) => String(value ?? "").trim();

export function buildPaymentMethodsReport(jobs = [], { paidOnly = true } = {}) {
  const groups = new Map();
  const totals = { a: 0, b: 0, unassigned: 0, total: 0 };

  for (const job of jobs) {
    if (paidOnly && label(job.invoiceStatus).toLowerCase() !== "paid") continue;

    const rawMethod = label(job.paymentMethod);
    const method = rawMethod || "No registrado";
    const key = method.toLocaleLowerCase("en-US");
    if (!groups.has(key)) groups.set(key, { method, a: 0, b: 0, unassigned: 0, total: 0 });

    const group = groups.get(key);
    const receiver = label(job.paymentReceiver).toUpperCase();
    const column = receiver === "A" ? "a" : receiver === "B" ? "b" : "unassigned";
    group[column] += 1;
    group.total += 1;
    totals[column] += 1;
    totals.total += 1;
  }

  return {
    rows: [...groups.values()].sort((a, b) => a.method.localeCompare(b.method)),
    totals,
  };
}
