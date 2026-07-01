import React, { useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  Ban,
  BriefcaseBusiness,
  Clipboard,
  Edit3,
  FileCheck2,
  FileWarning,
  LocateFixed,
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
  getKnownColumns,
  loadTechnicians,
  subscribeToTechnicians,
  updateTechnician,
} from "./technicianService";
import { supabase } from "../../lib/supabase";
import {
  createInvitation,
  cancelInvitation,
  deleteInvitation,
  inviteMessage,
  loadInvitations,
  registrationLink as buildRegistrationLink,
  registrationLinkForInvite,
} from "./technicianInvitationService";
import { logActivity } from "../activity";
import { getPermissions } from "../permissions";

const emptyTechnician = {
  full_name: "",
  phone: "",
  email: "",
  company_name: "",
  city: "",
  state: "",
  address: "",
  zip_code: "",
  serviceArea: "",
  coverage: "",
  services: "",
  status: "Approved",
  availabilityStatus: "Available",
  paymentMethod: "",
  notes: "",
};

const tabs = ["Dashboard", "Directory", "Pending", "Approved", "Inactive", "Documents", "Performance"];
const statuses = ["All", "Pending", "Approved", "Rejected", "Inactive", "Missing Documents"];
const sortOptions = ["Newest", "Rating", "Completed Jobs"];
const availabilityOptions = ["Available", "Busy", "Off Duty", "Offline"];

export default function TechnicianCenter() {
  const [technicians, setTechnicians] = useState([]);
  const [activeTab, setActiveTab] = useState("Dashboard");
  const [form, setForm] = useState(emptyTechnician);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [serviceFilter, setServiceFilter] = useState("All");
  const [sortBy, setSortBy] = useState("Newest");
  const [selectedTechnician, setSelectedTechnician] = useState(null);
  const [editingTechnician, setEditingTechnician] = useState(null);
  const [coverageTechnician, setCoverageTechnician] = useState(null);
  const [technicianToDelete, setTechnicianToDelete] = useState(null);
  const [invitationToDelete, setInvitationToDelete] = useState(null);
  const [invitations, setInvitations] = useState([]);
  const [addTechnicianModalOpen, setAddTechnicianModalOpen] = useState(false);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [inviteError, setInviteError] = useState("");
  const [copyMessage, setCopyMessage] = useState("");

  const currentUserRole = localStorage.getItem("currentUserRole") || "dispatcher";
  const permissions = getPermissions(currentUserRole);
  const canApproveTechnicians = permissions.canApproveTechnicians;
  const canViewPrivateTechnicianData = permissions.canViewPrivateTechnicianData;
  const canEditDirectoryTechnicians = canApproveTechnicians || permissions.canAssignTechnicians;
  const knownColumns = useMemo(() => getKnownColumns(technicians), [technicians]);
  const missingDirectoryColumns = useMemo(() => directoryColumnsNeeded(knownColumns), [knownColumns]);
  const registrationLink = buildRegistrationLink();

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

    if (permissions.canApproveTechnicians) {
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
    if (canViewPrivateTechnicianData) return technicians;
    return technicians.filter((technician) => isApproved(technician.status));
  }, [canViewPrivateTechnicianData, technicians]);

  const serviceOptions = useMemo(() => {
    const services = safeTechnicians.flatMap((technician) =>
      splitServices(technician.services)
    );

    return ["All", ...new Set(services)].sort();
  }, [safeTechnicians]);

  const tabTechnicians = useMemo(() => {
    return safeTechnicians.filter((technician) => {
      if (activeTab === "Pending") return technician.status === "Pending";
      if (activeTab === "Approved") return technician.status === "Approved";
      if (activeTab === "Inactive") return ["Inactive", "Rejected", "Missing Documents"].includes(technician.status);
      if (activeTab === "Documents") return complianceScore(technician) < 100;
      return true;
    });
  }, [activeTab, safeTechnicians]);

  const filteredTechnicians = useMemo(() => {
    const query = search.trim().toLowerCase();

    return tabTechnicians
      .filter((technician) => {
        const searchText = [
          technician.full_name,
          technician.phone,
          technician.company_name,
          technician.city,
          technician.state,
          technician.coverage,
          technician.serviceArea,
        ]
          .join(" ")
          .toLowerCase();
        const matchesSearch = !query || searchText.includes(query);
        const matchesStatus = statusFilter === "All" || technician.status === statusFilter;
        const matchesService =
          serviceFilter === "All" ||
          splitServices(technician.services).some((service) =>
            service.toLowerCase().includes(serviceFilter.toLowerCase())
          );

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
      inactive: technicians.filter((technician) => ["Inactive", "Rejected", "Missing Documents"].includes(technician.status)).length,
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
    await saveNewTechnician(form);
  }

  async function saveNewTechnician(values) {
    setSaving(true);
    setError("");
    const createdBy = localStorage.getItem("currentUserName") || currentUserRole;
    const technicianValues = prepareDirectoryTechnicianValues(canApproveTechnicians ? values : { ...values, status: "Approved" });

    try {
      const technician = await createTechnician(technicianValues, knownColumns);
      await logActivity({
        entityType: "technician",
        entityId: technician.id,
        action: `Technician manually added by ${createdBy}`,
        description: `Technician manually added by ${createdBy}`,
        createdBy,
      });
      await refreshTechnicians();
      setForm(emptyTechnician);
      setAddTechnicianModalOpen(false);
      setActiveTab("Directory");
      setCopyMessage("Technician added successfully.");
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

  function buildStatusPatch(status) {
    const now = new Date().toISOString();

    if (status === "Approved") {
      return {
        status,
        approvedAt: now,
        approvedBy: localStorage.getItem("currentUserName") || currentUserRole,
      };
    }

    if (status === "Rejected") {
      return {
        status,
        rejectedAt: now,
        rejectedReason: window.prompt("Reason for rejection?", "") || "",
      };
    }

    if (status === "Inactive") {
      return {
        status,
        inactiveAt: now,
      };
    }

    return { status };
  }

  function updateTechnicianStatus(technician, status) {
    saveTechnician(technician.id, buildStatusPatch(status));
    if (status === "Approved") {
      logActivity({
        entityType: "technician",
        entityId: technician.id,
        action: "Technician Approved",
        description: `${technician.full_name || "Technician"} approved`,
        createdBy: localStorage.getItem("currentUserName") || currentUserRole,
      });
    }
  }

  function requestDeleteTechnician(technician) {
    if (!canApproveTechnicians) {
      setError("Only administrators can delete technicians.");
      return;
    }

    setTechnicianToDelete(technician);
  }

  async function confirmDeleteTechnician() {
    if (!technicianToDelete) return;
    if (!canApproveTechnicians) {
      setError("Only administrators can delete technicians.");
      setTechnicianToDelete(null);
      return;
    }

    try {
      const { error: invitationError } = await supabase
        .from("technician_invitations")
        .update({ status: "Deleted" })
        .eq("technician_id", technicianToDelete.id);

      if (invitationError) {
        console.warn("Technician invitation cleanup skipped:", invitationError);
      }

      const { error: deleteError } = await supabase
        .from("technicians")
        .delete()
        .eq("id", technicianToDelete.id);

      if (deleteError) {
        throw deleteError;
      }

      setTechnicians((current) => current.filter((technician) => technician.id !== technicianToDelete.id));
      setSelectedTechnician(null);
      setTechnicianToDelete(null);
      setCopyMessage("Technician deleted successfully");
      setError("");
      await logActivity({
        entityType: "technician",
        entityId: technicianToDelete.id,
        action: "Technician Deleted",
        description: `${technicianToDelete.full_name || "Technician"} deleted`,
        createdBy: localStorage.getItem("currentUserName") || currentUserRole,
      });
      await refreshTechnicians();
    } catch (deleteError) {
      console.error("Delete technician failed:", deleteError);
      setError(deleteError.message || JSON.stringify(deleteError) || "Unable to delete technician.");
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

  function shareRegistrationBySms() {
    const message = `Hello, this is NTTR - National Truck Trailer Repair. Please complete your technician registration using this secure link:\n${registrationLink}`;
    window.location.href = `sms:?&body=${encodeURIComponent(message)}`;
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

  async function submitInvitation(inviteForm) {
    setSaving(true);
    setInviteError("");

    try {
      const invitation = await createInvitation({
        ...inviteForm,
        invitedBy: localStorage.getItem("currentUserName") || currentUserRole,
      });
      setInvitations((current) => [invitation, ...current]);
      setCopyMessage(`Invitation created: ${registrationLinkForInvite(invitation.inviteCode)}`);
      await logActivity({
        entityType: "technician_invitation",
        entityId: invitation.id,
        action: "Technician Invited",
        description: `Invitation ${invitation.inviteCode} sent to ${invitation.phone || invitation.email || invitation.technicianName}`,
        createdBy: localStorage.getItem("currentUserName") || currentUserRole,
      });
      return invitation;
    } catch (createError) {
      setInviteError(createError.message || "Unable to create invitation.");
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function cancelTechnicianInvitation(invitation) {
    setInviteError("");
    try {
      await cancelInvitation(invitation.id);
      setCopyMessage("Invitation cancelled.");
      setInvitations(await loadInvitations());
    } catch (cancelError) {
      setInviteError(cancelError.message || "Unable to cancel invitation.");
    }
  }

  async function confirmDeleteInvitation() {
    if (!invitationToDelete) return;

    setInviteError("");
    try {
      await deleteInvitation(invitationToDelete.id);
      setInvitationToDelete(null);
      setCopyMessage("Invitation deleted.");
      setInvitations(await loadInvitations());
    } catch (deleteError) {
      setInviteError(deleteError.message || "Unable to delete invitation.");
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

            <div className="flex flex-wrap items-center justify-start gap-2 xl:justify-end">
              {canEditDirectoryTechnicians && <ActionButton onClick={() => setAddTechnicianModalOpen(true)} icon={<UserPlus />} label="+ Add Technician" tone="blue" />}
              <ActionButton onClick={() => setInviteModalOpen(true)} icon={<UserPlus />} label="Invite Technician" />
              <ActionButton onClick={copyRegistrationLink} icon={<Clipboard />} label="Copy Registration Link" tone="emerald" />
              <ActionButton onClick={shareRegistrationOnWhatsApp} icon={<MessageCircle />} label="WhatsApp Share" tone="green" />
              <ActionButton onClick={shareRegistrationBySms} icon={<Smartphone />} label="SMS Invite" tone="blue" />
              <ActionButton onClick={refreshTechnicians} icon={<RefreshCw className={loading ? "animate-spin" : ""} />} label="Refresh" />
            </div>
          </div>

          {copyMessage && (
            <p className="mt-3 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
              {copyMessage}
            </p>
          )}

          {!canViewPrivateTechnicianData && (
            <p className="mt-3 rounded-2xl bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700">
              Dispatcher-safe mode is active. Only approved technicians are visible.
            </p>
          )}

          {missingDirectoryColumns.length > 0 && (
            <p className="mt-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700">
              Safe mode: missing optional directory columns ({missingDirectoryColumns.join(", ")}). Those fields stay visible and the app will only save them when the technicians table supports them.
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

        {activeTab === "Directory" && (
          <TechnicianDirectory
            technicians={filteredTechnicians}
            loading={loading}
            search={search}
            statusFilter={statusFilter}
            serviceFilter={serviceFilter}
            sortBy={sortBy}
            serviceOptions={serviceOptions}
            canEdit={canEditDirectoryTechnicians}
            canDelete={canApproveTechnicians}
            canAssign={permissions.canAssignTechnicians}
            onSearch={setSearch}
            onStatusFilter={setStatusFilter}
            onServiceFilter={setServiceFilter}
            onSort={setSortBy}
            onOpen={setSelectedTechnician}
            onEdit={setEditingTechnician}
            onDelete={requestDeleteTechnician}
            onCoverage={setCoverageTechnician}
            onAssign={(technician) => setCopyMessage(`${technician.full_name || "Technician"} selected. Open a job in Dispatch Board to complete assignment.`)}
          />
        )}

        {activeTab !== "Directory" && (
          <TechnicianCardGrid
            technicians={filteredTechnicians}
            onOpen={setSelectedTechnician}
          />
        )}

        {canApproveTechnicians && (
          <InvitationsPanel
            invitations={invitations}
            onCopy={copyInviteLink}
            onWhatsApp={shareInviteOnWhatsApp}
            onCancel={cancelTechnicianInvitation}
            onDelete={setInvitationToDelete}
          />
        )}

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
            {error}
          </div>
        )}

        {canApproveTechnicians && inviteError && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-700">
            Invitation system: {inviteError}
          </div>
        )}

        {activeTab !== "Directory" && (
        <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
          {canApproveTechnicians && (
            <form onSubmit={addTechnician} className="rounded-3xl bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-bold">Add Technician</h2>
                <UserPlus className="h-5 w-5 text-slate-500" />
              </div>

              <div className="grid gap-3">
                <Field label="Full Name" value={form.full_name} onChange={(value) => updateForm("full_name", value)} required />
                <Field label="Company" value={form.company_name} onChange={(value) => updateForm("company_name", value)} />
                <Field label="Phone" value={form.phone} onChange={(value) => updateForm("phone", value)} required />
                <Field label="Email" value={form.email} onChange={(value) => updateForm("email", value)} type="email" />
                <div className="grid grid-cols-2 gap-3">
                  <Field label="City" value={form.city} onChange={(value) => updateForm("city", value)} />
                  <Field label="State" value={form.state} onChange={(value) => updateForm("state", value)} />
                </div>
                <Field label="Address" value={form.address} onChange={(value) => updateForm("address", value)} />
                <Field label="ZIP" value={form.zip_code} onChange={(value) => updateForm("zip_code", value)} />
                <TextArea label="Coverage Areas" value={form.coverage} onChange={(value) => updateForm("coverage", value)} />
                <Field label="Services" value={form.services} onChange={(value) => updateForm("services", value)} />
                <Field label="Preferred Payment Method" value={form.paymentMethod} onChange={(value) => updateForm("paymentMethod", value)} />
                <Select label="Availability" value={form.availabilityStatus} options={availabilityOptions} onChange={(value) => updateForm("availabilityStatus", value)} />
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

          <section className={`rounded-3xl bg-white p-5 shadow-sm ${canApproveTechnicians ? "" : "xl:col-span-2"}`}>
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
                      <tr
                        key={technician.id}
                        onClick={() => setSelectedTechnician(technician)}
                        className="cursor-pointer border-t border-slate-200 align-top hover:bg-slate-50"
                      >
                        <Td>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setSelectedTechnician(technician);
                            }}
                            className="text-left font-bold text-slate-950 hover:text-blue-700"
                          >
                            {technician.full_name || "Unnamed technician"}
                          </button>
                          <p className="mt-1 text-xs text-slate-500">{technician.company_name || "No company listed"}</p>
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
                          <p className="max-w-56 text-sm">{formatServices(technician.services)}</p>
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
                              onClick={(event) => {
                                event.stopPropagation();
                                setSelectedTechnician(technician);
                              }}
                              className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200"
                            >
                              View
                            </button>
                            {canApproveTechnicians && activeTab === "Pending" && technician.status === "Pending" && (
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  updateTechnicianStatus(technician, "Approved");
                                }}
                                className="rounded-xl bg-emerald-100 px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-200"
                              >
                                Approve
                              </button>
                            )}
                            {canApproveTechnicians && (
                              <div onClick={(event) => event.stopPropagation()}>
                                <AdminActions
                                  technician={technician}
                                onStatus={(status) => updateTechnicianStatus(technician, status)}
                                  onDelete={() => requestDeleteTechnician(technician)}
                                />
                              </div>
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
        )}

        {activeTab === "Documents" && <DocumentsPanel technicians={filteredTechnicians} canViewPrivateTechnicianData={canViewPrivateTechnicianData} />}
        {activeTab === "Performance" && <PerformancePanel technicians={filteredTechnicians} canViewPrivateTechnicianData={canViewPrivateTechnicianData} />}
      </div>

      {selectedTechnician && (
        <TechnicianProfileModal
          technician={selectedTechnician}
          invitations={invitations.filter(
            (invitation) =>
              invitation.technicianId === selectedTechnician.id ||
              invitation.phone === selectedTechnician.phone ||
              invitation.email === selectedTechnician.email
          )}
          canApproveTechnicians={canApproveTechnicians}
          canViewPrivateTechnicianData={canViewPrivateTechnicianData}
          onClose={() => setSelectedTechnician(null)}
          onSaveNotes={(notes) => saveTechnician(selectedTechnician.id, { notes })}
          onStatus={(status) => updateTechnicianStatus(selectedTechnician, status)}
          onDelete={() => requestDeleteTechnician(selectedTechnician)}
        />
      )}

      {editingTechnician && (
        <EditTechnicianModal
          technician={editingTechnician}
          saving={saving}
          canEditStatus={canApproveTechnicians}
          onClose={() => setEditingTechnician(null)}
          onSave={async (patch) => {
            setSaving(true);
            const nextPatch = prepareDirectoryTechnicianValues(patch);
            await saveTechnician(editingTechnician.id, canApproveTechnicians ? nextPatch : basicTechnicianPatch(nextPatch));
            setSaving(false);
            setEditingTechnician(null);
          }}
        />
      )}

      {coverageTechnician && (
        <CoverageMapModal
          technician={coverageTechnician}
          technicians={filteredTechnicians}
          onClose={() => setCoverageTechnician(null)}
        />
      )}

      {addTechnicianModalOpen && (
        <AddTechnicianModal
          saving={saving}
          onClose={() => setAddTechnicianModalOpen(false)}
          onSave={saveNewTechnician}
        />
      )}

      {technicianToDelete && (
        <DeleteTechnicianModal
          technician={technicianToDelete}
          onCancel={() => setTechnicianToDelete(null)}
          onConfirm={confirmDeleteTechnician}
        />
      )}

      {invitationToDelete && (
        <DeleteInvitationModal
          invitation={invitationToDelete}
          onCancel={() => setInvitationToDelete(null)}
          onConfirm={confirmDeleteInvitation}
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

function TechnicianDirectory({
  technicians,
  loading,
  search,
  statusFilter,
  serviceFilter,
  sortBy,
  serviceOptions,
  canEdit,
  canDelete,
  canAssign,
  onSearch,
  onStatusFilter,
  onServiceFilter,
  onSort,
  onOpen,
  onEdit,
  onDelete,
  onCoverage,
  onAssign,
}) {
  const [lookup, setLookup] = useState({ city: "", state: "", service: "" });
  const rankedTechnicians = useMemo(
    () => rankTechniciansByCoverage(technicians, lookup),
    [lookup, technicians]
  );

  return (
    <section className="rounded-3xl bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-950">Technician Directory</h2>
          <p className="mt-1 text-sm text-slate-500">Find technicians by home market, coverage area, service, availability, and rating.</p>
        </div>
        <button type="button" onClick={() => onCoverage(rankedTechnicians[0] || technicians[0])} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700">
          <LocateFixed className="h-4 w-4" />
          View Coverage Map
        </button>
      </div>

      <div className="mt-5 grid gap-3 xl:grid-cols-[1fr_1fr]">
        <div className="grid gap-2 md:grid-cols-4">
          <SearchBox value={search} onChange={onSearch} />
          <Select value={statusFilter} options={statuses} onChange={onStatusFilter} />
          <Select value={serviceFilter} options={serviceOptions} onChange={onServiceFilter} />
          <Select value={sortBy} options={sortOptions} onChange={onSort} />
        </div>
        <div className="grid gap-2 md:grid-cols-3">
          <Field label="Search City" value={lookup.city} onChange={(value) => setLookup((current) => ({ ...current, city: value }))} />
          <Field label="State" value={lookup.state} onChange={(value) => setLookup((current) => ({ ...current, state: value }))} />
          <Field label="Service" value={lookup.service} onChange={(value) => setLookup((current) => ({ ...current, service: value }))} />
        </div>
      </div>

      <div className="mt-5 overflow-x-auto rounded-2xl border border-slate-200">
        <table className="w-full min-w-[1500px] border-collapse text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <Th>Technician Name</Th>
              <Th>Company</Th>
              <Th>Phone</Th>
              <Th>Email</Th>
              <Th>City</Th>
              <Th>State</Th>
              <Th>Coverage Areas</Th>
              <Th>Services</Th>
              <Th>Availability</Th>
              <Th>Rating</Th>
              <Th>Status</Th>
              <Th>Last Used</Th>
              <Th>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><Td colSpan={13}>Loading technicians...</Td></tr>
            ) : rankedTechnicians.length === 0 ? (
              <tr><Td colSpan={13}>No technicians found.</Td></tr>
            ) : (
              rankedTechnicians.map((technician) => (
                <tr key={technician.id} className="border-t border-slate-200 align-top hover:bg-slate-50">
                  <Td><button type="button" onClick={() => onOpen(technician)} className="font-bold text-slate-950 hover:text-blue-700">{technician.full_name || "Unnamed technician"}</button></Td>
                  <Td>{technician.company_name || "Not set"}</Td>
                  <Td>{technician.phone || "Not set"}</Td>
                  <Td>{technician.email || "Not set"}</Td>
                  <Td>{technician.city || "Not set"}</Td>
                  <Td>{technician.state || "Not set"}</Td>
                  <Td><p className="max-w-64 whitespace-pre-wrap">{formatCoverage(technician)}</p></Td>
                  <Td><p className="max-w-64">{formatServices(technician.services)}</p></Td>
                  <Td><AvailabilityBadge status={technician.availabilityStatus} /></Td>
                  <Td>{Number(technician.rating || 0).toFixed(1)}</Td>
                  <Td><StatusBadge status={technician.status} /></Td>
                  <Td>{dateTime(technician.lastUsed || technician.updatedAt)}</Td>
                  <Td>
                    <div className="flex flex-wrap gap-2">
                      <a href={technician.phone ? `tel:${technician.phone}` : undefined} className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200">Call</a>
                      <a href={directoryWhatsAppLink(technician, lookup)} target="_blank" rel="noreferrer" className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700">WhatsApp</a>
                      {canAssign && <button type="button" onClick={() => onAssign(technician)} className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700">Assign</button>}
                      {canEdit && <button type="button" onClick={() => onEdit(technician)} className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200">Edit</button>}
                      <button type="button" onClick={() => onCoverage(technician)} className="rounded-xl bg-indigo-100 px-3 py-2 text-xs font-bold text-indigo-700 hover:bg-indigo-200">View Coverage</button>
                      {canDelete && <button type="button" onClick={() => onDelete(technician)} className="rounded-xl bg-red-100 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-200">Delete</button>}
                    </div>
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function AddTechnicianModal({ saving, onClose, onSave }) {
  const [form, setForm] = useState(emptyTechnician);

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
      <form onSubmit={(event) => { event.preventDefault(); onSave(form); }} className="max-h-[92vh] w-full max-w-3xl overflow-auto rounded-3xl bg-white p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold text-slate-950">Add Technician</h2>
            <p className="mt-1 text-sm text-slate-500">Create a technician manually in the directory.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">Close</button>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Full Name" value={form.full_name} onChange={(value) => update("full_name", value)} required />
          <Field label="Phone" value={form.phone} onChange={(value) => update("phone", value)} required />
          <Field label="Company" value={form.company_name} onChange={(value) => update("company_name", value)} />
          <Field label="Email" value={form.email} onChange={(value) => update("email", value)} type="email" />
          <Field label="City" value={form.city} onChange={(value) => update("city", value)} />
          <Field label="State" value={form.state} onChange={(value) => update("state", value)} />
          <TextArea label="Services" value={form.services} onChange={(value) => update("services", value)} />
          <TextArea label="Coverage Areas" value={form.coverage} onChange={(value) => update("coverage", value)} />
          <Select label="Availability" value={form.availabilityStatus} options={availabilityOptions} onChange={(value) => update("availabilityStatus", value)} />
          <Select label="Status" value={form.status} options={statuses.filter((status) => status !== "All")} onChange={(value) => update("status", value)} />
          <TextArea label="Notes" value={form.notes} onChange={(value) => update("notes", value)} />
        </div>

        <button type="submit" disabled={saving} className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400">
          <UserPlus className="h-5 w-5" />
          {saving ? "Saving..." : "Save Technician"}
        </button>
      </form>
    </div>
  );
}

function EditTechnicianModal({ technician, saving, canEditStatus, onClose, onSave }) {
  const [form, setForm] = useState({
    full_name: technician.full_name || "",
    company_name: technician.company_name || "",
    phone: technician.phone || "",
    email: technician.email || "",
    city: technician.city || "",
    state: technician.state || "",
    address: technician.address || "",
    zip_code: technician.zip_code || "",
    coverage: technician.coverage || technician.serviceArea || "",
    services: formatServices(technician.services) === "No services listed" ? "" : formatServices(technician.services),
    notes: technician.notes || "",
    paymentMethod: technician.paymentMethod || "",
    availabilityStatus: technician.availabilityStatus || "Available",
    status: technician.status || "Approved",
  });

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
      <form onSubmit={(event) => { event.preventDefault(); onSave(form); }} className="max-h-[92vh] w-full max-w-3xl overflow-auto rounded-3xl bg-white p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold text-slate-950">Edit Technician</h2>
            <p className="mt-1 text-sm text-slate-500">Update directory contact, coverage, service, and availability details.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">Close</button>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Full Name" value={form.full_name} onChange={(value) => update("full_name", value)} required />
          <Field label="Company" value={form.company_name} onChange={(value) => update("company_name", value)} />
          <Field label="Phone" value={form.phone} onChange={(value) => update("phone", value)} required />
          <Field label="Email" value={form.email} onChange={(value) => update("email", value)} type="email" />
          <Field label="City" value={form.city} onChange={(value) => update("city", value)} />
          <Field label="State" value={form.state} onChange={(value) => update("state", value)} />
          <Field label="Address" value={form.address} onChange={(value) => update("address", value)} />
          <Field label="ZIP" value={form.zip_code} onChange={(value) => update("zip_code", value)} />
          <TextArea label="Coverage Areas" value={form.coverage} onChange={(value) => update("coverage", value)} />
          <TextArea label="Services" value={form.services} onChange={(value) => update("services", value)} />
          <Field label="Preferred Payment Method" value={form.paymentMethod} onChange={(value) => update("paymentMethod", value)} />
          <Select label="Availability" value={form.availabilityStatus} options={availabilityOptions} onChange={(value) => update("availabilityStatus", value)} />
          {canEditStatus && <Select label="Status" value={form.status} options={statuses.filter((status) => status !== "All")} onChange={(value) => update("status", value)} />}
          <TextArea label="Notes" value={form.notes} onChange={(value) => update("notes", value)} />
        </div>
        <button type="submit" disabled={saving} className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400">
          <Edit3 className="h-5 w-5" />
          {saving ? "Saving..." : "Save Technician"}
        </button>
      </form>
    </div>
  );
}

function CoverageMapModal({ technician, technicians, onClose }) {
  const ranked = rankTechniciansByCoverage(technicians, {
    city: technician.city,
    state: technician.state,
    service: "",
  }).slice(0, 8);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
      <div className="max-h-[92vh] w-full max-w-4xl overflow-auto rounded-3xl bg-white p-6 shadow-2xl">
        <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-950">Coverage Map</h2>
            <p className="mt-1 text-sm text-slate-500">Map API is not configured. Showing a clean coverage and closest-technician list instead.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">Close</button>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-[0.9fr_1.1fr]">
          <section className="rounded-2xl border border-slate-200 p-4">
            <h3 className="font-bold">Home City</h3>
            <p className="mt-2 text-sm text-slate-700">{[technician.city, technician.state].filter(Boolean).join(", ") || "Not set"}</p>
            <h3 className="mt-5 font-bold">Coverage Areas</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {coverageAreas(technician).length ? coverageAreas(technician).map((area) => (
                <span key={area} className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">{area}</span>
              )) : <p className="text-sm text-slate-500">No coverage areas listed.</p>}
            </div>
          </section>
          <section className="rounded-2xl border border-slate-200 p-4">
            <h3 className="font-bold">Closest Available Technicians</h3>
            <div className="mt-3 grid gap-3">
              {ranked.map((item, index) => (
                <div key={item.id} className="rounded-xl bg-slate-50 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-bold text-slate-950">{index + 1}. {item.full_name || "Unnamed technician"}</p>
                      <p className="text-xs text-slate-500">{[item.city, item.state].filter(Boolean).join(", ") || "No home city"}</p>
                      <p className="mt-1 text-xs text-slate-500">{formatCoverage(item)}</p>
                    </div>
                    <AvailabilityBadge status={item.availabilityStatus} />
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
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

function TechnicianCardGrid({ technicians, onOpen }) {
  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {technicians.map((technician) => (
        <button
          key={technician.id}
          type="button"
          onClick={() => onOpen(technician)}
          className="rounded-3xl bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
        >
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-slate-100 text-lg font-bold text-slate-600">
              {technician.profilePhotoUrl ? (
                <img src={technician.profilePhotoUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                initials(technician.full_name)
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-bold text-slate-950">{technician.full_name || "Unnamed technician"}</p>
                <StatusBadge status={technician.status} />
                <AvailabilityBadge status={technician.availabilityStatus} />
              </div>
              <p className="mt-1 text-sm text-slate-500">
                {[technician.city, technician.state].filter(Boolean).join(", ") || "No location"} · {technician.phone || "No phone"}
              </p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <MiniStat label="Compliance" value={`${complianceScore(technician)}%`} />
            <MiniStat label="Jobs Completed" value={technician.completedJobs || 0} />
            <MiniStat label="Acceptance Rate" value={`${Number(technician.acceptanceRate || 0).toFixed(0)}%`} />
            <MiniStat label="Average ETA" value={technician.averageEta ? `${technician.averageEta} min` : "Not set"} />
            <MiniStat label="Average Rating" value={Number(technician.rating || 0).toFixed(1)} />
            <MiniStat label="Coverage" value={technician.coverage || technician.serviceArea || "Not set"} />
          </div>

          <div className="mt-4">
            <p className="text-xs font-bold uppercase text-slate-400">Services</p>
            <p className="mt-1 text-sm text-slate-700">{formatServices(technician.services)}</p>
          </div>
        </button>
      ))}
    </section>
  );
}

function DocumentsPanel({ technicians, canViewPrivateTechnicianData }) {
  return (
    <section className="rounded-3xl bg-white p-5 shadow-sm">
      <h2 className="text-xl font-bold">Documents</h2>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {technicians.map((technician) => (
          <div key={technician.id} className="rounded-2xl border border-slate-200 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-bold">{technician.full_name || "Unnamed technician"}</p>
                <p className="text-xs text-slate-500">{technician.company_name || "No company listed"}</p>
              </div>
              <CompliancePill score={complianceScore(technician)} />
            </div>
            <DocumentChecklist technician={technician} canViewPrivateTechnicianData={canViewPrivateTechnicianData} />
          </div>
        ))}
      </div>
    </section>
  );
}

function PerformancePanel({ technicians, canViewPrivateTechnicianData }) {
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
              {canViewPrivateTechnicianData && <Th>Total Paid</Th>}
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {technicians.map((technician) => (
              <tr key={technician.id} className="border-t border-slate-200">
                <Td>{technician.full_name || "Unnamed technician"}</Td>
                <Td>{Number(technician.rating || 0).toFixed(1)}</Td>
                <Td>{technician.completedJobs || 0}</Td>
                {canViewPrivateTechnicianData && <Td>{money(technician.totalPaid)}</Td>}
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

function InvitationsPanel({ invitations, onCopy, onWhatsApp, onCancel, onDelete }) {
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
                const inactive = ["Cancelled", "Deleted", "Completed"].includes(invitation.status);

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
                        {!inactive && (
                          <>
                            <IconAction label="Copy Link" icon={<Clipboard />} onClick={() => onCopy(link)} />
                            <IconAction label="WhatsApp" icon={<MessageCircle />} onClick={() => onWhatsApp(link)} />
                            <IconAction label="Cancel" icon={<Ban />} onClick={() => onCancel(invitation)} />
                          </>
                        )}
                        <IconAction label="Delete" icon={<Trash2 />} onClick={() => onDelete(invitation)} />
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
  const [createdInvitation, setCreatedInvitation] = useState(null);
  const createdLink = createdInvitation ? registrationLinkForInvite(createdInvitation.inviteCode) : "";

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    const invitation = await onSubmit(form);
    if (invitation) {
      setCreatedInvitation(invitation);
    }
  }

  async function copyCreatedLink() {
    await navigator.clipboard.writeText(createdLink);
  }

  function shareCreatedOnWhatsApp() {
    window.open(`https://wa.me/?text=${encodeURIComponent(inviteMessage(createdLink))}`, "_blank", "noopener,noreferrer");
  }

  function shareCreatedBySms() {
    window.location.href = `sms:?&body=${encodeURIComponent(inviteMessage(createdLink))}`;
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

        {createdInvitation ? (
          <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-sm font-bold text-emerald-800">Invitation Created</p>
            <p className="mt-1 text-xs font-semibold text-emerald-700">{createdInvitation.inviteCode}</p>
            <div className="mt-3 rounded-xl bg-white p-3 text-sm text-slate-700 break-all">
              {createdLink}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <IconAction label="Copy Link" icon={<Clipboard />} onClick={copyCreatedLink} />
              <IconAction label="WhatsApp Share" icon={<MessageCircle />} onClick={shareCreatedOnWhatsApp} />
              <IconAction label="SMS Invite" icon={<Smartphone />} onClick={shareCreatedBySms} />
            </div>
          </div>
        ) : (
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
        )}

        {error && (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
            {error}
          </div>
        )}

        {!createdInvitation && (
          <button
            type="submit"
            disabled={saving}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            <Send className="h-5 w-5" />
            {saving ? "Creating Invitation..." : "Create Invitation"}
          </button>
        )}
      </form>
    </div>
  );
}

function TechnicianProfileModal({
  technician,
  invitations,
  canApproveTechnicians,
  canViewPrivateTechnicianData,
  onClose,
  onSaveNotes,
  onStatus,
  onDelete,
}) {
  const [notes, setNotes] = useState(technician.notes || "");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
      <div className="max-h-[92vh] w-full max-w-5xl overflow-auto rounded-3xl bg-white p-6 shadow-2xl">
        <div className="flex flex-col gap-4 border-b border-slate-200 pb-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-2xl font-bold">{technician.full_name || "Technician Profile"}</h2>
            <p className="mt-1 text-sm text-slate-500">{technician.company_name || "No company listed"}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <StatusBadge status={technician.status} />
              <CompliancePill score={complianceScore(technician)} />
              <AvailabilityBadge status={technician.availabilityStatus} />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {canApproveTechnicians && (
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
            <Detail label="Name" value={technician.full_name} />
            <Detail label="Phone" value={technician.phone} />
            <Detail label="Email" value={technician.email} />
            <Detail label="City / State" value={[technician.city, technician.state].filter(Boolean).join(", ")} />
            <Detail label="Availability" value={technician.availabilityStatus} />
          </ProfileSection>

          <ProfileSection title="Business Information">
            <Detail label="Company" value={technician.company_name} />
            <Detail label="Status" value={technician.status} />
            <Detail label="Created" value={dateTime(technician.createdAt)} />
          </ProfileSection>

          <ProfileSection title="Services">
            <ServiceList services={technician.services} />
          </ProfileSection>

          <ProfileSection title="Coverage">
            <Detail label="Primary market" value={[technician.city, technician.state].filter(Boolean).join(", ")} />
            <Detail label="ZIP" value={technician.zip_code} />
            <Detail label="Coverage" value={technician.coverage || technician.serviceArea} />
          </ProfileSection>

          <ProfileSection title="Documents">
            <DocumentChecklist technician={technician} canViewPrivateTechnicianData={canViewPrivateTechnicianData} />
          </ProfileSection>

          <ProfileSection title="Compliance Score">
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-4xl font-bold text-slate-950">{complianceScore(technician)}%</p>
              <p className="mt-1 text-sm text-slate-500">Based on agreement, signature, license, W9, and insurance.</p>
            </div>
          </ProfileSection>

          {canViewPrivateTechnicianData && (
            <ProfileSection title="Payment Information">
              <Detail label="Method" value={technician.paymentMethod} />
              <Detail label="Bank / Zelle" value={technician.bankZelleInfo || technician.paymentDetails} />
              <Detail label="Total paid" value={money(technician.totalPaid)} />
            </ProfileSection>
          )}

          <ProfileSection title="Performance">
            <Detail label="Rating" value={Number(technician.rating || 0).toFixed(1)} />
            <Detail label="Completed jobs" value={technician.completedJobs || 0} />
            {canViewPrivateTechnicianData && <Detail label="Total paid" value={money(technician.totalPaid)} />}
          </ProfileSection>

          <ProfileSection title="Invitation History">
            {invitations.length === 0 ? (
              <p className="text-sm text-slate-500">No linked invitation history.</p>
            ) : (
              <div className="grid gap-3">
                {invitations.map((invitation) => (
                  <div key={invitation.id} className="rounded-xl bg-slate-50 p-3 text-sm">
                    <p className="font-bold">{invitation.inviteCode}</p>
                    <p className="text-slate-500">{invitation.status}</p>
                    <p className="text-xs text-slate-500">Opened: {dateTime(invitation.openedAt)}</p>
                    <p className="text-xs text-slate-500">Completed: {dateTime(invitation.completedAt)}</p>
                  </div>
                ))}
              </div>
            )}
          </ProfileSection>

          <ProfileSection title="Technician Detail Timeline">
            <Timeline technician={technician} invitations={invitations} />
          </ProfileSection>
        </div>

        <div className="mt-5 rounded-2xl border border-slate-200 p-4">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h3 className="font-bold">Notes</h3>
            {canApproveTechnicians && (
              <button
                type="button"
                onClick={() => onSaveNotes(notes)}
                className="rounded-xl bg-slate-950 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800"
              >
                Edit Notes
              </button>
            )}
          </div>
          {canApproveTechnicians ? (
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
          Inactive
        </button>
      )}
      {technician.status !== "Missing Documents" && (
        <button
          type="button"
          onClick={() => onStatus("Missing Documents")}
          className="rounded-xl bg-orange-100 px-3 py-2 text-xs font-bold text-orange-700 hover:bg-orange-200"
        >
          Mark Missing Documents
        </button>
      )}
      {String(technician.status || "").toLowerCase() === "pending" && (
        <button
          type="button"
          onClick={onDelete}
          className="rounded-xl bg-red-100 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-200"
          title="Delete technician"
        >
          Delete
        </button>
      )}
    </>
  );
}

function DeleteTechnicianModal({ technician, onCancel, onConfirm }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
      <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl">
        <h2 className="text-2xl font-bold text-slate-950">Delete Technician</h2>
        <p className="mt-2 text-sm text-slate-600">
          Are you sure you want to permanently delete this technician?
        </p>

        <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm">
          <Detail label="Full name" value={technician.full_name} />
          <Detail label="Phone" value={technician.phone} />
          <Detail label="Company" value={technician.company_name} />
          <Detail label="City / State" value={[technician.city, technician.state].filter(Boolean).join(", ")} />
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

function DeleteInvitationModal({ invitation, onCancel, onConfirm }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
      <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl">
        <h2 className="text-2xl font-bold text-slate-950">Delete Invitation</h2>
        <p className="mt-2 text-sm text-slate-600">
          Are you sure you want to permanently delete this technician invitation link?
        </p>

        <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm">
          <Detail label="Invite code" value={invitation.inviteCode} />
          <Detail label="Technician" value={invitation.technicianName} />
          <Detail label="Phone" value={invitation.phone} />
          <Detail label="Email" value={invitation.email} />
          <Detail label="Status" value={invitation.status} />
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

function DocumentChecklist({ technician, canViewPrivateTechnicianData }) {
  const documents = [
    { label: "Driver License", complete: Boolean(technician.driverLicenseUrl) },
    { label: "DOT Certificate", complete: Boolean(technician.dotCertificateUrl) },
    { label: "Profile Photo", complete: Boolean(technician.profilePhotoUrl) },
    { label: "Signed Agreement", complete: Boolean(technician.signedAgreementUrl || technician.agreementAccepted || technician.digitalSignature) },
  ];

  if (canViewPrivateTechnicianData) {
    documents.splice(
      1,
      0,
      { label: "Insurance", complete: Boolean(technician.insuranceUrl) },
      { label: "W9", complete: Boolean(technician.w9Url) }
    );
    documents.push({
      label: "Bank / Zelle Information",
      complete: Boolean(technician.bankZelleInfo || technician.paymentMethod),
    });
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
            {document.complete ? "Uploaded" : "Missing"}
          </span>
        </div>
      ))}
    </div>
  );
}

function complianceScore(technician) {
  const items = [
    technician.driverLicenseUrl,
    technician.insuranceUrl,
    technician.w9Url,
    technician.dotCertificateUrl,
    technician.profilePhotoUrl,
    technician.bankZelleInfo || technician.paymentMethod,
    technician.signedAgreementUrl || technician.agreementAccepted || technician.digitalSignature,
  ];
  const completed = items.filter(Boolean).length;
  return Math.round((completed / items.length) * 100);
}

function isApproved(status) {
  return status === "Approved" || status === "Active";
}

function basicTechnicianPatch(patch) {
  const allowedFields = [
    "full_name",
    "company_name",
    "phone",
    "email",
    "city",
    "state",
    "coverage",
    "serviceArea",
    "services",
    "availabilityStatus",
    "notes",
  ];

  return Object.fromEntries(
    Object.entries(patch).filter(([field]) => allowedFields.includes(field))
  );
}

function prepareDirectoryTechnicianValues(values) {
  return {
    ...values,
    serviceArea: values.serviceArea || values.coverage || "",
  };
}

function directoryColumnsNeeded(knownColumns) {
  const optionalColumns = {
    address: ["address", "street_address", "home_address"],
    coverage: ["coverage", "coverage_area", "service_area"],
    payment_method: ["payment_method", "paymentMethod", "payment_type"],
    availability: ["availability", "availability_status"],
  };

  return Object.entries(optionalColumns)
    .filter(([, aliases]) => !aliases.some((alias) => knownColumns.includes(alias)))
    .map(([label]) => label);
}

function coverageAreas(technician) {
  return splitCoverageAreas(technician.coverage || technician.serviceArea);
}

function formatCoverage(technician) {
  const areas = coverageAreas(technician);
  return areas.length ? areas.join(", ") : "No coverage area";
}

function directoryWhatsAppLink(technician, lookup) {
  const phone = String(technician.phone || "").replace(/\D/g, "");
  const location = [lookup.city, lookup.state].filter(Boolean).join(", ") || [technician.city, technician.state].filter(Boolean).join(", ");
  const message = [
    "NTTR Dispatch",
    "",
    "Location:",
    location || "Not provided",
    "",
    "Service:",
    lookup.service || "Not provided",
    "",
    "Are you available?",
  ].join("\n");

  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

function rankTechniciansByCoverage(technicians, lookup) {
  const city = String(lookup.city || "").trim().toLowerCase();
  const state = String(lookup.state || "").trim().toLowerCase();
  const service = String(lookup.service || "").trim().toLowerCase();

  return [...technicians]
    .filter((technician) => {
      const services = splitServices(technician.services).join(" ").toLowerCase();
      const areas = coverageAreas(technician).join(" ").toLowerCase();
      const homeCity = String(technician.city || "").toLowerCase();
      const homeState = String(technician.state || "").toLowerCase();
      const matchesLocation =
        !city && !state
          ? true
          : (city && homeCity.includes(city)) ||
            (state && homeState.includes(state)) ||
            (city && areas.includes(city)) ||
            (state && areas.includes(state));
      const matchesService = !service || services.includes(service);

      return matchesLocation && matchesService;
    })
    .sort((a, b) => {
      const aScore = technicianDirectoryScore(a, city, state);
      const bScore = technicianDirectoryScore(b, city, state);
      if (aScore !== bScore) return bScore - aScore;

      const availabilityDifference = availabilityRank(b.availabilityStatus) - availabilityRank(a.availabilityStatus);
      if (availabilityDifference !== 0) return availabilityDifference;

      return Number(b.rating || 0) - Number(a.rating || 0);
    });
}

function technicianDirectoryScore(technician, city, state) {
  const homeCity = String(technician.city || "").trim().toLowerCase();
  const homeState = String(technician.state || "").trim().toLowerCase();
  const areas = coverageAreas(technician).join(" ").toLowerCase();
  let score = 0;

  if (city && homeCity === city) score += 40;
  if (state && homeState === state) score += 30;
  if (city && areas.includes(city)) score += 20;
  if (state && areas.includes(state)) score += 10;
  return score;
}

function availabilityRank(status) {
  const normalized = String(status || "").toLowerCase();
  if (normalized.includes("available")) return 4;
  if (normalized.includes("busy")) return 3;
  if (normalized.includes("off")) return 2;
  return 1;
}

function splitCoverageAreas(value) {
  if (Array.isArray(value)) {
    return value.map((area) => String(area).trim()).filter(Boolean);
  }

  return String(value || "")
    .split(/[\n\r;]+/)
    .map((area) => area.trim())
    .filter(Boolean);
}

function docStatus(value) {
  return value ? "On file" : "Missing";
}

function ServiceList({ services }) {
  const serviceList = splitServices(services);

  if (serviceList.length === 0) {
    return <p className="text-sm text-slate-500">No services listed.</p>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {serviceList.map((service) => (
        <span key={service} className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
          {service}
        </span>
      ))}
    </div>
  );
}

function splitServices(services) {
  if (Array.isArray(services)) {
    return services.map((service) => String(service).trim()).filter(Boolean);
  }

  return String(services || "")
    .split(/[,\n\r]+/)
    .map((service) => service.trim())
    .filter(Boolean);
}

function formatServices(services) {
  const serviceList = splitServices(services);
  return serviceList.length ? serviceList.join(", ") : "No services listed";
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
  if (status === "Rejected") return "border-red-200 bg-red-50 text-red-700";
  if (status === "Missing Documents") return "border-orange-200 bg-orange-50 text-orange-700";
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

function Timeline({ technician, invitations }) {
  const events = [
    ...invitations.flatMap((invitation) => [
      { label: "Invitation created", time: invitation.createdAt },
      { label: "Invitation opened", time: invitation.openedAt },
      { label: "Registration completed", time: invitation.completedAt },
    ]),
    { label: "Approved", time: technician.approvedAt },
    { label: "Documents uploaded", time: latestDocumentTime(technician) },
    technician.completedJobs > 0 ? { label: "Jobs completed", time: technician.updatedAt || technician.createdAt } : null,
    technician.completedJobs > 0 ? { label: "Jobs assigned", time: technician.createdAt } : null,
  ]
    .filter((event) => event && event.time)
    .sort((a, b) => new Date(b.time) - new Date(a.time));

  if (events.length === 0) {
    return <p className="text-sm text-slate-500">No timeline activity yet.</p>;
  }

  return (
    <div className="grid gap-3">
      {events.map((event, index) => (
        <div key={`${event.label}-${event.time}-${index}`} className="rounded-xl bg-slate-50 p-3">
          <p className="text-sm font-bold text-slate-800">{event.label}</p>
          <p className="text-xs text-slate-500">{dateTime(event.time)}</p>
        </div>
      ))}
    </div>
  );
}

function latestDocumentTime(technician) {
  const hasDocuments =
    technician.driverLicenseUrl ||
    technician.insuranceUrl ||
    technician.w9Url ||
    technician.dotCertificateUrl ||
    technician.profilePhotoUrl ||
    technician.signedAgreementUrl;

  return hasDocuments ? technician.updatedAt || technician.createdAt : "";
}

function InfoLine({ icon, value }) {
  return (
    <div className="flex items-center gap-2 text-sm text-slate-700">
      {React.cloneElement(icon, { className: "h-4 w-4 text-slate-400" })}
      <span>{value || "Not set"}</span>
    </div>
  );
}

function MiniStat({ label, value }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-3">
      <p className="text-xs font-bold uppercase text-slate-400">{label}</p>
      <p className="mt-1 truncate text-sm font-bold text-slate-800">{value}</p>
    </div>
  );
}

function initials(name) {
  return String(name || "T")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function AvailabilityBadge({ status }) {
  const styles = {
    Available: "border-emerald-200 bg-emerald-50 text-emerald-700",
    Busy: "border-amber-200 bg-amber-50 text-amber-700",
    "Off Duty": "border-slate-200 bg-slate-100 text-slate-700",
    Offline: "border-red-200 bg-red-50 text-red-700",
  };

  return (
    <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-bold ${styles[status] || styles.Available}`}>
      {status || "Available"}
    </span>
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
    blue: "bg-blue-600 hover:bg-blue-700",
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
