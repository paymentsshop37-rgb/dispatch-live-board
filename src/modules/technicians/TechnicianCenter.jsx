import React, { useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  Ban,
  BriefcaseBusiness,
  Clipboard,
  FileCheck2,
  FileWarning,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  RefreshCw,
  Search,
  Send,
  Smartphone,
  Star,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
} from "lucide-react";
import {
  createTechnician,
  deleteTechnician,
  getKnownColumns,
  loadTechnicians,
  subscribeToTechnicians,
  updateTechnician,
} from "./technicianService";
import {
  createInvitation,
  inviteMessage,
  loadInvitations,
  registrationLinkForInvite,
} from "./technicianInvitationService";

const emptyTechnician = {
  name: "",
  phone: "",
  email: "",
  company: "",
  city: "",
  state: "",
  serviceArea: "",
  specialties: "",
  status: "Approved",
  notes: "",
};

const tabs = ["Dashboard", "Pending", "Approved", "Inactive", "Documents", "Performance"];
const statuses = ["All", "Pending", "Approved", "Active", "Inactive", "Rejected", "Do Not Use"];
const sortOptions = ["Newest", "Rating", "Completed Jobs"];

export default function TechnicianCenter() {
  const [technicians, setTechnicians] = useState([]);
  const [activeTab, setActiveTab] = useState("Dashboard");
  const [form, setForm] = useState(emptyTechnician);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [serviceFilter, setServiceFilter] = useState("All");
  const [sortBy, setSortBy] = useState("Newest");
  const [selectedTechnician, setSelectedTechnician] = useState(null);
  const [invitations, setInvitations] = useState([]);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [inviteError, setInviteError] = useState("");
  const [copyMessage, setCopyMessage] = useState("");

  const currentUserRole = localStorage.getItem("currentUserRole") || "Dispatcher";
  const isAdmin = currentUserRole === "Admin";
  const knownColumns = useMemo(() => getKnownColumns(technicians), [technicians]);
  const registrationLink = `${window.location.origin}/technician-registration`;

  async function refreshTechnicians() {
    setLoading(true);
    setError("");
    setInviteError("");

    try {
      setTechnicians(await loadTechnicians());
    } catch (loadError) {
      setError(loadError.message || "Unable to load technicians.");
    } finally {
      setLoading(false);
    }

    if (isAdmin) {
      try {
        setInvitations(await loadInvitations());
      } catch (loadInviteError) {
        setInviteError(loadInviteError.message || "Unable to load invitations.");
      }
    }
  }

  useEffect(() => {
    refreshTechnicians();
    return subscribeToTechnicians(refreshTechnicians);
  }, []);

  const safeTechnicians = useMemo(() => {
    if (isAdmin) return technicians;
    return technicians.filter((technician) => isApproved(technician.status));
  }, [isAdmin, technicians]);

  const serviceOptions = useMemo(() => {
    const services = safeTechnicians.flatMap((technician) =>
      String(technician.specialties || "")
        .split(",")
        .map((service) => service.trim())
        .filter(Boolean)
    );

    return ["All", ...new Set(services)].sort();
  }, [safeTechnicians]);

  const tabTechnicians = useMemo(() => {
    return safeTechnicians.filter((technician) => {
      if (activeTab === "Pending") return technician.status === "Pending";
      if (activeTab === "Approved") return isApproved(technician.status);
      if (activeTab === "Inactive") return ["Inactive", "Rejected", "Do Not Use"].includes(technician.status);
      if (activeTab === "Documents") return complianceScore(technician) < 100;
      return true;
    });
  }, [activeTab, safeTechnicians]);

  const filteredTechnicians = useMemo(() => {
    const query = search.trim().toLowerCase();

    return tabTechnicians
      .filter((technician) => {
        const searchText = [
          technician.name,
          technician.phone,
          technician.company,
          technician.city,
          technician.state,
        ]
          .join(" ")
          .toLowerCase();
        const matchesSearch = !query || searchText.includes(query);
        const matchesStatus = statusFilter === "All" || technician.status === statusFilter;
        const matchesService =
          serviceFilter === "All" ||
          String(technician.specialties || "").toLowerCase().includes(serviceFilter.toLowerCase());

        return matchesSearch && matchesStatus && matchesService;
      })
      .sort((a, b) => {
        if (sortBy === "Rating") return Number(b.rating || 0) - Number(a.rating || 0);
        if (sortBy === "Completed Jobs") return Number(b.completedJobs || 0) - Number(a.completedJobs || 0);
        return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
      });
  }, [search, serviceFilter, sortBy, statusFilter, tabTechnicians]);

  const stats = useMemo(() => {
    const approved = technicians.filter((technician) => isApproved(technician.status));
    const ratings = technicians.map((technician) => Number(technician.rating || 0)).filter(Boolean);

    return {
      total: technicians.length,
      pending: technicians.filter((technician) => technician.status === "Pending").length,
      approved: approved.length,
      inactive: technicians.filter((technician) => ["Inactive", "Rejected", "Do Not Use"].includes(technician.status)).length,
      missingDocuments: technicians.filter((technician) => complianceScore(technician) < 100).length,
      averageRating: ratings.length
        ? (ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length).toFixed(1)
        : "0.0",
    };
  }, [technicians]);

  function updateForm(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function addTechnician(event) {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      const technician = await createTechnician(form, knownColumns);
      setTechnicians((current) => [technician, ...current]);
      setForm(emptyTechnician);
    } catch (saveError) {
      setError(saveError.message || "Unable to save technician.");
    } finally {
      setSaving(false);
    }
  }

  async function saveTechnician(id, patch) {
    const currentTechnician = technicians.find((technician) => technician.id === id);
    if (!currentTechnician) return;

    const nextTechnician = { ...currentTechnician, ...patch };
    setTechnicians((current) =>
      current.map((technician) => (technician.id === id ? nextTechnician : technician))
    );
    setSelectedTechnician((current) => (current?.id === id ? nextTechnician : current));

    try {
      await updateTechnician(id, nextTechnician, knownColumns);
    } catch (saveError) {
      setError(saveError.message || "Unable to update technician.");
      refreshTechnicians();
    }
  }

  async function removeTechnician(id) {
    if (!window.confirm("Delete this technician from the technicians table?")) return;

    try {
      await deleteTechnician(id);
      setTechnicians((current) => current.filter((technician) => technician.id !== id));
      setSelectedTechnician(null);
    } catch (deleteError) {
      setError(deleteError.message || "Unable to delete technician.");
    }
  }

  async function copyRegistrationLink() {
    try {
      await navigator.clipboard.writeText(registrationLink);
      setCopyMessage("Registration link copied.");
    } catch {
      setCopyMessage(registrationLink);
    }
  }

  async function copyInviteLink(link) {
    try {
      await navigator.clipboard.writeText(link);
      setCopyMessage("Invitation link copied.");
    } catch {
      setCopyMessage(link);
    }
  }

  function shareInviteOnWhatsApp(link) {
    window.open(`https://wa.me/?text=${encodeURIComponent(inviteMessage(link))}`, "_blank", "noopener,noreferrer");
  }

  function shareInviteBySms(link) {
    window.location.href = `sms:?&body=${encodeURIComponent(inviteMessage(link))}`;
  }

  async function submitInvitation(inviteForm) {
    setSaving(true);
    setInviteError("");

    try {
      const invitation = await createInvitation({
        ...inviteForm,
        invitedBy: localStorage.getItem("currentUserName") || currentUserRole,
      });
      setInvitations((current) => [invitation, ...current]);
      setInviteModalOpen(false);
      setCopyMessage(`Invitation created: ${registrationLinkForInvite(invitation.inviteCode)}`);
    } catch (createError) {
      setInviteError(createError.message || "Unable to create invitation.");
    } finally {
      setSaving(false);
    }
  }

  function shareRegistrationOnWhatsApp() {
    const message = `Hello, this is NTTR - National Truck Trailer Repair. Please complete your technician registration using this secure link:\n${registrationLink}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="min-h-screen bg-slate-100 p-4 text-slate-900 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="rounded-3xl bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-blue-100 p-3 text-blue-700">
                <Users className="h-7 w-7" />
              </div>
              <div>
                <h1 className="text-3xl font-bold tracking-tight">Technician Center</h1>
                <p className="mt-1 text-sm text-slate-500">
                  CRM controls for technician onboarding, compliance, dispatch readiness, and performance.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {isAdmin && (
                <>
                  <ActionButton onClick={copyRegistrationLink} icon={<Clipboard />} label="Copy Registration Link" tone="emerald" />
                  <ActionButton onClick={shareRegistrationOnWhatsApp} icon={<MessageCircle />} label="WhatsApp Share" tone="green" />
                  <ActionButton onClick={() => setInviteModalOpen(true)} icon={<Send />} label="Invite Technician" />
                </>
              )}
              <ActionButton onClick={refreshTechnicians} icon={<RefreshCw className={loading ? "animate-spin" : ""} />} label="Refresh" />
            </div>
          </div>

          {copyMessage && (
            <p className="mt-3 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
              {copyMessage}
            </p>
          )}

          {!isAdmin && (
            <p className="mt-3 rounded-2xl bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700">
              Dispatcher-safe mode is active. Only approved technicians are visible.
            </p>
          )}
        </section>

        <div className="flex gap-2 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`shrink-0 rounded-xl px-4 py-2 text-sm font-bold transition ${
                activeTab === tab ? "bg-slate-950 text-white" : "bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {activeTab === "Dashboard" && <Dashboard stats={stats} />}

        {isAdmin && (
          <InvitationsPanel
            invitations={invitations}
            onCopy={copyInviteLink}
            onWhatsApp={shareInviteOnWhatsApp}
            onSms={shareInviteBySms}
          />
        )}

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
            {error}
          </div>
        )}

        {isAdmin && inviteError && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-700">
            Invitation system: {inviteError}
          </div>
        )}

        <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
          {isAdmin && (
            <form onSubmit={addTechnician} className="rounded-3xl bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-bold">Add Technician</h2>
                <UserPlus className="h-5 w-5 text-slate-500" />
              </div>

              <div className="grid gap-3">
                <Field label="Full Name" value={form.name} onChange={(value) => updateForm("name", value)} required />
                <Field label="Phone" value={form.phone} onChange={(value) => updateForm("phone", value)} required />
                <Field label="Company" value={form.company} onChange={(value) => updateForm("company", value)} />
                <div className="grid grid-cols-2 gap-3">
                  <Field label="City" value={form.city} onChange={(value) => updateForm("city", value)} />
                  <Field label="State" value={form.state} onChange={(value) => updateForm("state", value)} />
                </div>
                <Field label="Services" value={form.specialties} onChange={(value) => updateForm("specialties", value)} />
                <Select label="Status" value={form.status} options={statuses.filter((status) => status !== "All")} onChange={(value) => updateForm("status", value)} />
                <TextArea label="Notes" value={form.notes} onChange={(value) => updateForm("notes", value)} />
              </div>

              <button
                type="submit"
                disabled={saving}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 font-bold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                <UserPlus className="h-5 w-5" />
                {saving ? "Saving..." : "Add Technician"}
              </button>
            </form>
          )}

          <section className={`rounded-3xl bg-white p-5 shadow-sm ${isAdmin ? "" : "xl:col-span-2"}`}>
            <div className="mb-4 flex flex-col gap-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <h2 className="text-xl font-bold">{activeTab === "Dashboard" ? "Technician List" : activeTab}</h2>
                <div className="grid gap-2 md:grid-cols-4">
                  <SearchBox value={search} onChange={setSearch} />
                  <Select value={statusFilter} options={statuses} onChange={setStatusFilter} />
                  <Select value={serviceFilter} options={serviceOptions} onChange={setServiceFilter} />
                  <Select value={sortBy} options={sortOptions} onChange={setSortBy} />
                </div>
              </div>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-slate-200">
              <table className="w-full min-w-[1060px] border-collapse text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <Th>Technician</Th>
                    <Th>Contact</Th>
                    <Th>Coverage</Th>
                    <Th>Services</Th>
                    <Th>Status</Th>
                    <Th>Compliance</Th>
                    <Th>Performance</Th>
                    <Th>Actions</Th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <Td colSpan={8}>Loading technicians...</Td>
                    </tr>
                  ) : filteredTechnicians.length === 0 ? (
                    <tr>
                      <Td colSpan={8}>No technicians found.</Td>
                    </tr>
                  ) : (
                    filteredTechnicians.map((technician) => (
                      <tr key={technician.id} className="border-t border-slate-200 align-top hover:bg-slate-50">
                        <Td>
                          <button
                            type="button"
                            onClick={() => setSelectedTechnician(technician)}
                            className="text-left font-bold text-slate-950 hover:text-blue-700"
                          >
                            {technician.name || "Unnamed technician"}
                          </button>
                          <p className="mt-1 text-xs text-slate-500">{technician.company || "No company listed"}</p>
                        </Td>
                        <Td>
                          <InfoLine icon={<Phone />} value={technician.phone} />
                          <InfoLine icon={<Mail />} value={technician.email} />
                        </Td>
                        <Td>
                          <InfoLine icon={<MapPin />} value={[technician.city, technician.state].filter(Boolean).join(", ")} />
                          <p className="mt-1 text-xs text-slate-500">{technician.serviceArea || "No coverage area"}</p>
                        </Td>
                        <Td>
                          <p className="max-w-56 text-sm">{technician.specialties || "No services listed"}</p>
                        </Td>
                        <Td>
                          <StatusBadge status={technician.status} />
                        </Td>
                        <Td>
                          <CompliancePill score={complianceScore(technician)} />
                        </Td>
                        <Td>
                          <p className="font-bold">{Number(technician.rating || 0).toFixed(1)} rating</p>
                          <p className="text-xs text-slate-500">{technician.completedJobs || 0} completed jobs</p>
                        </Td>
                        <Td>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => setSelectedTechnician(technician)}
                              className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200"
                            >
                              View
                            </button>
                            {isAdmin && (
                              <AdminActions
                                technician={technician}
                                onStatus={(status) => saveTechnician(technician.id, { status })}
                                onDelete={() => removeTechnician(technician.id)}
                              />
                            )}
                          </div>
                        </Td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        {activeTab === "Documents" && <DocumentsPanel technicians={filteredTechnicians} isAdmin={isAdmin} />}
        {activeTab === "Performance" && <PerformancePanel technicians={filteredTechnicians} isAdmin={isAdmin} />}
      </div>

      {selectedTechnician && (
        <TechnicianProfileModal
          technician={selectedTechnician}
          isAdmin={isAdmin}
          onClose={() => setSelectedTechnician(null)}
          onSaveNotes={(notes) => saveTechnician(selectedTechnician.id, { notes })}
          onStatus={(status) => saveTechnician(selectedTechnician.id, { status })}
          onDelete={() => removeTechnician(selectedTechnician.id)}
        />
      )}

      {inviteModalOpen && (
        <InviteTechnicianModal
          saving={saving}
          error={inviteError}
          onClose={() => setInviteModalOpen(false)}
          onSubmit={submitInvitation}
        />
      )}
    </div>
  );
}

function Dashboard({ stats }) {
  return (
    <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
      <Metric icon={<Users />} label="Total technicians" value={stats.total} />
      <Metric icon={<UserPlus />} label="Pending approvals" value={stats.pending} />
      <Metric icon={<BadgeCheck />} label="Approved technicians" value={stats.approved} />
      <Metric icon={<Ban />} label="Inactive technicians" value={stats.inactive} />
      <Metric icon={<FileWarning />} label="Missing documents" value={stats.missingDocuments} />
      <Metric icon={<Star />} label="Average rating" value={stats.averageRating} />
    </div>
  );
}

function DocumentsPanel({ technicians, isAdmin }) {
  return (
    <section className="rounded-3xl bg-white p-5 shadow-sm">
      <h2 className="text-xl font-bold">Documents</h2>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {technicians.map((technician) => (
          <div key={technician.id} className="rounded-2xl border border-slate-200 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-bold">{technician.name || "Unnamed technician"}</p>
                <p className="text-xs text-slate-500">{technician.company || "No company listed"}</p>
              </div>
              <CompliancePill score={complianceScore(technician)} />
            </div>
            <DocumentChecklist technician={technician} isAdmin={isAdmin} />
          </div>
        ))}
      </div>
    </section>
  );
}

function PerformancePanel({ technicians, isAdmin }) {
  return (
    <section className="rounded-3xl bg-white p-5 shadow-sm">
      <h2 className="text-xl font-bold">Performance</h2>
      <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200">
        <table className="w-full min-w-[780px] border-collapse text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <Th>Technician</Th>
              <Th>Rating</Th>
              <Th>Completed Jobs</Th>
              {isAdmin && <Th>Total Paid</Th>}
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {technicians.map((technician) => (
              <tr key={technician.id} className="border-t border-slate-200">
                <Td>{technician.name || "Unnamed technician"}</Td>
                <Td>{Number(technician.rating || 0).toFixed(1)}</Td>
                <Td>{technician.completedJobs || 0}</Td>
                {isAdmin && <Td>{money(technician.totalPaid)}</Td>}
                <Td>
                  <StatusBadge status={technician.status} />
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function InvitationsPanel({ invitations, onCopy, onWhatsApp, onSms }) {
  return (
    <section className="rounded-3xl bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-bold">Technician Invitations</h2>
          <p className="mt-1 text-sm text-slate-500">Track sent links, opens, completions, and expirations.</p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
          {invitations.length} total
        </span>
      </div>

      <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200">
        <table className="w-full min-w-[1120px] border-collapse text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <Th>Technician</Th>
              <Th>Phone</Th>
              <Th>Email</Th>
              <Th>Status</Th>
              <Th>Created</Th>
              <Th>Expires</Th>
              <Th>Opened</Th>
              <Th>Completed</Th>
              <Th>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {invitations.length === 0 ? (
              <tr>
                <Td colSpan={9}>No invitations yet.</Td>
              </tr>
            ) : (
              invitations.map((invitation) => {
                const link = registrationLinkForInvite(invitation.inviteCode);

                return (
                  <tr key={invitation.id} className="border-t border-slate-200 align-top">
                    <Td>
                      <p className="font-bold">{invitation.technicianName || "Pending technician"}</p>
                      <p className="text-xs text-slate-500">{invitation.inviteCode}</p>
                    </Td>
                    <Td>{invitation.phone || "Not set"}</Td>
                    <Td>{invitation.email || "Not set"}</Td>
                    <Td>
                      <InvitationStatus status={invitation.status} />
                    </Td>
                    <Td>{dateTime(invitation.createdAt)}</Td>
                    <Td>{dateTime(invitation.expiresAt)}</Td>
                    <Td>{dateTime(invitation.openedAt)}</Td>
                    <Td>{dateTime(invitation.completedAt)}</Td>
                    <Td>
                      <div className="flex flex-wrap gap-2">
                        <IconAction label="Copy Link" icon={<Clipboard />} onClick={() => onCopy(link)} />
                        <IconAction label="WhatsApp" icon={<MessageCircle />} onClick={() => onWhatsApp(link)} />
                        <IconAction label="SMS" icon={<Smartphone />} onClick={() => onSms(link)} />
                      </div>
                    </Td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function InviteTechnicianModal({ saving, error, onClose, onSubmit }) {
  const [form, setForm] = useState({
    technicianName: "",
    phone: "",
    email: "",
    notes: "",
  });

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function submit(event) {
    event.preventDefault();
    onSubmit(form);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
      <form onSubmit={submit} className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold">Invite Technician</h2>
            <p className="mt-1 text-sm text-slate-500">
              Create a secure registration link that expires in 7 days.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
          >
            Close
          </button>
        </div>

        <div className="mt-5 grid gap-4">
          <Field
            label="Technician Name"
            value={form.technicianName}
            onChange={(value) => updateField("technicianName", value)}
            required
          />
          <Field label="Phone" value={form.phone} onChange={(value) => updateField("phone", value)} required />
          <Field label="Email Optional" type="email" value={form.email} onChange={(value) => updateField("email", value)} />
          <TextArea label="Notes Optional" value={form.notes} onChange={(value) => updateField("notes", value)} />
        </div>

        {error && (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={saving}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          <Send className="h-5 w-5" />
          {saving ? "Creating Invitation..." : "Create Invitation"}
        </button>
      </form>
    </div>
  );
}

function TechnicianProfileModal({ technician, isAdmin, onClose, onSaveNotes, onStatus, onDelete }) {
  const [notes, setNotes] = useState(technician.notes || "");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
      <div className="max-h-[92vh] w-full max-w-5xl overflow-auto rounded-3xl bg-white p-6 shadow-2xl">
        <div className="flex flex-col gap-4 border-b border-slate-200 pb-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-2xl font-bold">{technician.name || "Technician Profile"}</h2>
            <p className="mt-1 text-sm text-slate-500">{technician.company || "No company listed"}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <StatusBadge status={technician.status} />
              <CompliancePill score={complianceScore(technician)} />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {isAdmin && (
              <AdminActions technician={technician} onStatus={onStatus} onDelete={onDelete} />
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
            >
              Close
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <ProfileSection title="Personal Information">
            <Detail label="Name" value={technician.name} />
            <Detail label="Phone" value={technician.phone} />
            <Detail label="Email" value={technician.email} />
            <Detail label="City" value={[technician.city, technician.state].filter(Boolean).join(", ")} />
          </ProfileSection>

          <ProfileSection title="Business Information">
            <Detail label="Company" value={technician.company} />
            <Detail label="Coverage" value={technician.serviceArea} />
            <Detail label="Services" value={technician.specialties} />
          </ProfileSection>

          {isAdmin && (
            <ProfileSection title="Tax Information">
              <Detail label="Tax ID" value={technician.taxId} />
              <Detail label="W9" value={docStatus(technician.w9Url)} />
            </ProfileSection>
          )}

          <ProfileSection title="Documents">
            <DocumentChecklist technician={technician} isAdmin={isAdmin} />
          </ProfileSection>

          {isAdmin && (
            <ProfileSection title="Payment Method">
              <Detail label="Method" value={technician.paymentMethod} />
              <Detail label="Details" value={technician.paymentDetails} />
            </ProfileSection>
          )}

          <ProfileSection title="Performance">
            <Detail label="Rating" value={Number(technician.rating || 0).toFixed(1)} />
            <Detail label="Completed jobs" value={technician.completedJobs || 0} />
            {isAdmin && <Detail label="Total paid" value={money(technician.totalPaid)} />}
          </ProfileSection>
        </div>

        <div className="mt-5 rounded-2xl border border-slate-200 p-4">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h3 className="font-bold">Notes</h3>
            {isAdmin && (
              <button
                type="button"
                onClick={() => onSaveNotes(notes)}
                className="rounded-xl bg-slate-950 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800"
              >
                Edit Notes
              </button>
            )}
          </div>
          {isAdmin ? (
            <textarea
              className="min-h-28 w-full rounded-xl border border-slate-200 p-3 outline-none focus:border-slate-500"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          ) : (
            <p className="whitespace-pre-wrap text-sm text-slate-600">{technician.notes || "No notes on file."}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function AdminActions({ technician, onStatus, onDelete }) {
  return (
    <>
      {technician.status !== "Approved" && (
        <button
          type="button"
          onClick={() => onStatus("Approved")}
          className="rounded-xl bg-emerald-100 px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-200"
        >
          Approve
        </button>
      )}
      {technician.status !== "Rejected" && (
        <button
          type="button"
          onClick={() => onStatus("Rejected")}
          className="rounded-xl bg-amber-100 px-3 py-2 text-xs font-bold text-amber-700 hover:bg-amber-200"
        >
          Reject
        </button>
      )}
      {technician.status !== "Inactive" && (
        <button
          type="button"
          onClick={() => onStatus("Inactive")}
          className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200"
        >
          Deactivate
        </button>
      )}
      <button
        type="button"
        onClick={onDelete}
        className="rounded-xl bg-red-100 p-2 text-red-700 hover:bg-red-200"
        title="Delete technician"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </>
  );
}

function DocumentChecklist({ technician, isAdmin }) {
  const documents = [
    { label: "Agreement accepted", complete: technician.agreementAccepted },
    { label: "Digital signature", complete: Boolean(technician.digitalSignature) },
    { label: "Driver license", complete: Boolean(technician.driverLicenseUrl) },
  ];

  if (isAdmin) {
    documents.push(
      { label: "W9", complete: Boolean(technician.w9Url) },
      { label: "Insurance", complete: Boolean(technician.insuranceUrl) }
    );
  }

  return (
    <div className="mt-3 grid gap-2">
      {documents.map((document) => (
        <div key={document.label} className="flex items-center justify-between gap-3 text-sm">
          <span>{document.label}</span>
          <span
            className={`rounded-full px-2 py-1 text-xs font-bold ${
              document.complete ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
            }`}
          >
            {document.complete ? "On file" : "Missing"}
          </span>
        </div>
      ))}
    </div>
  );
}

function complianceScore(technician) {
  const items = [
    technician.agreementAccepted,
    technician.digitalSignature,
    technician.driverLicenseUrl,
    technician.w9Url,
    technician.insuranceUrl,
  ];
  const completed = items.filter(Boolean).length;
  return Math.round((completed / items.length) * 100);
}

function isApproved(status) {
  return status === "Approved" || status === "Active";
}

function docStatus(value) {
  return value ? "On file" : "Missing";
}

function money(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value || 0));
}

function dateTime(value) {
  return value ? new Date(value).toLocaleString() : "Not yet";
}

function statusClass(status) {
  if (isApproved(status)) return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "Pending") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "Rejected" || status === "Do Not Use") return "border-red-200 bg-red-50 text-red-700";
  return "border-slate-200 bg-slate-100 text-slate-700";
}

function InvitationStatus({ status }) {
  const tone =
    status === "Completed"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : status === "Opened"
      ? "border-blue-200 bg-blue-50 text-blue-700"
      : status === "Expired" || status === "Cancelled"
      ? "border-red-200 bg-red-50 text-red-700"
      : "border-amber-200 bg-amber-50 text-amber-700";

  return <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-bold ${tone}`}>{status}</span>;
}

function IconAction({ icon, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1 rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200"
    >
      {React.cloneElement(icon, { className: "h-4 w-4" })}
      {label}
    </button>
  );
}

function StatusBadge({ status }) {
  return (
    <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-bold ${statusClass(status)}`}>
      {status || "Unknown"}
    </span>
  );
}

function CompliancePill({ score }) {
  const tone =
    score >= 80 ? "bg-emerald-100 text-emerald-700" : score >= 50 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700";

  return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${tone}`}>{score}% compliant</span>;
}

function Metric({ icon, label, value }) {
  return (
    <div className="rounded-3xl bg-white p-5 shadow-sm">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
        {React.cloneElement(icon, { className: "h-5 w-5" })}
      </div>
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
}

function ProfileSection({ title, children }) {
  return (
    <section className="rounded-2xl border border-slate-200 p-4">
      <h3 className="mb-3 flex items-center gap-2 font-bold">
        <BriefcaseBusiness className="h-4 w-4 text-slate-400" />
        {title}
      </h3>
      <div className="grid gap-2">{children}</div>
    </section>
  );
}

function Detail({ label, value }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase text-slate-400">{label}</p>
      <p className="text-sm text-slate-700">{value || "Not set"}</p>
    </div>
  );
}

function InfoLine({ icon, value }) {
  return (
    <div className="flex items-center gap-2 text-sm text-slate-700">
      {React.cloneElement(icon, { className: "h-4 w-4 text-slate-400" })}
      <span>{value || "Not set"}</span>
    </div>
  );
}

function SearchBox({ value, onChange }) {
  return (
    <div className="relative">
      <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
      <input
        className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 outline-none focus:border-slate-500"
        placeholder="Name, phone, company, city, state"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function ActionButton({ icon, label, onClick, tone = "slate" }) {
  const tones = {
    slate: "bg-slate-950 hover:bg-slate-800",
    emerald: "bg-emerald-600 hover:bg-emerald-700",
    green: "bg-green-600 hover:bg-green-700",
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-white ${tones[tone]}`}
    >
      {React.cloneElement(icon, { className: "h-4 w-4" })}
      {label}
    </button>
  );
}

function Field({ label, value, onChange, type = "text", required = false }) {
  return (
    <label className="space-y-1 text-sm font-medium">
      {label}
      <input
        type={type}
        required={required}
        className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-slate-500"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function Select({ label, value, options, onChange }) {
  const control = (
    <select
      className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-slate-500"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {options.map((option) => (
        <option key={option}>{option}</option>
      ))}
    </select>
  );

  if (!label) return control;

  return (
    <label className="space-y-1 text-sm font-medium">
      {label}
      {control}
    </label>
  );
}

function TextArea({ label, value, onChange }) {
  return (
    <label className="space-y-1 text-sm font-medium">
      {label}
      <textarea
        className="min-h-20 w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-slate-500"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function Th({ children }) {
  return <th className="px-4 py-3 font-bold">{children}</th>;
}

function Td({ children, colSpan }) {
  return (
    <td className="px-4 py-3" colSpan={colSpan}>
      {children}
    </td>
  );
}
