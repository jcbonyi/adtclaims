import { Link, NavLink } from 'react-router-dom'
import { AppLogo } from './AppLogo'
import { quotationPath } from '../basePath'

function IconDashboard() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M4 4h7v9H4V4zm9 0h7v5h-7V4zM4 15h7v5H4v-5zm9-8h7v9h-7V7z" />
    </svg>
  )
}

function IconTable() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M3 3h18v18H3V3zm2 2v4h14V5H5zm14 6H5v4h14v-4zm0 6H5v4h14v-4z" />
    </svg>
  )
}

function IconBell() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 22a2 2 0 002-2h-4a2 2 0 002 2zm6-6V11a6 6 0 10-12 0v5L4 18v1h16v-1l-2-2z" />
    </svg>
  )
}

function IconChart() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M4 19h2V9H4v10zm4 0h2V5H8v14zm4 0h2v-8h-2v8zm4 0h2V12h-2v7z" />
    </svg>
  )
}

export function Sidebar() {
  const items = [
    { to: quotationPath('dashboard'), id: 'dashboard', label: 'Dashboard', Icon: IconDashboard },
    { to: quotationPath('register'), id: 'register', label: 'Quotation Register', Icon: IconTable },
    { to: quotationPath('followup'), id: 'followup', label: 'Follow-Up', Icon: IconBell },
    { to: quotationPath('analytics'), id: 'analytics', label: 'Analytics', Icon: IconChart },
  ]

  return (
    <aside className="adt-sidebar">
      <div className="adt-sidebar-brand">
        <div className="adt-sidebar-logo-wrap">
          <AppLogo variant="sidebar" />
        </div>
        <div className="adt-sidebar-app-name">Quotation Tracker</div>
      </div>
      <nav className="adt-sidebar-nav" aria-label="Main navigation">
        {items.map(({ id, to, label, Icon }) => (
          <NavLink
            key={id}
            to={to}
            className={({ isActive }) =>
              `adt-nav-link${isActive ? ' adt-nav-link--active' : ''}`
            }
          >
            <Icon />
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
  )
}
