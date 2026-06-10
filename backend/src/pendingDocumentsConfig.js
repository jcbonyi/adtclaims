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
      { key: "dosh_form_part_1_2", label: "Dosh form part I&II" },
      { key: "executed_claim_form", label: "Executed claim form" },
      { key: "dosh_wiba_4", label: "DOSH/WIBA 4" },
      { key: "police_abstract", label: "Police abstract for road accident/assault" },
      {
        key: "claimant_statement",
        label: "Claimant's detailed statement on the circumstances of the loss",
      },
      { key: "witness_statement", label: "Witness statement" },
      { key: "medical_reports", label: "Medical reports" },
      {
        key: "payslips_3_months",
        label: "Three months' pay slips prior to the loss (certified)",
      },
      { key: "medical_receipts", label: "Original medical receipts/bills" },
      { key: "claimant_id", label: "Copy of the claimants ID (both sides)" },
      { key: "employment_contract", label: "Employment contract" },
      { key: "sick_off_sheets", label: "Hospital sick off sheets in relation to the claim" },
      {
        key: "discharge_summary",
        label: "Discharge summary if admitted, treatment notes",
      },
      {
        key: "any_other",
        label: "Any other relevant documents related to this claim",
        freeText: true,
      },
    ],
    fatalItemsLabel: "Additional documents for fatal injuries",
    fatalItems: [
      { key: "dosh_wiba_6", label: "DOSH WIBA 6 (certificate of dependency)" },
      { key: "death_certificate", label: "Copy of death certificate" },
      { key: "certificate_return_id", label: "Certificate of return of ID" },
      { key: "postmortem_report", label: "Copy of postmortem report" },
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

function shouldIncludeFatalWibaItems(claimType, nonMotorCategory, wibaFatalInjury) {
  return claimType === "NON-MOTOR" && nonMotorCategory === "WIBA" && !!wibaFatalInjury;
}

function getChecklistItems(claimType, nonMotorCategory, wibaFatalInjury = false) {
  const def = getChecklistDefinition(claimType, nonMotorCategory);
  const items = [...(def.items || [])];
  if (shouldIncludeFatalWibaItems(claimType, nonMotorCategory, wibaFatalInjury)) {
    items.push(...(def.fatalItems || []));
  }
  return items;
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

function normalizeReceivedKeys(claimType, nonMotorCategory, receivedKeys, wibaFatalInjury = false) {
  const valid = new Set(
    getChecklistItems(claimType, nonMotorCategory, wibaFatalInjury).map((i) => i.key)
  );
  return parseReceivedKeys(receivedKeys).filter((k) => valid.has(k));
}

function getItemOutstandingLabel(item, pendingDocsOther) {
  if (item.freeText) {
    const text = String(pendingDocsOther || "").trim();
    return text || item.label;
  }
  return item.label;
}

function getOutstandingDocuments(
  claimType,
  nonMotorCategory,
  receivedKeys,
  pendingDocsOther = "",
  wibaFatalInjury = false
) {
  const received = new Set(
    normalizeReceivedKeys(claimType, nonMotorCategory, receivedKeys, wibaFatalInjury)
  );
  return getChecklistItems(claimType, nonMotorCategory, wibaFatalInjury)
    .filter((item) => !received.has(item.key))
    .map((item) => getItemOutstandingLabel(item, pendingDocsOther));
}

function formatOutstandingForExport(
  claimType,
  nonMotorCategory,
  receivedKeys,
  claimStatus,
  pendingDocsOther = "",
  wibaFatalInjury = false
) {
  if (claimStatus !== "Pending Documents") return "";
  const outstanding = getOutstandingDocuments(
    claimType,
    nonMotorCategory,
    receivedKeys,
    pendingDocsOther,
    wibaFatalInjury
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
