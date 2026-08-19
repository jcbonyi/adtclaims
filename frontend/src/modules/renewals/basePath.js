export const RENEWALS_MODULE_BASE = "/renewals";

export function renewalsPath(segment = "") {
  const normalized = String(segment).replace(/^\//, "");
  return normalized ? `${RENEWALS_MODULE_BASE}/${normalized}` : RENEWALS_MODULE_BASE;
}
