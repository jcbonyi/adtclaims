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
  const [info, setInfo] = useState("");
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
    setInfo("");
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
        setInfo("Admin account already exists. Please sign in.");
        return;
      }
      setError(result.message);
    } else if (mode === "reset") {
      setMode("login");
      setInfo("Password reset successful. Sign in with your new password.");
      setForm((prev) => ({ ...prev, password: "", newPassword: "", resetKey: "" }));
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4" style={{ background: "var(--adt-page)" }}>
      <div className="adt-brand-bar fixed left-0 right-0 top-0" aria-hidden="true" />
      <form
        onSubmit={onSubmit}
        className="adt-card mt-4 w-full max-w-md p-6 sm:p-8"
        style={{ boxShadow: "var(--adt-shadow-md)" }}
      >
        <div className="mb-6 flex justify-center">
          <img
            src="/adt-logo.png"
            alt="ADT Insurance"
            className="h-12 w-auto max-w-full object-contain sm:h-14"
          />
        </div>
        <h1 className="adt-page-title text-center">ADT Insurance Platform</h1>
        <p className="adt-page-subtitle mb-6 text-center">
          {mode === "login"
            ? "Sign in to Claims Tracker or Quotation Register."
            : mode === "bootstrap"
              ? "Create the first administrator account."
              : "Reset an administrator password."}
        </p>

        {mode === "bootstrap" && (
          <label className="mb-3 block">
            <span className="adt-label">Full name</span>
            <input
              className="adt-input"
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              required
            />
          </label>
        )}

        <label className="mb-3 block">
          <span className="adt-label">Email</span>
          <input
            type="email"
            className="adt-input"
            value={form.email}
            onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
            required
            autoComplete="email"
          />
        </label>

        {mode !== "reset" ? (
          <label className="mb-3 block">
            <span className="adt-label">Password</span>
            <input
              type="password"
              className="adt-input"
              value={form.password}
              onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
              required
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />
          </label>
        ) : (
          <>
            <label className="mb-3 block">
              <span className="adt-label">New password</span>
              <input
                type="password"
                className="adt-input"
                value={form.newPassword}
                onChange={(e) => setForm((prev) => ({ ...prev, newPassword: e.target.value }))}
                required
                autoComplete="new-password"
              />
            </label>
            <label className="mb-3 block">
              <span className="adt-label">Admin reset key</span>
              <input
                type="password"
                className="adt-input"
                value={form.resetKey}
                onChange={(e) => setForm((prev) => ({ ...prev, resetKey: e.target.value }))}
                required
              />
            </label>
          </>
        )}

        {error ? <p className="adt-alert adt-alert-error mb-3">{error}</p> : null}
        {info ? <p className="adt-alert adt-alert-info mb-3">{info}</p> : null}

        <button type="submit" disabled={loading} className="adt-btn adt-btn-accent w-full">
          {loading
            ? "Please wait…"
            : mode === "login"
              ? "Sign in"
              : mode === "bootstrap"
                ? "Create admin"
                : "Reset password"}
        </button>

        <div className="mt-4 flex flex-col gap-2 text-center text-sm">
          {mode === "login" ? (
            <button
              type="button"
              className="adt-btn adt-btn-ghost w-full"
              onClick={() => {
                setMode("reset");
                setError("");
                setInfo("");
              }}
            >
              Forgot admin password?
            </button>
          ) : null}

          {bootstrapRequired || mode === "bootstrap" ? (
            <button
              type="button"
              className="adt-btn adt-btn-ghost w-full"
              onClick={() => {
                setMode((prev) => (prev === "login" ? "bootstrap" : "login"));
                setError("");
                setInfo("");
              }}
            >
              {mode === "login" ? "Create first admin account" : "Back to sign in"}
            </button>
          ) : null}

          {mode === "reset" ? (
            <button
              type="button"
              className="adt-btn adt-btn-ghost w-full"
              onClick={() => {
                setMode("login");
                setError("");
                setInfo("");
              }}
            >
              Back to sign in
            </button>
          ) : null}
        </div>
      </form>
    </div>
  );
}
