import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import client from "../api/client";

export default function LoginPage() {
  const { token, login, bootstrapAdmin, resetAdminPassword, loading } = useAuth();
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    newPassword: "",
    resetKey: "",
  });
  const [error, setError] = useState("");
  const [bootstrapRequired, setBootstrapRequired] = useState(false);

  useEffect(() => {
    let ignore = false;
    async function loadBootstrapStatus() {
      try {
        const res = await client.get("/auth/bootstrap-status");
        if (!ignore) {
          setBootstrapRequired(Boolean(res.data.bootstrapRequired));
          if (!res.data.bootstrapRequired) {
            setMode("login");
          }
        }
      } catch {
        // Keep login as safe default.
      }
    }
    loadBootstrapStatus();
    return () => {
      ignore = true;
    };
  }, []);

  if (token) return <Navigate to="/dashboard" replace />;

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    const result =
      mode === "login"
        ? await login(form.email, form.password)
        : mode === "bootstrap"
        ? await bootstrapAdmin(form.name, form.email, form.password)
        : await resetAdminPassword(form.email, form.newPassword, form.resetKey);
    if (!result.ok) {
      if (mode === "bootstrap" && result.message === "Bootstrap already completed") {
        setMode("login");
        setBootstrapRequired(false);
        setError("Admin account already exists. Please sign in.");
        return;
      }
      setError(result.message);
    } else if (mode === "reset") {
      setMode("login");
      setError("Password reset successful. Sign in with your new password.");
      setForm((prev) => ({ ...prev, password: "", newPassword: "", resetKey: "" }));
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <form onSubmit={onSubmit} className="w-full max-w-md rounded-xl bg-white p-6 shadow-sm">
        <div className="mb-6 flex justify-center">
          <img
            src="/adt-logo.png"
            alt="ADT Insurance"
            className="h-12 w-auto max-w-full object-contain sm:h-14"
          />
        </div>
        <h1 className="mb-1 text-xl font-semibold text-slate-900">Insurance Claims Tracker</h1>
        <p className="mb-6 text-sm text-slate-600">
          {mode === "login"
            ? "Sign in with your account."
            : mode === "bootstrap"
            ? "Bootstrap first admin account."
            : "Reset an existing admin password."}
        </p>

        {mode === "bootstrap" && (
          <label className="mb-3 block">
            <span className="mb-1 block text-sm text-slate-700">Full Name</span>
            <input
              className="w-full rounded-md border border-slate-300 px-3 py-2"
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              required
            />
          </label>
        )}

        <label className="mb-3 block">
          <span className="mb-1 block text-sm text-slate-700">Email</span>
          <input
            type="email"
            className="w-full rounded-md border border-slate-300 px-3 py-2"
            value={form.email}
            onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
            required
          />
        </label>

        {mode !== "reset" ? (
          <label className="mb-3 block">
            <span className="mb-1 block text-sm text-slate-700">Password</span>
            <input
              type="password"
              className="w-full rounded-md border border-slate-300 px-3 py-2"
              value={form.password}
              onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
              required
            />
          </label>
        ) : (
          <>
            <label className="mb-3 block">
              <span className="mb-1 block text-sm text-slate-700">New Password</span>
              <input
                type="password"
                className="w-full rounded-md border border-slate-300 px-3 py-2"
                value={form.newPassword}
                onChange={(e) => setForm((prev) => ({ ...prev, newPassword: e.target.value }))}
                required
              />
            </label>
            <label className="mb-3 block">
              <span className="mb-1 block text-sm text-slate-700">Admin Reset Key</span>
              <input
                type="password"
                className="w-full rounded-md border border-slate-300 px-3 py-2"
                value={form.resetKey}
                onChange={(e) => setForm((prev) => ({ ...prev, resetKey: e.target.value }))}
                required
              />
            </label>
          </>
        )}

        {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-blue-600 px-4 py-2 font-medium text-white disabled:opacity-60"
        >
          {loading
            ? "Please wait..."
            : mode === "login"
            ? "Login"
            : mode === "bootstrap"
            ? "Create Admin"
            : "Reset Password"}
        </button>

        {mode === "login" ? (
          <button
            type="button"
            className="mt-3 text-sm text-blue-700"
            onClick={() => {
              setMode("reset");
              setError("");
            }}
          >
            Forgot admin password?
          </button>
        ) : null}

        {bootstrapRequired || mode === "bootstrap" ? (
          <button
            type="button"
            className="mt-3 text-sm text-blue-700"
            onClick={() => {
              setMode((prev) => (prev === "login" ? "bootstrap" : "login"));
              setError("");
            }}
          >
            {mode === "login" ? "Need to create first admin?" : "Back to login"}
          </button>
        ) : null}

        {mode === "reset" ? (
          <button
            type="button"
            className="mt-3 text-sm text-blue-700"
            onClick={() => {
              setMode("login");
              setError("");
            }}
          >
            Back to login
          </button>
        ) : null}
      </form>
    </div>
  );
}
