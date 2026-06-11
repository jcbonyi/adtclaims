import { Sidebar } from "./Sidebar";

export function AppLayout({ children, onOpenSearch }) {
  return (
    <div className="adt-layout" style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <div className="adt-topbar-accent" />
        <header className="adt-topbar">
          <div>
            <h1 className="adt-topbar-title">Motor Valuation Tracker</h1>
            <div className="adt-topbar-sub">2-day valuation report turnaround</div>
          </div>
          {onOpenSearch ? (
            <button type="button" className="adt-btn adt-btn-primary" onClick={onOpenSearch}>
              Search <kbd>Ctrl</kbd>+<kbd>K</kbd>
            </button>
          ) : null}
        </header>
        <main className="adt-main">
          <div className="adt-page">{children}</div>
        </main>
      </div>
    </div>
  );
}
