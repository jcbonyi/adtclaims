import { useMemo } from "react";
import { Link, NavLink } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import { valuationPath } from "../basePath";
import { FOLLOW_UP_STATUSES, canManageValuers } from "../constants";
import { useValuations } from "../context/useValuations";

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

function IconBell() {
  return (
    <svg className="val-nav-icon" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 22a2 2 0 002-2h-4a2 2 0 002 2zm6-6V11a6 6 0 10-12 0v5l-2 2v1h16v-1l-2-2z" />
    </svg>
  );
}

function IconReport() {
  return (
    <svg className="val-nav-icon" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M19 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2zm-7 14H7v-2h5v2zm5-4H7v-2h10v2zm0-4H7V7h10v2z" />
    </svg>
  );
}

function IconUsers() {
  return (
    <svg className="val-nav-icon" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5C15 14.17 10.33 13 8 13zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
    </svg>
  );
}

export function Sidebar() {
  const { user } = useAuth();
  const { state } = useValuations();

  const followUpCount = useMemo(
    () =>
      state.valuations.filter((v) => FOLLOW_UP_STATUSES.has(v.status) || v.isOverdue).length,
    [state.valuations]
  );

  const items = [
    { to: valuationPath("dashboard"), label: "Dashboard", Icon: IconChart },
    { to: valuationPath("register"), label: "Valuation Register", Icon: IconTable },
    { to: valuationPath("followup"), label: "Follow-Up", Icon: IconBell, badge: followUpCount },
    { to: valuationPath("analytics"), label: "Analytics", Icon: IconReport },
  ];
  if (canManageValuers(user?.role)) {
    items.push({ to: valuationPath("valuers"), label: "Valuers", Icon: IconUsers });
  }

  return (
    <aside className="adt-sidebar">
      <div className="adt-sidebar-brand">
        <div className="adt-sidebar-app-name">Motor Valuations</div>
        <div style={{ fontSize: 12, color: "var(--adt-muted)", marginTop: 4 }}>
          2-day report turnaround
        </div>
      </div>
      <nav className="adt-sidebar-nav" aria-label="Valuation navigation">
        {items.map(({ to, label, Icon, badge }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `adt-nav-link${isActive ? " adt-nav-link--active" : ""}`
            }
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
        Internal use · 2026
      </div>
    </aside>
  );
}
