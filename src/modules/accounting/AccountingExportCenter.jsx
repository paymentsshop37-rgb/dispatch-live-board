import React, { useState } from "react";
import { Download, FileSpreadsheet, FileText, LoaderCircle, Printer } from "lucide-react";
import { estimatedProfit, isCancelled, isCompleted, isDryRun } from "./accountingData.js";
import { loadAllTransactionRows, logAccountingExport } from "./accountingService.js";

const reports = [
  ["executive-accounting", "Executive Accounting Report"], ["accounts-receivable", "Accounts Receivable"], ["customer-invoice-register", "Customer Invoice Register"], ["invoice-payment-history", "Invoice Payment History"],
  ["technician-payments-due", "Technician Payments Due"], ["technician-payment-history", "Technician Payment History"], ["profitability", "Profitability Report"], ["red-internal-control", "Red Internal Control Queue"],
  ["completed-jobs", "Completed Jobs"], ["cancelled-jobs", "Cancelled Jobs"], ["dry-runs", "Dry Runs"], ["complete-workbook", "Complete Accounting Workbook"],
];

export default function AccountingExportCenter({ model, outstanding, settings, session, rangeLabel, onNotice }) {
  const [busy, setBusy] = useState("");
  async function prepare() {
    const [invoicePayments, techTransactions] = await Promise.all([loadAllTransactionRows("invoice_payments"), loadAllTransactionRows("technician_payment_transactions")]);
    return { model: { ...model, outstandingSentInvoices: outstanding }, settings, pendingTechJobs: model.techDueJobs, invoicePayments, techTransactions };
  }
  async function run(id, label, format) {
    const key = `${id}-${format}`; setBusy(key);
    try {
      const payload = await prepare();
      const options = { reportId: id, generatedAt: new Date().toISOString(), generatedBy: session?.name || session?.username || "Administrator", filterLabel: rangeLabel };
      if (format === "xlsx") {
        const buffer = await worker(payload, options);
        download(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), filename(label, "xlsx"));
      } else {
        const data = reportTable(id, payload);
        if (format === "csv") download(new Blob([csv(data.headers, data.rows)], { type: "text/csv;charset=utf-8" }), filename(label, "csv"));
        else {
          const { createAccountingPdf } = await import("./accountingPdf.js");
          const blob = createAccountingPdf({ title: label, ...data, model: id === "executive-accounting" ? payload.model : null, generatedBy: options.generatedBy, filterLabel: rangeLabel, footer: settings?.pdf_footer || "Confidential - NTTR" });
          if (format === "print") { const url = URL.createObjectURL(blob); window.open(url, "_blank", "noopener,noreferrer"); window.setTimeout(() => URL.revokeObjectURL(url), 60000); }
          else download(blob, filename(label, "pdf"));
        }
      }
      await logAccountingExport(id, { format, range: rangeLabel });
      onNotice?.(`${label} ${format.toUpperCase()} generated.`);
    } catch (error) { onNotice?.(error.message || "Export failed."); }
    finally { setBusy(""); }
  }
  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><header className="border-b bg-[#0b1f3a] p-5 text-white"><p className="text-xs font-black uppercase tracking-[.18em] text-blue-300">Accounting Export Center</p><h2 className="mt-1 text-2xl font-black">Premium NTTR Financial Reports</h2><p className="mt-1 text-sm text-slate-400">Excel uses a background worker for large datasets. Every export is audited.</p></header><div className="grid gap-3 p-4 lg:grid-cols-2">{reports.map(([id, label]) => <div key={id} className="rounded-2xl border border-slate-200 p-4"><h3 className="font-black text-slate-950">{label}</h3><p className="mt-1 text-xs text-slate-500">{id === "complete-workbook" ? "12-sheet accounting workbook" : "Filtered accounting report"}</p><div className="mt-3 flex flex-wrap gap-2">{[["xlsx", FileSpreadsheet, "Excel"], ["pdf", FileText, "PDF"], ["csv", Download, "CSV"], ["print", Printer, "Print"]].map(([format, Icon, text]) => <button key={format} disabled={Boolean(busy) || id === "complete-workbook" && format !== "xlsx"} onClick={() => run(id, label, format)} className="flex min-h-9 items-center gap-1.5 rounded-lg bg-slate-100 px-3 text-xs font-black text-slate-700 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-35">{busy === `${id}-${format}` ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}{text}</button>)}</div></div>)}</div></section>;
}

function worker(payload, options) { return new Promise((resolve, reject) => { const w = new Worker(new URL("./accountingWorkbookWorker.js", import.meta.url), { type: "module" }); const timeout = setTimeout(() => { w.terminate(); reject(new Error("Accounting workbook generation timed out.")); }, 300000); w.onmessage = (event) => { clearTimeout(timeout); w.terminate(); event.data.ok ? resolve(event.data.buffer) : reject(new Error(event.data.error)); }; w.onerror = (error) => { clearTimeout(timeout); w.terminate(); reject(new Error(error.message)); }; w.postMessage({ payload, options }); }); }
function reportTable(id, payload) { const jobs = id === "completed-jobs" ? payload.model.jobs.filter(isCompleted) : id === "cancelled-jobs" ? payload.model.jobs.filter(isCancelled) : id === "dry-runs" ? payload.model.jobs.filter(isDryRun) : id === "red-internal-control" ? payload.model.redJobs : id === "technician-payments-due" ? payload.pendingTechJobs : payload.model.jobs; if (id === "accounts-receivable") return { headers: ["Invoice #", "Due Date", "Company", "Reference #", "Total Bill", "Amount Paid", "Balance Due", "Aging", "Status"], rows: payload.model.receivables.map((row) => [row.invoiceNumber, row.dueDateLabel, row.company, row.referenceNumber, row.totalBill, row.amountPaid, row.balanceDue, row.agingBucket, row.paymentStatus]) }; if (id === "invoice-payment-history") return { headers: ["Payment Date", "Invoice #", "Amount", "Method", "Confirmation", "Status"], rows: payload.invoicePayments.map((row) => [row.payment_date, row.invoice_number, row.amount, row.payment_method, row.confirmation_number, row.voided_at ? "Voided" : "Active"]) }; if (id === "technician-payment-history") return { headers: ["Payment Date", "Technician", "Amount", "Method", "Confirmation", "Status"], rows: payload.techTransactions.map((row) => [row.payment_date, row.technician_name, row.amount, row.payment_method, row.confirmation_number, row.voided_at ? "Voided" : "Active"]) }; return { headers: ["Date", "Invoice #", "Reference #", "Company", "Technician", "Dispatcher", "Status", "Invoice Status", "Tech Payment", "Total Bill", "Parts", "Tech Labor", "Estimated Profit"], rows: jobs.map((job) => [job.date, job.invoiceNumber, job.referenceNumber, job.company, job.technician, job.dispatcher, job.status, job.invoiceStatus, job.techPaymentStatus, job.totalBill, job.parts, job.techLabor, estimatedProfit(job)]) }; }
function csv(headers, rows) { return [headers, ...rows].map((row) => row.map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(",")).join("\n"); }
function filename(label, ext) { return `NTTR-${label.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "")}-${new Date().toISOString().slice(0, 10)}.${ext}`; }
function download(blob, name) { const url = URL.createObjectURL(blob), anchor = document.createElement("a"); anchor.href = url; anchor.download = name; document.body.appendChild(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
