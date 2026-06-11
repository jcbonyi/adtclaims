import { Link, NavLink } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import { valuationPath } from "../basePath";
import { canManageValuers } from "../constants";

export function Sidebar() {
  const { user } = useAuth();
  const items = [
    { to: valuationPath("dashboard"), label: "Dashboard" },
    { to: valuationPath("register"), label: "Valuation Register" },
    { to: valuationPath("followup"), label: "Follow-Up" },
    { to: valuationPath("analytics"), label: "Analytics" },
  ];
  if (canManageValuers(user?.role)) {
    items.push({ to: valuationPath("valuers"), label: "Valuers" });
  }

  return (
    <aside className="adt-sidebar">
      <div className="adt-sidebar-brand">
        <div className="adt-sidebar-app-name">Motor Valuations</div>
      </div>
      <nav className="adt-sidebar-nav" aria-label="Valuation navigation">
        {items.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `adt-nav-link${isActive ? " adt-nav-link--active" : ""}`
            }
          >
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="adt-sidebar-footer">
        <Link to="/claims" className="adt-nav-link" style={{ marginBottom: 8 }}>
          ← Claims Tracker
        </Link>
        Internal use · 2026
      </div>
    </aside>
  );
}
