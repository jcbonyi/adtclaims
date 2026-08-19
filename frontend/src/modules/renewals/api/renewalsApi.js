import client from "../../../api/client";

export async function fetchRenewals(params) {
  const res = await client.get("/renewals", { params });
  return res.data;
}

export async function fetchRenewal(id) {
  const res = await client.get(`/renewals/${id}`);
  return res.data;
}

export async function createRenewal(payload) {
  const res = await client.post("/renewals", payload);
  return res.data;
}

export async function updateRenewal(id, payload) {
  const res = await client.put(`/renewals/${id}`, payload);
  return res.data;
}

export async function deleteRenewal(id) {
  const res = await client.delete(`/renewals/${id}`);
  return res.data;
}

export async function fetchRenewalsDashboard() {
  const res = await client.get("/renewals/dashboard");
  return res.data;
}

export async function fetchRenewalSettings() {
  const res = await client.get("/renewals/settings");
  return res.data;
}

export async function updateRenewalSettings(payload) {
  const res = await client.put("/renewals/settings", payload);
  return res.data;
}

export async function fetchFinanciers() {
  const res = await client.get("/renewals/financiers");
  return res.data;
}

export async function createFinancier(payload) {
  const res = await client.post("/renewals/financiers", payload);
  return res.data;
}

export async function updateFinancier(id, payload) {
  const res = await client.put(`/renewals/financiers/${id}`, payload);
  return res.data;
}

export async function deleteFinancier(id) {
  const res = await client.delete(`/renewals/financiers/${id}`);
  return res.data;
}

export async function fetchNotifications(params) {
  const res = await client.get("/renewals/notifications", { params });
  return res.data;
}

export async function retryNotification(id) {
  const res = await client.post(`/renewals/notifications/${id}/retry`);
  return res.data;
}

export async function ackNotification(id) {
  const res = await client.post(`/renewals/notifications/${id}/ack`);
  return res.data;
}

export async function runReminders(force = false) {
  const res = await client.post("/renewals/run-reminders", { force });
  return res.data;
}

export async function sendTestEmail(email) {
  const res = await client.post("/renewals/notifications/test-email", { email });
  return res.data;
}

export async function sendTestSms(phone) {
  const res = await client.post("/renewals/notifications/test-sms", { phone });
  return res.data;
}

export async function importRenewalsExcel(file) {
  const form = new FormData();
  form.append("file", file);
  const res = await client.post("/renewals/import-excel", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data;
}

export async function clearRenewalRegister() {
  const res = await client.delete("/renewals");
  return res.data;
}

function downloadBlob(res, filename) {
  const blob = new Blob([res.data], { type: res.headers["content-type"] || "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function downloadRenewalsExcel(params) {
  const res = await client.get("/renewals/export.xlsx", { params, responseType: "blob" });
  downloadBlob(res, "ADT-renewals.xlsx");
}

export async function downloadRenewalsTemplate() {
  const res = await client.get("/renewals/template.xlsx", { responseType: "blob" });
  downloadBlob(res, "ADT-renewals-import-template.xlsx");
}
