import { Link, NavLink, Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

function moduleTab({ isActive }) {
  return `adt-module-tab${isActive ? " adt-module-tab--active" : ""}`;
}

function navPill({ isActive }) {
  return `adt-nav-pill${isActive ? " adt-nav-pill--active" : ""}`;
}

export default function ShellLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const isQuotations = location.pathname.startsWith("/quotations");

  if (user?.mustChangePassword && location.pathname !== "/change-password") {
    return <Navigate to="/change-password" replace />;
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--adt-page)" }}>
      <div className="adt-brand-bar" aria-hidden="true" />
      <header className="adt-shell-header">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link
            to="/dashboard"
            className="flex-shrink-0 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adt-blue)] focus-visible:ring-offset-2"
            aria-label="ADT — go to dashboard"
          >
            <img
              src="/adt-logo.png"
              alt=""
              className="h-9 w-auto max-h-10 max-w-[min(100%,14rem)] object-contain object-left sm:h-10"
            />
          </Link>
          <div className="flex items-center gap-3">
            <div className="hidden text-right text-sm sm:block">
              <p className="font-semibold text-slate-900">{user?.name || "Unknown User"}</p>
              <span className="adt-role-badge">{user?.role || "No role"}</span>
            </div>
            <button type="button" className="adt-btn adt-btn-secondary" onClick={logout}>
              Logout
            </button>
          </div>
        </div>
        <div className="mx-auto max-w-7xl px-4 pb-3">
          <div className="adt-module-tabs" role="tablist" aria-label="Application module">
            <NavLink
              to="/dashboard"
              className={() => `adt-module-tab${!isQuotations ? " adt-module-tab--active" : ""}`}
            >
              Claims Tracker
            </NavLink>
            <NavLink
              to="/quotations"
              className={() => `adt-module-tab${isQuotations ? " adt-module-tab--active" : ""}`}
            >
              Quotation Register
            </NavLink>
          </div>
          {!isQuotations ? (
            <nav className="adt-subnav mt-3" aria-label="Claims navigation">
              <NavLink to="/dashboard" className={navPill}>
                Dashboard
              </NavLink>
              <NavLink to="/claims" className={navPill}>
                Claims Register
              </NavLink>
              <NavLink to="/claims/new" className={navPill}>
                Add Claim
              </NavLink>
              {user?.role === "Admin" ? (
                <NavLink to="/users" className={navPill}>
                  User Management
                </NavLink>
              ) : null}
            </nav>
          ) : (
            <p className="mt-2 text-sm text-slate-500">
              Use the sidebar inside Quotation Register to navigate between dashboard, register, and analytics.
            </p>
          )}
        </div>
      </header>

      <main
        id="main-content"
        className={isQuotations ? "pb-8" : "mx-auto max-w-7xl px-4 pb-10 pt-2"}
      >
        <Outlet />
      </main>
    </div>
  );
}
