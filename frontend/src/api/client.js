import axios from "axios";

/** Local / same-origin: `/api`. Combined Vercel services: `/_/backend/api` unless VITE_API_BASE_URL is set. */
function resolveApiBase() {
  const configured =
    import.meta.env.VITE_API_BASE_URL && String(import.meta.env.VITE_API_BASE_URL).replace(/\/$/, "");
  if (configured) return configured;
  if (typeof window !== "undefined" && window.location.hostname.endsWith(".vercel.app")) {
    return "/_/backend/api";
  }
  return "/api";
}

const baseURL = resolveApiBase();

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
