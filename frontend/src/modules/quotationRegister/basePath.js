/** Base path when quotation register runs as an extension inside the claims app. */
export const QUOTATION_MODULE_BASE = "/quotations";

export function quotationPath(segment = "") {
  const normalized = String(segment).replace(/^\//, "");
  return normalized ? `${QUOTATION_MODULE_BASE}/${normalized}` : QUOTATION_MODULE_BASE;
}
