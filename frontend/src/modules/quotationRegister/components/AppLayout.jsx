import { Sidebar } from './Sidebar'

export function TopBar() {
  return (
    <>
      <div className="adt-topbar-accent" />
      <header className="adt-topbar">
        <div>
          <h1 className="adt-topbar-title">Quotation Tracker</h1>
          <div className="adt-topbar-sub">Insuring Africa With Confidence</div>
        </div>
        <div className="adt-topbar-hint">
          Quick search <kbd>Ctrl</kbd>+<kbd>K</kbd>
        </div>
      </header>
    </>
  )
}

export function AppLayout({ children }) {
  return (
    <div className="adt-layout" style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <TopBar />
        <main className="adt-main">
          <div className="adt-page">{children}</div>
        </main>
      </div>
    </div>
  )
}
