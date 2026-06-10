/**
 * ADT pending-document checklists — edit labels/keys here; no database migration needed.
 * Restart backend after changes. Frontend loads this via GET /api/meta.
 */
const PENDING_DOCUMENT_CHECKLISTS = {
  MOTOR: {
    label: "Motor claim — required documents",
    items: [
      { key: "signed_claim_form", label: "Signed Claim Form" },
      { key: "logbook", label: "Copy of vehicle logbook" },
      { key: "driving_licence", label: "Copy of driver's valid driving licence" },
      { key: "driver_id", label: "Copy of Driver's national ID / passport" },
      { key: "police_abstract", label: "Police abstract (ATI)" },
      { key: "accident_photos", label: "Accident photographs (all angles)" },
      { key: "any_other", label: "Any Other", freeText: true },
    ],
  },
  WIBA: {
    label: "WIBA claim — required documents",
    items: [
      { key: "wiba_claim_form", label: "WIBA claim notification form (signed)" },
      { key: "wiba_policy", label: "WIBA policy schedule / endorsement" },
      { key: "p3_medical", label: "P3 / medical assessment form (DOSH) (Dosh 1)" },
      { key: "employer_accident_report", label: "Employer report of accident (DOSH) (Dosh 2)" },
      { key: "dosh_award", label: "DOSH compensation assessment / award (if issued) (Dosh 4)" },
      { key: "employee_id", label: "Employee national ID / passport copy" },
      { key: "payslips", label: "Payslips — last 3 months pre-injury" },
      { key: "nhif_nssf", label: "NHIF / NSSF contribution records" },
      { key: "medical_bills", label: "Hospital bills and medical receipts" },
      { key: "disability_assessment", label: "Disability assessment report (if applicable)" },
    ],
  },
  OTHER_NON_MOTOR: {
    label: "Other non-motor claim — required documents",
    items: [
      { key: "claim_form", label: "Non-motor claim notification form (signed)" },
      { key: "policy_schedule", label: "Policy schedule / certificate of insurance" },
      { key: "proof_of_loss", label: "Proof of loss / statement of claim" },
      { key: "incident_report", label: "Police, fire brigade, or incident report (if applicable)" },
      { key: "loss_photos", label: "Photographs or video of loss / damage" },
      { key: "repair_quotation", label: "Repair or replacement quotation" },
      { key: "invoices_proof", label: "Original invoices / proof of purchase or value" },
      { key: "surveyor_report", label: "Surveyor / adjuster report (if appointed)" },
      { key: "insured_documents", label: "Insured ID / company registration documents" },
      { key: "bank_details", label: "Bank details for settlement" },
    ],
  },
};

const NON_MOTOR_CATEGORIES = [
  { value: "WIBA", label: "WIBA (Work Injury Benefits Act)" },
  { value: "OTHER", label: "Other Non-Motor Claims" },
];

function resolveChecklistKey(claimType, nonMotorCategory) {
  if (claimType === "MOTOR") return "MOTOR";
  if (nonMotorCategory === "WIBA") return "WIBA";
  return "OTHER_NON_MOTOR";
}

function getChecklistDefinition(claimType, nonMotorCategory) {
  const key = resolveChecklistKey(claimType, nonMotorCategory);
  return { key, ...PENDING_DOCUMENT_CHECKLISTS[key] };
}

function getChecklistItems(claimType, nonMotorCategory) {
  return getChecklistDefinition(claimType, nonMotorCategory).items;
}

function parseReceivedKeys(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter((k) => typeof k === "string");
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter((k) => typeof k === "string") : [];
    } catch {
      return [];
    }
  }
  return [];
}

function normalizeReceivedKeys(claimType, nonMotorCategory, receivedKeys) {
  const valid = new Set(getChecklistItems(claimType, nonMotorCategory).map((i) => i.key));
  return parseReceivedKeys(receivedKeys).filter((k) => valid.has(k));
}

function getItemOutstandingLabel(item, pendingDocsOther) {
  if (item.freeText) {
    const text = String(pendingDocsOther || "").trim();
    return text || item.label;
  }
  return item.label;
}

function getOutstandingDocuments(claimType, nonMotorCategory, receivedKeys, pendingDocsOther = "") {
  const received = new Set(normalizeReceivedKeys(claimType, nonMotorCategory, receivedKeys));
  return getChecklistItems(claimType, nonMotorCategory)
    .filter((item) => !received.has(item.key))
    .map((item) => getItemOutstandingLabel(item, pendingDocsOther));
}

function formatOutstandingForExport(
  claimType,
  nonMotorCategory,
  receivedKeys,
  claimStatus,
  pendingDocsOther = ""
) {
  if (claimStatus !== "Pending Documents") return "";
  const outstanding = getOutstandingDocuments(
    claimType,
    nonMotorCategory,
    receivedKeys,
    pendingDocsOther
  );
  if (!outstanding.length) return "All documents received";
  return outstanding.map((label, index) => `${index + 1}. ${label}`).join("\n");
}

function getPendingDocumentsMeta() {
  return {
    checklists: PENDING_DOCUMENT_CHECKLISTS,
    nonMotorCategories: NON_MOTOR_CATEGORIES,
  };
}

module.exports = {
  PENDING_DOCUMENT_CHECKLISTS,
  NON_MOTOR_CATEGORIES,
  resolveChecklistKey,
  getChecklistDefinition,
  getChecklistItems,
  parseReceivedKeys,
  normalizeReceivedKeys,
  getItemOutstandingLabel,
  getOutstandingDocuments,
  formatOutstandingForExport,
  getPendingDocumentsMeta,
};
