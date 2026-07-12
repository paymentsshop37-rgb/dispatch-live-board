import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  KeyRound,
  Plus,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Trash2,
  UserCog,
  Users,
} from "lucide-react";
import { supabase } from "../../lib/supabase";

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
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState(null);
  const [resetUser, setResetUser] = useState(null);
  const [deleteUser, setDeleteUser] = useState(null);
  const [saveState, setSaveState] = useState({});
  const [authWarning, setAuthWarning] = useState("");

  const stats = useMemo(
    () => ({
      total: users.length,
      active: users.filter((user) => user.status === "Active").length,
      admins: users.filter((user) => user.role === "Administrator").length,
      dispatchers: users.filter((user) => user.role === "Dispatcher").length,
    }),
    [users]
  );

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data?.session) {
        setAuthWarning(
          "Users administration requires a Supabase Auth admin session. Local access-code login can open the app, but secure create/delete/reset actions need Supabase Auth and the admin-users Edge Function."
        );
      }
    });
    loadUsers();
  }, []);

  async function request(method, body) {
    const { data, error } = await supabase.functions.invoke("admin-users", { method, body });
    if (error) {
      let message = error.message || "Administrative request failed.";
      const response = error.context;
      if (response?.clone) {
        try {
          const details = await response.clone().json();
          message = details?.error || message;
        } catch {
          // Keep the Supabase error message when the response body is not JSON.
        }
      }
      throw new Error(message);
    }
    if (data?.error) throw new Error(data.error);
    return data;
  }

  function show(message, error = false) {
    setNotice({ message, error });
    window.setTimeout(() => setNotice(null), 4500);
  }

  async function loadUsers() {
    setLoading(true);
    try {
      const data = await request("GET");
      setUsers((data.users || []).map(normalizeUser));
    } catch (error) {
      show(error.message || "Unable to load users.", true);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }

  async function create(event) {
    event.preventDefault();
    const payload = {
      ...form,
      name: form.name.trim(),
      username: form.username.trim(),
      email: form.email.trim().toLowerCase(),
      notes: form.notes.trim(),
      role: roleToDb(form.role),
    };
    const validation = validateCreatePayload(payload);
    if (validation) return show(validation, true);

    setBusy("create");
    try {
      await request("POST", payload);
      setForm(emptyForm);
      await loadUsers();
      show("User created successfully.");
    } catch (error) {
      show(error.message || "Unable to create user.", true);
    } finally {
      setBusy("");
    }
  }

  async function updateUser(user, patch) {
    const normalizedPatch = normalizePatch(patch);
    if (Object.keys(normalizedPatch).length === 0) return;

    const statusKey = `${user.id}:${Object.keys(normalizedPatch).join(",")}`;
    setSaveState((current) => ({ ...current, [user.id]: "Saving..." }));
    setBusy(statusKey);

    try {
      await request("PATCH", { id: user.id, ...normalizedPatch });
      setUsers((list) =>
        list.map((item) => (item.id === user.id ? { ...item, ...profilePatchToUi(normalizedPatch) } : item))
      );
      setSaveState((current) => ({ ...current, [user.id]: "Saved" }));
      show(normalizedPatch.status ? "User status updated successfully." : "User updated successfully.");
      window.setTimeout(() => {
        setSaveState((current) => ({ ...current, [user.id]: "" }));
      }, 1800);
    } catch (error) {
      setSaveState((current) => ({ ...current, [user.id]: "Error saving changes" }));
      show(error.message || "Error saving changes", true);
      await loadUsers();
    } finally {
      setBusy("");
    }
  }

  async function confirmDelete() {
    if (!deleteUser) return;
    if (isCurrentUser(deleteUser, currentUser)) {
      show("You cannot delete your own account while signed in.", true);
      return;
    }

    setBusy(`delete-${deleteUser.id}`);
    try {
      await request("DELETE", { id: deleteUser.id });
      setDeleteUser(null);
      await loadUsers();
      show("User deleted successfully.");
    } catch (error) {
      show(error.message || "Unable to delete user.", true);
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-8">
      <div className="space-y-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-blue-600">Administration</p>
              <h1 className="mt-1 text-3xl font-black">User Management</h1>
              <p className="mt-2 text-sm text-slate-500">Manage authenticated accounts and application access.</p>
            </div>
            <button
              type="button"
              onClick={loadUsers}
              disabled={loading}
              className="flex w-fit items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 font-bold text-white disabled:bg-slate-400"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </section>

        {notice && (
          <div
            className={`fixed right-6 top-6 z-[70] rounded-xl px-5 py-3 font-bold shadow-xl ${
              notice.error ? "bg-red-600 text-white" : "bg-emerald-600 text-white"
            }`}
          >
            {notice.message}
          </div>
        )}

        {authWarning && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
            {authWarning}
          </div>
        )}

        <section className="grid gap-4 md:grid-cols-4">
          <Metric icon={Users} label="Total Users" value={stats.total} />
          <Metric icon={ShieldCheck} label="Active Users" value={stats.active} />
          <Metric icon={UserCog} label="Administrators" value={stats.admins} />
          <Metric icon={KeyRound} label="Dispatchers" value={stats.dispatchers} />
        </section>

        <section className="grid gap-6 xl:grid-cols-[0.72fr_1.28fr]">
          <form onSubmit={create} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-5 flex items-center gap-2 text-xl font-black">
              <Plus className="text-blue-600" />
              Create User
            </h2>
            <div className="grid gap-4">
              <Field label="Username" value={form.username} required onChange={(value) => setForm((current) => ({ ...current, username: value }))} />
              <Field label="Name" value={form.name} required onChange={(value) => setForm((current) => ({ ...current, name: value }))} />
              <Field label="Email" type="email" value={form.email} required onChange={(value) => setForm((current) => ({ ...current, email: value }))} />
              <Field label="Temporary Password" type="password" value={form.temporaryPassword} required onChange={(value) => setForm((current) => ({ ...current, temporaryPassword: value }))} />
              <Select label="Role" value={form.role} options={roles} onChange={(value) => setForm((current) => ({ ...current, role: value }))} />
              <Select label="Status" value={form.status} options={statuses} onChange={(value) => setForm((current) => ({ ...current, status: value }))} />
              <Field label="Notes" value={form.notes} onChange={(value) => setForm((current) => ({ ...current, notes: value }))} />
              <label className="flex gap-3 rounded-xl bg-slate-50 p-3 text-sm font-bold">
                <input
                  type="checkbox"
                  checked={form.forcePasswordChange}
                  onChange={(event) => setForm((current) => ({ ...current, forcePasswordChange: event.target.checked }))}
                />
                Force password change on first login
              </label>
              <button
                disabled={busy === "create"}
                className="rounded-xl bg-blue-600 px-4 py-3 font-black text-white disabled:bg-slate-400"
              >
                {busy === "create" ? "Creating..." : "Create User"}
              </button>
            </div>
          </form>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-xl font-black">Users</h2>
            <p className="mb-4 text-sm text-slate-500">
              {loading ? "Loading users..." : `${users.length} user records`}
            </p>
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-[1250px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    {["Name", "Username", "Email", "Role", "Status", "Force Change", "Last Login", "Notes", "Actions"].map((header) => (
                      <th key={header} className="px-3 py-3">{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id} className="border-t border-slate-200">
                      <td className="px-3 py-3">
                        <Editable value={user.name} onSave={(value) => updateUser(user, { name: value })} />
                        <SaveStatus value={saveState[user.id]} />
                      </td>
                      <td className="px-3 py-3">
                        <Editable value={user.username} onSave={(value) => updateUser(user, { username: value })} />
                      </td>
                      <td className="px-3 py-3 text-slate-600">{user.email}</td>
                      <td className="px-3 py-3">
                        <Select value={user.role} options={roles} onChange={(value) => updateUser(user, { role: value })} />
                      </td>
                      <td className="px-3 py-3">
                        <Select value={user.status} options={statuses} onChange={(value) => updateUser(user, { status: value })} />
                        <span className={`mt-2 block w-fit rounded-full px-2 py-1 text-xs font-bold ${user.status === "Active" ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}>
                          {user.status}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <span className={`rounded-full px-2 py-1 text-xs font-black ${user.forcePasswordChange ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600"}`}>
                          {user.forcePasswordChange ? "REQUIRED" : "NOT REQUIRED"}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-slate-600">{formatDate(user.lastLoginAt)}</td>
                      <td className="px-3 py-3">
                        <Editable wide value={user.notes} onSave={(value) => updateUser(user, { notes: value })} />
                      </td>
                      <td className="px-3 py-3">
                        <div className="grid gap-2">
                          <button
                            type="button"
                            disabled={Boolean(busy)}
                            onClick={() => setResetUser(user)}
                            className="flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white disabled:bg-slate-300"
                          >
                            <RotateCcw className="h-4 w-4" />
                            Reset Password
                          </button>
                          <button
                            type="button"
                            disabled={Boolean(busy) || isCurrentUser(user, currentUser)}
                            title="Delete user"
                            onClick={() =>
                              isCurrentUser(user, currentUser)
                                ? show("You cannot delete your own account while signed in.", true)
                                : setDeleteUser(user)
                            }
                            className="flex items-center justify-center gap-2 rounded-xl bg-red-600 px-3 py-2 text-xs font-bold text-white disabled:bg-slate-300"
                          >
                            <Trash2 className="h-4 w-4" />
                            Delete User
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>

      {resetUser && (
        <ResetModal
          user={resetUser}
          busy={busy}
          onClose={() => setResetUser(null)}
          onSave={async (password, force) => {
            setBusy(`reset-${resetUser.id}`);
            try {
              await request("POST", { action: "reset-password", id: resetUser.id, password, forcePasswordChange: force });
              setResetUser(null);
              await loadUsers();
              show("Password reset successfully.");
            } catch (error) {
              show(error.message || "Unable to reset password.", true);
            } finally {
              setBusy("");
            }
          }}
        />
      )}

      {deleteUser && (
        <Modal title="Delete User" onClose={() => setDeleteUser(null)}>
          <p>Are you sure you want to delete this user? This will permanently remove their access to the system.</p>
          <div className="mt-6 flex justify-end gap-3">
            <button type="button" onClick={() => setDeleteUser(null)} className="rounded-xl border px-4 py-2 font-bold">
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmDelete}
              disabled={busy === `delete-${deleteUser.id}`}
              className="rounded-xl bg-red-600 px-4 py-2 font-bold text-white disabled:bg-slate-300"
            >
              {busy === `delete-${deleteUser.id}` ? "Deleting..." : "Delete User"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function ResetModal({ user, onClose, onSave, busy }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [force, setForce] = useState(true);
  const [error, setError] = useState("");

  function submit() {
    if (password.length < 8) return setError("The password must contain at least 8 characters.");
    if (password !== confirm) return setError("Passwords do not match.");
    onSave(password, force);
  }

  return (
    <Modal title="Reset Password" onClose={onClose}>
      <p className="font-bold">{user.name}</p>
      <p className="text-sm text-slate-500">{user.email}</p>
      <div className="mt-4 grid gap-3">
        <Field type="password" label="New temporary password" value={password} onChange={setPassword} />
        <Field type="password" label="Confirm password" value={confirm} onChange={setConfirm} />
        <label className="flex gap-2 text-sm font-bold">
          <input type="checkbox" checked={force} onChange={(event) => setForce(event.target.checked)} />
          Force password change on next login
        </label>
        {error && <p className="text-sm font-bold text-red-600">{error}</p>}
        <button
          type="button"
          disabled={Boolean(busy)}
          onClick={submit}
          className="rounded-xl bg-slate-900 px-4 py-3 font-bold text-white disabled:bg-slate-300"
        >
          {busy ? "Resetting..." : "Reset Password"}
        </button>
      </div>
    </Modal>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex justify-between">
          <h2 className="text-xl font-black">{title}</h2>
          <button type="button" onClick={onClose}>x</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Editable({ value, onSave, wide }) {
  const [draft, setDraft] = useState(value || "");
  const onSaveRef = useRef(onSave);

  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);
  useEffect(() => setDraft(value || ""), [value]);
  useEffect(() => {
    if (draft === (value || "")) return undefined;
    const id = window.setTimeout(() => onSaveRef.current(draft.trim()), 650);
    return () => window.clearTimeout(id);
  }, [draft, value]);

  return (
    <input
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      className={`${wide ? "w-56" : "w-40"} rounded-xl border border-slate-200 px-3 py-2 font-semibold`}
    />
  );
}

function Field({ label, value, onChange, type = "text", required }) {
  return (
    <label className="grid gap-2 text-sm font-bold text-slate-600">
      {label}
      <input
        required={required}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-xl border border-slate-200 px-3 py-2 text-slate-900"
      />
    </label>
  );
}

function Select({ label, value, options, onChange }) {
  const control = (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="rounded-xl border border-slate-200 px-3 py-2 text-slate-900"
    >
      {options.map((option) => <option key={option}>{option}</option>)}
    </select>
  );
  if (!label) return control;
  return (
    <label className="grid gap-2 text-sm font-bold text-slate-600">
      {label}
      {control}
    </label>
  );
}

function SaveStatus({ value }) {
  if (!value) return null;
  return <p className={`mt-1 text-xs font-bold ${value.startsWith("Error") ? "text-red-600" : "text-slate-500"}`}>{value}</p>;
}

function Metric({ icon: Icon, label, value }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <Icon className="h-5 w-5 text-blue-600" />
      <p className="mt-3 text-xs font-black uppercase text-slate-500">{label}</p>
      <p className="text-3xl font-black">{value}</p>
    </div>
  );
}

function normalizeUser(row) {
  return {
    id: row.id,
    name: row.name || "",
    username: row.username || "",
    email: row.email || "",
    role: String(row.role).toLowerCase() === "admin" ? "Administrator" : "Dispatcher",
    status: row.status || "Inactive",
    forcePasswordChange: Boolean(row.force_password_change),
    lastLoginAt: row.last_login_at,
    notes: row.notes || "",
  };
}

function normalizePatch(patch) {
  const normalized = {};
  if (patch.name !== undefined) normalized.name = String(patch.name || "").trim();
  if (patch.username !== undefined) normalized.username = String(patch.username || "").trim();
  if (patch.notes !== undefined) normalized.notes = String(patch.notes || "").trim();
  if (patch.role !== undefined) normalized.role = roleToDb(patch.role);
  if (patch.status !== undefined) normalized.status = patch.status;
  return normalized;
}

function isCurrentUser(user, currentUser) {
  if (!user || !currentUser) return false;
  return Boolean(
    (currentUser.id && user.id === currentUser.id) ||
      (currentUser.username && user.username === currentUser.username) ||
      (currentUser.email && user.email === currentUser.email)
  );
}

function profilePatchToUi(patch) {
  return {
    ...patch,
    ...(patch.role ? { role: patch.role === "admin" ? "Administrator" : "Dispatcher" } : {}),
  };
}

function roleToDb(role) {
  return role === "Administrator" ? "admin" : "dispatcher";
}

function validateCreatePayload(payload) {
  if (!payload.username || !payload.name || !payload.email || !payload.temporaryPassword || !payload.role || !payload.status) {
    return "Complete all required fields.";
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) return "Enter a valid email address.";
  if (payload.temporaryPassword.length < 8) return "The password must contain at least 8 characters.";
  return "";
}

function formatDate(value) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
