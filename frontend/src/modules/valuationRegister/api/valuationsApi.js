import client from "../../../api/client";

export async function fetchValuations(params) {
  const res = await client.get("/valuations", { params });
  return res.data;
}

export async function fetchValuation(id) {
  const res = await client.get(`/valuations/${id}`);
  return res.data;
}

export async function createValuation(payload) {
  const res = await client.post("/valuations", payload);
  return res.data;
}

export async function updateValuation(id, payload) {
  const res = await client.put(`/valuations/${id}`, payload);
  return res.data;
}

export async function updateValuationStatus(id, status) {
  const res = await client.post(`/valuations/${id}/status`, { status });
  return res.data;
}

export async function logValuationFollowUp(id, payload) {
  const res = await client.post(`/valuations/${id}/follow-up`, payload);
  return res.data;
}

export async function fetchDashboard() {
  const res = await client.get("/valuations/dashboard/overall");
  return res.data;
}

export async function fetchKpiDetail(kpi, params) {
  const res = await client.get("/valuations/dashboard/kpi-detail", {
    params: { kpi, ...params },
  });
  return res.data;
}

export async function fetchReport(type) {
  const res = await client.get(`/valuations/reports/${type}`);
  return res.data;
}

export async function fetchValuers() {
  const res = await client.get("/valuers");
  return res.data;
}

export async function createValuer(payload) {
  const res = await client.post("/valuers", payload);
  return res.data;
}

export async function updateValuer(id, payload) {
  const res = await client.put(`/valuers/${id}`, payload);
  return res.data;
}

export async function prefillFromQuotation(quotationId) {
  const res = await client.post(`/valuations/from-quotation/${quotationId}`);
  return res.data;
}

export async function prefillFromClaim(claimId) {
  const res = await client.post(`/valuations/from-claim/${claimId}`);
  return res.data;
}

export function exportValuationsUrl(format, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const base = client.defaults.baseURL || "/api";
  const path = format === "csv" ? "/valuations-export.csv" : "/valuations-export.xlsx";
  return `${base}${path}${qs ? `?${qs}` : ""}`;
}
