import axios from "axios";

/** Local dev: Vite proxies `/api`. Production (e.g. Vercel): set `VITE_API_BASE_URL` to your API origin + `/api`. */
const baseURL =
  (import.meta.env.VITE_API_BASE_URL && String(import.meta.env.VITE_API_BASE_URL).replace(/\/$/, "")) ||
  "/api";

const client = axios.create({
  baseURL,
});

client.interceptors.request.use((config) => {
  const token = localStorage.getItem("claims_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default client;
