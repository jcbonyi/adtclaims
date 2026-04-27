import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function ForcePasswordChangePage() {
  const { user, loading, changePassword } = useAuth();
  const [form, setForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  if (!user?.mustChangePassword) {
    return <Navigate to="/dashboard" replace />;
  }

  async function onSubmit(e) {
    e.preventDefault();
    setMessage("");
    setError("");
    if (form.newPassword !== form.confirmPassword) {
      setError("New password and confirmation do not match.");
      return;
    }

    const result = await changePassword(form.currentPassword, form.newPassword);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setMessage("Password changed successfully. Redirecting...");
  }

  return (
    <div className="mx-auto max-w-md rounded-xl bg-white p-6 shadow-sm">
      <h2 className="mb-1 text-lg font-semibold text-slate-900">Password Update Required</h2>
      <p className="mb-4 text-sm text-slate-600">
        You must change your password before accessing the system.
      </p>

      <form onSubmit={onSubmit} className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-sm text-slate-700">Current Password</span>
          <input
            type="password"
            className="w-full rounded-md border border-slate-300 px-3 py-2"
            value={form.currentPassword}
            onChange={(e) => setForm((prev) => ({ ...prev, currentPassword: e.target.value }))}
            required
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-slate-700">New Password</span>
          <input
            type="password"
            className="w-full rounded-md border border-slate-300 px-3 py-2"
            value={form.newPassword}
            onChange={(e) => setForm((prev) => ({ ...prev, newPassword: e.target.value }))}
            required
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-slate-700">Confirm New Password</span>
          <input
            type="password"
            className="w-full rounded-md border border-slate-300 px-3 py-2"
            value={form.confirmPassword}
            onChange={(e) => setForm((prev) => ({ ...prev, confirmPassword: e.target.value }))}
            required
          />
        </label>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {message ? <p className="text-sm text-emerald-700">{message}</p> : null}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-blue-600 px-4 py-2 font-medium text-white disabled:opacity-60"
        >
          {loading ? "Please wait..." : "Update Password"}
        </button>
      </form>
    </div>
  );
}
