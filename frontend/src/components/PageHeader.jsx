export default function PageHeader({ title, subtitle, actions, children }) {
  return (
    <div className="adt-card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        {children}
        <h1 className="adt-page-title">{title}</h1>
        {subtitle ? <p className="adt-page-subtitle">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
