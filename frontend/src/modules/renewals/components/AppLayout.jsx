import { Sidebar } from "./Sidebar";

export function AppLayout({ children, failureCount }) {
  return (
    <div className="adt-layout" style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar failureCount={failureCount} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <div className="adt-topbar-accent" />
        <header className="adt-topbar">
          <div>
            <h1 className="adt-topbar-title">Policy Renewals</h1>
            <div className="adt-topbar-sub">SMS and email reminders at 60, 30, and 15 days before expiry</div>
          </div>
        </header>
        <main className="adt-main">
          <div className="adt-page">{children}</div>
        </main>
      </div>
    </div>
  );
}
