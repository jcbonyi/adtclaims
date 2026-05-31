import { THEME } from '../constants'

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="adt-page-header">
      <div>
        <h1>{title}</h1>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {actions ? <div className="adt-page-header-actions">{actions}</div> : null}
    </div>
  )
}

export function Card({ children, style, className = '', hover = false }) {
  return (
    <div
      className={`adt-card${hover ? ' adt-card--hover' : ''}${className ? ` ${className}` : ''}`}
      style={style}
    >
      {children}
    </div>
  )
}

export function CardTitle({ children }) {
  return <h3 className="adt-card-header">{children}</h3>
}

export function KpiCard({ label, value, sub, accent = THEME.brandBlue }) {
  return (
    <div className="adt-kpi" style={{ '--kpi-accent': accent }}>
      <div className="adt-kpi-label">{label}</div>
      <div className="adt-kpi-value">{value}</div>
      {sub != null ? <div className="adt-kpi-sub">{sub}</div> : null}
    </div>
  )
}

export function KpiRow({ children }) {
  return <div className="adt-kpi-row">{children}</div>
}

export function Button({
  children,
  type = 'button',
  tone = 'secondary',
  onClick,
  className = '',
  style,
  ...rest
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      className={`adt-btn adt-btn--${tone}${className ? ` ${className}` : ''}`}
      style={style}
      {...rest}
    >
      {children}
    </button>
  )
}

export function LinkButton({ children, onClick, className = '', style }) {
  return (
    <button type="button" onClick={onClick} className={`adt-link-btn${className ? ` ${className}` : ''}`} style={style}>
      {children}
    </button>
  )
}

export function EmptyState({ children }) {
  return <div className="adt-table-empty">{children}</div>
}
