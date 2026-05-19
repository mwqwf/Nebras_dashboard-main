import { b as private_env } from "./shared-server.js";
const GLOBAL_KEY = "__NEBRAS_NOOR_BROWSER__";
function getGlobalState() {
  if (!globalThis[GLOBAL_KEY]) {
    globalThis[GLOBAL_KEY] = {
      browser: null,
      browserPromise: null,
      puppeteerModule: null,
      puppeteerEnabled: null,
      // unknown until first probe
      lastError: null
    };
  }
  return globalThis[GLOBAL_KEY];
}
const DEFAULT_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
function readBoolEnv(name, fallback) {
  const raw = String(private_env[name] ?? process.env[name] ?? "").trim().toLowerCase();
  if (raw === "") return fallback;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  return fallback;
}
async function loadPuppeteer() {
  const state = getGlobalState();
  if (state.puppeteerModule) return state.puppeteerModule;
  if (state.puppeteerEnabled === false) return null;
  try {
    const [{ default: puppeteerExtra }, { default: StealthPlugin }] = await Promise.all([
      import("puppeteer-extra"),
      import("puppeteer-extra-plugin-stealth")
    ]);
    puppeteerExtra.use(StealthPlugin());
    state.puppeteerModule = puppeteerExtra;
    state.puppeteerEnabled = true;
    return puppeteerExtra;
  } catch (errExtra) {
    try {
      const mod = await import("puppeteer");
      state.puppeteerModule = mod.default || mod;
      state.puppeteerEnabled = true;
      state.lastError = "puppeteer-extra غير مثبّت — استعمال puppeteer العاديّ بدون stealth (لن يجتاز Cloudflare).";
      return state.puppeteerModule;
    } catch (errPlain) {
      state.puppeteerEnabled = false;
      state.lastError = "لا puppeteer ولا puppeteer-extra مثبّتَيْن. شغّل: npm i -D puppeteer puppeteer-extra puppeteer-extra-plugin-stealth";
      return null;
    }
  }
}
async function isPuppeteerEnabled() {
  const enabledFlag = readBoolEnv("NOOR_USE_PUPPETEER", true);
  if (!enabledFlag) return false;
  const mod = await loadPuppeteer();
  return mod !== null;
}
async function getBrowser() {
  const state = getGlobalState();
  if (state.browser && state.browser.connected !== false) {
    try {
      if (typeof state.browser.isConnected === "function" && !state.browser.isConnected()) {
        state.browser = null;
      }
    } catch {
      state.browser = null;
    }
  }
  if (state.browser) return state.browser;
  if (state.browserPromise) return state.browserPromise;
  const puppeteer = await loadPuppeteer();
  if (!puppeteer) {
    throw Object.assign(new Error(state.lastError || "puppeteer غير متاح."), {
      reason: "puppeteer_not_available",
      status: 501
    });
  }
  const headless = readBoolEnv("PUPPETEER_HEADLESS", true);
  const executablePath = String(private_env.PUPPETEER_EXECUTABLE_PATH || process.env.PUPPETEER_EXECUTABLE_PATH || "").trim() || void 0;
  state.browserPromise = puppeteer.launch({
    headless: headless ? "new" : false,
    executablePath,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-blink-features=AutomationControlled",
      "--disable-features=IsolateOrigins,site-per-process",
      "--lang=ar-EG,ar",
      "--window-size=1366,900"
    ],
    defaultViewport: { width: 1366, height: 900 }
  }).then((browser) => {
    state.browser = browser;
    state.browserPromise = null;
    browser.on("disconnected", () => {
      if (state.browser === browser) state.browser = null;
    });
    return browser;
  }).catch((err) => {
    state.browserPromise = null;
    throw err;
  });
  return state.browserPromise;
}
async function preparePage(page) {
  await page.setUserAgent(DEFAULT_USER_AGENT);
  await page.setExtraHTTPHeaders({
    "Accept-Language": "ar-EG,ar;q=0.9,en;q=0.7",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
  });
  await page.setRequestInterception(true);
  page.on("request", (req) => {
    const type = req.resourceType();
    if (type === "image" || type === "media" || type === "font") {
      req.abort().catch(() => {
      });
    } else {
      req.continue().catch(() => {
      });
    }
  });
}
async function waitForCloudflareIfNeeded(page, { maxWaitMs = 25e3 } = {}) {
  const start = Date.now();
  const isChallenge = async () => {
    try {
      const html = await page.content();
      if (!html) return false;
      const lower = html.toLowerCase();
      return lower.includes("just a moment") || lower.includes("checking your browser") || lower.includes("cf-browser-verification") || lower.includes("challenge-platform") || lower.includes("cf-mitigated");
    } catch {
      return false;
    }
  };
  while (Date.now() - start < maxWaitMs) {
    if (!await isChallenge()) return;
    await Promise.race([
      page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 5e3 }).catch(() => null),
      new Promise((r) => setTimeout(r, 2500))
    ]);
  }
}
async function fetchHtmlViaBrowser(url, opts = {}) {
  const { waitForSelector = null, timeoutMs = 45e3, waitForCloudflare = true } = opts;
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await preparePage(page);
    const response = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: timeoutMs
    });
    if (waitForCloudflare) {
      await waitForCloudflareIfNeeded(page, { maxWaitMs: 25e3 });
    }
    if (waitForSelector) {
      await page.waitForSelector(waitForSelector, { timeout: 1e4 }).catch(() => null);
    }
    const html = await page.content();
    const finalUrl = page.url();
    const status = response?.status?.() ?? 200;
    return { html, finalUrl, status };
  } finally {
    await page.close().catch(() => {
    });
  }
}
async function downloadBufferViaBrowser(url, opts = {}) {
  const { timeoutMs = 9e4, refererUrl = null } = opts;
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setUserAgent(DEFAULT_USER_AGENT);
    await page.setExtraHTTPHeaders({
      "Accept-Language": "ar-EG,ar;q=0.9,en;q=0.7"
    });
    let landingUrl = refererUrl;
    if (!landingUrl) {
      try {
        landingUrl = new URL(url).origin + "/";
      } catch {
        landingUrl = null;
      }
    }
    if (landingUrl && landingUrl !== url) {
      await page.goto(landingUrl, { waitUntil: "domcontentloaded", timeout: timeoutMs }).catch(() => null);
      await waitForCloudflareIfNeeded(page, { maxWaitMs: 25e3 });
    }
    const result = await page.evaluate(async (fileUrl) => {
      try {
        const r = await fetch(fileUrl, {
          credentials: "include",
          redirect: "follow",
          mode: "cors",
          headers: { Accept: "*/*" }
        });
        if (!r.ok) {
          return { ok: false, status: r.status, contentType: "", base64: "" };
        }
        const buf = await r.arrayBuffer();
        const bytes = new Uint8Array(buf);
        const ct = r.headers.get("content-type") || "application/octet-stream";
        let bin = "";
        const chunk = 32768;
        for (let i = 0; i < bytes.length; i += chunk) {
          bin += String.fromCharCode.apply(
            null,
            /** @type {any} */
            bytes.subarray(i, i + chunk)
          );
        }
        return {
          ok: true,
          status: r.status,
          contentType: ct,
          base64: btoa(bin),
          finalUrl: r.url
        };
      } catch (err) {
        return {
          ok: false,
          status: 0,
          contentType: "",
          base64: "",
          error: String(
            /** @type {Error} */
            err?.message || err
          )
        };
      }
    }, url);
    if (!result.ok || !result.base64) {
      throw Object.assign(
        new Error(
          `فشل تنزيل الملفّ من داخل المتصفّح — HTTP ${result.status}${result.error ? " — " + result.error : ""}`
        ),
        {
          reason: "puppeteer_in_page_fetch_failed",
          status: result.status || 0
        }
      );
    }
    const buffer = Buffer.from(result.base64, "base64");
    const contentType = result.contentType || "application/octet-stream";
    let filename = "book.pdf";
    try {
      const u = new URL(result.finalUrl || url);
      filename = decodeURIComponent(u.pathname.split("/").pop() || "book.pdf");
    } catch {
    }
    if (!filename || filename.length < 3) filename = "book.pdf";
    return { buffer, contentType, filename };
  } finally {
    await page.close().catch(() => {
    });
  }
}
async function findBookFileUrlViaBrowser(bookPageUrl, opts = {}) {
  const { timeoutMs = 3e4, clickDownload = true } = opts;
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await preparePage(page);
    await page.goto(bookPageUrl, {
      waitUntil: "domcontentloaded",
      timeout: timeoutMs
    });
    await waitForCloudflareIfNeeded(page, { maxWaitMs: 25e3 });
    const found = await page.evaluate(() => {
      const out = [];
      const push = (url, source) => {
        if (typeof url !== "string") return;
        const trimmed = url.trim();
        if (!trimmed) return;
        out.push({ url: trimmed, source });
      };
      document.querySelectorAll("iframe[src]").forEach((el) => {
        push(el.getAttribute("src"), "iframe");
      });
      document.querySelectorAll("embed[src],object[data]").forEach((el) => {
        push(el.getAttribute("src") || el.getAttribute("data"), "embed");
      });
      document.querySelectorAll("a[href]").forEach((el) => {
        const href = el.getAttribute("href");
        const text = (el.textContent || "").trim();
        push(href, "a:" + text.slice(0, 30));
      });
      document.querySelectorAll(
        "[data-download],[data-file],[data-url],[data-href],[data-src],[data-pdf]"
      ).forEach((el) => {
        for (const attr of [
          "data-download",
          "data-file",
          "data-url",
          "data-href",
          "data-src",
          "data-pdf"
        ]) {
          const v = el.getAttribute(attr);
          if (v) push(v, attr);
        }
      });
      return out;
    }).catch(() => []);
    const baseUrl = page.url();
    const candidates = [];
    const seen = /* @__PURE__ */ new Set();
    for (const f of found) {
      let abs;
      try {
        abs = new URL(f.url, baseUrl).toString();
      } catch {
        continue;
      }
      if (seen.has(abs)) continue;
      seen.add(abs);
      const lower = abs.toLowerCase();
      let score = 0;
      let hint = "";
      if (/\.(?:pdf|epub|mp3|mp4|m4a|wav|docx?)(?:\?|$|#)/i.test(lower)) {
        score = 100;
        hint = "direct-file";
      } else if (/\/(download|file|files|book\/download)\//i.test(lower) || /تحميل-كتاب|%D8%AA%D8%AD%D9%85%D9%8A%D9%84-%D9%83%D8%AA%D8%A7%D8%A8/i.test(
        lower
      )) {
        score = 70;
        hint = "download-path";
      } else if (/تحميل|تنزيل|download|حمل/i.test(f.source) && lower.startsWith("http")) {
        score = 50;
        hint = "download-text-link";
      }
      if (score > 0) candidates.push({ url: abs, score, hint });
    }
    candidates.sort((a, b) => b.score - a.score);
    if (candidates.length > 0) {
      return { url: candidates[0].url, source: candidates[0].hint };
    }
    if (clickDownload) {
      const FILE_URL_RE = /\.(?:pdf|epub|mp3|mp4|m4a|wav|docx?)(?:\?|$|#)/i;
      const FILE_PATH_RE = /\/(?:book-pdf|bk-pdf|download|dl|file|files|book\/download)\//i;
      const FILE_CT_RE = /^(?:application\/pdf|application\/epub\+zip|application\/octet-stream|audio\/|video\/|application\/msword|application\/vnd\.openxmlformats)/i;
      const reqP = page.waitForRequest(
        (req) => {
          try {
            const u = req.url();
            return FILE_URL_RE.test(u) || FILE_PATH_RE.test(u);
          } catch {
            return false;
          }
        },
        { timeout: 25e3 }
      ).catch(() => null);
      const resP = page.waitForResponse(
        (res) => {
          try {
            const ct = (res.headers() || {})["content-type"] || "";
            const u = res.url();
            if (!FILE_CT_RE.test(ct)) return false;
            if (ct.toLowerCase().startsWith("text/html")) return false;
            if (/\.(?:css|js|png|jpe?g|gif|svg|webp|woff2?)(?:\?|$)/i.test(u)) {
              return false;
            }
            return true;
          } catch {
            return false;
          }
        },
        { timeout: 25e3 }
      ).catch(() => null);
      const clickedAny = await page.evaluate(() => {
        const labels = ["تحميل", "تنزيل", "حمل", "download", "Download", "حمّل"];
        const classHints = /btn-download|downloadbutton|download-btn|btn-dl|dl-btn|btnDownload|download/i;
        const score = (el) => {
          let s = 0;
          const cls = (el.getAttribute("class") || "") + "";
          const id = (el.getAttribute("id") || "") + "";
          const href = (el.getAttribute("href") || "") + "";
          const txt = ((el.textContent || "") + "").trim();
          const alt = (el.querySelector?.("img")?.getAttribute("alt") || "").trim();
          if (classHints.test(cls)) s += 5;
          if (classHints.test(id)) s += 3;
          if (labels.some((l) => txt.includes(l))) s += 4;
          if (labels.some((l) => alt.includes(l))) s += 3;
          if (/تحميل|download|book-pdf|bk-pdf|\/dl\//i.test(href)) s += 6;
          return s;
        };
        const all = Array.from(
          document.querySelectorAll('a, button, [role="button"]')
        );
        const ranked = all.map((el) => ({ el, s: score(el) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 3);
        if (ranked.length === 0) return 0;
        for (const { el } of ranked) {
          try {
            el.click();
          } catch {
          }
        }
        return ranked.length;
      }).catch(() => 0);
      if (clickedAny > 0) {
        const [req, res] = await Promise.all([reqP, resP]);
        if (req) return { url: req.url(), source: "click-download:request" };
        if (res) return { url: res.url(), source: "click-download:response" };
      }
    }
    return null;
  } finally {
    await page.close().catch(() => {
    });
  }
}
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 NebrasDashboard/1.0";
const HOST_ALIASES = ["noor-book.com", "www.noor-book.com"];
function looksLikeCloudflareChallenge(html) {
  if (!html || html.length < 200) return true;
  const lower = html.toLowerCase();
  return lower.includes("just a moment") || lower.includes("checking your browser") || lower.includes("cf-browser-verification") || lower.includes("challenge-platform") || lower.includes("cf-mitigated") || lower.includes("attention required! | cloudflare");
}
function parseNoorUrl(input) {
  const raw = String(input || "").trim();
  if (!raw) return null;
  let u;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (!HOST_ALIASES.includes(u.hostname.toLowerCase())) return null;
  const segs = u.pathname.split("/").filter(Boolean);
  const bookId = decodeURIComponent(segs[segs.length - 1] || "");
  if (!bookId) return null;
  const canonicalUrl = `https://www.noor-book.com${u.pathname}${u.search}`;
  return { canonicalUrl, bookId };
}
function makeError(message, reason, status = 0, cause = null) {
  const err = (
    /** @type {any} */
    new Error(message)
  );
  err.reason = reason;
  err.status = status;
  if (cause) err.cause = cause;
  return err;
}
async function fetchHtml(url) {
  const usePuppeteer = await isPuppeteerEnabled().catch(() => false);
  if (usePuppeteer) {
    try {
      const r = await fetchHtmlViaBrowser(url, { waitForCloudflare: true });
      if (!looksLikeCloudflareChallenge(r.html) && r.html.length >= 200) {
        return { html: r.html, finalUrl: r.finalUrl };
      }
      throw makeError(
        "Cloudflare لم يُجتَز حتى مع Puppeteer (تحدّي مستمرّ).",
        "cloudflare_challenge_persistent",
        403
      );
    } catch (err) {
      if (err?.reason === "cloudflare_challenge_persistent") throw err;
    }
  }
  let res;
  try {
    res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ar,en;q=0.7",
        "Cache-Control": "no-cache"
      },
      redirect: "follow"
    });
  } catch (err) {
    throw makeError("تعذّر الوصول إلى مكتبة نور — تحقّق من الإنترنت.", "network_error", 0, err);
  }
  if (!res.ok) {
    throw makeError(
      `مكتبة نور أرجعت حالة ${res.status} للرابط: ${url}` + (res.status === 403 || res.status === 503 ? " — يبدو أنّ Cloudflare يعترض. فعّل Puppeteer (NOOR_USE_PUPPETEER=true)." : ""),
      "upstream_error",
      res.status
    );
  }
  const html = await res.text();
  if (!html || html.length < 200) {
    throw makeError("استجابة فارغة أو مقطوعة من مكتبة نور.", "empty_response", res.status);
  }
  if (looksLikeCloudflareChallenge(html)) {
    throw makeError(
      "الرّد عبارة عن تحدّي Cloudflare. يلزم Puppeteer (NOOR_USE_PUPPETEER=true).",
      "cloudflare_challenge_detected",
      403
    );
  }
  return { html, finalUrl: res.url || url };
}
function decodeHtmlEntities(s) {
  return String(s || "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ").replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code))).replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)));
}
function extractMeta(html, property) {
  const re = new RegExp(
    `<meta[^>]*(?:property|name)=["']${property}["'][^>]*content=["']([^"']+)["']`,
    "i"
  );
  const m = html.match(re);
  if (m) return decodeHtmlEntities(m[1]).trim();
  const reAlt = new RegExp(
    `<meta[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["']${property}["']`,
    "i"
  );
  const m2 = html.match(reAlt);
  return m2 ? decodeHtmlEntities(m2[1]).trim() : "";
}
function extractTitle(html) {
  const og = extractMeta(html, "og:title");
  if (og) return og;
  const tw = extractMeta(html, "twitter:title");
  if (tw) return tw;
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (m) {
    return decodeHtmlEntities(m[1]).replace(/\s*\|\s*مكتبة نور.*$/u, "").trim();
  }
  return "";
}
function extractDescription(html) {
  return extractMeta(html, "og:description") || extractMeta(html, "twitter:description") || extractMeta(html, "description") || "";
}
function extractThumbnail(html) {
  return extractMeta(html, "og:image") || extractMeta(html, "twitter:image") || extractMeta(html, "image") || "";
}
function extractAuthor(html) {
  const meta = extractMeta(html, "book:author") || extractMeta(html, "author") || extractMeta(html, "article:author");
  if (meta) return meta;
  const ld = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
  if (ld) {
    try {
      const data = JSON.parse(ld[1].trim());
      const items = Array.isArray(data) ? data : [data];
      for (const it of items) {
        const a = it?.author;
        if (typeof a === "string") return a;
        if (Array.isArray(a) && a[0]?.name) return String(a[0].name);
        if (a?.name) return String(a.name);
      }
    } catch {
    }
  }
  const m = html.match(/(?:تأليف|المؤلف|الكاتب)\s*[:\-]\s*<[^>]+>\s*([^<]+?)\s*</);
  return m ? decodeHtmlEntities(m[1]).trim() : "";
}
function extractCategoryHints(html) {
  const hints = [];
  const tagRe = /<meta[^>]*property=["']book:tag["'][^>]*content=["']([^"']+)["']/gi;
  let m;
  while (m = tagRe.exec(html)) {
    hints.push(decodeHtmlEntities(m[1]).trim());
  }
  const kw = extractMeta(html, "keywords");
  if (kw) {
    for (const part of kw.split(/[,،]/)) {
      const t = part.trim();
      if (t) hints.push(t);
    }
  }
  const bcMatch = html.match(/<(?:ol|ul)[^>]*breadcrumb[^>]*>([\s\S]*?)<\/(?:ol|ul)>/i);
  if (bcMatch) {
    const itemRe = />([^<>]{2,80})</g;
    let im;
    while (im = itemRe.exec(bcMatch[1])) {
      const t = decodeHtmlEntities(im[1]).trim();
      if (t && !/^(الرئيسية|home|كتب)$/i.test(t)) hints.push(t);
    }
  }
  return [...new Set(hints.filter(Boolean))].slice(0, 12);
}
function guessContentType(url) {
  const lower = String(url || "").toLowerCase().split("?")[0];
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".epub")) return "application/epub+zip";
  if (lower.endsWith(".mp3")) return "audio/mpeg";
  if (lower.endsWith(".m4a")) return "audio/mp4";
  if (lower.endsWith(".wav")) return "audio/wav";
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".docx"))
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (lower.endsWith(".doc")) return "application/msword";
  return "application/octet-stream";
}
function extractFileUrl(html, baseUrl) {
  const candidates = [];
  const directRe = /href=["']([^"']+\.(?:pdf|epub|mp3|mp4|m4a|wav|docx?))(?:\?[^"']*)?["']/gi;
  let m;
  while (m = directRe.exec(html)) candidates.push(m[1]);
  const iframeRe = /<iframe[^>]+src=["']([^"']+)["']/gi;
  while (m = iframeRe.exec(html)) {
    const src = m[1];
    if (/\.(?:pdf|epub|mp3|mp4|m4a)(?:\?|$)/i.test(src)) {
      candidates.push(src);
    }
  }
  const dlPathRe = /href=["']([^"']*\/(?:download|file|files|book\/download|book-pdf|bk-pdf|dl|get|reader)\/[^"']+)["']/gi;
  while (m = dlPathRe.exec(html)) candidates.push(m[1]);
  const dlClassRe = /<a[^>]+class=["'][^"']*(?:btn-download|downloadbutton|download-btn|btn-dl|dl-btn|btnDownload)[^"']*["'][^>]+href=["']([^"']+)["']/gi;
  while (m = dlClassRe.exec(html)) candidates.push(m[1]);
  const dlClassRe2 = /<a[^>]+href=["']([^"']+)["'][^>]+class=["'][^"']*(?:btn-download|downloadbutton|download-btn|btn-dl|dl-btn|btnDownload)[^"']*["']/gi;
  while (m = dlClassRe2.exec(html)) candidates.push(m[1]);
  const arabicDlRe = /href=["']([^"']*(?:تحميل-كتاب|%D8%AA%D8%AD%D9%85%D9%8A%D9%84-%D9%83%D8%AA%D8%A7%D8%A8)[^"']*)["']/gi;
  while (m = arabicDlRe.exec(html)) candidates.push(m[1]);
  const dataAttrRe = /data-(?:download|file|url|href|src|pdf)=["']([^"']+)["']/gi;
  while (m = dataAttrRe.exec(html)) candidates.push(m[1]);
  const dlByTextRe = /<a[^>]+href=["']([^"']+)["'][^>]*>[^<]*(?:تحميل|تحميل الكتاب|حمل|تنزيل|download|Download)[^<]*<\/a>/gi;
  while (m = dlByTextRe.exec(html)) candidates.push(m[1]);
  const embedRe = /<(?:embed|object)[^>]+(?:src|data)=["']([^"']+)["']/gi;
  while (m = embedRe.exec(html)) {
    if (/\.(?:pdf|epub)(?:\?|$)/i.test(m[1])) candidates.push(m[1]);
  }
  const ldRe = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  while (m = ldRe.exec(html)) {
    try {
      const data = JSON.parse(m[1].trim());
      const items = Array.isArray(data) ? data : [data];
      for (const it of items) {
        if (typeof it?.contentUrl === "string") candidates.push(it.contentUrl);
        if (typeof it?.url === "string" && /\.(?:pdf|epub|mp3)/i.test(it.url)) {
          candidates.push(it.url);
        }
      }
    } catch {
    }
  }
  const seen = /* @__PURE__ */ new Set();
  const absCandidates = [];
  for (const c of candidates) {
    try {
      const abs = new URL(c, baseUrl).toString();
      if (seen.has(abs)) continue;
      seen.add(abs);
      absCandidates.push(abs);
    } catch {
    }
  }
  const hasFileExt = (u) => /\.(?:pdf|epub|mp3|mp4|m4a|wav|docx?)(?:\?|$)/i.test(u);
  absCandidates.sort((a, b) => {
    const aExt = hasFileExt(a) ? 1 : 0;
    const bExt = hasFileExt(b) ? 1 : 0;
    return bExt - aExt;
  });
  if (absCandidates.length === 0) return null;
  return { url: absCandidates[0], type: guessContentType(absCandidates[0]) };
}
async function fetchBookMetadata(pageUrl) {
  const parsed = parseNoorUrl(pageUrl);
  if (!parsed) {
    throw makeError(
      "الرابط لا ينتمي إلى noor-book.com. الرجاء لصق رابط كتاب صحيح.",
      "invalid_url",
      400
    );
  }
  const { html, finalUrl } = await fetchHtml(parsed.canonicalUrl);
  const title = extractTitle(html);
  const description = extractDescription(html);
  const author = extractAuthor(html);
  const thumbnail = extractThumbnail(html);
  const categoryHints = extractCategoryHints(html);
  let file = extractFileUrl(html, finalUrl);
  if (!file) {
    const usePuppeteer = await isPuppeteerEnabled().catch(() => false);
    if (usePuppeteer) {
      try {
        const found = await findBookFileUrlViaBrowser(finalUrl, {
          timeoutMs: 35e3,
          clickDownload: true
        });
        if (found?.url) {
          file = { url: found.url, type: guessContentType(found.url) };
        }
      } catch (err) {
        console.warn(
          "[noorLibrary] findBookFileUrlViaBrowser failed for",
          finalUrl,
          "-",
          /** @type {Error} */
          err?.message
        );
      }
    }
  }
  if (!title) {
    throw makeError(
      "تعذّر استخراج عنوان الكتاب من الصفحة — قد يكون القالب تغيّر أو الرابط لصفحة غير كتاب.",
      "no_title",
      422
    );
  }
  return {
    title,
    description,
    author,
    thumbnail,
    categoryHints,
    fileUrl: file?.url || "",
    fileType: file?.type || "",
    source: {
      url: parsed.canonicalUrl,
      finalUrl,
      bookId: parsed.bookId,
      provider: "noor-book.com",
      fetchedAt: (/* @__PURE__ */ new Date()).toISOString()
    }
  };
}
async function downloadBookFile(fileUrl, opts = {}) {
  if (!fileUrl) throw makeError("لا يوجد رابط ملف للتنزيل.", "no_file_url", 400);
  const refererUrl = opts?.refererUrl || null;
  const usePuppeteer = await isPuppeteerEnabled().catch(() => false);
  let lastPuppeteerErr = null;
  if (usePuppeteer) {
    try {
      const r = await downloadBufferViaBrowser(fileUrl, {
        timeoutMs: 9e4,
        refererUrl
      });
      if (r.buffer && r.buffer.byteLength > 0) {
        return {
          buffer: r.buffer,
          contentType: r.contentType,
          filename: r.filename,
          size: r.buffer.byteLength
        };
      }
    } catch (err) {
      lastPuppeteerErr = err;
    }
  }
  let host = "";
  try {
    host = new URL(fileUrl).host.toLowerCase();
  } catch {
    host = "";
  }
  const isNoorHost = /(?:^|\.)noor-book\.com$/.test(host);
  if (isNoorHost) {
    throw makeError(
      lastPuppeteerErr?.message || "تعذّر تنزيل الملفّ من noor-book.com — Cloudflare يحجب fetch العاديّ.",
      "download_failed_cf",
      lastPuppeteerErr?.status || 403,
      lastPuppeteerErr
    );
  }
  let res;
  try {
    res = await fetch(fileUrl, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "*/*",
        ...refererUrl ? { Referer: refererUrl } : {}
      },
      redirect: "follow"
    });
  } catch (err) {
    throw makeError(
      "تعذّر تنزيل ملفّ الكتاب — قد يكون الخادم البعيد محظوراً أو الرابط منتهي.",
      "download_failed",
      0,
      err
    );
  }
  if (!res.ok) {
    throw makeError(
      `فشل تنزيل الملفّ — حالة HTTP ${res.status}.`,
      "download_failed",
      res.status
    );
  }
  const arrayBuf = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuf);
  const contentType = res.headers.get("content-type") || "application/octet-stream";
  let filename = "";
  const cd = res.headers.get("content-disposition") || "";
  const cdMatch = cd.match(/filename\*?=(?:UTF-8'')?["']?([^;"']+)/i);
  if (cdMatch) {
    try {
      filename = decodeURIComponent(cdMatch[1]);
    } catch {
      filename = cdMatch[1];
    }
  }
  if (!filename) {
    try {
      const u = new URL(fileUrl);
      filename = decodeURIComponent(u.pathname.split("/").pop() || "book.pdf");
    } catch {
      filename = "book.pdf";
    }
  }
  return { buffer, contentType, filename, size: buffer.byteLength };
}
export {
  fetchBookMetadata as a,
  downloadBookFile as d,
  fetchHtmlViaBrowser as f,
  isPuppeteerEnabled as i,
  parseNoorUrl as p
};
