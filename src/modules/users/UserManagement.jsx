import React, { useEffect, useMemo, useState } from "react";
import { KeyRound, Plus, RefreshCw, RotateCcw, ShieldCheck, UserCog, Users } from "lucide-react";
import { getRecentActivity, logActivity } from "../activity";
import { supabase } from "../../lib/supabase";

const userTable = "app_users";
const roles = ["Administrator", "Dispatcher"];
const statuses = ["Active", "Inactive"];

const emptyForm = {
  name: "",
  username: "",
  email: "",
  temporaryPassword: "",
  role: "Dispatcher",
  status: "Active",
  forcePasswordChange: true,
  notes: "",
};

export default function UserManagement({ currentUser }) {
  const [users, setUsers] = useState([]);
  const [activity, setActivity] = useState([]);
  const [warnings, setWarnings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    loadUsers();
  }, []);

  const stats = useMemo(() => {
    const active = users.filter((user) => user.status === "Active").length;
    const administrators = users.filter((user) => user.role === "Administrator").length;
    const dispatchers = users.filter((user) => user.role === "Dispatcher").length;

    return { total: users.length, active, administrators, dispatchers };
  }, [users]);

  async function loadUsers() {
    setLoading(true);
    const nextWarnings = [];
    const { data, error } = await supabase.from(userTable).select("*");

    if (error) {
      setUsers([]);
      setActivity([]);
      setWarnings([`Safe mode: ${userTable} table is not available yet (${error.message}).`]);
      setLoading(false);
      return;
    }

    const normalizedUsers = (data || []).map(normalizeUser).sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
    setUsers(normalizedUsers);

    const activityData = await getRecentActivity({ limit: 100 });
    setActivity(activityData.filter((item) => item.entity_type === "user" && ["User Created", "User Disabled"].includes(item.action)));

    setWarnings(nextWarnings);
    setLoading(false);
  }

  async function createUser(event) {
    event.preventDefault();
    if (!form.name.trim() || !form.username.trim() || !form.temporaryPassword.trim()) {
      alert("Name, username, and temporary password are required.");
      return;
    }

    setSaving(true);
    const payload = {
      name: form.name.trim(),
      username: form.username.trim(),
      email: form.email.trim(),
      password: form.temporaryPassword,
      temporary_password: form.temporaryPassword,
      role: roleToDb(form.role),
      status: form.status,
      force_password_change: form.forcePasswordChange,
      notes: form.notes.trim(),
      last_login_at: null,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase.from(userTable).insert([payload]).select("*").single();
    setSaving(false);

    if (error) {
      alert("Unable to create user: " + error.message);
      return;
    }

    await logUserActivity(data?.id, "User Created", `Created ${form.role} user ${form.username.trim()}`);
    setForm(emptyForm);
    await loadUsers();
  }

  async function updateUser(user, patch, action, description) {
    const { error } = await supabase.from(userTable).update(toDbPatch(patch)).eq("id", user.id);

    if (error) {
      alert("Unable to update user: " + error.message);
      await loadUsers();
      return;
    }

    if (patch.status === "Inactive") {
      await logUserActivity(user.id, "User Disabled", `Disabled user ${user.username}`);
    }
    setUsers((current) => current.map((item) => (item.id === user.id ? { ...item, ...patch } : item)));
    await loadUsers();
  }

  async function resetPassword(user) {
    const nextPassword = window.prompt(`Enter a new temporary password for ${user.username}:`);
    if (!nextPassword) return;

    await updateUser(
      user,
      { temporaryPassword: nextPassword, forcePasswordChange: true },
      "Password Reset",
      `Reset temporary password for ${user.username}`
    );
  }

  async function logUserActivity(entityId, action, description) {
    await logActivity({
      entityType: "user",
      entityId,
      action,
      description,
      createdBy: currentUser?.name || currentUser?.username || "Administrator",
    });
  }

  return (
    <div className="min-h-screen w-full max-w-none bg-slate-100 p-4 md:p-8">
      <div className="space-y-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-600">Administration</p>
              <h1 className="mt-1 text-3xl font-black text-slate-950">User Management</h1>
              <p className="mt-2 max-w-3xl text-sm font-medium text-slate-500">
                Create users, reset temporary passwords, control role access, and review user activity.
              </p>
            </div>
            <button
              type="button"
              onClick={loadUsers}
              className="inline-flex w-fit items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
          </div>
        </section>

        {warnings.map((warning) => (
          <div key={warning} className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800">
            {warning}
          </div>
        ))}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Metric icon={Users} label="Total Users" value={stats.total} />
          <Metric icon={ShieldCheck} label="Active Users" value={stats.active} />
          <Metric icon={UserCog} label="Administrators" value={stats.administrators} />
          <Metric icon={KeyRound} label="Dispatchers" value={stats.dispatchers} />
        </section>

        <section className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
          <form onSubmit={createUser} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-5 flex items-center gap-3">
              <div className="rounded-xl bg-blue-50 p-3 text-blue-700">
                <Plus className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-xl font-black text-slate-950">Create User</h2>
                <p className="text-sm font-medium text-slate-500">Administrator access required.</p>
              </div>
            </div>

            <div className="grid gap-4">
              <Field label="Username" value={form.username} onChange={(value) => setForm((current) => ({ ...current, username: value }))} required />
              <Field label="Name" value={form.name} onChange={(value) => setForm((current) => ({ ...current, name: value }))} required />
              <Field label="Email" type="email" value={form.email} onChange={(value) => setForm((current) => ({ ...current, email: value }))} />
              <Field label="Temporary Password" value={form.temporaryPassword} onChange={(value) => setForm((current) => ({ ...current, temporaryPassword: value }))} required />
              <SelectField label="Role" value={form.role} options={roles} onChange={(value) => setForm((current) => ({ ...current, role: value }))} />
              <SelectField label="Status" value={form.status} options={statuses} onChange={(value) => setForm((current) => ({ ...current, status: value }))} />
              <TextAreaField label="Notes" value={form.notes} onChange={(value) => setForm((current) => ({ ...current, notes: value }))} />
              <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-bold text-slate-700">
                <input
                  type="checkbox"
                  checked={form.forcePasswordChange}
                  onChange={(event) => setForm((current) => ({ ...current, forcePasswordChange: event.target.checked }))}
                  className="h-4 w-4"
                />
                Force password change on first login
              </label>
              <button type="submit" disabled={saving} className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-black text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-400">
                {saving ? "Creating..." : "Create User"}
              </button>
            </div>
          </form>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-black text-slate-950">Users</h2>
                <p className="text-sm font-medium text-slate-500">{loading ? "Loading users..." : `${users.length} user records`}</p>
              </div>
            </div>

            <div className="w-full overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-[1000px] table-auto text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    {["Name", "Username", "Email", "Role", "Status", "Force Change", "Last Login", "Notes", "Actions"].map((header) => (
                      <th key={header} className="px-4 py-3 font-black">{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id} className="border-t border-slate-200">
                      <td className="px-4 py-3">
                        <EditableCell value={user.name} onSave={(value) => updateUser(user, { name: value }, "Name Updated", `Updated name for ${user.username}`)} />
                      </td>
                      <td className="px-4 py-3">
                        <EditableCell value={user.username} onSave={(value) => updateUser(user, { username: value }, "Username Updated", `Updated username for ${user.username}`)} />
                      </td>
                      <td className="px-4 py-3">
                        <EditableCell value={user.email} onSave={(value) => updateUser(user, { email: value }, "Email Updated", `Updated email for ${user.username}`)} />
                      </td>
                      <td className="px-4 py-3">
                        <select className="rounded-xl border border-slate-200 px-3 py-2 font-semibold" value={user.role} onChange={(event) => updateUser(user, { role: event.target.value }, "Role Updated", `Updated ${user.username} role to ${event.target.value}`)}>
                          {roles.map((roleOption) => <option key={roleOption}>{roleOption}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <select className="rounded-xl border border-slate-200 px-3 py-2 font-semibold" value={user.status} onChange={(event) => updateUser(user, { status: event.target.value }, "Status Updated", `Updated ${user.username} status to ${event.target.value}`)}>
                          {statuses.map((status) => <option key={status}>{status}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => updateUser(user, { forcePasswordChange: !user.forcePasswordChange }, "Force Password Change Updated", `Updated password-change requirement for ${user.username}`)}
                          className={`rounded-full px-3 py-1 text-xs font-black uppercase tracking-wide ${user.forcePasswordChange ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-700"}`}
                        >
                          {user.forcePasswordChange ? "Required" : "Not Required"}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{formatDate(user.lastLoginAt)}</td>
                      <td className="px-4 py-3">
                        <EditableCell value={user.notes} onSave={(value) => updateUser(user, { notes: value }, "Notes Updated", `Updated notes for ${user.username}`)} wide />
                      </td>
                      <td className="px-4 py-3">
                        <button type="button" onClick={() => resetPassword(user)} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800">
                          <RotateCcw className="h-4 w-4" />
                          Reset Password
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!loading && users.length === 0 && (
                    <tr>
                      <td colSpan={9} className="px-4 py-10 text-center text-sm font-semibold text-slate-500">
                        No users found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-xl font-black text-slate-950">User Activity Log</h2>
          <div className="mt-4 grid gap-3">
            {activity.map((item) => (
              <div key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
                <p className="font-black text-slate-900">{item.action || "User Activity"}</p>
                <p className="mt-1 text-slate-600">{item.description || "No description"}</p>
                <p className="mt-2 text-xs font-semibold text-slate-400">{formatDate(item.created_at)} by {item.created_by || "Administrator"}</p>
              </div>
            ))}
            {!loading && activity.length === 0 && (
              <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm font-semibold text-slate-500">
                No user activity yet.
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function normalizeUser(row) {
  return {
    id: row.id,
    name: row.name || "",
    username: row.username || "",
    email: row.email || "",
    role: normalizeRoleLabel(row.role),
    status: row.status || "Active",
    forcePasswordChange: Boolean(row.force_password_change),
    lastLoginAt: row.last_login_at || "",
    notes: row.notes || "",
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || "",
  };
}

function normalizeRoleLabel(role) {
  const normalized = String(role || "").toLowerCase();
  if (normalized === "admin" || normalized === "administrator") return "Administrator";
  return "Dispatcher";
}

function roleToDb(role) {
  return normalizeRoleLabel(role) === "Administrator" ? "admin" : "dispatcher";
}

function toDbPatch(patch) {
  const output = {};
  if (patch.name !== undefined) output.name = String(patch.name || "").trim();
  if (patch.username !== undefined) output.username = String(patch.username || "").trim();
  if (patch.email !== undefined) output.email = String(patch.email || "").trim();
  if (patch.role !== undefined) output.role = roleToDb(patch.role);
  if (patch.status !== undefined) output.status = patch.status;
  if (patch.temporaryPassword !== undefined) {
    output.password = patch.temporaryPassword;
    output.temporary_password = patch.temporaryPassword;
  }
  if (patch.forcePasswordChange !== undefined) output.force_password_change = patch.forcePasswordChange;
  if (patch.notes !== undefined) output.notes = String(patch.notes || "").trim();
  output.updated_at = new Date().toISOString();
  return output;
}

function Metric({ icon: Icon, label, value }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="rounded-2xl bg-blue-50 p-3 text-blue-700 w-fit">
        <Icon className="h-5 w-5" />
      </div>
      <p className="mt-4 text-xs font-black uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-black text-slate-950">{value}</p>
    </div>
  );
}

function Field({ label, value, onChange, required = false, type = "text" }) {
  return (
    <label className="grid gap-2 text-sm font-bold text-slate-600">
      {label}
      <input
        type={type}
        value={value}
        required={required}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-xl border border-slate-200 px-3 py-2 font-semibold text-slate-900 outline-none focus:border-blue-500"
      />
    </label>
  );
}

function SelectField({ label, value, options, onChange }) {
  return (
    <label className="grid gap-2 text-sm font-bold text-slate-600">
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 font-semibold text-slate-900 outline-none focus:border-blue-500">
        {options.map((option) => <option key={option}>{option}</option>)}
      </select>
    </label>
  );
}

function TextAreaField({ label, value, onChange }) {
  return (
    <label className="grid gap-2 text-sm font-bold text-slate-600">
      {label}
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-20 rounded-xl border border-slate-200 px-3 py-2 font-semibold text-slate-900 outline-none focus:border-blue-500"
      />
    </label>
  );
}

function EditableCell({ value, onSave, wide = false }) {
  const [draft, setDraft] = useState(value || "");

  useEffect(() => {
    setDraft(value || "");
  }, [value]);

  function saveIfChanged() {
    if (draft !== (value || "")) {
      onSave(draft);
    }
  }

  return (
    <input
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={saveIfChanged}
      className={`${wide ? "w-64" : "w-44"} rounded-xl border border-slate-200 px-3 py-2 font-semibold text-slate-900 outline-none focus:border-blue-500`}
    />
  );
}

function formatDate(value) {
  if (!value) return "Never";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}
