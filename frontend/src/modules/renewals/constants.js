export const POLICY_STATUSES = ["Active", "Renewed", "Lapsed", "Cancelled"];
export const PIPELINE_STAGES = ["Not contacted", "Quoted", "Awaiting payment", "Extended", "Bound", "Lost"];
export const FOLLOW_UP_METHODS = ["Call", "Visit", "Email", "SMS", "WhatsApp", "Note"];
export const MILESTONES = [60, 30, 15, 7, 1];

export const STATUS_BADGE_STYLES = {
  Active: { bg: "#ECFDF5", border: "#10B981", text: "#047857" },
  Renewed: { bg: "#EFF6FF", border: "#3B82F6", text: "#1D4ED8" },
  Lapsed: { bg: "#FEE2E2", border: "#EF4444", text: "#B91C1C" },
  Cancelled: { bg: "#F1F5F9", border: "#64748B", text: "#334155" },
};

export const PIPELINE_STYLES = {
  "Not contacted": { bg: "#F8FAFC", border: "#94A3B8", text: "#334155" },
  Quoted: { bg: "#EFF6FF", border: "#3B82F6", text: "#1D4ED8" },
  "Awaiting payment": { bg: "#FEF3C7", border: "#F59E0B", text: "#B45309" },
  Extended: { bg: "#F5F3FF", border: "#8B5CF6", text: "#6D28D9" },
  Bound: { bg: "#ECFDF5", border: "#10B981", text: "#047857" },
  Lost: { bg: "#FEE2E2", border: "#EF4444", text: "#B91C1C" },
};

export const LOG_STATUS_STYLES = {
  sent: { bg: "#ECFDF5", border: "#10B981", text: "#047857" },
  delivered: { bg: "#ECFDF5", border: "#059669", text: "#047857" },
  failed: { bg: "#FEE2E2", border: "#EF4444", text: "#B91C1C" },
  skipped: { bg: "#FEF3C7", border: "#F59E0B", text: "#B45309" },
  undelivered: { bg: "#FEE2E2", border: "#EF4444", text: "#B91C1C" },
};

export function canViewRenewals(role) {
  return ["Admin", "Claims Officer", "Operations Team", "Management", "Read-Only"].includes(role);
}

export function canEditRenewals(role) {
  return ["Admin", "Claims Officer", "Operations Team"].includes(role);
}

export function canManageRenewalSettings(role) {
  return role === "Admin";
}

export const KPI_FILTER_LABELS = {
  today: "Due today",
  t60: "Due in 31–60 days",
  t30: "Due in 16–30 days",
  t15: "Due in 0–15 days",
  later: "Due in 61+ days",
  overdue: "Overdue / expired",
};

export function isDayCount(value) {
  return Number.isFinite(value);
}

export function daysUntilTone(days) {
  if (days == null) return "neutral";
  if (days < 0) return "danger";
  if (days <= 15) return "danger";
  if (days <= 30) return "warn";
  if (days <= 60) return "info";
  return "ok";
}

export function daysUntilLabel(days) {
  if (days == null) return "—";
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return "Due today";
  return `${days}d`;
}

/** Reminder log milestone: standard T-60… or Extended weekly Ext+0d / Ext+7d… */
export function formatMilestoneLabel(milestone) {
  if (milestone == null || milestone === "") return "—";
  const n = Number(milestone);
  if (!Number.isFinite(n)) return String(milestone);
  if (n <= 0) return `Ext+${Math.abs(n)}d`;
  return `T-${n}`;
}

export function formatKes(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0) return "—";
  return `KES ${n.toLocaleString("en-KE", { maximumFractionDigits: 0 })}`;
}
