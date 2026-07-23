import React, { useEffect, useMemo, useState } from "react";
import { BriefcaseBusiness, Edit3, Mail, Phone, Plus, RefreshCw, Save, Trash2, X } from "lucide-react";
import { supabase } from "../../lib/supabase";

const profileTabs = ["Overview", "Contacts", "Locations", "Invoices", "Jobs", "Notes", "Payment History", "Activity Timeline"];
const defaultContactRoles = ["Fleet Manager", "Dispatcher", "Accounting", "After Hours"];

export default function CustomerCRM({ onOpenJob }) {
  const [jobs, setJobs] = useState([]);
  const [customerRows, setCustomerRows] = useState([]);
  const [contactRows, setContactRows] = useState([]);
  const [locationRows, setLocationRows] = useState([]);
  const [warnings, setWarnings] = useState([]);
  const [successMessage, setSuccessMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [activeTab, setActiveTab] = useState("Overview");

  useEffect(() => {
    loadCustomers();
  }, []);

  async function loadCustomers() {
    setLoading(true);
    const [customerResult, contactsResult, locationsResult, jobsResult] = await Promise.all([
      supabase.from("customers").select("*"),
      supabase.from("customer_contacts").select("*"),
      supabase.from("customer_locations").select("*"),
      supabase.from("jobs").select("*"),
    ]);

    const loadErrors = [customerResult, contactsResult, locationsResult, jobsResult]
      .filter((result) => result.error)
      .map((result) => result.error.message);

    setWarnings(loadErrors.length ? [`Unable to load CRM data: ${loadErrors.join("; ")}`] : []);
    setJobs((jobsResult.data || []).map(normalizeJob));

    setCustomerRows(customerResult.data || []);
    setContactRows(contactsResult.data || []);
    setLocationRows(locationsResult.data || []);
    setLoading(false);
  }

  const customers = useMemo(() => buildCustomers(jobs, customerRows, contactRows, locationRows), [jobs, customerRows, contactRows, locationRows]);
  const stats = useMemo(() => buildStats(customers), [customers]);

  async function saveCustomerProfile(draft) {
    const saveWarnings = [];
    let customerId = draft.id;

    const result = await saveCustomerRow(customerPayloadFromDraft(draft));
    if (!result.ok) saveWarnings.push(result.message);
    if (result.id) customerId = result.id;

    if (customerId) {
      const result = await replaceChildRows("customer_contacts", "customer_id", customerId, draft.contacts.map(contactPayloadFromDraft));
      if (!result.ok) saveWarnings.push(result.message);
    }

    if (customerId) {
      const result = await replaceChildRows("customer_locations", "customer_id", customerId, draft.locations.map(locationPayloadFromDraft));
      if (!result.ok) saveWarnings.push(result.message);
    }

    if (saveWarnings.length) setWarnings((current) => [...new Set([...current, ...saveWarnings])]);
    await loadCustomers();
    setSuccessMessage("Customer information updated successfully.");
    setTimeout(() => setSuccessMessage(""), 4000);
    return true;
  }

  function openProfile(customer, tab) {
    setSelectedCustomer(customer);
    setActiveTab(tab);
  }

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
          <div key={warning} className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800">{warning}</div>
        ))}
        {successMessage && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800">{successMessage}</div>}

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
                  <tr key={customer.key} className="border-t border-slate-200">
                    <td className="px-4 py-3 font-bold text-slate-950">{customer.company}</td>
                    <td className="px-4 py-3">{customer.primaryContact.name || "Not stored"}</td>
                    <td className="px-4 py-3">{customer.primaryContact.phone || "Not stored"}</td>
                    <td className="px-4 py-3">{customer.primaryContact.email || "Not stored"}</td>
                    <td className="px-4 py-3">{customer.city || "Not set"}</td>
                    <td className="px-4 py-3">{customer.state || "Not set"}</td>
                    <td className="px-4 py-3">{customer.jobs.length}</td>
                    <td className="px-4 py-3 font-bold">{money(customer.totalRevenue)}</td>
                    <td className="px-4 py-3"><StatusBadge status={customer.customerStatus || customer.status} /></td>
                    <td className="px-4 py-3">
                      <button type="button" onClick={() => openProfile(customer, "Overview")} className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700">
                        View Profile
                      </button>
                    </td>
                  </tr>
                ))}
                {!loading && customers.length === 0 && (
                  <tr><td colSpan={10} className="px-4 py-8 text-center text-slate-500">No customer records found.</td></tr>
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
          onSave={saveCustomerProfile}
          onOpenJob={onOpenJob}
        />
      )}
    </div>
  );
}

function CustomerProfile({ customer, activeTab, setActiveTab, onClose, openProfile, onSave, onOpenJob }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState(() => createCustomerDraft(customer));

  useEffect(() => {
    setDraft(createCustomerDraft(customer));
    setEditing(false);
  }, [customer]);

  function updateField(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function updateContact(index, field, value) {
    setDraft((current) => ({
      ...current,
      contacts: current.contacts.map((contact, contactIndex) => (contactIndex === index ? { ...contact, [field]: value } : contact)),
    }));
  }

  function updateLocation(index, field, value) {
    setDraft((current) => ({
      ...current,
      locations: current.locations.map((location, locationIndex) => (locationIndex === index ? { ...location, [field]: value } : location)),
    }));
  }

  async function handleSave() {
    setSaving(true);
    const saved = await onSave(draft);
    setSaving(false);
    if (saved) setEditing(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="border-b border-slate-200 p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-blue-600">Customer Profile</p>
              <h2 className="text-2xl font-bold text-slate-950">{draft.company}</h2>
              <p className="mt-1 text-sm text-slate-500">{draft.city}, {draft.state} - {customer.jobs.length} jobs - {money(customer.totalRevenue)} revenue</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <QuickAction href={draft.mainPhone ? `tel:${draft.mainPhone}` : undefined} icon={<Phone />} label="Call" />
              <QuickAction href={draft.mainEmail ? `mailto:${draft.mainEmail}` : undefined} icon={<Mail />} label="Email" />
              <QuickAction onClick={() => alert("Open Dispatch Center to create a new dispatch for this company.")} icon={<Plus />} label="Create Dispatch" />
              <QuickAction onClick={() => openProfile(customer, "Invoices")} icon={<BriefcaseBusiness />} label="View Invoices" />
              <QuickAction onClick={() => openProfile(customer, "Jobs")} icon={<BriefcaseBusiness />} label="View Jobs" />
              {!editing && <QuickAction onClick={() => setEditing(true)} icon={<Edit3 />} label="Edit" />}
              {editing && (
                <>
                  <QuickAction onClick={handleSave} icon={<Save />} label={saving ? "Saving..." : "Save Changes"} />
                  <QuickAction onClick={() => { setDraft(createCustomerDraft(customer)); setEditing(false); }} icon={<X />} label="Cancel" />
                </>
              )}
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
          {activeTab === "Overview" && <OverviewTab customer={customer} draft={draft} editing={editing} updateField={updateField} />}
          {activeTab === "Contacts" && <ContactsTab draft={draft} editing={editing} updateContact={updateContact} addContact={() => setDraft((current) => ({ ...current, contacts: [...current.contacts, { role: "Additional Contact", name: "", phone: "", email: "" }] }))} />}
          {activeTab === "Locations" && (
            <LocationsTab
              draft={draft}
              editing={editing}
              updateLocation={updateLocation}
              addLocation={() => setDraft((current) => ({ ...current, locations: [...current.locations, { locationName: "", address: "", city: "", state: "", zip: "", notes: "" }] }))}
              deleteLocation={(index) => setDraft((current) => ({ ...current, locations: current.locations.filter((_, locationIndex) => locationIndex !== index) }))}
            />
          )}
          {activeTab === "Invoices" && <InvoicesTab jobs={customer.jobs} onOpenJob={onOpenJob} />}
          {activeTab === "Jobs" && <JobsTab jobs={customer.jobs} onOpenJob={onOpenJob} />}
          {activeTab === "Notes" && <NotesTab draft={draft} editing={editing} updateField={updateField} />}
          {activeTab === "Payment History" && <PaymentHistoryTab jobs={customer.jobs} onOpenJob={onOpenJob} />}
          {activeTab === "Activity Timeline" && <TimelineTab customer={customer} onOpenJob={onOpenJob} />}
        </div>
      </div>
    </div>
  );
}

function OverviewTab({ customer, draft, editing, updateField }) {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <EditableField label="Company name" value={draft.company} editing={editing} onChange={(value) => updateField("company", value)} />
        <EditableField label="Main phone" value={draft.mainPhone} editing={editing} onChange={(value) => updateField("mainPhone", value)} />
        <EditableField label="Main email" value={draft.mainEmail} editing={editing} onChange={(value) => updateField("mainEmail", value)} />
        <EditableField label="Billing email" value={draft.billingEmail} editing={editing} onChange={(value) => updateField("billingEmail", value)} />
        <EditableField label="Address" value={draft.address} editing={editing} onChange={(value) => updateField("address", value)} />
        <EditableField label="City" value={draft.city} editing={editing} onChange={(value) => updateField("city", value)} />
        <EditableField label="State" value={draft.state} editing={editing} onChange={(value) => updateField("state", value)} />
        <EditableField label="ZIP" value={draft.zip} editing={editing} onChange={(value) => updateField("zip", value)} />
        <EditableField label="Preferred payment method" value={draft.preferredPaymentMethod} editing={editing} onChange={(value) => updateField("preferredPaymentMethod", value)} options={["", "EFS", "Comcheck", "Zelle", "Card", "Cash", "ACH", "Wire", "Other"]} />
        <EditableField label="Credit status" value={draft.creditStatus} editing={editing} onChange={(value) => updateField("creditStatus", value)} options={["", "Good", "Hold", "COD", "Need Review"]} />
        <EditableField label="Customer status" value={draft.customerStatus} editing={editing} onChange={(value) => updateField("customerStatus", value)} options={["Active", "Inactive", "Prospect", "On Hold"]} />
      </div>
      <EditableField label="Notes" value={draft.notes} editing={editing} onChange={(value) => updateField("notes", value)} multiline />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <CrmCard label="Total Revenue" value={money(customer.totalRevenue)} />
        <CrmCard label="Average Invoice" value={money(customer.averageInvoice)} />
        <CrmCard label="Jobs This Month" value={customer.jobsThisMonth} />
        <CrmCard label="Most Requested Service" value={customer.mostRequestedService} />
        <CrmCard label="Last Service Date" value={customer.lastServiceDate || "Not set"} />
        <CrmCard label="Outstanding Balance" value={money(customer.outstandingBalance)} />
      </div>
    </div>
  );
}

function ContactsTab({ draft, editing, updateContact, addContact }) {
  return (
    <div className="space-y-4">
      {editing && <button type="button" onClick={addContact} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700"><Plus className="h-4 w-4" />Add Contact</button>}
      <div className="grid gap-4 md:grid-cols-2">
        {draft.contacts.map((contact, index) => (
          <div key={`${contact.role}-${index}`} className="rounded-xl border border-slate-200 p-4">
            <EditableField label="Role" value={contact.role} editing={editing} onChange={(value) => updateContact(index, "role", value)} />
            <EditableField label="Name" value={contact.name} editing={editing} onChange={(value) => updateContact(index, "name", value)} />
            <EditableField label="Phone" value={contact.phone} editing={editing} onChange={(value) => updateContact(index, "phone", value)} />
            <EditableField label="Email" value={contact.email} editing={editing} onChange={(value) => updateContact(index, "email", value)} />
          </div>
        ))}
      </div>
    </div>
  );
}

function LocationsTab({ draft, editing, updateLocation, addLocation, deleteLocation }) {
  return (
    <div className="space-y-4">
      {editing && <button type="button" onClick={addLocation} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700"><Plus className="h-4 w-4" />Add Location</button>}
      <div className="grid gap-4 md:grid-cols-2">
        {draft.locations.map((location, index) => (
          <div key={`${location.locationName}-${index}`} className="rounded-xl border border-slate-200 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="font-bold text-slate-950">{location.locationName || `Location ${index + 1}`}</p>
              {editing && <button type="button" onClick={() => deleteLocation(index)} className="rounded-lg bg-red-50 p-2 text-red-700 hover:bg-red-100"><Trash2 className="h-4 w-4" /></button>}
            </div>
            <EditableField label="Location name" value={location.locationName} editing={editing} onChange={(value) => updateLocation(index, "locationName", value)} />
            <EditableField label="Address" value={location.address} editing={editing} onChange={(value) => updateLocation(index, "address", value)} />
            <EditableField label="City" value={location.city} editing={editing} onChange={(value) => updateLocation(index, "city", value)} />
            <EditableField label="State" value={location.state} editing={editing} onChange={(value) => updateLocation(index, "state", value)} />
            <EditableField label="ZIP" value={location.zip} editing={editing} onChange={(value) => updateLocation(index, "zip", value)} />
            <EditableField label="Notes" value={location.notes} editing={editing} onChange={(value) => updateLocation(index, "notes", value)} multiline />
          </div>
        ))}
      </div>
    </div>
  );
}

function InvoicesTab({ jobs, onOpenJob }) {
  return <JobsTable jobs={jobs} invoiceMode onOpenJob={onOpenJob} />;
}

function JobsTab({ jobs, onOpenJob }) {
  return <JobsTable jobs={jobs} onOpenJob={onOpenJob} />;
}

function NotesTab({ draft, editing, updateField }) {
  return <EditableField label="Notes" value={draft.notes} editing={editing} onChange={(value) => updateField("notes", value)} multiline />;
}

function PaymentHistoryTab({ jobs, onOpenJob }) {
  return <JobsTable jobs={jobs.filter((job) => isPaid(job.invoiceStatus))} invoiceMode onOpenJob={onOpenJob} />;
}

function TimelineTab({ customer, onOpenJob }) {
  return (
    <div className="space-y-3">
      {customer.jobs.map((job) => (
        <div key={job.id} className="rounded-xl border border-slate-200 p-4">
          <button type="button" onClick={() => onOpenJob?.(job.id)} className="min-h-11 text-left font-bold text-blue-700 underline underline-offset-4">{job.date || "No date"} - {job.invoiceNumber || "No invoice"}</button>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-600">
            <JobStatusBadge status={job.status} />
            <span>at {job.location || "unknown location"}</span>
          </div>
        </div>
      ))}
      {customer.jobs.length === 0 && <Empty text="No activity available." />}
    </div>
  );
}

function JobsTable({ jobs, invoiceMode = false, onOpenJob }) {
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
                  <td className="px-4 py-3 font-bold"><button type="button" onClick={() => onOpenJob?.(job.id)} className="min-h-11 text-blue-700 underline underline-offset-4">{job.invoiceNumber || job.id || "No invoice"}</button></td>
                  <td className="px-4 py-3">{job.date || "No date"}</td>
                  <td className="px-4 py-3">{job.location || "No location"}</td>
                  <td className="px-4 py-3"><InvoiceStatusBadge status={job.invoiceStatus} /></td>
                  <td className="px-4 py-3">{job.paymentMethod || "Pending"}</td>
                  <td className="px-4 py-3 font-bold">{money(job.totalBill)}</td>
                  <td className="px-4 py-3">{money(job.profit)}</td>
                </>
              ) : (
                <>
                  <td className="px-4 py-3">{job.date || "No date"}</td>
                  <td className="px-4 py-3 font-bold"><button type="button" onClick={() => onOpenJob?.(job.id)} className="min-h-11 text-blue-700 underline underline-offset-4">{job.invoiceNumber || job.id || "No invoice"}</button></td>
                  <td className="px-4 py-3">{job.location || "No location"}</td>
                  <td className="px-4 py-3"><JobStatusBadge status={job.status} /></td>
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

function EditableField({ label, value, editing, onChange, options, multiline = false }) {
  if (!editing) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
        <p className="mt-2 whitespace-pre-wrap text-sm font-semibold text-slate-900">{value || "Not stored"}</p>
      </div>
    );
  }

  return (
    <label className="grid gap-1 text-sm font-bold text-slate-600">
      {label}
      {options ? (
        <select className="rounded-xl border border-slate-200 px-3 py-2 font-semibold outline-none focus:border-blue-500" value={value || ""} onChange={(event) => onChange(event.target.value)}>
          {options.map((option) => <option key={option} value={option}>{option || "Not set"}</option>)}
        </select>
      ) : multiline ? (
        <textarea className="min-h-28 rounded-xl border border-slate-200 px-3 py-2 font-semibold outline-none focus:border-blue-500" value={value || ""} onChange={(event) => onChange(event.target.value)} />
      ) : (
        <input className="rounded-xl border border-slate-200 px-3 py-2 font-semibold outline-none focus:border-blue-500" value={value || ""} onChange={(event) => onChange(event.target.value)} />
      )}
    </label>
  );
}

function buildCustomers(jobs, customerRows, contactRows, locationRows) {
  const groups = new Map();
  jobs.forEach((job) => {
    const company = job.company || "Unknown Company";
    if (!groups.has(normalizeKey(company))) groups.set(normalizeKey(company), { company, jobs: [] });
    groups.get(normalizeKey(company)).jobs.push(job);
  });

  customerRows.forEach((row) => {
    const company = read(row, ["company_name", "company", "name"]) || "Unknown Company";
    if (!groups.has(normalizeKey(company))) groups.set(normalizeKey(company), { company, jobs: [] });
  });

  return [...groups.values()].map(({ company, jobs: companyJobs }) => {
    const customerRow = findCustomerRow(customerRows, company);
    const sortedJobs = [...companyJobs].sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
    const fallbackLocations = buildLocationsFromJobs(company, companyJobs);
    const savedLocations = customerRow?.id ? locationRows.filter((row) => String(row.customer_id || "") === String(customerRow.id)).map(locationFromRow) : [];
    const locations = savedLocations.length ? savedLocations : fallbackLocations;
    const contacts = customerRow?.id ? mergeContacts(contactRows.filter((row) => String(row.customer_id || "") === String(customerRow.id)).map(contactFromRow)) : defaultContacts();
    const primaryContact = contacts[0] || { role: "Fleet Manager", name: "", phone: "", email: "" };
    const totalRevenue = companyJobs.reduce((sum, job) => sum + job.totalBill, 0);
    const outstandingBalance = companyJobs.filter((job) => !isPaid(job.invoiceStatus) && !isCancelled(job.invoiceStatus)).reduce((sum, job) => sum + job.totalBill, 0);
    const jobsThisMonth = companyJobs.filter((job) => String(job.date || "").startsWith(new Date().toISOString().slice(0, 7))).length;

    return {
      key: customerRow?.id || normalizeKey(company),
      id: customerRow?.id || "",
      company: read(customerRow, ["company_name", "company", "name"]) || company,
      companyKey: company,
      mainPhone: read(customerRow, ["main_phone", "phone"]),
      mainEmail: read(customerRow, ["main_email", "email"]),
      billingEmail: read(customerRow, ["billing_email"]),
      address: read(customerRow, ["address"]),
      city: read(customerRow, ["city"]) || locations[0]?.city || "",
      state: read(customerRow, ["state"]) || locations[0]?.state || "",
      zip: read(customerRow, ["zip", "zip_code"]) || locations[0]?.zip || "",
      notes: read(customerRow, ["notes"]),
      preferredPaymentMethod: read(customerRow, ["preferred_payment_method", "payment_method"]),
      creditStatus: read(customerRow, ["credit_status"]),
      customerStatus: read(customerRow, ["customer_status", "status"]) || (companyJobs.some((job) => !["Completed", "Canceled", "Cancelled", "Paid"].includes(job.status)) ? "Active" : "Inactive"),
      primaryContact,
      contacts,
      locations,
      jobs: sortedJobs,
      totalRevenue,
      outstandingBalance,
      averageInvoice: companyJobs.length ? totalRevenue / companyJobs.length : 0,
      jobsThisMonth,
      mostRequestedService: mostRequestedService(companyJobs),
      lastServiceDate: sortedJobs[0]?.date || "",
      status: companyJobs.some((job) => !["Completed", "Canceled", "Cancelled", "Paid"].includes(job.status)) ? "Active" : "Inactive",
    };
  }).sort((a, b) => a.company.localeCompare(b.company));
}

function buildLocationsFromJobs(company, jobs) {
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
        notes: "",
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
    activeCompanies: customers.filter((customer) => customer.customerStatus === "Active" || customer.status === "Active").length,
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

function createCustomerDraft(customer) {
  return {
    id: customer.id || "",
    originalCompany: customer.companyKey || customer.company,
    company: customer.company || "",
    mainPhone: customer.mainPhone || customer.primaryContact?.phone || "",
    mainEmail: customer.mainEmail || customer.primaryContact?.email || "",
    billingEmail: customer.billingEmail || "",
    address: customer.address || "",
    city: customer.city || "",
    state: customer.state || "",
    zip: customer.zip || "",
    notes: customer.notes || "",
    preferredPaymentMethod: customer.preferredPaymentMethod || "",
    creditStatus: customer.creditStatus || "",
    customerStatus: customer.customerStatus || customer.status || "Active",
    contacts: mergeContacts(customer.contacts || []),
    locations: customer.locations?.length ? customer.locations.map((location) => ({ ...location })) : [{ locationName: "", address: "", city: "", state: "", zip: "", notes: "" }],
  };
}

function customerPayloadFromDraft(draft) {
  return {
    ...(draft.id ? { id: draft.id } : {}),
    company_name: draft.company,
    name: draft.company,
    account_status: draft.customerStatus,
    main_phone: draft.mainPhone,
    phone: draft.mainPhone,
    main_email: draft.mainEmail,
    email: draft.mainEmail,
    billing_email: draft.billingEmail,
    address: draft.address,
    city: draft.city,
    state: draft.state,
    zip: draft.zip,
    zip_code: draft.zip,
    notes: draft.notes,
    preferred_payment_method: draft.preferredPaymentMethod,
    credit_status: draft.creditStatus,
    customer_status: draft.customerStatus,
    status: draft.customerStatus,
    updated_at: new Date().toISOString(),
  };
}

async function saveCustomerRow(payload) {
  const insertPayload = { ...payload, created_at: new Date().toISOString() };
  const result = await retryingWrite("customers", insertPayload, "upsert");
  if (!result.error) {
    const customerId = result.data?.id || payload.id;
    if (customerId && payload.company_name) {
      await supabase.from("jobs").update({ customer_id: customerId }).ilike("company", payload.company_name);
    }
    return { ok: true, id: customerId };
  }
  return { ok: false, message: `Unable to save customer (${result.error.message}).` };
}

async function replaceChildRows(table, foreignKey, parentId, rows) {
  const deleteResult = await supabase.from(table).delete().eq(foreignKey, parentId);
  if (deleteResult.error) return { ok: false, message: `Unable to update ${table} (${deleteResult.error.message}).` };
  const payload = rows.filter((row) => Object.values(row).some(Boolean)).map((row) => ({ ...row, [foreignKey]: parentId }));
  if (!payload.length) return { ok: true };
  const result = await retryingWrite(table, payload, "insert");
  if (!result.error) return { ok: true };
  return { ok: false, message: `Unable to save ${table} (${result.error.message}).` };
}

function contactPayloadFromDraft(contact) {
  return {
    role: contact.role,
    contact_role: contact.role,
    position: contact.role,
    is_primary: contact.role === "Fleet Manager" || contact.isPrimary === true,
    name: contact.name,
    phone: contact.phone,
    email: contact.email,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function locationPayloadFromDraft(location) {
  return {
    location_name: location.locationName,
    name: location.locationName,
    address: location.address,
    city: location.city,
    state: location.state,
    zip: location.zip,
    zip_code: location.zip,
    latitude: location.latitude || null,
    longitude: location.longitude || null,
    notes: location.notes,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

async function retryingWrite(table, payload, mode) {
  let nextPayload = Array.isArray(payload) ? payload : [payload];
  let lastError = null;

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const query = mode === "upsert"
      ? supabase.from(table).upsert(nextPayload).select("*").single()
      : supabase.from(table).insert(nextPayload);
    const result = await query;
    if (!result.error) return result;

    lastError = result.error;
    const missingColumn = missingColumnFromMessage(result.error.message);
    if (!missingColumn) return result;
    nextPayload = nextPayload.map((row) => stripColumn(row, missingColumn));
  }

  return { data: null, error: lastError || { message: "Unknown save error" } };
}

function missingColumnFromMessage(message = "") {
  const match = String(message).match(/'([^']+)' column|column "([^"]+)"/i);
  return match?.[1] || match?.[2] || "";
}

function stripColumn(payload, column) {
  const { [column]: _removed, ...rest } = payload;
  return rest;
}

function findCustomerRow(rows, company) {
  const key = normalizeKey(company);
  return rows.find((row) => normalizeKey(read(row, ["company_name", "company", "name"])) === key);
}

function contactFromRow(row) {
  return {
    role: read(row, ["role", "contact_role", "type"]) || "Contact",
    name: read(row, ["name", "contact_name"]),
    phone: read(row, ["phone", "contact_phone"]),
    email: read(row, ["email", "contact_email"]),
  };
}

function locationFromRow(row) {
  return {
    locationName: read(row, ["location_name", "name"]) || "Service Location",
    address: read(row, ["address"]),
    city: read(row, ["city"]),
    state: read(row, ["state"]),
    zip: read(row, ["zip", "zip_code"]),
    notes: read(row, ["notes"]),
  };
}

function mergeContacts(contacts) {
  const byRole = new Map(contacts.map((contact) => [contact.role, { ...contact }]));
  defaultContactRoles.forEach((role) => {
    if (!byRole.has(role)) byRole.set(role, { role, name: "", phone: "", email: "" });
  });
  return [...byRole.values()];
}

function defaultContacts() {
  return defaultContactRoles.map((role) => ({ role, name: "", phone: "", email: "" }));
}

function parseLocation(location) {
  const parts = String(location || "").split(",").map((part) => part.trim());
  return { city: parts[0] || "", state: parts[1] || "", zip: parts[2] || "" };
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

function read(row, aliases) {
  for (const alias of aliases) {
    if (row?.[alias] !== undefined && row?.[alias] !== null) return String(row[alias]).trim();
  }
  return "";
}

function normalizeKey(value) {
  return String(value || "").trim().toLowerCase();
}

function isPaid(status) {
  return String(status || "").toLowerCase() === "paid";
}

function isCancelled(status) {
  return ["cancelled", "canceled", "void"].includes(String(status || "").trim().toLowerCase());
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
  return <span className={`rounded-full px-3 py-1 text-xs font-bold ${status === "Active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-700"}`}>{status || "Inactive"}</span>;
}

function InvoiceStatusBadge({ status }) {
  const value = String(status || "Pending").trim();
  const tone =
    value.toLowerCase() === "paid"
      ? "bg-green-100 text-green-800"
      : ["cancelled", "canceled", "void"].includes(value.toLowerCase())
        ? "bg-red-100 text-red-800"
        : value.toLowerCase() === "pending"
          ? "bg-yellow-100 text-yellow-800"
          : "bg-slate-100 text-slate-700";
  return <span className={`rounded-full px-3 py-1 text-xs font-bold ${tone}`}>{value}</span>;
}

const jobStatusVisuals = {
  Completed: { background: "#DCFCE7", border: "#22C55E", text: "#166534", dot: "🟢" },
  Cancelled: { background: "#FEE2E2", border: "#EF4444", text: "#991B1B", dot: "🔴" },
  "In Progress": { background: "#DBEAFE", border: "#2563EB", text: "#1D4ED8", dot: "🔵" },
  "On Site": { background: "#FEF3C7", border: "#F59E0B", text: "#92400E", dot: "🟡" },
  "En Route": { background: "#E0F2FE", border: "#0284C7", text: "#075985", dot: "🔵" },
  "Waiting Parts": { background: "#F3E8FF", border: "#9333EA", text: "#6B21A8", dot: "🟣" },
  Pending: { background: "#FFF7ED", border: "#F97316", text: "#9A3412", dot: "🟠" },
  "Dry Run": { background: "#EDE9FE", border: "#7C3AED", text: "#5B21B6", dot: "🟣" },
  "Need Review": { background: "#FEF2F2", border: "#DC2626", text: "#7F1D1D", dot: "🔴" },
  New: { background: "#F8FAFC", border: "#64748B", text: "#334155", dot: "⚪" },
};

function canonicalJobStatus(status) {
  const value = String(status || "New").trim().toLowerCase();
  const aliases = {
    canceled: "Cancelled",
    cancelled: "Cancelled",
    declined: "Cancelled",
    working: "In Progress",
    assigned: "In Progress",
    "tech accepted": "In Progress",
    paid: "Completed",
    invoiced: "Completed",
    pending: "Pending",
    "need review": "Need Review",
    "dry run": "Dry Run",
  };
  return aliases[value] || status || "New";
}

function jobStatusVisual(status) {
  return jobStatusVisuals[canonicalJobStatus(status)] || jobStatusVisuals.New;
}

function JobStatusBadge({ status }) {
  const visual = jobStatusVisual(status);
  return (
    <span
      className="inline-flex rounded-full border px-3 py-1 text-xs font-bold"
      style={{
        backgroundColor: visual.background,
        borderColor: visual.border,
        color: visual.text,
        transition: "background-color 0.2s ease, border-color 0.2s ease",
      }}
    >
      {visual.dot} {status || "New"}
    </span>
  );
}

function QuickAction({ icon, label, href, onClick }) {
  const content = (
    <>
      {React.cloneElement(icon, { className: "h-4 w-4" })}
      {label}
    </>
  );

  if (href) return <a href={href} className="flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-200">{content}</a>;
  return <button type="button" onClick={onClick} className="flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-200">{content}</button>;
}

function Empty({ text }) {
  return <div className="p-8 text-center text-sm text-slate-500">{text}</div>;
}
