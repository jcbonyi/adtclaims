import { useEffect, useState } from "react";
import client from "../api/client";
import { useAuth } from "../context/AuthContext";
import { formatDate } from "../utils/format";

const roles = ["Admin", "Claims Officer", "Read-Only"];

export default function UserManagementPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [auditLoading, setAuditLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "Claims Officer",
  });
  const [editingUserId, setEditingUserId] = useState(null);
  const [editForm, setEditForm] = useState({ name: "", email: "", role: "Claims Officer" });

  async function loadUsers() {
    setLoading(true);
    setError("");
    try {
      const res = await client.get("/users");
      setUsers(res.data);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load users");
    } finally {
      setLoading(false);
    }
  }

  async function loadAuditLogs() {
    setAuditLoading(true);
    try {
      const res = await client.get("/users/audit", { params: { limit: 200 } });
      setAuditLogs(res.data);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load audit logs");
    } finally {
      setAuditLoading(false);
    }
  }

  useEffect(() => {
    let ignore = false;
    async function init() {
      setLoading(true);
      setError("");
      try {
        const [usersRes, auditRes] = await Promise.all([
          client.get("/users"),
          client.get("/users/audit", { params: { limit: 200 } }),
        ]);
        if (!ignore) {
          setUsers(usersRes.data);
          setAuditLogs(auditRes.data);
        }
      } catch (err) {
        if (!ignore) setError(err.response?.data?.message || "Failed to load users");
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    init();
    return () => {
      ignore = true;
    };
  }, []);

  async function createUser(e) {
    e.preventDefault();
    setCreating(true);
    setError("");
    setMessage("");
    try {
      await client.post("/auth/register", form);
      setMessage("User created successfully. They must change password on first login.");
      setForm({ name: "", email: "", password: "", role: "Claims Officer" });
      await loadUsers();
      await loadAuditLogs();
    } catch (err) {
      const apiMessage = err.response?.data?.message || "Failed to create user";
      const existingUser = err.response?.data?.existingUser;
      if (err.response?.status === 409 && existingUser) {
        setError(
          `Email already exists (${existingUser.email}). Use Edit/Reset/Deactivate actions in the table below.`
        );
        setEditingUserId(existingUser.id);
        setEditForm({
          name: existingUser.name,
          email: existingUser.email,
          role: existingUser.role,
        });
        await loadUsers();
        return;
      }
      setError(apiMessage);
    } finally {
      setCreating(false);
    }
  }

  async function updateRole(targetUserId, role) {
    setError("");
    setMessage("");
    try {
      await client.patch(`/users/${targetUserId}/role`, { role });
      setMessage("User role updated.");
      await loadUsers();
      await loadAuditLogs();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to update role");
    }
  }

  function startEdit(row) {
    setEditingUserId(row.id);
    setEditForm({
      name: row.name,
      email: row.email,
      role: row.role,
    });
    setError("");
    setMessage("");
  }

  function cancelEdit() {
    setEditingUserId(null);
    setEditForm({ name: "", email: "", role: "Claims Officer" });
  }

  async function saveEdit(targetUserId) {
    setError("");
    setMessage("");
    try {
      await client.patch(`/users/${targetUserId}`, editForm);
      setMessage("User details updated.");
      cancelEdit();
      await loadUsers();
      await loadAuditLogs();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to update user details");
    }
  }

  async function resetUserPassword(targetUserId) {
    const newPassword = window.prompt("Enter new password (min 8 chars):");
    if (!newPassword) return;

    setError("");
    setMessage("");
    try {
      await client.post(`/users/${targetUserId}/reset-password`, { newPassword });
      setMessage("Password reset successfully. User will be forced to change it on first login.");
      await loadUsers();
      await loadAuditLogs();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to reset password");
    }
  }

  async function toggleUserActive(targetUserId, currentState) {
    setError("");
    setMessage("");
    try {
      await client.patch(`/users/${targetUserId}/status`, { isActive: !currentState });
      setMessage(!currentState ? "User reactivated." : "User deactivated.");
      await loadUsers();
      await loadAuditLogs();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to update user status");
    }
  }

  async function deleteUser(targetUserId, email) {
    const confirmed = window.confirm(`Delete user ${email}? This cannot be undone.`);
    if (!confirmed) return;

    setError("");
    setMessage("");
    try {
      await client.delete(`/users/${targetUserId}`);
      setMessage("User deleted.");
      await loadUsers();
      await loadAuditLogs();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to delete user");
    }
  }

  if (user?.role !== "Admin") {
    return (
      <div className="rounded-xl bg-white p-4 text-sm text-slate-700 shadow-sm">
        Only Admin users can manage accounts.
      </div>
    );
  }

  return (
    <section className="space-y-4">
      <div className="rounded-xl bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold text-slate-900">User Management</h2>
        <p className="mb-4 text-sm text-slate-600">
          Create accounts, deactivate/delete users, update roles, and reset passwords.
        </p>

        <form className="grid gap-2 md:grid-cols-4" onSubmit={createUser}>
          <input
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder="Full Name"
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            required
          />
          <input
            type="email"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder="Email"
            value={form.email}
            onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
            required
          />
          <input
            type="password"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder="Temporary Password"
            value={form.password}
            onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
            required
          />
          <select
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={form.role}
            onChange={(e) => setForm((prev) => ({ ...prev, role: e.target.value }))}
          >
            {roles.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={creating}
            className="md:col-span-4 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {creating ? "Creating..." : "Create User"}
          </button>
        </form>
        {message ? <p className="mt-2 text-sm text-emerald-700">{message}</p> : null}
        {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
      </div>

      <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-600">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Force Password Change</th>
              <th className="px-3 py-2">Created</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((row) => (
              <tr key={row.id} className="border-t">
                <td className="px-3 py-2">
                  {editingUserId === row.id ? (
                    <input
                      className="w-full rounded border border-slate-300 px-2 py-1"
                      value={editForm.name}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))}
                    />
                  ) : (
                    row.name
                  )}
                </td>
                <td className="px-3 py-2">
                  {editingUserId === row.id ? (
                    <input
                      type="email"
                      className="w-full rounded border border-slate-300 px-2 py-1"
                      value={editForm.email}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, email: e.target.value }))}
                    />
                  ) : (
                    row.email
                  )}
                </td>
                <td className="px-3 py-2">
                  {editingUserId === row.id ? (
                    <select
                      className="rounded border border-slate-300 px-2 py-1"
                      value={editForm.role}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, role: e.target.value }))}
                    >
                      {roles.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <select
                      className="rounded border border-slate-300 px-2 py-1"
                      value={row.role}
                      onChange={(e) => updateRole(row.id, e.target.value)}
                    >
                      {roles.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>
                  )}
                </td>
                <td className="px-3 py-2">
                  <span
                    className={`rounded px-2 py-1 text-xs ${
                      row.isActive ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"
                    }`}
                  >
                    {row.isActive ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="px-3 py-2">
                  {row.mustChangePassword ? (
                    <span className="rounded bg-amber-100 px-2 py-1 text-xs text-amber-800">Required</span>
                  ) : (
                    <span className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-700">No</span>
                  )}
                </td>
                <td className="px-3 py-2">{formatDate(row.createdAt)}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-2">
                    {editingUserId === row.id ? (
                      <>
                        <button
                          type="button"
                          className="rounded border border-emerald-300 px-2 py-1 text-xs text-emerald-700"
                          onClick={() => saveEdit(row.id)}
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700"
                          onClick={cancelEdit}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700"
                        onClick={() => startEdit(row)}
                      >
                        Edit
                      </button>
                    )}
                    <button
                      type="button"
                      className="rounded border border-blue-300 px-2 py-1 text-xs text-blue-700"
                      onClick={() => resetUserPassword(row.id)}
                    >
                      Reset Password
                    </button>
                    <button
                      type="button"
                      className="rounded border border-orange-300 px-2 py-1 text-xs text-orange-700"
                      onClick={() => toggleUserActive(row.id, row.isActive)}
                    >
                      {row.isActive ? "Deactivate" : "Reactivate"}
                    </button>
                    <button
                      type="button"
                      className="rounded border border-red-300 px-2 py-1 text-xs text-red-700"
                      onClick={() => deleteUser(row.id, row.email)}
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {loading ? <p className="p-3 text-sm text-slate-500">Loading users...</p> : null}
      </div>

      <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">User Audit Log</h3>
          {auditLoading ? <span className="text-xs text-slate-500">Refreshing...</span> : null}
        </div>
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-600">
            <tr>
              <th className="px-3 py-2">Time</th>
              <th className="px-3 py-2">Actor</th>
              <th className="px-3 py-2">Action</th>
              <th className="px-3 py-2">Target</th>
              <th className="px-3 py-2">Details</th>
            </tr>
          </thead>
          <tbody>
            {auditLogs.map((row) => (
              <tr key={row.id} className="border-t">
                <td className="px-3 py-2">{formatDate(row.createdAt)}</td>
                <td className="px-3 py-2">{row.changedByName}</td>
                <td className="px-3 py-2">{row.action}</td>
                <td className="px-3 py-2">{row.targetEmail}</td>
                <td className="px-3 py-2">
                  {row.details ? (
                    <code className="rounded bg-slate-100 px-2 py-1 text-xs">{row.details}</code>
                  ) : (
                    "-"
                  )}
                </td>
              </tr>
            ))}
            {!auditLoading && auditLogs.length === 0 ? (
              <tr>
                <td className="px-3 py-3 text-sm text-slate-500" colSpan={5}>
                  No audit log entries yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
