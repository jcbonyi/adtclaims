import client from "../../../api/client";

export async function fetchQuotations() {
  const res = await client.get("/quotations");
  return res.data;
}

export async function createQuotation(payload) {
  const res = await client.post("/quotations", payload);
  return res.data;
}

export async function updateQuotation(id, patch) {
  const res = await client.put(`/quotations/${id}`, patch);
  return res.data;
}

export async function deleteQuotation(id) {
  await client.delete(`/quotations/${id}`);
}

export async function logFollowUp(id, { date, note }) {
  const res = await client.post(`/quotations/${id}/follow-up`, { date, note });
  return res.data;
}

export async function importQuotations(quotations) {
  const res = await client.post("/quotations/import", { quotations });
  return res.data;
}
