import axios from "axios";

/**
 * Resolve API base for axios.
 * - Local Vite: `/api` (proxied to Express)
 * - Vercel services (any domain): `/_/backend/api`
 * - Override: VITE_API_BASE_URL (absolute or relative, no trailing slash)
 */
function resolveApiBase() {
  const configured = String(import.meta.env.VITE_API_BASE_URL || "")
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/\/$/, "");
  if (configured) return configured;

  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (host.endsWith(".vercel.app") || host.includes("adtclaims") || import.meta.env.PROD) {
      return "/_/backend/api";
    }
  }

  if (import.meta.env.PROD) return "/_/backend/api";
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
