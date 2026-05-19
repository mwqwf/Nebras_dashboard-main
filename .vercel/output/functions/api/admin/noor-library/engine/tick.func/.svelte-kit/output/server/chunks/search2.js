function html(value) {
  var html2 = String(value ?? "");
  var open = "<!---->";
  return open + html2 + "<!---->";
}
function normalizeArabic(s) {
  if (s === void 0 || s === null) return "";
  let out = String(s);
  out = out.toLowerCase();
  out = out.replace(/[\u064B-\u0652\u0670\u06D6-\u06ED]/g, "");
  out = out.replace(/\u0640/g, "");
  out = out.replace(/[\u0622\u0623\u0625\u0671]/g, "ا");
  out = out.replace(/\u0649/g, "ي");
  out = out.replace(/\u0629/g, "ه");
  out = out.replace(/\u0624/g, "و");
  out = out.replace(/\u0626/g, "ي");
  out = out.replace(/\s+/g, " ").trim();
  return out;
}
function tokenize(query) {
  const norm = normalizeArabic(query);
  if (!norm) return [];
  const parts = norm.split(/[\s,./\\|~`!@#$%^&*()_+\-={}\[\]:;"'<>?،؛؟]+/);
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const p of parts) {
    if (!p) continue;
    if (seen.has(p)) continue;
    seen.add(p);
    out.push(p);
  }
  return out;
}
function matchesAllTokens(fields, tokens) {
  if (!tokens || tokens.length === 0) return true;
  const normalizedFields = (fields || []).map((f) => normalizeArabic(f));
  for (const token of tokens) {
    let found = false;
    for (const f of normalizedFields) {
      if (f.includes(token)) {
        found = true;
        break;
      }
    }
    if (!found) return false;
  }
  return true;
}
function scoreMatch(fields, tokens) {
  if (!tokens || tokens.length === 0) return 0;
  const fieldWeights = [100, 40, 20, 10, 5, 5, 5, 5];
  let total = 0;
  for (let i = 0; i < (fields || []).length; i++) {
    const raw = fields[i];
    if (!raw) continue;
    const norm = normalizeArabic(raw);
    const weight = fieldWeights[i] ?? 5;
    for (const token of tokens) {
      if (!norm.includes(token)) continue;
      let bonus = 1;
      if (norm === token) bonus = 4;
      else if (norm.startsWith(token)) bonus = 3;
      else if (new RegExp(`(^|[\\s\\-_/])${escapeRegex(token)}`).test(norm)) bonus = 2;
      total += weight * bonus;
    }
  }
  return total;
}
function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function filterAndRank(list, tokens, extractFields) {
  if (!Array.isArray(list)) return [];
  if (!tokens || tokens.length === 0) return list;
  const matched = [];
  for (const item of list) {
    const fields = extractFields(item) || [];
    if (!matchesAllTokens(fields, tokens)) continue;
    const score = scoreMatch(fields, tokens);
    matched.push({ item, score });
  }
  matched.sort((a, b) => b.score - a.score);
  return matched.map((x) => x.item);
}
function highlightMatches(text, tokens) {
  if (text === void 0 || text === null) return "";
  const raw = String(text);
  if (!tokens || tokens.length === 0) return escapeHtml(raw);
  const escaped = escapeHtml(raw);
  let out = escaped;
  const sortedTokens = [...tokens].filter(Boolean).sort((a, b) => b.length - a.length);
  for (const token of sortedTokens) {
    if (!token) continue;
    const pattern = buildLenientPattern(token);
    if (!pattern) continue;
    try {
      const re = new RegExp(pattern, "gi");
      out = out.replace(re, (m) => `<mark class="hl">${m}</mark>`);
    } catch {
    }
  }
  return out;
}
function buildLenientPattern(token) {
  if (!token) return null;
  const alefClass = "[آأإاٱ]";
  const yaClass = "[ىيئ]";
  const haClass = "[ةه]";
  const wawClass = "[ؤو]";
  let out = "";
  for (const ch of token) {
    if (ch === "ا") out += alefClass;
    else if (ch === "ي") out += yaClass;
    else if (ch === "ه") out += haClass;
    else if (ch === "و") out += wawClass;
    else out += escapeRegex(ch);
  }
  return out;
}
function escapeHtml(s) {
  if (s === void 0 || s === null) return "";
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
export {
  highlightMatches as a,
  filterAndRank as f,
  html as h,
  tokenize as t
};
