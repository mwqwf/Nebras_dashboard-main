const SCRAPE_ENDPOINT = "https://archive.org/services/search/v1/scrape";
const USER_AGENT = "NebrasDashboard/1.0 (+self-hosted; contact: admin@nebras.local)";
const DEFAULT_FIELDS = Object.freeze([
  "identifier",
  "title",
  "creator",
  "mediatype",
  "collection",
  "language",
  "description",
  "subject",
  "date",
  "licenseurl",
  "rights"
]);
const MEDIATYPE_MAP = Object.freeze({
  document: "texts",
  audio: "audio",
  video: "movies"
});
function buildLuceneQuery(parts = {}) {
  const segments = [];
  const free = String(parts.q || "").trim();
  if (free) segments.push(`(${escapeLuceneFree(free)})`);
  const mediatypes = (parts.nebrasTypes || []).map((t) => MEDIATYPE_MAP[t]).filter(Boolean);
  if (mediatypes.length > 0) {
    segments.push(`mediatype:(${mediatypes.join(" OR ")})`);
  }
  const langs = (parts.languages || []).map(quoteField).filter(Boolean);
  if (langs.length > 0) segments.push(`language:(${langs.join(" OR ")})`);
  const cols = (parts.collections || []).map(quoteField).filter(Boolean);
  if (cols.length > 0) segments.push(`collection:(${cols.join(" OR ")})`);
  const creators = (parts.creators || []).map(quoteField).filter(Boolean);
  if (creators.length > 0) segments.push(`creator:(${creators.join(" OR ")})`);
  return segments.join(" AND ");
}
function escapeLuceneFree(s) {
  return String(s).replace(/[\\+\-!(){}\[\]^"~*?:\\/]/g, " ").replace(/\s+/g, " ").trim();
}
function quoteField(v) {
  const s = String(v || "").trim();
  if (!s) return "";
  if (/[\s"]/.test(s)) return `"${s.replace(/"/g, '\\"')}"`;
  return s;
}
async function scrapeOnePage({
  query,
  count = 100,
  cursor = null,
  fields = DEFAULT_FIELDS,
  sorts = ["publicdate desc"]
}) {
  if (!String(query || "").trim()) {
    throw Object.assign(new Error("query فارغ."), { reason: "empty_query", status: 400 });
  }
  const params = new URLSearchParams();
  params.set("q", query);
  params.set("count", String(Math.max(1, Math.min(1e3, Number(count) || 100))));
  params.set("fields", (fields || DEFAULT_FIELDS).join(","));
  for (const s of sorts || []) params.append("sorts", s);
  if (cursor) params.set("cursor", cursor);
  const url = `${SCRAPE_ENDPOINT}?${params.toString()}`;
  const res = await fetch(url, {
    method: "GET",
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    redirect: "follow"
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw Object.assign(
      new Error(`IA scrape HTTP ${res.status}: ${body.slice(0, 240)}`),
      { reason: "scrape_http_error", status: res.status }
    );
  }
  let json;
  try {
    json = await res.json();
  } catch (e) {
    throw Object.assign(new Error("IA scrape: استجابة ليست JSON."), {
      reason: "scrape_invalid_json",
      status: 502
    });
  }
  const items = Array.isArray(json?.items) ? json.items : [];
  const nextCursor = typeof json?.cursor === "string" && json.cursor ? json.cursor : null;
  const total = Number(json?.total || 0);
  return {
    items,
    nextCursor,
    total,
    // IA يُرسل cursor مفقوداً عند نهاية النتائج (أو يُرسل items فارغة).
    exhausted: !nextCursor || items.length === 0
  };
}
async function fetchItemMetadata(identifier) {
  const id = String(identifier || "").trim();
  if (!id) throw Object.assign(new Error("identifier فارغ."), { reason: "empty_identifier" });
  const url = `https://archive.org/metadata/${encodeURIComponent(id)}`;
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    redirect: "follow"
  });
  if (!res.ok) {
    throw Object.assign(new Error(`IA metadata HTTP ${res.status}`), {
      reason: "metadata_http_error",
      status: res.status
    });
  }
  const json = await res.json();
  return {
    metadata: json?.metadata || {},
    files: Array.isArray(json?.files) ? json.files : [],
    server: String(json?.server || "archive.org"),
    dir: String(json?.dir || `/${id}`)
  };
}
function buildDownloadUrl(identifier, filename) {
  const id = encodeURIComponent(String(identifier || ""));
  const fn = String(filename || "").split("/").map((seg) => encodeURIComponent(seg)).join("/");
  return `https://archive.org/download/${id}/${fn}`;
}
export {
  buildDownloadUrl as a,
  buildLuceneQuery as b,
  fetchItemMetadata as f,
  scrapeOnePage as s
};
