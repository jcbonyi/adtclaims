/** Helpers for pending-document checklists (definitions loaded from GET /api/meta). */

export function resolveChecklistKey(claimType, nonMotorCategory) {
  if (claimType === "MOTOR") return "MOTOR";
  if (nonMotorCategory === "WIBA") return "WIBA";
  return "OTHER_NON_MOTOR";
}

export function getChecklistItems(checklists, claimType, nonMotorCategory) {
  if (!checklists) return [];
  const key = resolveChecklistKey(claimType, nonMotorCategory);
  return checklists[key]?.items || [];
}

export function normalizeReceivedKeys(checklists, claimType, nonMotorCategory, receivedKeys) {
  const valid = new Set(getChecklistItems(checklists, claimType, nonMotorCategory).map((i) => i.key));
  const keys = Array.isArray(receivedKeys) ? receivedKeys : [];
  return keys.filter((k) => valid.has(k));
}

export function getOutstandingLabels(checklists, claimType, nonMotorCategory, receivedKeys) {
  const received = new Set(normalizeReceivedKeys(checklists, claimType, nonMotorCategory, receivedKeys));
  return getChecklistItems(checklists, claimType, nonMotorCategory)
    .filter((item) => !received.has(item.key))
    .map((item) => item.label);
}
