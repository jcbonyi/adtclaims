/**
 * Claim statuses grouped by workflow stage (intake → investigation → … → closed).
 * CLAIM_STATUSES is the flattened list used for validation and filters.
 */
export const CLAIM_STATUS_GROUPS = [
  {
    label: "1. Intake & notification",
    statuses: ["Reported", "Not Reported", "Undocumented"],
  },
  {
    label: "2. Investigation & assessment",
    statuses: [
      "Under Investigation",
      "Awaiting Assessment",
      "Assessment Completed",
      "Cause of Loss Confirmed",
      "Liability Under Review",
      "Coverage Under Review",
      "Under Review",
    ],
  },
  {
    label: "3. Surveys & technical reports",
    statuses: [
      "Awaiting Survey",
      "Survey Completed",
      "Awaiting Survey Report",
      "Survey Report Received",
      "Awaiting Adjuster Report",
      "Adjuster Report Received",
    ],
  },
  {
    label: "4. Documents & information",
    statuses: [
      "Pending Documents",
      "Documents Received",
      "Documents Verified",
      "Pending Clarification",
      "Pending Supplementary",
      "Pending Beneficiary Documents (Life Claims)",
      "Pending Medical Reports",
      "Pending Police Abstract",
      "Pending Original Documents",
    ],
  },
  {
    label: "5. Repair, release & reinstatement",
    statuses: [
      "Under Repair",
      "Repairs Completed",
      "Awaiting Re-Inspection",
      "Re-Inspection Completed",
      "Pending RA",
      "RA Issued",
      "Pending LPO",
      "LPO Issued",
      "Released",
      "Cargo Released",
      "Awaiting Reinstatement",
      "Reinstated",
    ],
  },
  {
    label: "6. Payment & settlement",
    statuses: [
      "Payment Processing",
      "Payment Authorized",
      "Payment Released",
      "Partially Paid",
      "Paid",
      "Pending CIL Payments",
      "Settlement Negotiation",
      "Ex-Gratia Approved",
      "Ex-Gratia Paid",
    ],
  },
  {
    label: "7. Disputes & legal",
    statuses: [
      "DV Disputed",
      "Under Appeal",
      "Arbitration",
      "Litigation",
      "Court Matter Pending",
      "Court Award Issued",
      "Settled out of Court",
    ],
  },
  {
    label: "8. Marine & general average",
    statuses: ["General Average Declared", "General Average Settled"],
  },
  {
    label: "9. Closed & final outcomes",
    statuses: [
      "Closed",
      "Closed Without Payment",
      "Closed With Payment",
      "Repudiated",
      "Declined",
      "Withdrawn",
      "Duplicate Claim",
      "Time Barred",
    ],
  },
  {
    label: "10. WIBA (Work Injury Benefits)",
    statuses: [
      "Registered",
      "Under Treatment",
      "Awaiting Medical Assessment",
      "Disability Assessment",
      "Pending Compensation Assessment",
      "Pending DOSHS Award",
      "Compensation Approved",
      "Pending Payment",
      "Disputed",
    ],
  },
  {
    label: "11. Other",
    statuses: ["Other"],
  },
];

export const CLAIM_STATUSES = CLAIM_STATUS_GROUPS.flatMap((group) => group.statuses);

/** Statuses that count as closed for lifecycle filters, dashboards, and closure date. */
export const CLOSED_STATUSES = [
  "Closed",
  "Closed Without Payment",
  "Closed With Payment",
  "Repudiated",
  "Declined",
  "Paid",
  "Withdrawn",
  "Duplicate Claim",
  "Time Barred",
  "Ex-Gratia Paid",
  "General Average Settled",
];

export const AGING_BUCKETS = ["0-7", "8-14", "15-30", "30+"];
