import { Sidebar } from './Sidebar'

export function TopBar({ onOpenSearch }) {
  return (
    <>
      <div className="adt-topbar-accent" />
      <header className="adt-topbar">
        <div>
          <h1 className="adt-topbar-title">Quotation Tracker</h1>
          <div className="adt-topbar-sub">Insuring Africa With Confidence</div>
        </div>
        {onOpenSearch ? (
          <button type="button" className="adt-btn adt-btn-primary" onClick={onOpenSearch}>
            Search clients <kbd>Ctrl</kbd>+<kbd>K</kbd>
          </button>
        ) : null}
      </header>
    </>
  )
}

export function AppLayout({ children, onOpenSearch }) {
  return (
    <div className="adt-layout" style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <TopBar onOpenSearch={onOpenSearch} />
        <main className="adt-main">
          <div className="adt-page">{children}</div>
        </main>
      </div>
    </div>
  )
}
