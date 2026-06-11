export const THEME = {
  brandBlue: "#0078c8",
  brandGreen: "#72bf44",
  textMuted: "#64748b",
};

export const VALUATION_STATUSES = [
  "Pending Appointment",
  "Valuation Requested",
  "Pending Logbook",
  "Pending Valuation Letter",
  "Appointment Scheduled",
  "Awaiting Inspection",
  "Valuation Report Received",
  "Insured Uncooperative",
  "Follow-up Required",
  "Overdue",
  "Closed",
];

export const FOLLOW_UP_STATUSES = new Set([
  "Follow-up Required",
  "Insured Uncooperative",
  "Pending Logbook",
  "Pending Valuation Letter",
  "Overdue",
]);

export const FOLLOW_UP_METHODS = ["Call", "Email", "Visit"];

export const STATUS_BADGE_STYLES = {
  "Pending Appointment": { bg: "#F1F5F9", border: "#94A3B8", text: "#475569" },
  "Valuation Requested": { bg: "#EFF6FF", border: "#3B82F6", text: "#1D4ED8" },
  "Pending Logbook": { bg: "#FEF3C7", border: "#F59E0B", text: "#B45309" },
  "Pending Valuation Letter": { bg: "#FEF3C7", border: "#F59E0B", text: "#B45309" },
  "Appointment Scheduled": { bg: "#E0F2FE", border: "#0EA5E9", text: "#0369A1" },
  "Awaiting Inspection": { bg: "#E0F2FE", border: "#0EA5E9", text: "#0369A1" },
  "Valuation Report Received": { bg: "#ECFDF5", border: "#10B981", text: "#047857" },
  "Insured Uncooperative": { bg: "#FEE2E2", border: "#EF4444", text: "#B91C1C" },
  "Follow-up Required": { bg: "#FFF7ED", border: "#F97316", text: "#C2410C" },
  Overdue: { bg: "#FEE2E2", border: "#DC2626", text: "#991B1B" },
  Closed: { bg: "#F1F5F9", border: "#64748B", text: "#334155" },
};

export function canEditValuations(role) {
  return ["Admin", "Claims Officer", "Operations Team"].includes(role);
}

export function canManageValuers(role) {
  return role === "Admin";
}
