import React, { useEffect, useMemo, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import { supabase } from "../../lib/supabase";

const columnAliases = {
  invoiceNumber: ["invoice_number", "invoice", "reference"],
  date: ["job_date", "date"],
  company: ["company"],
  location: ["location"],
  status: ["invoice_status", "status", "invoice"],
  paymentMethod: ["payment_method", "paymentMethod"],
  totalBill: ["total_bill", "totalBill"],
  parts: ["parts"],
  techLabor: ["tech_labor", "techLabor"],
};

const requiredFields = ["invoiceNumber", "date", "company", "location", "status", "paymentMethod", "totalBill", "parts", "techLabor"];

export default function BillingDashboard() {
  const [jobs, setJobs] = useState([]);
  const [warnings, setWarnings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    fromDate: "",
    toDate: "",
    status: "All",
    company: "All",
    paymentMethod: "All",
  });

  useEffect(() => {
    loadBillingJobs();
  }, []);

  async function loadBillingJobs() {
    setLoading(true);
    const { data, error } = await supabase.from("jobs").select("*");

    if (error) {
      setWarnings([`Safe mode: unable to load jobs table (${error.message}).`]);
      setJobs([]);
      setLoading(false);
      return;
    }

    const rows = data || [];
    const availableColumns = new Set(rows.flatMap((row) => Object.keys(row || {})));
    const missingFields = requiredFields.filter((field) => !columnAliases[field].some((column) => availableColumns.has(column)));

    setWarnings(
      missingFields.length
        ? [`Safe mode: missing billing columns or no rows available for: ${missingFields.join(", ")}.`]
        : []
    );
    setJobs(rows.map(normalizeJob).sort((a, b) => String(b.date || "").localeCompare(String(a.date || ""))));
    setLoading(false);
  }

  const filteredJobs = useMemo(() => {
    return jobs.filter((job) => {
      const matchesFrom = !filters.fromDate || job.date >= filters.fromDate;
      const matchesTo = !filters.toDate || job.date <= filters.toDate;
      const matchesStatus = filters.status === "All" || job.status === filters.status;
      const matchesCompany = filters.company === "All" || job.company === filters.company;
      const matchesPayment = filters.paymentMethod === "All" || job.paymentMethod === filters.paymentMethod;

      return matchesFrom && matchesTo && matchesStatus && matchesCompany && matchesPayment;
    });
  }, [jobs, filters]);

  const totals = useMemo(() => {
    const totalRevenue = filteredJobs.reduce((sum, job) => sum + job.totalBill, 0);
    const partsCost = filteredJobs.reduce((sum, job) => sum + job.parts, 0);
    const techLabor = filteredJobs.reduce((sum, job) => sum + job.techLabor, 0);
    const paidInvoices = filteredJobs.filter((job) => isPaid(job.status)).length;
    const pendingInvoices = filteredJobs.filter((job) => !isPaid(job.status)).length;
    const outstandingBalance = filteredJobs.filter((job) => !isPaid(job.status)).reduce((sum, job) => sum + job.totalBill, 0);

    return {
      totalRevenue,
      pendingInvoices,
      paidInvoices,
      outstandingBalance,
      partsCost,
      techLabor,
      profit: totalRevenue - partsCost - techLabor,
    };
  }, [filteredJobs]);

  const companies = uniqueOptions(jobs.map((job) => job.company));
  const statuses = uniqueOptions(jobs.map((job) => job.status));
  const paymentMethods = uniqueOptions(jobs.map((job) => job.paymentMethod));

  function exportCsv() {
    const headers = ["Invoice #", "Date", "Company", "Location", "Status", "Payment Method", "Total Bill", "Parts", "Tech Labor", "Profit"];
    const rows = filteredJobs.map((job) => [
      job.invoiceNumber,
      job.date,
      job.company,
      job.location,
      job.status,
      job.paymentMethod,
      job.totalBill,
      job.parts,
      job.techLabor,
      job.profit,
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `nttr-billing-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen w-full max-w-none bg-slate-100 p-4 md:p-8">
      <div className="space-y-6">
        <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-blue-600">NTTR Command Center</p>
            <h1 className="text-3xl font-bold text-slate-950">Billing & Payments</h1>
            <p className="mt-1 text-sm text-slate-500">Revenue, invoice status, costs, and profitability from Dispatch jobs.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={loadBillingJobs} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
            <button type="button" onClick={exportCsv} className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700">
              <Download className="h-4 w-4" />
              Export CSV
            </button>
          </div>
        </div>

        {warnings.map((warning) => (
          <div key={warning} className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800">
            {warning}
          </div>
        ))}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-7">
          <BillingCard label="Total Revenue" value={money(totals.totalRevenue)} />
          <BillingCard label="Pending Invoices" value={totals.pendingInvoices} />
          <BillingCard label="Paid Invoices" value={totals.paidInvoices} />
          <BillingCard label="Outstanding Balance" value={money(totals.outstandingBalance)} />
          <BillingCard label="Parts Cost" value={money(totals.partsCost)} />
          <BillingCard label="Tech Labor" value={money(totals.techLabor)} />
          <BillingCard label="Profit" value={money(totals.profit)} highlight={totals.profit >= 0} />
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <FilterInput label="Start Date" type="date" value={filters.fromDate} onChange={(value) => setFilters((current) => ({ ...current, fromDate: value }))} />
            <FilterInput label="End Date" type="date" value={filters.toDate} onChange={(value) => setFilters((current) => ({ ...current, toDate: value }))} />
            <FilterSelect label="Status" value={filters.status} options={["All", ...statuses]} onChange={(value) => setFilters((current) => ({ ...current, status: value }))} />
            <FilterSelect label="Company" value={filters.company} options={["All", ...companies]} onChange={(value) => setFilters((current) => ({ ...current, company: value }))} />
            <FilterSelect label="Payment Method" value={filters.paymentMethod} options={["All", ...paymentMethods]} onChange={(value) => setFilters((current) => ({ ...current, paymentMethod: value }))} />
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-slate-950">Invoice List</h2>
              <p className="text-sm text-slate-500">{loading ? "Loading invoices..." : `${filteredJobs.length} invoice records`}</p>
            </div>
          </div>

          <div className="w-full overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-[1300px] table-auto whitespace-nowrap text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  {["Invoice #", "Date", "Company", "Location", "Status", "Payment Method", "Total Bill", "Parts", "Tech Labor", "Profit", "Actions"].map((header) => (
                    <th key={header} className="px-4 py-3 font-bold">{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredJobs.map((job) => (
                  <tr key={job.id} className="border-t border-slate-200">
                    <td className="px-4 py-3 font-bold text-slate-900">{job.invoiceNumber || "No invoice"}</td>
                    <td className="px-4 py-3">{job.date || "Not set"}</td>
                    <td className="px-4 py-3">{job.company || "Not set"}</td>
                    <td className="px-4 py-3">{job.location || "Not set"}</td>
                    <td className="px-4 py-3"><StatusBadge status={job.status} /></td>
                    <td className="px-4 py-3">{job.paymentMethod || "Pending"}</td>
                    <td className="px-4 py-3 font-bold">{money(job.totalBill)}</td>
                    <td className="px-4 py-3">{money(job.parts)}</td>
                    <td className="px-4 py-3">{money(job.techLabor)}</td>
                    <td className={`px-4 py-3 font-bold ${job.profit >= 0 ? "text-emerald-700" : "text-red-700"}`}>{money(job.profit)}</td>
                    <td className="px-4 py-3">
                      <button type="button" className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200">
                        View
                      </button>
                    </td>
                  </tr>
                ))}
                {!loading && filteredJobs.length === 0 && (
                  <tr>
                    <td colSpan={11} className="px-4 py-8 text-center text-slate-500">No invoices match the current filters.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function normalizeJob(row) {
  const totalBill = numberValue(readAlias(row, columnAliases.totalBill));
  const parts = numberValue(readAlias(row, columnAliases.parts));
  const techLabor = numberValue(readAlias(row, columnAliases.techLabor));

  return {
    id: row.id || `${readAlias(row, columnAliases.invoiceNumber)}-${readAlias(row, columnAliases.date)}`,
    invoiceNumber: readAlias(row, columnAliases.invoiceNumber),
    date: readAlias(row, columnAliases.date),
    company: readAlias(row, columnAliases.company),
    location: readAlias(row, columnAliases.location),
    status: readAlias(row, columnAliases.status) || "Pending",
    paymentMethod: readAlias(row, columnAliases.paymentMethod) || "Pending",
    totalBill,
    parts,
    techLabor,
    profit: totalBill - parts - techLabor,
  };
}

function readAlias(row, aliases) {
  const key = aliases.find((alias) => row?.[alias] !== undefined && row?.[alias] !== null);
  return key ? row[key] : "";
}

function numberValue(value) {
  return Number(value || 0);
}

function uniqueOptions(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

function isPaid(status) {
  return String(status || "").toLowerCase() === "paid";
}

function money(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value || 0));
}

function BillingCard({ label, value, highlight = false }) {
  return (
    <div className={`rounded-xl border p-4 shadow-sm ${highlight ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white"}`}>
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-slate-950">{value}</p>
    </div>
  );
}

function FilterInput({ label, value, onChange, type = "text" }) {
  return (
    <label className="space-y-1 text-sm font-semibold text-slate-700">
      {label}
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-blue-500" />
    </label>
  );
}

function FilterSelect({ label, value, options, onChange }) {
  return (
    <label className="space-y-1 text-sm font-semibold text-slate-700">
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-blue-500">
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

function StatusBadge({ status }) {
  const paid = isPaid(status);
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-bold ${paid ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
      {status || "Pending"}
    </span>
  );
}
