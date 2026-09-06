import axios from "axios";

/**
 * Resolve API base for axios.
 * - Local Vite: `/api` (proxied to Express)
 * - Vercel (services rewrites): `/api` → backend service
 * - Override: VITE_API_BASE_URL (no trailing slash)
 */
function resolveApiBase() {
  const configured = String(import.meta.env.VITE_API_BASE_URL || "")
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/\/$/, "");
  if (configured) {
    // Legacy absolute URL that pointed at the old experimentalServices prefix
    if (/\/_\/backend\/api$/i.test(configured)) return "/api";
    return configured;
  }
  return "/api";
}

const baseURL = resolveApiBase();

const client = axios.create({
  baseURL,
  timeout: 25000,
});

client.interceptors.request.use((config) => {
  const token = localStorage.getItem("claims_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export function getApiBaseUrl() {
  return baseURL;
}

export default client;
