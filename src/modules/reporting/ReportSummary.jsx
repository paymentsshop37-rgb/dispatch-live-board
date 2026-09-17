import React, { useMemo } from "react";
import { calculateReportSummary } from "./reportSummary.js";
import { summaryHtml } from "./summaryRenderers.js";

export default function ReportSummary({ rows, summary, includeFinancial = true, kind = "jobs", recordLabel = "Records" }) {
  const html = useMemo(() => summaryHtml(summary || calculateReportSummary(rows, { includeFinancial, kind, recordLabel })), [rows, summary, includeFinancial, kind, recordLabel]);
  // summaryHtml escapes every label and value, including user-entered names.
  return <div className="overflow-x-auto rounded-xl bg-white p-4 text-slate-900" dangerouslySetInnerHTML={{ __html: html }} />;
}
