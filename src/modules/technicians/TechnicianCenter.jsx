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
  MoreHorizontal,
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
  compareTechniciansByAssignedNumber,
  deleteOrDeactivateTechnician,
  getKnownColumns,
  loadTechnicianColumnSupport,
  loadTechnicians,
  permanentlyDeleteUnusedTechnician,
  restoreTechnician,
  sortTechniciansByAssignedNumber,
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
  assigned_number: "",
  phone: "",
  email: "",
  company: "",
  city: "",
  state: "",
  address: "",
  zip_code: "",
  coverage_areas: "",
  coverage: "",
  services: "",
  status: "Approved",
  availability: "Available",
  notes: "",
};

const tabs = ["Dashboard", "Directory", "Pending", "Approved", "Inactive Technicians", "Documents", "Performance"];
const statuses = ["All", "Pending", "Approved", "Rejected", "Inactive", "Missing Documents"];
const editableTechnicianStatuses = statuses.filter((status) => !["All", "Inactive"].includes(status));
const sortOptions = ["Assigned Number"];
const availabilityOptions = ["Available", "Busy", "Off Duty", "Offline"];
const nearbyPartsCategories = [
  "Commercial Tire Shops",
  "Truck Parts Suppliers",
  "Trailer Parts",
  "Cummins Dealers",
  "Freightliner Dealers",
  "Kenworth Dealers",
  "Peterbilt Dealers",
  "Volvo Mack Dealers",
  "Love's Truck Care",
  "TA Truck Service",
  "Pilot Flying J Service",
  "Welding Shops",
  "Hydraulic Hose Shops",
  "Battery Suppliers",
  "Road Service",
];
const nearbyPartsCache = new Map();
const technicianFavoritesKey = "nttr-technician-favorites";
const regionalSidebarTemplate = [
  { state: "Texas", cities: ["El Paso", "Dallas", "Houston", "Midland", "Odessa", "San Antonio", "Austin", "Amarillo", "Lubbock", "Fort Worth"] },
  { state: "New Mexico", cities: ["Las Cruces", "Albuquerque", "Santa Fe"] },
  { state: "Arizona", cities: ["Phoenix", "Tucson", "Flagstaff"] },
  { state: "Oklahoma", cities: ["Tulsa", "Oklahoma City"] },
  { state: "Colorado", cities: ["Denver", "Pueblo", "Colorado Springs"] },
  { state: "Louisiana", cities: ["Shreveport", "Baton Rouge", "New Orleans"] },
  { state: "Kansas", cities: ["Wichita", "Kansas City"] },
  { state: "Arkansas", cities: ["Little Rock", "Fort Smith"] },
  { state: "Mississippi", cities: ["Jackson"] },
  { state: "Tennessee", cities: ["Memphis", "Nashville"] },
];
const stateAliases = {
  TX: "TEXAS",
  TEXAS: "TEXAS",
  NM: "NEW MEXICO",
  "NEW MEXICO": "NEW MEXICO",
  AZ: "ARIZONA",
  ARIZONA: "ARIZONA",
  OK: "OKLAHOMA",
  OKLAHOMA: "OKLAHOMA",
  CO: "COLORADO",
  COLORADO: "COLORADO",
  LA: "LOUISIANA",
  LOUISIANA: "LOUISIANA",
  KS: "KANSAS",
  KANSAS: "KANSAS",
  AR: "ARKANSAS",
  ARKANSAS: "ARKANSAS",
  MS: "MISSISSIPPI",
  MISSISSIPPI: "MISSISSIPPI",
  TN: "TENNESSEE",
  TENNESSEE: "TENNESSEE",
  CA: "CALIFORNIA",
  CALIFORNIA: "CALIFORNIA",
};

export default function TechnicianCenter({ currentUser }) {
  const [technicians, setTechnicians] = useState([]);
  const [activeTab, setActiveTab] = useState("Dashboard");
  const [form, setForm] = useState(emptyTechnician);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [serviceFilter, setServiceFilter] = useState("All");
  const [sortBy, setSortBy] = useState("Assigned Number");
  const [selectedTechnician, setSelectedTechnician] = useState(null);
  const [editingTechnician, setEditingTechnician] = useState(null);
  const [coverageTechnician, setCoverageTechnician] = useState(null);
  const [nearbyPartsTechnician, setNearbyPartsTechnician] = useState(null);
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
  const [missingColumns, setMissingColumns] = useState([]);

  const currentUserRole = String(currentUser?.role || "").toLowerCase();
  const currentAdminName = currentUser?.name || currentUser?.username || "Admin";
  const currentUserId = currentUser?.authUserId || currentUser?.id || "";
  const permissions = getPermissions(currentUserRole);
  const canApproveTechnicians = permissions.canApproveTechnicians;
  const canViewPrivateTechnicianData = permissions.canViewPrivateTechnicianData;
  const canEditDirectoryTechnicians = canApproveTechnicians;
  const knownColumns = useMemo(() => getKnownColumns(technicians).filter((column) => !missingColumns.includes(column)), [missingColumns, technicians]);
  const missingDirectoryColumns = useMemo(() => missingColumns, [missingColumns]);
  const registrationLink = buildRegistrationLink();

  async function refreshTechnicians() {
    setLoading(true);
    setError("");
    setInviteError("");

    try {
      const [nextTechnicians, columnSupport] = await Promise.all([
        loadTechnicians({ includeInactive: canApproveTechnicians }),
        loadTechnicianColumnSupport(),
      ]);
      setTechnicians(nextTechnicians);
      setMissingColumns(columnSupport.missing);
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
    return technicians.filter((technician) => technician.isActive);
  }, [canViewPrivateTechnicianData, technicians]);

  const visibleTabs = useMemo(
    () => canApproveTechnicians ? tabs : tabs.filter((tab) => tab !== "Inactive Technicians"),
    [canApproveTechnicians]
  );

  const serviceOptions = useMemo(() => {
    const services = safeTechnicians.flatMap((technician) =>
      splitServices(technician.services)
    );

    return ["All", ...new Set(services)].sort();
  }, [safeTechnicians]);

  const tabTechnicians = useMemo(() => {
    return safeTechnicians.filter((technician) => {
      if (activeTab === "Inactive Technicians") return !technician.isActive;
      if (!technician.isActive) return false;
      if (activeTab === "Pending") return technician.status === "Pending";
      if (activeTab === "Approved") return technician.status === "Approved";
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
          technician.assigned_number,
          technician.phone,
          technician.company,
          technician.city,
          technician.state,
          technician.coverage,
          technician.coverage_areas,
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
        if (sortBy === "Newest") return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
        return compareTechniciansByAssignedNumber(a, b);
      });
  }, [search, serviceFilter, sortBy, statusFilter, tabTechnicians]);

  const stats = useMemo(() => {
    const activeTechnicians = technicians.filter((technician) => technician.isActive);
    const approved = activeTechnicians.filter((technician) => isApproved(technician.status));
    const ratings = activeTechnicians.map((technician) => Number(technician.rating || 0)).filter(Boolean);

    return {
      total: activeTechnicians.length,
      pending: activeTechnicians.filter((technician) => technician.status === "Pending").length,
      approved: approved.length,
      inactive: technicians.filter((technician) => !technician.isActive).length,
      missingDocuments: activeTechnicians.filter((technician) => complianceScore(technician) < 100).length,
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
    if (!canApproveTechnicians) {
      setError("Only administrators can create technicians.");
      return false;
    }
    setSaving(true);
    setError("");
    const createdBy = localStorage.getItem("currentUserName") || currentUserRole;
    const technicianValues = prepareDirectoryTechnicianValues(canApproveTechnicians ? values : { ...values, status: "Approved" });

    try {
      assertUniqueAssignedNumber(technicianValues.assigned_number, technicians);
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
      setError(technicianSaveError(saveError));
    } finally {
      setSaving(false);
    }
  }

  async function saveTechnician(id, patch) {
    if (!canApproveTechnicians) {
      setError("Only administrators can edit technicians.");
      return false;
    }
    const currentTechnician = technicians.find((technician) => technician.id === id);
    if (!currentTechnician) return;

    const nextTechnician = { ...currentTechnician, ...patch };
    try {
      assertUniqueAssignedNumber(nextTechnician.assigned_number, technicians, id);
    } catch (validationError) {
      setError(validationError.message);
      return false;
    }
    setTechnicians((current) =>
      current.map((technician) => (technician.id === id ? nextTechnician : technician))
    );
    setSelectedTechnician((current) => (current?.id === id ? nextTechnician : current));

    try {
      await updateTechnician(id, nextTechnician, knownColumns);
      const updatedBy = localStorage.getItem("currentUserName") || currentUserRole;
      await logActivity({
        entityType: "technician",
        entityId: id,
        action: `Technician updated by ${updatedBy}`,
        description: `Technician updated by ${updatedBy}`,
        createdBy: updatedBy,
      });
      return true;
    } catch (saveError) {
      setError(technicianSaveError(saveError));
      refreshTechnicians();
      return false;
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

    setError("");
    setTechnicianToDelete({ technician, mode: "auto" });
  }

  function requestPermanentDeleteTechnician(technician) {
    if (!canApproveTechnicians) {
      setError("Only administrators can permanently delete technicians.");
      return;
    }
    setError("");
    setTechnicianToDelete({ technician, mode: "permanent" });
  }

  async function restoreInactiveTechnician(technician) {
    if (!canApproveTechnicians) {
      setError("Only administrators can restore technicians.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await restoreTechnician(technician.id);
      await logActivity({
        entityType: "technician",
        entityId: technician.id,
        action: "Technician Restored",
        description: `${technician.full_name || "Technician"} restored by ${currentAdminName}`,
        createdBy: currentAdminName,
        metadata: { technicianId: technician.id, technicianName: technician.full_name, action: "restored", previousValues: technician.raw },
      });
      setSelectedTechnician(null);
      setEditingTechnician(null);
      setCopyMessage("Technician restored successfully.");
      await refreshTechnicians();
    } catch (restoreError) {
      setError(restoreError.message || "Unable to restore technician.");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDeleteTechnician() {
    if (!technicianToDelete) return;
    if (!canApproveTechnicians) {
      setError("Only administrators can delete technicians.");
      setTechnicianToDelete(null);
      return;
    }

    const { technician, mode } = technicianToDelete;
    setSaving(true);
    try {
      let completedMode = mode;
      if (mode === "permanent") {
        await permanentlyDeleteUnusedTechnician(technician);
      } else {
        const result = await deleteOrDeactivateTechnician(technician, currentUserId);
        completedMode = result.action === "deactivated" ? "deactivate" : "permanent";
      }

      setTechnicians((current) => current.filter((item) => item.id !== technician.id));
      setSelectedTechnician(null);
      setEditingTechnician(null);
      setTechnicianToDelete(null);
      setCopyMessage(completedMode === "permanent" ? "Unused technician permanently deleted." : "Technician removed from the active directory.");
      setError("");
      await logActivity({
        entityType: "technician",
        entityId: technician.id,
        action: completedMode === "permanent" ? "Technician Permanently Deleted" : "Technician Deactivated",
        description: `${technician.full_name || "Technician"} ${completedMode === "permanent" ? "permanently deleted" : "deactivated"} by ${currentAdminName}`,
        createdBy: currentAdminName,
        metadata: {
          technicianId: technician.id,
          technicianName: technician.full_name,
          action: completedMode === "permanent" ? "permanently deleted" : "deactivated",
          previousValues: technician.raw,
        },
      });
      await refreshTechnicians();
    } catch (deleteError) {
      console.error("Delete technician failed:", deleteError);
      const message = deleteError.message || JSON.stringify(deleteError) || "Unable to remove technician.";
      setError(message);
      setCopyMessage(`Unable to remove technician: ${message}`);
    } finally {
      setSaving(false);
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
    <div className="min-h-screen w-full bg-slate-100 p-4 text-slate-900 md:p-6 xl:p-8">
      <div className="mx-auto w-full max-w-none space-y-6">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="flex min-w-0 items-start gap-4">
              <div className="rounded-2xl bg-blue-100 p-3 text-blue-700 shadow-sm">
                <Users className="h-7 w-7" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-3xl font-black tracking-tight text-slate-950">Technician Center</h1>
                  <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-black uppercase tracking-wide text-blue-700">Dispatcher-Safe Mode</span>
                </div>
                <p className="mt-2 max-w-3xl text-sm font-medium text-slate-500">
                  Central hub for technician management, compliance, dispatch readiness, and performance.
                </p>
                <p className="mt-2 text-xs font-bold text-slate-400">Active technicians are visible to Admin, Dispatcher, and Supervisor users.</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-start gap-2 xl:max-w-3xl xl:justify-end">
              {canEditDirectoryTechnicians && <ActionButton onClick={() => setAddTechnicianModalOpen(true)} icon={<UserPlus />} label="Add Technician" tone="blue" />}
              {canApproveTechnicians && <ActionButton onClick={() => setInviteModalOpen(true)} icon={<UserPlus />} label="Invite Technician" />}
              {canApproveTechnicians && <ActionButton onClick={copyRegistrationLink} icon={<Clipboard />} label="Copy Registration Link" tone="emerald" />}
              {canApproveTechnicians && <ActionButton onClick={shareRegistrationOnWhatsApp} icon={<MessageCircle />} label="WhatsApp Share" tone="green" />}
              {canApproveTechnicians && <ActionButton onClick={shareRegistrationBySms} icon={<Smartphone />} label="SMS Invite" tone="blue" />}
              <ActionButton onClick={refreshTechnicians} icon={<RefreshCw className={loading ? "animate-spin" : ""} />} label="Refresh" />
            </div>
          </div>

          {copyMessage && (
            <p className={`mt-3 rounded-2xl px-4 py-3 text-sm font-semibold ${copyMessage.startsWith("Unable") ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>
              {copyMessage}
            </p>
          )}

          {!canViewPrivateTechnicianData && (
            <p className="mt-3 rounded-2xl bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700">
              Dispatcher-safe mode is active. All active technicians are visible; management controls remain Admin-only.
            </p>
          )}

          {missingDirectoryColumns.length > 0 && (
            <p className="mt-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700">
              Safe mode: missing optional directory columns ({missingDirectoryColumns.join(", ")}). Those fields stay visible and the app will only save them when the technicians table supports them.
            </p>
          )}
        </section>

        <Dashboard stats={stats} />

        <div className="flex gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
          {visibleTabs.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`shrink-0 rounded-xl px-4 py-2 text-sm font-bold transition ${
                activeTab === tab ? "bg-slate-950 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
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
            onRestore={restoreInactiveTechnician}
            onPermanentDelete={requestPermanentDeleteTechnician}
            onCoverage={setCoverageTechnician}
            onNearbyParts={setNearbyPartsTechnician}
            onAdd={() => setAddTechnicianModalOpen(true)}
            onInvite={() => setInviteModalOpen(true)}
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
                <Field label="Assigned Number" value={form.assigned_number} onChange={(value) => updateForm("assigned_number", value)} type="number" min={1} />
                <Field label="Company" value={form.company} onChange={(value) => updateForm("company", value)} />
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
                <Select label="Availability" value={form.availability} options={availabilityOptions} onChange={(value) => updateForm("availability", value)} />
                <Select label="Status" value={form.status} options={editableTechnicianStatuses} onChange={(value) => updateForm("status", value)} />
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
                          {technician.assigned_number && <span className="mr-2 rounded-full bg-blue-100 px-2 py-1 text-xs font-black text-blue-700">#{technician.assigned_number}</span>}
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
                          <p className="mt-1 text-xs text-slate-500">{technician.company || "No company listed"}</p>
                        </Td>
                        <Td>
                          <InfoLine icon={<Phone />} value={technician.phone} />
                          <InfoLine icon={<Mail />} value={technician.email} />
                        </Td>
                        <Td>
                          <InfoLine icon={<MapPin />} value={[technician.city, technician.state].filter(Boolean).join(", ")} />
                          <p className="mt-1 text-xs text-slate-500">{technician.coverage_areas || "No coverage area"}</p>
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
                          <p className="text-xs text-slate-500">{[technician.city, technician.state].filter(Boolean).join(", ") || "No city"}</p>
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
                                  onRestore={() => restoreInactiveTechnician(technician)}
                                  onPermanentDelete={() => requestPermanentDeleteTechnician(technician)}
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
          onRestore={() => restoreInactiveTechnician(selectedTechnician)}
          onPermanentDelete={() => requestPermanentDeleteTechnician(selectedTechnician)}
        />
      )}

      {editingTechnician && (
        <EditTechnicianModal
          technician={editingTechnician}
          saving={saving}
          canEditStatus={canApproveTechnicians}
          canDelete={canApproveTechnicians}
          onDelete={() => requestDeleteTechnician(editingTechnician)}
          onClose={() => setEditingTechnician(null)}
          onSave={async (patch) => {
            setSaving(true);
            const nextPatch = prepareDirectoryTechnicianValues(patch);
            const saved = await saveTechnician(editingTechnician.id, canApproveTechnicians ? nextPatch : basicTechnicianPatch(nextPatch));
            setSaving(false);
            if (saved) setEditingTechnician(null);
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

      {nearbyPartsTechnician && (
        <NearbyPartsModal
          technician={nearbyPartsTechnician}
          onClose={() => setNearbyPartsTechnician(null)}
        />
      )}

      {addTechnicianModalOpen && (
        <AddTechnicianModal
          saving={saving}
          canAssignNumber={canApproveTechnicians}
          onClose={() => setAddTechnicianModalOpen(false)}
          onSave={saveNewTechnician}
        />
      )}

      {technicianToDelete && (
        <DeleteTechnicianModal
          technician={technicianToDelete.technician}
          mode={technicianToDelete.mode}
          saving={saving}
          error={error}
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
  onRestore,
  onPermanentDelete,
  onCoverage,
  onNearbyParts,
  onAdd,
  onInvite,
  onAssign,
}) {
  const [lookup, setLookup] = useState({ city: "", state: "", service: "" });
  const [availabilityFilter, setAvailabilityFilter] = useState("All");
  const [selectedState, setSelectedState] = useState("");
  const [selectedCity, setSelectedCity] = useState("");
  const [shortcut, setShortcut] = useState("all");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [expandedStates, setExpandedStates] = useState({});
  const [favoriteIds, setFavoriteIds] = useState(() => loadFavoriteTechnicians());
  const regionTree = useMemo(() => buildRegionTree(technicians), [technicians]);
  const companyOptions = useMemo(() => ["All", ...new Set(technicians.map((technician) => technician.company).filter(Boolean))].sort(), [technicians]);
  const coverageOptions = useMemo(() => ["All", ...new Set(technicians.flatMap((technician) => coverageAreas(technician)))].sort(), [technicians]);
  const cityOptions = useMemo(() => {
    if (selectedState) {
      const group = regionTree.find((item) => item.state === selectedState);
      return ["All", ...(group?.cities || []).map((item) => item.city)];
    }
    return ["All", ...new Set(technicians.map((technician) => technician.city).filter(Boolean))].sort();
  }, [regionTree, selectedState, technicians]);
  const [coverageFilter, setCoverageFilter] = useState("All");
  const [ratingFilter, setRatingFilter] = useState("All");
  const [companyFilter, setCompanyFilter] = useState("All");
  const regionalStats = useMemo(() => buildRegionalStats(technicians, favoriteIds), [favoriteIds, technicians]);
  const rankedTechnicians = useMemo(() => {
    return sortTechniciansByAssignedNumber(rankTechniciansByCoverage(technicians, { ...lookup, state: selectedState || lookup.state, city: selectedCity || lookup.city })
      .filter((technician) => shortcut !== "favorites" || favoriteIds.includes(String(technician.id)))
      .filter((technician) => shortcut !== "available" || technician.availability === "Available")
      .filter((technician) => availabilityFilter === "All" || technician.availability === availabilityFilter)
      .filter((technician) => !selectedState || normalizeStateName(technician.state) === selectedState)
      .filter((technician) => !selectedCity || normalizeText(technician.city) === normalizeText(selectedCity))
      .filter((technician) => coverageFilter === "All" || coverageAreas(technician).includes(coverageFilter))
      .filter((technician) => ratingFilter === "All" || Number(technician.rating || 0) >= Number(ratingFilter))
      .filter((technician) => companyFilter === "All" || technician.company === companyFilter));
  }, [availabilityFilter, companyFilter, coverageFilter, favoriteIds, lookup, ratingFilter, selectedCity, selectedState, shortcut, technicians]);
  function selectShortcut(nextShortcut) {
    setShortcut(nextShortcut);
    setSelectedState("");
    setSelectedCity("");
    if (nextShortcut !== "available") setAvailabilityFilter("All");
    if (nextShortcut === "available") setAvailabilityFilter("Available");
  }
  function toggleFavorite(technician) {
    setFavoriteIds((current) => {
      const id = String(technician.id);
      const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
      localStorage.setItem(technicianFavoritesKey, JSON.stringify(next));
      return next;
    });
  }
  const clearFilters = () => {
    onSearch("");
    onStatusFilter("All");
    onServiceFilter("All");
    onSort("Assigned Number");
    setAvailabilityFilter("All");
    setSelectedState("");
    setSelectedCity("");
    setShortcut("all");
    setCoverageFilter("All");
    setRatingFilter("All");
    setCompanyFilter("All");
    setLookup({ city: "", state: "", service: "" });
  };

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h2 className="text-2xl font-black text-slate-950">Technician Directory</h2>
          <p className="mt-1 text-sm text-slate-500">Find technicians by home market, coverage area, service, availability, and rating.</p>
        </div>
        <button type="button" onClick={() => onCoverage(rankedTechnicians[0] || technicians[0])} className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800">
          <LocateFixed className="h-4 w-4" />
          View Coverage Map
        </button>
      </div>

      <RegionalStats stats={regionalStats} />

      <div className="sticky top-0 z-20 mt-5 grid gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3 md:static md:grid-cols-2 xl:grid-cols-[1.4fr_0.7fr_0.7fr_0.9fr_0.8fr_0.7fr_0.8fr_auto]">
          <SearchBox value={search} onChange={onSearch} placeholder="Search by name, phone, company" />
          <button type="button" onClick={() => setMobileFiltersOpen((open) => !open)} className="min-h-11 rounded-xl bg-slate-950 px-4 text-sm font-bold text-white lg:hidden">{mobileFiltersOpen ? "Hide Filters" : "State, City & Filters"}</button>
          <div className={`${mobileFiltersOpen ? "grid" : "hidden"} gap-2 lg:contents`}>
            <Select value={selectedState || "All"} options={["All", ...regionTree.map((state) => state.state)]} onChange={(value) => { setShortcut("all"); setSelectedState(value === "All" ? "" : value); setSelectedCity(""); }} />
            <Select value={selectedCity || "All"} options={cityOptions} onChange={(value) => { setShortcut("all"); setSelectedCity(value === "All" ? "" : value); }} />
            <Select value={coverageFilter} options={coverageOptions} onChange={setCoverageFilter} />
            <Select value={serviceFilter} options={serviceOptions} onChange={onServiceFilter} />
            <Select value={availabilityFilter} options={["All", ...availabilityOptions]} onChange={setAvailabilityFilter} />
            <Select value={ratingFilter} options={["All", "1", "2", "3", "4", "5"]} onChange={setRatingFilter} />
            <Select value={companyFilter} options={companyOptions} onChange={setCompanyFilter} />
            <button type="button" onClick={clearFilters} className="min-h-11 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100">Clear Filters</button>
          </div>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="hidden rounded-2xl border border-slate-200 bg-slate-50 p-4 lg:block">
          <div className="mb-3">
            <button type="button" onClick={() => selectShortcut("all")} className={`mb-2 flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm font-black ${shortcut === "all" && !selectedState ? "bg-slate-950 text-white" : "bg-white text-slate-800 hover:bg-slate-100"}`}>
              <span>🌎 United States</span>
              <span>{technicians.length}</span>
            </button>
            <button type="button" onClick={() => selectShortcut("favorites")} className={`mb-2 flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm font-black ${shortcut === "favorites" ? "bg-slate-950 text-white" : "bg-white text-slate-800 hover:bg-slate-100"}`}>
              <span>⭐ Favorites</span>
              <span>{favoriteIds.length}</span>
            </button>
            <button type="button" onClick={() => selectShortcut("available")} className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm font-black ${shortcut === "available" ? "bg-slate-950 text-white" : "bg-white text-slate-800 hover:bg-slate-100"}`}>
              <span>🟢 Available Now</span>
              <span>{technicians.filter((technician) => technician.availability === "Available").length}</span>
            </button>
          </div>
          <div className="max-h-[680px] space-y-2 overflow-y-auto pr-1">
            {regionTree.map((stateGroup) => {
              const expanded = expandedStates[stateGroup.state];
              return (
                <div key={stateGroup.state} className="rounded-xl bg-white shadow-sm">
                  <button
                    type="button"
                    onClick={() => {
                      setExpandedStates((current) => ({ ...current, [stateGroup.state]: !expanded }));
                      setShortcut("all");
                      setSelectedState(stateGroup.state);
                      setSelectedCity("");
                    }}
                    className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm font-black ${selectedState === stateGroup.state && !selectedCity ? "bg-slate-950 text-white" : "text-slate-800 hover:bg-slate-100"}`}
                  >
                    <span>{stateGroup.state}</span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{stateGroup.count}</span>
                  </button>
                  {expanded && (
                    <div className="border-t border-slate-100 p-2">
                      {stateGroup.cities.map((cityGroup) => (
                        <button
                          key={`${stateGroup.state}-${cityGroup.city}`}
                          type="button"
                          onClick={() => {
                            setSelectedState(stateGroup.state);
                            setSelectedCity(cityGroup.city);
                            setShortcut("all");
                          }}
                          className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs font-bold ${selectedCity === cityGroup.city ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-50"}`}
                        >
                          <span>{cityGroup.city}</span>
                          <span>{cityGroup.count}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </aside>

        <section className="min-w-0">
          {loading ? (
            <div className="rounded-2xl border border-slate-200 p-8 text-sm font-bold text-slate-500">Loading technicians...</div>
          ) : rankedTechnicians.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-slate-200 py-16 text-center">
              <div className="rounded-2xl bg-slate-100 p-4 text-slate-500"><Users className="h-8 w-8" /></div>
              <div>
                <p className="text-lg font-black text-slate-950">No technicians found in this region.</p>
                <p className="mt-1 text-sm text-slate-500">Add your first technician or clear filters to expand the search.</p>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                {canEdit && <button type="button" onClick={onAdd} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700">Add Technician</button>}
                <button type="button" onClick={clearFilters} className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800">Clear Filters</button>
              </div>
            </div>
          ) : (
            <div className="technician-mobile-grid grid gap-4 2xl:grid-cols-2">
              {rankedTechnicians.map((technician) => (
                <TechnicianRegionalCard
                  key={technician.id}
                  technician={technician}
                  lookup={lookup}
                  canEdit={canEdit}
                  canDelete={canDelete}
                  canAssign={canAssign}
                  onOpen={onOpen}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  onRestore={onRestore}
                  onPermanentDelete={onPermanentDelete}
                  onCoverage={onCoverage}
                  onNearbyParts={onNearbyParts}
                  onAssign={onAssign}
                  isFavorite={favoriteIds.includes(String(technician.id))}
                  onFavorite={toggleFavorite}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </section>
  );
}

function RegionalStats({ stats }) {
  const items = [
    ["Total Technicians", stats.total],
    ["Available", stats.available],
    ["Busy", stats.busy],
    ["Off Duty", stats.offDuty],
    ["Favorites", stats.favorites],
    ["States Covered", stats.statesCovered],
    ["Cities Covered", stats.citiesCovered],
  ];

  return (
    <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7">
      {items.map(([label, value]) => (
        <div key={label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-2xl font-black text-slate-950">{value}</p>
          <p className="mt-1 text-xs font-bold uppercase tracking-wide text-slate-400">{label}</p>
        </div>
      ))}
    </div>
  );
}

function TechnicianRegionalCard({ technician, lookup, canEdit, canDelete, canAssign, isFavorite, onOpen, onEdit, onDelete, onRestore, onPermanentDelete, onCoverage, onNearbyParts, onAssign, onFavorite }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-4">
        <button type="button" onClick={() => onOpen(technician)} className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-blue-100 text-lg font-black text-blue-700">
          {initials(technician.full_name)}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                {technician.assigned_number && <span className="rounded-full bg-blue-100 px-2 py-1 text-xs font-black text-blue-700">#{technician.assigned_number}</span>}
                <button type="button" onClick={() => onOpen(technician)} className="truncate text-left text-lg font-black text-slate-950 hover:text-blue-700">{technician.full_name || "Unnamed technician"}</button>
              </div>
              <p className="text-sm font-semibold text-slate-500">{technician.company || "No company listed"}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <AvailabilityBadge status={technician.availability} />
              <StatusBadge status={technician.status} />
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <MiniStat label="Phone" value={technician.phone || "Not stored"} />
            <MiniStat label="Email" value={technician.email || "Not stored"} />
            <MiniStat label="City" value={[technician.city, technician.state].filter(Boolean).join(", ") || "Not stored"} />
            <MiniStat label="Rating" value={<RatingStars rating={technician.rating} />} />
            <MiniStat label="Last Used" value={dateTime(technician.lastUsed || technician.updatedAt)} />
          </div>

          <div className="mt-4">
            <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-400">Coverage Areas</p>
            <ChipPreview items={coverageAreas(technician)} empty="Not stored" tone="blue" />
          </div>

          <div className="mt-4">
            <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-400">Services</p>
            <ChipPreview items={splitServices(technician.services)} empty="Not stored" tone="slate" />
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <IconTextLink href={technician.phone ? `tel:${technician.phone}` : undefined} label="Call"><Phone className="h-4 w-4" /></IconTextLink>
            <IconTextLink href={directoryWhatsAppLink(technician, lookup)} label="WhatsApp" external tone="emerald"><MessageCircle className="h-4 w-4" /></IconTextLink>
            <IconTextLink href={technicianMapLink(technician)} label="Map" external tone="sky"><MapPin className="h-4 w-4" /></IconTextLink>
            <IconTextButton label="Nearby Parts" onClick={() => onNearbyParts(technician)} tone="amber"><Search className="h-4 w-4" /></IconTextButton>
            {canAssign && technician.isActive && <IconTextButton label="Assign" onClick={() => onAssign(technician)} tone="blue"><UserCheck className="h-4 w-4" /></IconTextButton>}
            {canEdit && <IconTextButton label="Edit" onClick={() => onEdit(technician)}><Edit3 className="h-4 w-4" /></IconTextButton>}
            <IconTextButton label={isFavorite ? "Favorited" : "Favorite"} onClick={() => onFavorite(technician)} tone={isFavorite ? "amber" : "slate"}><Star className="h-4 w-4" /></IconTextButton>
            {coverageAreas(technician).length > 0 && <IconTextButton label="Coverage" onClick={() => onCoverage(technician)} tone="indigo"><LocateFixed className="h-4 w-4" /></IconTextButton>}
            {canDelete && technician.isActive && (
              <button type="button" onClick={() => onDelete(technician)} className="ml-3 inline-flex items-center gap-2 rounded-xl border border-red-300 bg-white px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-50">
                <Trash2 className="h-4 w-4" /> Delete Technician
              </button>
            )}
            {canDelete && !technician.isActive && (
              <>
                <button type="button" onClick={() => onRestore(technician)} className="inline-flex items-center gap-2 rounded-xl border border-emerald-300 bg-white px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-50">
                  <UserCheck className="h-4 w-4" /> Restore Technician
                </button>
                <button type="button" onClick={() => onPermanentDelete(technician)} className="ml-3 inline-flex items-center gap-2 rounded-xl border border-red-300 bg-white px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-50">
                  <Trash2 className="h-4 w-4" /> Permanently Delete
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

function AddTechnicianModal({ saving, canAssignNumber, onClose, onSave }) {
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
          {canAssignNumber && <Field label="Assigned Number" value={form.assigned_number} onChange={(value) => update("assigned_number", value)} type="number" min={1} />}
          <Field label="Phone" value={form.phone} onChange={(value) => update("phone", value)} required />
          <Field label="Company" value={form.company} onChange={(value) => update("company", value)} />
          <Field label="Email" value={form.email} onChange={(value) => update("email", value)} type="email" />
          <Field label="City" value={form.city} onChange={(value) => update("city", value)} />
          <Field label="State" value={form.state} onChange={(value) => update("state", value)} />
          <TextArea label="Services" value={form.services} onChange={(value) => update("services", value)} />
          <TextArea label="Coverage Areas" value={form.coverage} onChange={(value) => update("coverage", value)} />
          <Select label="Availability" value={form.availability} options={availabilityOptions} onChange={(value) => update("availability", value)} />
          <Select label="Status" value={form.status} options={editableTechnicianStatuses} onChange={(value) => update("status", value)} />
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

function EditTechnicianModal({ technician, saving, canEditStatus, canDelete, onClose, onSave, onDelete }) {
  const [form, setForm] = useState({
    full_name: technician.full_name || "",
    assigned_number: technician.assigned_number || "",
    company: technician.company || "",
    phone: technician.phone || "",
    email: technician.email || "",
    city: technician.city || "",
    state: technician.state || "",
    address: technician.address || "",
    zip_code: technician.zip_code || "",
    coverage: technician.coverage || technician.coverage_areas || "",
    services: formatServices(technician.services) === "No services listed" ? "" : formatServices(technician.services),
    notes: technician.notes || "",
    availability: technician.availability || "Available",
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
          {canEditStatus && <Field label="Assigned Number" value={form.assigned_number} onChange={(value) => update("assigned_number", value)} type="number" min={1} />}
          <Field label="Company" value={form.company} onChange={(value) => update("company", value)} />
          <Field label="Phone" value={form.phone} onChange={(value) => update("phone", value)} required />
          <Field label="Email" value={form.email} onChange={(value) => update("email", value)} type="email" />
          <Field label="City" value={form.city} onChange={(value) => update("city", value)} />
          <Field label="State" value={form.state} onChange={(value) => update("state", value)} />
          <Field label="Address" value={form.address} onChange={(value) => update("address", value)} />
          <Field label="ZIP" value={form.zip_code} onChange={(value) => update("zip_code", value)} />
          <TextArea label="Coverage Areas" value={form.coverage} onChange={(value) => update("coverage", value)} />
          <TextArea label="Services" value={form.services} onChange={(value) => update("services", value)} />
          <Select label="Availability" value={form.availability} options={availabilityOptions} onChange={(value) => update("availability", value)} />
          {canEditStatus && <Select label="Status" value={form.status} options={editableTechnicianStatuses} onChange={(value) => update("status", value)} />}
          <TextArea label="Notes" value={form.notes} onChange={(value) => update("notes", value)} />
        </div>
        <div className="mt-7 flex flex-col gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:items-center sm:justify-between">
          {canDelete && technician.isActive ? (
            <button type="button" onClick={onDelete} className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-300 bg-white px-4 py-3 font-bold text-red-700 hover:bg-red-50">
              <Trash2 className="h-5 w-5" /> Delete Technician
            </button>
          ) : <span />}
          <button type="submit" disabled={saving} className="flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-6 py-3 font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400">
            <Edit3 className="h-5 w-5" />
            {saving ? "Saving..." : "Save Technician"}
          </button>
        </div>
      </form>
    </div>
  );
}

function CoverageMapModal({ technician, onClose }) {
  const areas = coverageAreas(technician);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-auto rounded-3xl bg-white p-6 shadow-2xl">
        <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-950">Coverage Areas</h2>
            <p className="mt-1 text-sm text-slate-500">{technician.full_name || "Unnamed technician"}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">Close</button>
        </div>

        <div className="mt-5 grid gap-4">
          <section className="grid gap-3 rounded-2xl border border-slate-200 p-4 md:grid-cols-2">
            <Detail label="Home City / State" value={[technician.city, technician.state].filter(Boolean).join(", ")} />
            <Detail label="Availability" value={technician.availability} />
            <div className="md:col-span-2">
              <p className="text-xs font-bold uppercase text-slate-400">Services</p>
              <p className="mt-1 text-sm text-slate-700">{formatServices(technician.services)}</p>
            </div>
          </section>

          <div className="flex flex-wrap gap-2">
            <a href={technicianMapLink(technician)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700">
              <MapPin className="h-4 w-4" />
              Open Home Area Map
            </a>
          </div>

          <section className="rounded-2xl border border-slate-200 p-4">
            <h3 className="font-bold">Coverage Areas</h3>
            <div className="mt-3 grid gap-2">
              {areas.length === 0 ? (
                <p className="text-sm text-slate-500">No coverage areas listed.</p>
              ) : (
                areas.map((area) => (
                  <div key={area} className="flex flex-col gap-2 rounded-xl bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between">
                    <span className="text-sm font-semibold text-slate-800">{area}</span>
                    <a href={googleMapsSearchLink(area)} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800">
                      <MapPin className="h-3.5 w-3.5" />
                      Open Coverage Area Map
                    </a>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function NearbyPartsModal({ technician, onClose }) {
  const defaultLocation = technicianPartsLocation(technician);
  const areas = coverageAreas(technician);
  const locationOptions = [defaultLocation, ...areas].filter(Boolean);
  const [searchLocation, setSearchLocation] = useState(defaultLocation);
  const [selectedArea, setSelectedArea] = useState(defaultLocation);
  const location = searchLocation.trim() || selectedArea || defaultLocation;
  const categories = useMemo(() => nearbyPartsResults(location), [location]);

  function chooseArea(value) {
    setSelectedArea(value);
    setSearchLocation(value);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
      <div className="max-h-[92vh] w-full max-w-5xl overflow-auto rounded-3xl bg-white p-6 shadow-2xl">
        <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-950">Nearby Parts for {technician.full_name || "Technician"}</h2>
            <p className="mt-1 text-sm text-slate-500">{technician.full_name || "Unnamed technician"} · {location || "No location selected"}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">Close</button>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_1fr]">
          <label className="space-y-1 text-sm font-medium">
            Search another city
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <input
                className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 outline-none focus:border-slate-500"
                value={searchLocation}
                onChange={(event) => setSearchLocation(event.target.value)}
                placeholder="El Paso, TX"
              />
            </div>
          </label>

          <label className="space-y-1 text-sm font-medium">
            Technician area
            <select
              className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-slate-500"
              value={selectedArea}
              onChange={(event) => chooseArea(event.target.value)}
            >
              {locationOptions.length === 0 ? (
                <option value="">No area available</option>
              ) : (
                locationOptions.map((area) => <option key={area}>{area}</option>)
              )}
            </select>
          </label>
        </div>

        {!location ? (
          <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-700">No location available for parts search.</div>
        ) : (
          <>
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <span className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-bold text-slate-700">Location: {location}</span>
              <a href={googleMapsSearchLink(location)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700">
                <MapPin className="h-4 w-4" />
                Open Technician Area Map
              </a>
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {categories.map((item) => (
                <a key={item.category} href={item.mapUrl} target="_blank" rel="noreferrer" className="inline-flex items-center justify-between gap-3 rounded-2xl border border-slate-200 p-4 text-left font-bold text-slate-800 hover:border-blue-300 hover:bg-blue-50">
                  <span>{item.category}</span>
                  <MapPin className="h-4 w-4 shrink-0 text-blue-600" />
                </a>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Dashboard({ stats }) {
  return (
    <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
      <Metric icon={<Users />} label="Total Technicians" value={stats.total} helper="All technician records" />
      <Metric icon={<BadgeCheck />} label="Approved" value={stats.approved} helper="Ready for dispatch" />
      <Metric icon={<UserPlus />} label="Pending" value={stats.pending} helper="Awaiting review" />
      <Metric icon={<Ban />} label="Inactive" value={stats.inactive} helper="Unavailable records" />
      <Metric icon={<FileWarning />} label="Missing Documents" value={stats.missingDocuments} helper="Profile gaps" />
      <Metric icon={<Star />} label="Average Rating" value={stats.averageRating} helper="Directory average" />
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
              {initials(technician.full_name)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-bold text-slate-950">{technician.full_name || "Unnamed technician"}</p>
                <StatusBadge status={technician.status} />
                <AvailabilityBadge status={technician.availability} />
              </div>
              <p className="mt-1 text-sm text-slate-500">
                {[technician.city, technician.state].filter(Boolean).join(", ") || "No location"} · {technician.phone || "No phone"}
              </p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <MiniStat label="Compliance" value={`${complianceScore(technician)}%`} />
            <MiniStat label="Average Rating" value={Number(technician.rating || 0).toFixed(1)} />
            <MiniStat label="Coverage" value={technician.coverage || technician.coverage_areas || "Not set"} />
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
                <p className="text-xs text-slate-500">{technician.company || "No company listed"}</p>
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

function PerformancePanel({ technicians }) {
  return (
    <section className="rounded-3xl bg-white p-5 shadow-sm">
      <h2 className="text-xl font-bold">Performance</h2>
      <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200">
        <table className="w-full min-w-[780px] border-collapse text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <Th>Technician</Th>
              <Th>Rating</Th>
              <Th>Availability</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {technicians.map((technician) => (
              <tr key={technician.id} className="border-t border-slate-200">
                <Td>{technician.full_name || "Unnamed technician"}</Td>
                <Td>{Number(technician.rating || 0).toFixed(1)}</Td>
                <Td>{technician.availability || "Available"}</Td>
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
  onRestore,
  onPermanentDelete,
}) {
  const [notes, setNotes] = useState(technician.notes || "");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
      <div className="max-h-[92vh] w-full max-w-5xl overflow-auto rounded-3xl bg-white p-6 shadow-2xl">
        <div className="flex flex-col gap-4 border-b border-slate-200 pb-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-2xl font-bold">{technician.full_name || "Technician Profile"}</h2>
            <p className="mt-1 text-sm text-slate-500">{technician.company || "No company listed"}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <StatusBadge status={technician.status} />
              <CompliancePill score={complianceScore(technician)} />
              <AvailabilityBadge status={technician.availability} />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {canApproveTechnicians && (
              <AdminActions technician={technician} onStatus={onStatus} onDelete={onDelete} onRestore={onRestore} onPermanentDelete={onPermanentDelete} />
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
            <Detail label="Availability" value={technician.availability} />
          </ProfileSection>

          <ProfileSection title="Business Information">
            <Detail label="Company" value={technician.company} />
            <Detail label="Status" value={technician.status} />
            <Detail label="Created" value={dateTime(technician.createdAt)} />
          </ProfileSection>

          <ProfileSection title="Services">
            <ServiceList services={technician.services} />
          </ProfileSection>

          <ProfileSection title="Coverage">
            <Detail label="Primary market" value={[technician.city, technician.state].filter(Boolean).join(", ")} />
            <Detail label="ZIP" value={technician.zip_code} />
            <Detail label="Coverage" value={technician.coverage || technician.coverage_areas} />
          </ProfileSection>

          <ProfileSection title="Performance">
            <Detail label="Rating" value={Number(technician.rating || 0).toFixed(1)} />
            <Detail label="Availability" value={technician.availability} />
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

function AdminActions({ technician, onStatus, onDelete, onRestore, onPermanentDelete }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {!technician.isActive ? (
        <>
          <button type="button" onClick={onRestore} className="rounded-xl border border-emerald-300 bg-white px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-50">
            Restore Technician
          </button>
          <button type="button" onClick={onPermanentDelete} className="ml-3 inline-flex items-center gap-2 rounded-xl border border-red-300 bg-white px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-50">
            <Trash2 className="h-4 w-4" /> Permanently Delete
          </button>
        </>
      ) : (
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
      {technician.status !== "Missing Documents" && (
        <button
          type="button"
          onClick={() => onStatus("Missing Documents")}
          className="rounded-xl bg-orange-100 px-3 py-2 text-xs font-bold text-orange-700 hover:bg-orange-200"
        >
          Mark Missing Documents
        </button>
      )}
      <button
        type="button"
        onClick={onDelete}
        className="ml-3 inline-flex items-center gap-2 rounded-xl border border-red-300 bg-white px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-50"
      >
        <Trash2 className="h-4 w-4" /> Delete Technician
      </button>
      </>
      )}
    </div>
  );
}

function DeleteTechnicianModal({ technician, mode, saving, error, onCancel, onConfirm }) {
  const permanent = mode === "permanent";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
      <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl">
        <h2 className="text-2xl font-bold text-slate-950">{permanent ? "Permanently Delete Technician?" : "Delete Technician?"}</h2>
        <p className="mt-2 text-sm text-slate-600">
          {permanent
            ? "This permanently removes an unused technician. The operation will be blocked if any previous job is linked to this technician."
            : "This technician will be removed from the active directory."}
        </p>
        {!permanent && <p className="mt-2 text-sm text-slate-600">If this technician is already linked to previous jobs, those job records will remain unchanged.</p>}

        <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm">
          <Detail label="Full name" value={technician.full_name} />
          <Detail label="Phone" value={technician.phone} />
          <Detail label="Company" value={technician.company} />
          <Detail label="City / State" value={[technician.city, technician.state].filter(Boolean).join(", ")} />
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
            Unable to remove technician: {error}
          </div>
        )}

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
            disabled={saving}
            className="rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700"
          >
            {saving ? "Deleting..." : permanent ? "Permanently Delete" : "Delete Technician"}
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
    { label: "Phone", complete: Boolean(technician.phone) },
    { label: "Email", complete: Boolean(technician.email) },
    { label: "City / State", complete: Boolean(technician.city && technician.state) },
    { label: "Coverage Areas", complete: coverageAreas(technician).length > 0 },
    { label: "Services", complete: splitServices(technician.services).length > 0 },
    { label: "Availability", complete: Boolean(technician.availability) },
  ];

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
            {document.complete ? "Set" : "Missing"}
          </span>
        </div>
      ))}
    </div>
  );
}

function complianceScore(technician) {
  const items = [
    technician.full_name,
    technician.phone,
    technician.city,
    technician.state,
    coverageAreas(technician).length,
    splitServices(technician.services).length,
    technician.availability,
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
    "company",
    "phone",
    "email",
    "city",
    "state",
    "coverage",
    "coverage_areas",
    "services",
    "availability",
    "notes",
  ];

  return Object.fromEntries(
    Object.entries(patch).filter(([field]) => allowedFields.includes(field))
  );
}

function prepareDirectoryTechnicianValues(values) {
  return {
    ...values,
    coverage_areas: values.coverage_areas || values.coverage || "",
  };
}

function buildRegionTree(technicians) {
  const counts = new Map();

  function ensureState(state) {
    const normalizedState = normalizeStateName(state) || "UNKNOWN";
    if (!counts.has(normalizedState)) counts.set(normalizedState, new Map());
    return counts.get(normalizedState);
  }

  regionalSidebarTemplate.forEach((group) => {
    const cities = ensureState(group.state);
    group.cities.forEach((city) => {
      if (!cities.has(city)) cities.set(city, 0);
    });
  });

  technicians.forEach((technician) => {
    const cities = ensureState(technician.state);
    const city = String(technician.city || "Unknown").trim() || "Unknown";
    cities.set(city, (cities.get(city) || 0) + 1);
  });

  return Array.from(counts, ([state, cities]) => {
    const mergedCities = new Map();
    cities.forEach((count, city) => {
      const cityName = String(city || "Unknown").trim() || "Unknown";
      const key = normalizeText(cityName);
      const existing = mergedCities.get(key);
      mergedCities.set(key, {
        city: existing?.city || cityName,
        count: (existing?.count || 0) + count,
      });
    });

    return {
      state,
      count: Array.from(mergedCities.values()).reduce((sum, item) => sum + item.count, 0),
      cities: Array.from(mergedCities.values()).sort((a, b) => a.city.localeCompare(b.city)),
    };
  })
    .sort((a, b) => a.state.localeCompare(b.state));
}

function buildRegionalStats(technicians, favoriteIds = []) {
  const ratings = technicians.map((technician) => Number(technician.rating || 0)).filter(Boolean);
  return {
    total: technicians.length,
    available: technicians.filter((technician) => technician.availability === "Available").length,
    busy: technicians.filter((technician) => technician.availability === "Busy").length,
    offDuty: technicians.filter((technician) => technician.availability === "Off Duty").length,
    favorites: favoriteIds.length,
    averageRating: ratings.length ? (ratings.reduce((sum, value) => sum + value, 0) / ratings.length).toFixed(1) : "0.0",
    statesCovered: new Set(technicians.map((technician) => normalizeStateName(technician.state)).filter(Boolean)).size,
    citiesCovered: new Set(technicians.map((technician) => [technician.city, technician.state].filter(Boolean).join(", ")).filter(Boolean)).size,
  };
}

function normalizeStateName(value) {
  const state = String(value || "").trim().replace(/\s+/g, " ").toUpperCase();
  return stateAliases[state] || state;
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function loadFavoriteTechnicians() {
  try {
    const parsed = JSON.parse(localStorage.getItem(technicianFavoritesKey) || "[]");
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function coverageAreas(technician) {
  return splitCoverageAreas(technician.coverage || technician.coverage_areas);
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

function technicianMapQuery(technician) {
  if (technician.address) {
    return [technician.address, technician.city, technician.state, technician.zip_code]
      .filter(Boolean)
      .join(", ");
  }

  const cityStateQuery = [technician.city, technician.state].filter(Boolean).join(", ");
  if (cityStateQuery) return cityStateQuery;

  const firstCoverageArea = coverageAreas(technician)[0];
  if (firstCoverageArea) return firstCoverageArea;

  return String(technician.coverage || "").trim();
}

function technicianMapLink(technician) {
  return googleMapsSearchLink(technicianMapQuery(technician));
}

function googleMapsSearchLink(query) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query || "")}`;
}

function googleMapsNearbyLink(category, location) {
  const searchTerm = category === "Road Service" ? "mobile truck repair" : category;
  return `https://www.google.com/maps/search/${encodeURIComponent(`${searchTerm} near ${location || ""}`).replace(/%20/g, "+")}`;
}

function technicianPartsLocation(technician) {
  const cityState = [technician.city, technician.state].filter(Boolean).join(", ");
  if (cityState) return cityState;
  const firstCoverageArea = coverageAreas(technician)[0];
  if (firstCoverageArea) return firstCoverageArea;
  return String(technician.coverage || "").trim();
}

function nearbyPartsResults(location) {
  const normalizedLocation = String(location || "").trim();
  const cacheKey = normalizedLocation.toLowerCase();
  if (nearbyPartsCache.has(cacheKey)) return nearbyPartsCache.get(cacheKey);

  const results = nearbyPartsCategories.map((category) => {
    return {
      category,
      mapUrl: googleMapsNearbyLink(category, normalizedLocation),
    };
  });

  nearbyPartsCache.set(cacheKey, results);
  return results;
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

      const availabilityDifference = availabilityRank(b.availability) - availabilityRank(a.availability);
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
  if (status === "Inactive") return "border-red-200 bg-red-50 text-red-700";
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

function ChipPreview({ items, empty, tone = "slate" }) {
  const values = items.filter(Boolean);
  const visible = values.slice(0, 2);
  const hiddenCount = Math.max(values.length - visible.length, 0);
  const tones = {
    blue: "bg-blue-50 text-blue-700",
    slate: "bg-slate-100 text-slate-700",
  };

  if (!values.length) return <span className="text-sm font-medium text-slate-400">{empty}</span>;

  return (
    <div className="flex max-w-64 flex-wrap gap-1.5">
      {visible.map((item) => (
        <span key={item} className={`rounded-full px-2.5 py-1 text-xs font-bold ${tones[tone] || tones.slate}`}>{item}</span>
      ))}
      {hiddenCount > 0 && <span className="rounded-full bg-slate-900 px-2.5 py-1 text-xs font-bold text-white">+{hiddenCount}</span>}
    </div>
  );
}

function RatingStars({ rating }) {
  const value = Number(rating || 0);
  const stars = Math.max(0, Math.min(5, Math.round(value)));

  return (
    <div>
      <p className="font-black text-slate-950">{value.toFixed(1)}</p>
      <p className="text-xs tracking-wide text-amber-500">{"★".repeat(stars)}{"☆".repeat(5 - stars)}</p>
    </div>
  );
}

function IconMiniButton({ title, onClick, children, tone = "slate" }) {
  const tones = {
    slate: "bg-slate-100 text-slate-700 hover:bg-slate-200",
    amber: "bg-amber-100 text-amber-700 hover:bg-amber-200",
    indigo: "bg-indigo-100 text-indigo-700 hover:bg-indigo-200",
    red: "bg-red-100 text-red-700 hover:bg-red-200",
  };

  return (
    <button type="button" title={title} onClick={onClick} className={`inline-flex h-9 w-9 items-center justify-center rounded-xl ${tones[tone] || tones.slate}`}>
      {children}
    </button>
  );
}

function IconMiniLink({ title, href, children, external = false, tone = "slate" }) {
  const tones = {
    slate: "bg-slate-100 text-slate-700 hover:bg-slate-200",
    emerald: "bg-emerald-100 text-emerald-700 hover:bg-emerald-200",
    sky: "bg-sky-100 text-sky-700 hover:bg-sky-200",
  };

  return (
    <a href={href} title={title} target={external ? "_blank" : undefined} rel={external ? "noreferrer" : undefined} className={`inline-flex h-9 w-9 items-center justify-center rounded-xl ${tones[tone] || tones.slate}`}>
      {children}
    </a>
  );
}

function IconTextButton({ label, onClick, children, tone = "slate" }) {
  const tones = {
    slate: "bg-slate-100 text-slate-700 hover:bg-slate-200",
    amber: "bg-amber-100 text-amber-700 hover:bg-amber-200",
    indigo: "bg-indigo-100 text-indigo-700 hover:bg-indigo-200",
    red: "bg-red-100 text-red-700 hover:bg-red-200",
    blue: "bg-blue-600 text-white hover:bg-blue-700",
  };

  return (
    <button type="button" onClick={onClick} className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-black ${tones[tone] || tones.slate}`}>
      {children}
      {label}
    </button>
  );
}

function IconTextLink({ label, href, children, external = false, tone = "slate" }) {
  const tones = {
    slate: "bg-slate-100 text-slate-700 hover:bg-slate-200",
    emerald: "bg-emerald-100 text-emerald-700 hover:bg-emerald-200",
    sky: "bg-sky-100 text-sky-700 hover:bg-sky-200",
  };

  return (
    <a href={href} target={external ? "_blank" : undefined} rel={external ? "noreferrer" : undefined} className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-black ${tones[tone] || tones.slate}`}>
      {children}
      {label}
    </a>
  );
}

function CompliancePill({ score }) {
  const tone =
    score >= 80 ? "bg-emerald-100 text-emerald-700" : score >= 50 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700";

  return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${tone}`}>{score}% compliant</span>;
}

function Metric({ icon, label, value, helper }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
        {React.cloneElement(icon, { className: "h-5 w-5" })}
      </div>
      <p className="text-3xl font-black tracking-tight text-slate-950">{value}</p>
      <p className="mt-2 text-sm font-black text-slate-700">{label}</p>
      <p className="mt-1 text-xs font-semibold text-slate-400">{helper}</p>
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
    { label: "Created", time: technician.createdAt },
    { label: "Updated", time: technician.updatedAt },
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
      <div className="mt-1 text-sm font-bold text-slate-800">{value || "Not set"}</div>
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

function SearchBox({ value, onChange, placeholder = "Name, phone, company, city, state" }) {
  return (
    <div className="relative">
      <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
      <input
        className="min-h-11 w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 outline-none focus:border-slate-500"
        placeholder={placeholder}
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

function Field({ label, value, onChange, type = "text", required = false, min }) {
  return (
    <label className="space-y-1 text-sm font-medium">
      {label}
      <input
        type={type}
        required={required}
        min={min}
        step={type === "number" ? 1 : undefined}
        className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-slate-500"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function assertUniqueAssignedNumber(value, technicians, excludedId = null) {
  if (value === "" || value === null || value === undefined) return;
  const assignedNumber = Number(value);
  if (!Number.isInteger(assignedNumber) || assignedNumber < 1) {
    throw new Error("Assigned Number must be a whole number of 1 or greater.");
  }
  if (technicians.some((technician) => technician.id !== excludedId && Number(technician.assigned_number) === assignedNumber)) {
    throw new Error(`Assigned Number ${assignedNumber} is already in use.`);
  }
}

function technicianSaveError(error) {
  if (error?.code === "23505" || String(error?.message || "").toLowerCase().includes("assigned_number")) {
    return "That Assigned Number is already in use. Choose a different number.";
  }
  return error?.message || "Unable to save technician.";
}

function Select({ label, value, options, onChange }) {
  const control = (
    <select
      className="min-h-11 w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-slate-500"
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
