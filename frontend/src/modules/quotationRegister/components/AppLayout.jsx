export function AppLayout({
  children,
  onOpenSearch,
  title = "Quotation Tracker",
  subtitle = "Insuring Africa With Confidence",
  extra = null,
}) {
  return (
    <div className="adt-workspace">
      <div className="adt-workspace-toolbar">
        <div>
          <p className="adt-workspace-kicker">{title}</p>
          <p className="adt-workspace-hint">{subtitle}</p>
        </div>
        <div className="adt-workspace-actions">
          {extra}
          {onOpenSearch ? (
            <button type="button" className="adt-btn adt-btn-secondary adt-workspace-search" onClick={onOpenSearch}>
              Search <kbd>Ctrl</kbd>+<kbd>K</kbd>
            </button>
          ) : null}
        </div>
      </div>
      <div className="adt-page">{children}</div>
    </div>
  );
}
