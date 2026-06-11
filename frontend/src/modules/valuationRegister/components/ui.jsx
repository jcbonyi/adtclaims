import { THEME } from "../constants";

export function PageHeader({ title, subtitle, actions, children }) {
  return (
    <div className="adt-page-header val-page-header">
      <div>
        {children}
        <h1>{title}</h1>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {actions ? <div className="adt-page-header-actions val-toolbar">{actions}</div> : null}
    </div>
  );
}

export function Card({ children, className = "", padding = true }) {
  return (
    <div className={`adt-card val-card${padding ? "" : " val-card--flush"} ${className}`.trim()}>
      {children}
    </div>
  );
}

export function KpiCard({ label, value, sub, onClick, active }) {
  const inner = (
    <>
      <div className="adt-kpi-label">{label}</div>
      <div className="adt-kpi-value">{value}</div>
      {sub != null ? <div className="adt-kpi-sub">{sub}</div> : null}
      {onClick ? <div className="val-kpi-hint">Click to view →</div> : null}
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

export function Button({ children, tone = "secondary", className = "", size = "md", ...rest }) {
  return (
    <button
      type="button"
      className={`adt-btn adt-btn--${tone} val-btn val-btn--${size} ${className}`.trim()}
      {...rest}
    >
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

export function EmptyState({ title, children }) {
  return (
    <div className="adt-table-empty val-empty">
      {title ? <strong className="val-empty-title">{title}</strong> : null}
      <p>{children}</p>
    </div>
  );
}

export function LoadingState({ label = "Loading…" }) {
  return (
    <div className="val-loading" role="status">
      <div className="val-loading-spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function AlertBanner({ tone = "info", children, onDismiss }) {
  return (
    <div className={`val-alert val-alert--${tone}`} role="status">
      <div className="val-alert-body">{children}</div>
      {onDismiss ? (
        <button type="button" className="val-alert-dismiss" onClick={onDismiss} aria-label="Dismiss">
          ×
        </button>
      ) : null}
    </div>
  );
}

export function FormSection({ title, description, children }) {
  return (
    <section className="val-form-section">
      <div className="val-form-section-head">
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      <div className="val-form-section-body">{children}</div>
    </section>
  );
}

export function FormField({ label, hint, required, children }) {
  return (
    <label className="val-field">
      <span className="val-field-label">
        {label}
        {required ? <span className="val-required">*</span> : null}
      </span>
      {children}
      {hint ? <span className="val-field-hint">{hint}</span> : null}
    </label>
  );
}

export function Modal({ title, open, onClose, children, footer }) {
  if (!open) return null;
  return (
    <div className="adt-modal-backdrop val-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="val-modal-title">
      <div className="adt-modal val-modal">
        <div className="val-modal-header">
          <h3 id="val-modal-title">{title}</h3>
          <button type="button" className="val-modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="val-modal-body">{children}</div>
        {footer ? <div className="val-modal-footer">{footer}</div> : null}
      </div>
    </div>
  );
}

export function FilterBar({ children, onClear, showClear }) {
  return (
    <div className="adt-filter-bar val-filter-bar">
      {children}
      {showClear ? (
        <Button tone="ghost" size="sm" onClick={onClear}>
          Clear filters
        </Button>
      ) : null}
    </div>
  );
}

export function VarianceBadge({ value, percentage }) {
  const tone = percentage == null ? "neutral" : Number(percentage) > 0 ? "up" : Number(percentage) < 0 ? "down" : "neutral";
  return (
    <span className={`val-variance val-variance--${tone}`}>
      {percentage != null ? `${Number(percentage) > 0 ? "+" : ""}${percentage}%` : "—"}
      {value != null ? <span className="val-variance-amt"> ({Number(value).toLocaleString()})</span> : null}
    </span>
  );
}

export function Timeline({ items, emptyLabel = "No entries yet." }) {
  if (!items?.length) {
    return <p className="val-timeline-empty">{emptyLabel}</p>;
  }
  return (
    <ol className="val-timeline">
      {items.map((item) => (
        <li key={item.id} className="val-timeline-item">
          <div className="val-timeline-dot" aria-hidden="true" />
          <div className="val-timeline-content">
            <div className="val-timeline-meta">{item.meta}</div>
            <div className="val-timeline-title">{item.title}</div>
            {item.detail ? <div className="val-timeline-detail">{item.detail}</div> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function ReportTabs({ items, active, onChange }) {
  return (
    <div className="val-report-tabs" role="tablist">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={active === item.id}
          className={`val-report-tab${active === item.id ? " val-report-tab--active" : ""}`}
          onClick={() => onChange(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export { THEME };
