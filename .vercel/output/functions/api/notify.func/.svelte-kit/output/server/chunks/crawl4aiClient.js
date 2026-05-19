import { b as private_env } from "./shared-server.js";
function baseUrl() {
  return String(private_env.CRAWL4AI_SERVICE_URL || "").trim().replace(/\/+$/, "");
}
function crawl4aiConfigured() {
  return Boolean(baseUrl());
}
async function crawl4aiFetch(path, init = {}) {
  const base = baseUrl();
  if (!base) return null;
  const secret = String(private_env.CRAWL4AI_SERVICE_SECRET || "").trim();
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
  const headers = new Headers(
    /** @type {any} */
    init.headers || {}
  );
  if (secret) headers.set("X-Crawl4AI-Secret", secret);
  const timeoutMs = Number(private_env.CRAWL4AI_FETCH_TIMEOUT_MS || "120000") || 12e4;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      headers,
      signal: ac.signal
    });
  } finally {
    clearTimeout(timer);
  }
}
export {
  crawl4aiFetch as a,
  crawl4aiConfigured as c
};
