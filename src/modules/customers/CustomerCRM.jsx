import React, { useEffect, useMemo, useState } from "react";
import { BriefcaseBusiness, Mail, Phone, Plus, RefreshCw } from "lucide-react";
import { supabase } from "../../lib/supabase";

const profileTabs = ["Overview", "Contacts", "Locations", "Invoices", "Jobs", "Notes", "Payment History", "Activity Timeline"];

export default function CustomerCRM() {
  const [jobs, setJobs] = useState([]);
  const [warnings, setWarnings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [activeTab, setActiveTab] = useState("Overview");

  useEffect(() => {
    loadCustomers();
  }, []);

  async function loadCustomers() {
    setLoading(true);
    const nextWarnings = [];

    const { error: customerTableError } = await supabase.from("customers").select("id").limit(1);
    if (customerTableError) {
      nextWarnings.push("Safe mode: dedicated customers table is not available yet. CRM is using Dispatch jobs as the customer source.");
    }

    const { data, error } = await supabase.from("jobs").select("*");
    if (error) {
      setWarnings([...nextWarnings, `Safe mode: unable to load jobs table (${error.message}).`]);
      setJobs([]);
      setLoading(false);
      return;
    }

    setWarnings(nextWarnings);
    setJobs((data || []).map(normalizeJob));
    setLoading(false);
  }

  const customers = useMemo(() => buildCustomers(jobs), [jobs]);
  const stats = useMemo(() => buildStats(customers), [customers]);

  return (
    <div className="min-h-screen w-full max-w-none bg-slate-100 p-4 md:p-8">
      <div className="space-y-6">
        <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-blue-600">NTTR Command Center</p>
            <h1 className="text-3xl font-bold text-slate-950">Customer & Company CRM</h1>
            <p className="mt-1 text-sm text-slate-500">Company relationships, job history, locations, invoices, and account activity.</p>
          </div>
          <button type="button" onClick={loadCustomers} className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700">
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>

        {warnings.map((warning) => (
          <div key={warning} className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800">
            {warning}
          </div>
        ))}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <CrmCard label="Total Customers" value={stats.totalCustomers} />
          <CrmCard label="Active Companies" value={stats.activeCompanies} />
          <CrmCard label="New This Month" value={stats.newThisMonth} />
          <CrmCard label="Outstanding Balance" value={money(stats.outstandingBalance)} />
          <CrmCard label="Active Jobs" value={stats.activeJobs} />
          <CrmCard label="Average Invoice" value={money(stats.averageInvoice)} />
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-slate-950">Customer List</h2>
              <p className="text-sm text-slate-500">{loading ? "Loading customers..." : `${customers.length} company accounts`}</p>
            </div>
          </div>

          <div className="w-full overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-[1200px] table-auto whitespace-nowrap text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  {["Company", "Contact", "Phone", "Email", "City", "State", "Jobs", "Revenue", "Status", "Actions"].map((header) => (
                    <th key={header} className="px-4 py-3 font-bold">{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {customers.map((customer) => (
                  <tr key={customer.company} className="border-t border-slate-200">
                    <td className="px-4 py-3 font-bold text-slate-950">{customer.company}</td>
                    <td className="px-4 py-3">{customer.primaryContact.name}</td>
                    <td className="px-4 py-3">{customer.primaryContact.phone || "Not stored"}</td>
                    <td className="px-4 py-3">{customer.primaryContact.email || "Not stored"}</td>
                    <td className="px-4 py-3">{customer.city || "Not set"}</td>
                    <td className="px-4 py-3">{customer.state || "Not set"}</td>
                    <td className="px-4 py-3">{customer.jobs.length}</td>
                    <td className="px-4 py-3 font-bold">{money(customer.totalRevenue)}</td>
                    <td className="px-4 py-3"><StatusBadge status={customer.status} /></td>
                    <td className="px-4 py-3">
                      <button type="button" onClick={() => openProfile(customer, "Overview")} className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700">
                        View Profile
                      </button>
                    </td>
                  </tr>
                ))}
                {!loading && customers.length === 0 && (
                  <tr>
                    <td colSpan={10} className="px-4 py-8 text-center text-slate-500">No customer records found from Dispatch jobs.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {selectedCustomer && (
        <CustomerProfile
          customer={selectedCustomer}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          onClose={() => setSelectedCustomer(null)}
          openProfile={openProfile}
        />
      )}
    </div>
  );

  function openProfile(customer, tab) {
    setSelectedCustomer(customer);
    setActiveTab(tab);
  }
}

function CustomerProfile({ customer, activeTab, setActiveTab, onClose, openProfile }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="border-b border-slate-200 p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-blue-600">Customer Profile</p>
              <h2 className="text-2xl font-bold text-slate-950">{customer.company}</h2>
              <p className="mt-1 text-sm text-slate-500">{customer.city}, {customer.state} · {customer.jobs.length} jobs · {money(customer.totalRevenue)} revenue</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <QuickAction href={customer.primaryContact.phone ? `tel:${customer.primaryContact.phone}` : undefined} icon={<Phone />} label="Call" />
              <QuickAction href={customer.primaryContact.email ? `mailto:${customer.primaryContact.email}` : undefined} icon={<Mail />} label="Email" />
              <QuickAction onClick={() => alert("Open Dispatch Center to create a new dispatch for this company.")} icon={<Plus />} label="Create Dispatch" />
              <QuickAction onClick={() => openProfile(customer, "Invoices")} icon={<BriefcaseBusiness />} label="View Invoices" />
              <QuickAction onClick={() => openProfile(customer, "Jobs")} icon={<BriefcaseBusiness />} label="View Jobs" />
              <button type="button" onClick={onClose} className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-200">Close</button>
            </div>
          </div>

          <div className="mt-4 flex gap-2 overflow-x-auto">
            {profileTabs.map((tab) => (
              <button key={tab} type="button" onClick={() => setActiveTab(tab)} className={`shrink-0 rounded-xl px-3 py-2 text-sm font-bold ${activeTab === tab ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>
                {tab}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-y-auto p-5">
          {activeTab === "Overview" && <OverviewTab customer={customer} />}
          {activeTab === "Contacts" && <ContactsTab customer={customer} />}
          {activeTab === "Locations" && <LocationsTab customer={customer} />}
          {activeTab === "Invoices" && <InvoicesTab jobs={customer.jobs} />}
          {activeTab === "Jobs" && <JobsTab jobs={customer.jobs} />}
          {activeTab === "Notes" && <NotesTab customer={customer} />}
          {activeTab === "Payment History" && <PaymentHistoryTab jobs={customer.jobs} />}
          {activeTab === "Activity Timeline" && <TimelineTab customer={customer} />}
        </div>
      </div>
    </div>
  );
}

function OverviewTab({ customer }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <CrmCard label="Total Revenue" value={money(customer.totalRevenue)} />
      <CrmCard label="Average Invoice" value={money(customer.averageInvoice)} />
      <CrmCard label="Jobs This Month" value={customer.jobsThisMonth} />
      <CrmCard label="Most Requested Service" value={customer.mostRequestedService} />
      <CrmCard label="Last Service Date" value={customer.lastServiceDate || "Not set"} />
      <CrmCard label="Outstanding Balance" value={money(customer.outstandingBalance)} />
    </div>
  );
}

function ContactsTab({ customer }) {
  return <InfoGrid items={customer.contacts.map((contact) => ({ title: contact.role, lines: [contact.name, contact.phone || "Phone not stored", contact.email || "Email not stored"] }))} />;
}

function LocationsTab({ customer }) {
  return <InfoGrid items={customer.locations.map((location) => ({ title: location.locationName, lines: [location.address, `${location.city}, ${location.state} ${location.zip}`, "GPS: future"] }))} />;
}

function InvoicesTab({ jobs }) {
  return <JobsTable jobs={jobs} invoiceMode />;
}

function JobsTab({ jobs }) {
  return <JobsTable jobs={jobs} />;
}

function NotesTab({ customer }) {
  return (
    <div className="space-y-3">
      {customer.notes.length ? customer.notes.map((note, index) => (
        <div key={`${note}-${index}`} className="rounded-xl bg-slate-50 p-4 text-sm text-slate-700">{note}</div>
      )) : <Empty text="No customer notes stored yet." />}
    </div>
  );
}

function PaymentHistoryTab({ jobs }) {
  return <JobsTable jobs={jobs.filter((job) => isPaid(job.invoiceStatus))} invoiceMode />;
}

function TimelineTab({ customer }) {
  return (
    <div className="space-y-3">
      {customer.jobs.map((job) => (
        <div key={job.id} className="rounded-xl border border-slate-200 p-4">
          <p className="font-bold text-slate-950">{job.date || "No date"} · {job.invoiceNumber || "No invoice"}</p>
          <p className="mt-1 text-sm text-slate-600">{job.status || "Job updated"} at {job.location || "unknown location"}</p>
        </div>
      ))}
    </div>
  );
}

function JobsTable({ jobs, invoiceMode = false }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="min-w-[900px] table-auto whitespace-nowrap text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            {(invoiceMode ? ["Invoice #", "Date", "Location", "Invoice Status", "Payment", "Total", "Profit"] : ["Date", "Invoice #", "Location", "Job Status", "Service", "Total"]).map((header) => (
              <th key={header} className="px-4 py-3 font-bold">{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => (
            <tr key={job.id} className="border-t border-slate-200">
              {invoiceMode ? (
                <>
                  <td className="px-4 py-3 font-bold">{job.invoiceNumber || "No invoice"}</td>
                  <td className="px-4 py-3">{job.date || "No date"}</td>
                  <td className="px-4 py-3">{job.location || "No location"}</td>
                  <td className="px-4 py-3">{job.invoiceStatus || "Pending"}</td>
                  <td className="px-4 py-3">{job.paymentMethod || "Pending"}</td>
                  <td className="px-4 py-3 font-bold">{money(job.totalBill)}</td>
                  <td className="px-4 py-3">{money(job.profit)}</td>
                </>
              ) : (
                <>
                  <td className="px-4 py-3">{job.date || "No date"}</td>
                  <td className="px-4 py-3 font-bold">{job.invoiceNumber || "No invoice"}</td>
                  <td className="px-4 py-3">{job.location || "No location"}</td>
                  <td className="px-4 py-3">{job.status || "No status"}</td>
                  <td className="px-4 py-3">{extractService(job)}</td>
                  <td className="px-4 py-3 font-bold">{money(job.totalBill)}</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {jobs.length === 0 && <Empty text="No records available." />}
    </div>
  );
}

function buildCustomers(jobs) {
  const groups = new Map();
  jobs.forEach((job) => {
    const company = job.company || "Unknown Company";
    if (!groups.has(company)) groups.set(company, []);
    groups.get(company).push(job);
  });

  return [...groups.entries()]
    .map(([company, companyJobs]) => {
      const sortedJobs = [...companyJobs].sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
      const locations = buildLocations(company, companyJobs);
      const totalRevenue = companyJobs.reduce((sum, job) => sum + job.totalBill, 0);
      const outstandingBalance = companyJobs.filter((job) => !isPaid(job.invoiceStatus)).reduce((sum, job) => sum + job.totalBill, 0);
      const jobsThisMonth = companyJobs.filter((job) => String(job.date || "").startsWith(new Date().toISOString().slice(0, 7))).length;

      return {
        company,
        jobs: sortedJobs,
        locations,
        city: locations[0]?.city || "",
        state: locations[0]?.state || "",
        primaryContact: { role: "Fleet Manager", name: "Not stored", phone: "", email: "" },
        contacts: [
          { role: "Fleet Manager", name: "Not stored", phone: "", email: "" },
          { role: "Dispatcher", name: "Not stored", phone: "", email: "" },
          { role: "Accounting", name: "Not stored", phone: "", email: "" },
          { role: "After Hours", name: "Not stored", phone: "", email: "" },
        ],
        totalRevenue,
        outstandingBalance,
        averageInvoice: companyJobs.length ? totalRevenue / companyJobs.length : 0,
        jobsThisMonth,
        mostRequestedService: mostRequestedService(companyJobs),
        lastServiceDate: sortedJobs[0]?.date || "",
        notes: companyJobs.map((job) => job.updates).filter(Boolean).slice(0, 8),
        status: companyJobs.some((job) => !["Completed", "Canceled", "Cancelled", "Paid"].includes(job.status)) ? "Active" : "Inactive",
      };
    })
    .sort((a, b) => a.company.localeCompare(b.company));
}

function buildLocations(company, jobs) {
  const locations = new Map();
  jobs.forEach((job) => {
    const parsed = parseLocation(job.location);
    const key = job.location || `${parsed.city}-${parsed.state}`;
    if (!locations.has(key)) {
      locations.set(key, {
        company,
        locationName: job.location || "Service Location",
        address: job.location || "Address not stored",
        city: parsed.city,
        state: parsed.state,
        zip: parsed.zip,
      });
    }
  });
  return [...locations.values()];
}

function buildStats(customers) {
  const totalJobs = customers.flatMap((customer) => customer.jobs);
  const totalRevenue = totalJobs.reduce((sum, job) => sum + job.totalBill, 0);
  return {
    totalCustomers: customers.length,
    activeCompanies: customers.filter((customer) => customer.status === "Active").length,
    newThisMonth: customers.filter((customer) => String(customer.jobs.at(-1)?.date || "").startsWith(new Date().toISOString().slice(0, 7))).length,
    outstandingBalance: customers.reduce((sum, customer) => sum + customer.outstandingBalance, 0),
    activeJobs: totalJobs.filter((job) => !["Completed", "Canceled", "Cancelled", "Paid"].includes(job.status)).length,
    averageInvoice: totalJobs.length ? totalRevenue / totalJobs.length : 0,
  };
}

function normalizeJob(row) {
  const totalBill = Number(row.total_bill || row.totalBill || 0);
  const parts = Number(row.parts || 0);
  const techLabor = Number(row.tech_labor || row.techLabor || 0);
  return {
    raw: row,
    id: row.id || `${row.company}-${row.invoice_number || row.invoice}-${row.job_date || row.date}`,
    company: row.company || "Unknown Company",
    date: row.job_date || row.date || "",
    location: row.location || "",
    status: row.status || "New",
    invoiceStatus: row.invoice_status || row.invoice || "Pending",
    invoiceNumber: row.invoice_number || row.reference || row.invoice || "",
    paymentMethod: row.payment_method || row.paymentMethod || "Pending",
    totalBill,
    parts,
    techLabor,
    profit: totalBill - parts - techLabor,
    updates: row.updates || "",
    requestedService: row.requested_service || row.service || "",
  };
}

function parseLocation(location) {
  const parts = String(location || "").split(",").map((part) => part.trim());
  return {
    city: parts[0] || "",
    state: parts[1] || "",
    zip: parts[2] || "",
  };
}

function mostRequestedService(jobs) {
  const counts = jobs.reduce((acc, job) => {
    const service = extractService(job);
    acc[service] = (acc[service] || 0) + 1;
    return acc;
  }, {});
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || "Not enough data";
}

function extractService(job) {
  if (job.requestedService) return job.requestedService;
  const line = String(job.updates || "").split(/\n+/).find((item) => /tire|brake|roadside|repair|tow|reefer|jump|fuel|service/i.test(item));
  return line || "Roadside service";
}

function isPaid(status) {
  return String(status || "").toLowerCase() === "paid";
}

function money(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value || 0));
}

function CrmCard({ label, value }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-slate-950">{value}</p>
    </div>
  );
}

function StatusBadge({ status }) {
  return <span className={`rounded-full px-3 py-1 text-xs font-bold ${status === "Active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-700"}`}>{status}</span>;
}

function QuickAction({ icon, label, href, onClick }) {
  const content = (
    <>
      {React.cloneElement(icon, { className: "h-4 w-4" })}
      {label}
    </>
  );

  if (href) {
    return <a href={href} className="flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-200">{content}</a>;
  }

  return <button type="button" onClick={onClick} className="flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-200">{content}</button>;
}

function InfoGrid({ items }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <div key={item.title} className="rounded-xl border border-slate-200 p-4">
          <p className="font-bold text-slate-950">{item.title}</p>
          {item.lines.map((line) => <p key={line} className="mt-1 text-sm text-slate-600">{line}</p>)}
        </div>
      ))}
    </div>
  );
}

function Empty({ text }) {
  return <div className="p-8 text-center text-sm text-slate-500">{text}</div>;
}
