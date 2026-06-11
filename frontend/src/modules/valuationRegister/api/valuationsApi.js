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

function downloadBlob(res, filename) {
  const contentType = res.headers["content-type"] || "";
  if (res.status !== 200) {
    throw new Error("Download failed");
  }
  if (filename.endsWith(".xlsx") && !contentType.includes("spreadsheetml") && !contentType.includes("octet-stream")) {
    throw new Error("Server did not return an Excel file");
  }
  const blob = new Blob([res.data], { type: contentType || "application/octet-stream" });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

export async function downloadValuationsExcel(params = {}) {
  const res = await client.get("/valuations-export.xlsx", {
    responseType: "blob",
    params,
  });
  downloadBlob(res, "ADT-motor-valuations.xlsx");
}

export async function downloadValuationsCsv(params = {}) {
  const res = await client.get("/valuations-export.csv", {
    responseType: "blob",
    params,
  });
  downloadBlob(res, "ADT-motor-valuations.csv");
}

export async function downloadValuationsTemplate() {
  const res = await client.get("/valuations-export-template.xlsx", {
    responseType: "blob",
  });
  downloadBlob(res, "ADT-motor-valuations-template.xlsx");
}

export async function importValuationsExcel(file) {
  const formData = new FormData();
  formData.append("file", file);
  const res = await client.post("/valuations/import-excel", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data;
}
