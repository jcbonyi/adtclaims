export const VALUATION_MODULE_BASE = "/valuations";

export function valuationPath(segment = "") {
  const normalized = String(segment).replace(/^\//, "");
  return normalized ? `${VALUATION_MODULE_BASE}/${normalized}` : VALUATION_MODULE_BASE;
}
