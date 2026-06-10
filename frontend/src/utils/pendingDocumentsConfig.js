/** Helpers for pending-document checklists (definitions loaded from GET /api/meta). */

export function resolveChecklistKey(claimType, nonMotorCategory) {
  if (claimType === "MOTOR") return "MOTOR";
  if (nonMotorCategory === "WIBA") return "WIBA";
  return "OTHER_NON_MOTOR";
}

function shouldIncludeFatalWibaItems(claimType, nonMotorCategory, wibaFatalInjury) {
  return claimType === "NON-MOTOR" && nonMotorCategory === "WIBA" && !!wibaFatalInjury;
}

export function getChecklistItems(checklists, claimType, nonMotorCategory, wibaFatalInjury = false) {
  if (!checklists) return [];
  const key = resolveChecklistKey(claimType, nonMotorCategory);
  const checklist = checklists[key];
  if (!checklist) return [];
  const items = [...(checklist.items || [])];
  if (shouldIncludeFatalWibaItems(claimType, nonMotorCategory, wibaFatalInjury)) {
    items.push(...(checklist.fatalItems || []));
  }
  return items;
}

export function normalizeReceivedKeys(
  checklists,
  claimType,
  nonMotorCategory,
  receivedKeys,
  wibaFatalInjury = false
) {
  const valid = new Set(
    getChecklistItems(checklists, claimType, nonMotorCategory, wibaFatalInjury).map((i) => i.key)
  );
  const keys = Array.isArray(receivedKeys) ? receivedKeys : [];
  return keys.filter((k) => valid.has(k));
}

export function getItemOutstandingLabel(item, otherText) {
  if (item.freeText) {
    const text = String(otherText || "").trim();
    return text || item.label;
  }
  return item.label;
}

export function getOutstandingLabels(
  checklists,
  claimType,
  nonMotorCategory,
  receivedKeys,
  otherText = "",
  wibaFatalInjury = false
) {
  const received = new Set(
    normalizeReceivedKeys(checklists, claimType, nonMotorCategory, receivedKeys, wibaFatalInjury)
  );
  return getChecklistItems(checklists, claimType, nonMotorCategory, wibaFatalInjury)
    .filter((item) => !received.has(item.key))
    .map((item) => getItemOutstandingLabel(item, otherText));
}
