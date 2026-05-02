import { Link, NavLink, Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const navItem = ({ isActive }) =>
  `rounded-md px-3 py-2 text-sm font-medium ${
    isActive ? "bg-blue-600 text-white" : "text-slate-700 hover:bg-slate-200"
  }`;

export default function ShellLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();

  if (user?.mustChangePassword && location.pathname !== "/change-password") {
    return <Navigate to="/change-password" replace />;
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <Link
            to="/dashboard"
            className="flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 rounded"
            aria-label="ADT Claims Tracker — go to dashboard"
          >
            <img
              src="/adt-logo.png"
              alt=""
              className="h-9 w-auto max-h-10 max-w-[min(100%,14rem)] object-contain object-left sm:h-10"
            />
          </Link>
          <div className="flex items-center gap-4">
            <div className="text-right text-sm text-slate-600">
              <p className="font-medium text-slate-900">{user?.name || "Unknown User"}</p>
              <p>{user?.role || "No role"}</p>
            </div>
            <button
              type="button"
              className="rounded-md bg-slate-900 px-3 py-2 text-sm text-white"
              onClick={logout}
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <nav className="mx-auto flex max-w-7xl gap-2 px-4 py-3">
        <NavLink to="/dashboard" className={navItem}>
          Dashboard
        </NavLink>
        <NavLink to="/claims" className={navItem}>
          Claims Register
        </NavLink>
        <NavLink to="/claims/new" className={navItem}>
          Add Claim
        </NavLink>
        {user?.role === "Admin" ? (
          <NavLink to="/users" className={navItem}>
            User Management
          </NavLink>
        ) : null}
      </nav>

      <main className="mx-auto max-w-7xl px-4 pb-8">
        <Outlet />
      </main>
    </div>
  );
}
