/** Strip detail-only fields before storing a valuation in the list cache. */
export function valuationForList(detail) {
  if (!detail) return detail;
  const { followUps, statusHistory, auditLogs, ...list } = detail;
  return list;
}
