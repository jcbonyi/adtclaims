import { memo } from "react";
import { STATUS_BADGE_STYLES } from "../constants";

export const StatusBadge = memo(function StatusBadge({ status }) {
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
});
