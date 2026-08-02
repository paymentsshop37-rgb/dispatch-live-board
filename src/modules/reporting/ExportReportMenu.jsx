import React, { useEffect, useRef, useState } from "react";
import { CheckCircle2, ChevronDown, FileDown, FileSpreadsheet, FileText, LoaderCircle, ShieldCheck } from "lucide-react";
import { exportNttrReport } from "./exportClient.js";
import { availableReports, getReportExportAccess } from "./reportPermissions.js";

export default function ExportReportMenu({ jobs, role, currentUser, filterLabel, onNotice }) {
  const [open, setOpen] = useState(false);
  const [busyReport, setBusyReport] = useState("");
  const containerRef = useRef(null);
  const reports = availableReports(role, currentUser);
  const access = getReportExportAccess(role, currentUser);

  useEffect(() => {
    function close(event) {
      if (!containerRef.current?.contains(event.target)) setOpen(false);
    }
    function escape(event) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", escape); };
  }, []);

  async function run(report) {
    if (busyReport) return;
    setBusyReport(report.id);
    setOpen(false);
    try {
      await exportNttrReport(report, jobs, {
        generatedAt: new Date().toISOString(),
        generatedBy: currentUser?.name || currentUser?.username || "Dispatch Live User",
        filterLabel,
        reportVersion: "2.0",
        includeFinancial: access.canExportFinancial,
      });
      onNotice?.(`${report.label.replace("Export ", "")} generated successfully.`);
    } catch (error) {
      onNotice?.(error.message || "Report generation failed.", true);
    } finally {
      setBusyReport("");
    }
  }

  if (!reports.length) return null;
  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        disabled={Boolean(busyReport)}
        className="flex h-10 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-black text-white shadow-lg shadow-emerald-950/20 transition hover:bg-emerald-500 disabled:cursor-wait disabled:opacity-80"
      >
        {busyReport ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
        {busyReport ? "Building Report..." : "Export Reports"}
        {!busyReport && <ChevronDown className="h-4 w-4" />}
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-50 mt-2 w-[min(92vw,360px)] overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-2xl">
          <div className="border-b border-slate-200 bg-slate-950 px-4 py-3 text-white">
            <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-400" /><p className="text-sm font-black">NTTR Reporting System</p></div>
            <p className="mt-1 text-xs text-slate-400">{jobs.length.toLocaleString()} filtered jobs · OpenXML and PDF</p>
          </div>
          <div className="max-h-[65vh] overflow-y-auto p-2">
            {reports.map((report) => {
              const Icon = report.format === "pdf" ? FileText : FileSpreadsheet;
              return (
                <button key={report.id} type="button" role="menuitem" onClick={() => run(report)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-slate-100">
                  <span className={`rounded-lg p-2 ${report.format === "pdf" ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-700"}`}><Icon className="h-4 w-4" /></span>
                  <span className="min-w-0 flex-1"><span className="block text-sm font-bold">{report.label}</span><span className="block text-xs text-slate-500">{report.format === "pdf" ? "Landscape executive PDF" : "Professional Excel workbook"}</span></span>
                  <CheckCircle2 className="h-4 w-4 text-slate-300" />
                </button>
              );
            })}
          </div>
          {!access.canExportFinancial && (
            <p className="border-t border-slate-200 bg-amber-50 px-4 py-2.5 text-xs font-semibold text-amber-900">Operational access: financial measures are excluded.</p>
          )}
        </div>
      )}
    </div>
  );
}
