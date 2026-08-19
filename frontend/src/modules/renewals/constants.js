export const POLICY_STATUSES = ["Active", "Renewed", "Lapsed", "Cancelled"];
export const MILESTONES = [60, 30, 15];

export const STATUS_BADGE_STYLES = {
  Active: { bg: "#ECFDF5", border: "#10B981", text: "#047857" },
  Renewed: { bg: "#EFF6FF", border: "#3B82F6", text: "#1D4ED8" },
  Lapsed: { bg: "#FEE2E2", border: "#EF4444", text: "#B91C1C" },
  Cancelled: { bg: "#F1F5F9", border: "#64748B", text: "#334155" },
};

export const LOG_STATUS_STYLES = {
  sent: { bg: "#ECFDF5", border: "#10B981", text: "#047857" },
  failed: { bg: "#FEE2E2", border: "#EF4444", text: "#B91C1C" },
  skipped: { bg: "#FEF3C7", border: "#F59E0B", text: "#B45309" },
};

export function canEditRenewals(role) {
  return ["Admin", "Claims Officer", "Operations Team"].includes(role);
}

export function canManageRenewalSettings(role) {
  return role === "Admin";
}

export const KPI_FILTER_LABELS = {
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
