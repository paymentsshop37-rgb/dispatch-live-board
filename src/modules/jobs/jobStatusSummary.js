export function jobStatusBucket(status) {
  const value = String(status || "New").trim().toLowerCase();
  if (value.includes("cancel") || value.includes("void")) return "cancelled";
  if (value.includes("complete") || value.includes("paid")) return "completed";
  if (value.includes("dry")) return "dryRuns";
  if (value.includes("pending") || value.includes("new") || value.includes("open")) return "pending";
  return "inProgress";
}

export function jobStatusSummary(jobs) {
  const counts = { total: jobs.length, completed: 0, cancelled: 0, dryRuns: 0, pending: 0, inProgress: 0 };
  for (const job of jobs) counts[jobStatusBucket(job.status)] += 1;
  return counts;
}
