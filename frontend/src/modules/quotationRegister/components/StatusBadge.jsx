import { DEFAULT_STATUS_STYLE, STATUS_BADGE_STYLES } from '../constants'

export function StatusBadge({ status }) {
  const s = STATUS_BADGE_STYLES[status] ?? DEFAULT_STATUS_STYLE
  return (
    <span
      className="adt-badge"
      style={{
        backgroundColor: s.bg,
        color: s.text,
        border: `1px solid ${s.border}`,
      }}
    >
      {status}
    </span>
  )
}
