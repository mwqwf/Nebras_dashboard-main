import { g as getFirebaseAuth } from "./client2.js";
import { getIdToken } from "firebase/auth";
const API_BASE = "http://localhost:8000";
async function getAuthHeaderValue() {
  try {
    const auth = getFirebaseAuth();
    if (!auth?.currentUser) return null;
    const token = await getIdToken(auth.currentUser, false);
    return token ? `Bearer ${token}` : null;
  } catch {
    return null;
  }
}
async function apiRequest(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const isFormData = options.body instanceof FormData;
  const headers = {
    ...isFormData ? {} : { "Content-Type": "application/json" },
    ...options.headers
  };
  const authHeader = await getAuthHeaderValue();
  if (authHeader) headers["Authorization"] = authHeader;
  return fetch(url, { ...options, headers, credentials: "include" });
}
async function apiGet(endpoint) {
  return apiRequest(endpoint, { method: "GET" });
}
async function listModerators({ search = "", page = 1, is_active, is_staff } = {}) {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (page > 1) params.set("page", String(page));
  if (is_active !== void 0 && is_active !== "") params.set("is_active", String(is_active));
  if (is_staff !== void 0 && is_staff !== "") params.set("is_staff", String(is_staff));
  const query = params.toString();
  const endpoint = `/api/admin/moderators/${query ? `?${query}` : ""}`;
  const res = await apiGet(endpoint);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to fetch moderators");
  }
  return res.json();
}
async function listBans({ user, is_banned, search = "", page = 1 } = {}) {
  const params = new URLSearchParams();
  if (user !== void 0 && user !== "") params.set("user", String(user));
  if (is_banned !== void 0 && is_banned !== "") params.set("is_banned", String(is_banned));
  if (search) params.set("search", search);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  const endpoint = `/api/admin/bans/${query ? `?${query}` : ""}`;
  const res = await apiGet(endpoint);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to fetch bans");
  }
  return res.json();
}
export {
  listModerators as a,
  listBans as l
};
