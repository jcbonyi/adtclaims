import { Link, NavLink } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import { renewalsPath } from "../basePath";
import { canManageRenewalSettings } from "../constants";

function IconChart() {
  return (
    <svg className="val-nav-icon" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M4 19h2V9H4v10zm4 0h2V5H8v14zm4 0h2v-8h-2v8zm4 0h2V12h-2v7z" />
    </svg>
  );
}

function IconTable() {
  return (
    <svg className="val-nav-icon" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M3 3h18v18H3V3zm2 2v4h14V5H5zm0 6v4h14v-4H5zm0 6v2h14v-2H5z" />
    </svg>
  );
}

function IconAlert() {
  return (
    <svg className="val-nav-icon" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
    </svg>
  );
}

function IconBell() {
  return (
    <svg className="val-nav-icon" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 22a2 2 0 002-2h-4a2 2 0 002 2zm6-6V11a6 6 0 10-12 0v5l-2 2v1h16v-1l-2-2z" />
    </svg>
  );
}

function IconBank() {
  return (
    <svg className="val-nav-icon" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M4 10v7h3v-7H4zm6.5 0v7h3v-7h-3zM2 19v2h20v-2H2zM17 10v7h3v-7h-3zM12 1L2 6v2h20V6L12 1z" />
    </svg>
  );
}

function IconCog() {
  return (
    <svg className="val-nav-icon" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 00.12-.64l-1.92-3.32a.5.5 0 00-.6-.22l-2.39.96a7.03 7.03 0 00-1.63-.94l-.36-2.54A.5.5 0 0014.9 2h-3.8a.5.5 0 00-.5.42l-.36 2.54c-.59.24-1.13.55-1.63.94l-2.39-.96a.5.5 0 00-.6.22L3.8 8.48a.5.5 0 00.12.64l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94L3.92 14.16a.5.5 0 00-.12.64l1.92 3.32c.13.23.4.32.64.22l2.39-.96c.5.39 1.04.7 1.63.94l.36 2.54c.05.24.26.42.5.42h3.8c.24 0 .45-.18.5-.42l.36-2.54c.59-.24 1.13-.55 1.63-.94l2.39.96c.24.1.51 0 .64-.22l1.92-3.32a.5.5 0 00-.12-.64l-2.03-1.58zM12 15.6A3.6 3.6 0 1112 8.4a3.6 3.6 0 010 7.2z" />
    </svg>
  );
}

export function Sidebar({ failureCount = 0 }) {
  const { user } = useAuth();

  const items = [
    { to: renewalsPath("dashboard"), label: "Dashboard", Icon: IconChart },
    { to: renewalsPath("register"), label: "Policy Register", Icon: IconTable },
    { to: renewalsPath("analytics"), label: "Production report", Icon: IconChart },
    { to: renewalsPath("failures"), label: "Delivery Failures", Icon: IconAlert, badge: failureCount },
    { to: renewalsPath("log"), label: "Send Log", Icon: IconBell },
    { to: renewalsPath("financiers"), label: "Financiers", Icon: IconBank },
  ];
  if (canManageRenewalSettings(user?.role)) {
    items.push({ to: renewalsPath("settings"), label: "Settings", Icon: IconCog });
  }

  return (
    <aside className="adt-sidebar">
      <div className="adt-sidebar-brand">
        <div className="adt-sidebar-app-name">Renewals</div>
        <div style={{ fontSize: 12, color: "var(--adt-muted)", marginTop: 4 }}>
          T-60 · T-30 · T-15 · T-7 · T-1
        </div>
      </div>
      <nav className="adt-sidebar-nav" aria-label="Renewals navigation">
        {items.map(({ to, label, Icon, badge }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => `adt-nav-link${isActive ? " adt-nav-link--active" : ""}`}
          >
            <Icon />
            <span>{label}</span>
            {badge > 0 ? <span className="val-nav-badge">{badge}</span> : null}
          </NavLink>
        ))}
      </nav>
      <div className="adt-sidebar-footer">
        <Link to="/dashboard" className="adt-nav-link" style={{ marginBottom: 8 }}>
          ← Claims Tracker
        </Link>
        <Link to="/quotations" className="adt-nav-link" style={{ marginBottom: 8 }}>
          Quotation Register
        </Link>
        <Link to="/valuations" className="adt-nav-link" style={{ marginBottom: 8 }}>
          Motor Valuations
        </Link>
        Internal use · 2026
      </div>
    </aside>
  );
}
