import { memo } from "react";
import { LOG_STATUS_STYLES, PIPELINE_STYLES, STATUS_BADGE_STYLES } from "../constants";

export const StatusBadge = memo(function StatusBadge({ status }) {
  const style = STATUS_BADGE_STYLES[status] || STATUS_BADGE_STYLES.Active;
  return (
    <span
      className="adt-status-badge"
      style={{ background: style.bg, borderColor: style.border, color: style.text }}
    >
      {status}
    </span>
  );
});

export const PipelineBadge = memo(function PipelineBadge({ stage }) {
  const style = PIPELINE_STYLES[stage] || PIPELINE_STYLES["Not contacted"];
  return (
    <span
      className="adt-status-badge"
      style={{ background: style.bg, borderColor: style.border, color: style.text }}
    >
      {stage || "Not contacted"}
    </span>
  );
});

export const LogStatusBadge = memo(function LogStatusBadge({ status }) {
  const style = LOG_STATUS_STYLES[status] || LOG_STATUS_STYLES.skipped;
  return (
    <span
      className="adt-status-badge"
      style={{ background: style.bg, borderColor: style.border, color: style.text }}
    >
      {status}
    </span>
  );
});
