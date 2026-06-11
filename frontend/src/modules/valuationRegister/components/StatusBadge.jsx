import { STATUS_BADGE_STYLES } from "../constants";

export function StatusBadge({ status }) {
  const style = STATUS_BADGE_STYLES[status] || STATUS_BADGE_STYLES["Pending Appointment"];
  return (
    <span
      className="adt-status-badge"
      style={{
        background: style.bg,
        borderColor: style.border,
        color: style.text,
      }}
    >
      {status}
    </span>
  );
}
