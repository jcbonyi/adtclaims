import { THEME } from "../constants";

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="adt-page-header">
      <div>
        <h1>{title}</h1>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {actions ? <div className="adt-page-header-actions">{actions}</div> : null}
    </div>
  );
}

export function Card({ children, className = "" }) {
  return <div className={`adt-card ${className}`.trim()}>{children}</div>;
}

export function KpiCard({ label, value, sub, onClick, active }) {
  const inner = (
    <>
      <div className="adt-kpi-label">{label}</div>
      <div className="adt-kpi-value">{value}</div>
      {sub != null ? <div className="adt-kpi-sub">{sub}</div> : null}
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        className={`adt-kpi adt-kpi--clickable${active ? " adt-kpi--active" : ""}`}
        onClick={onClick}
        aria-label={`${label}: ${value}. Click to view details.`}
      >
        {inner}
      </button>
    );
  }
  return <div className="adt-kpi">{inner}</div>;
}

export function KpiRow({ children }) {
  return <div className="adt-kpi-row">{children}</div>;
}

export function Button({ children, tone = "secondary", className = "", ...rest }) {
  return (
    <button type="button" className={`adt-btn adt-btn--${tone} ${className}`.trim()} {...rest}>
      {children}
    </button>
  );
}

export function LinkButton({ children, onClick, className = "" }) {
  return (
    <button type="button" onClick={onClick} className={`adt-link-btn ${className}`.trim()}>
      {children}
    </button>
  );
}

export function EmptyState({ children }) {
  return <div className="adt-table-empty">{children}</div>;
}

export { THEME };
