import { runCurationSweep } from "./curate.js";
import { getMarketSnapshot } from "./markets.js";
import { getQuotes, parseSymbols } from "./quotes.js";

function normalizeOrigin(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function getAllowedOrigins(env) {
  const raw = String(env.ALLOWED_ORIGINS || env.ALLOWED_ORIGIN || "");
  if (!raw.trim()) {
    return [];
  }

  const unique = new Set();
  raw.split(",").forEach((value) => {
    const normalized = normalizeOrigin(value);
    if (normalized) {
      unique.add(normalized);
    }
  });

  return Array.from(unique);
}

function getRequestOrigin(request) {
  return normalizeOrigin(request.headers.get("Origin") || "");
}

function getCorsAllowOrigin(request, env) {
  const allowedOrigins = getAllowedOrigins(env);
  if (allowedOrigins.length === 0) {
    return "*";
  }

  const requestOrigin = getRequestOrigin(request);
  if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
    return requestOrigin;
  }

  return allowedOrigins[0];
}

function getCorsHeaders(request, env) {
  const allowOrigin = getCorsAllowOrigin(request, env);
  const headers = {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET,PUT,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  if (allowOrigin !== "*") {
    headers.Vary = "Origin";
  }

  return headers;
}

function isOriginAllowed(request, env) {
  const allowedOrigins = getAllowedOrigins(env);
  if (allowedOrigins.length === 0) {
    return true;
  }

  const requestOrigin = getRequestOrigin(request);
  if (!requestOrigin) {
    // Allow non-browser clients (no Origin header).
    return true;
  }

  return allowedOrigins.includes(requestOrigin);
}

function jsonResponse(body, status = 200, request = null, env = {}) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...getCorsHeaders(request || new Request("https://local.invalid"), env),
    },
  });
}

const ARTEMIS_UPDATES_CACHE_KEY = "public:artemis-updates:v1";
const ARTEMIS_UPDATES_TTL_MS = 5 * 60 * 1000;
const NASA_WP_BASE = "https://www.nasa.gov/wp-json/wp/v2";
const ARTEMIS_CATEGORY_ID = 2918;

const RSS_PROXY_ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);
const RSS_PROXY_BLOCKED_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
]);

// The proxy has to accept arbitrary hosts — pasting a feed URL the curated list
// has never seen is a supported way to add a source — so it cannot use an
// allow-list. What it can refuse is anything that isn't the public internet:
// loopback, RFC1918, carrier-grade NAT and the 169.254.169.254 metadata address.
// Workers can't route to a private network anyway; this keeps it that way if the
// runtime ever changes, and makes the intent explicit.
function isPrivateAddress(host) {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    const [a, b] = host.split(".").map(Number);
    if ([a, b].some(n => !Number.isFinite(n) || n > 255)) return true;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;          // link-local + cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
    return false;
  }
  // IPv6 literals arrive from URL.hostname wrapped in brackets.
  const v6 = host.replace(/^\[|\]$/g, "");
  if (v6.includes(":")) {
    return v6 === "::1" || v6 === "::" ||
      /^f[cd]/i.test(v6) ||        // unique local fc00::/7
      /^fe[89ab]/i.test(v6);       // link-local fe80::/10
  }
  return false;
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Failed ${response.status} for ${url}`);
  }
  return response.json();
}

function stripHtml(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#8216;|&#8217;|&rsquo;/gi, "'")
    .replace(/&#8220;|&#8221;|&ldquo;|&rdquo;/gi, '"')
    .replace(/&#8211;|&#8212;/gi, "-")
    .replace(/&#8230;|&hellip;/gi, "...")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function ensureIsoString(value) {
  if (!value) return "";
  const text = String(value);
  return /Z$/.test(text) ? text : `${text}Z`;
}

function normalizeWpItems(items, source) {
  return (Array.isArray(items) ? items : []).map((item) => ({
    id: item?.id || item?.link || item?.title?.rendered || "item",
    title: stripHtml(item?.title?.rendered || item?.title || "Artemis II update"),
    summary: stripHtml(item?.excerpt?.rendered || item?.excerpt || ""),
    url: item?.link || "https://www.nasa.gov/mission/artemis-ii/",
    published_at: ensureIsoString(item?.date_gmt || item?.date),
    modified_at: ensureIsoString(item?.modified_gmt || item?.modified),
    news_site: source,
    source,
  })).filter((item) => /artemis\s*(ii|2)/i.test(`${item.title} ${item.summary}`));
}

function uniqueBy(items, keyFn) {
  const seen = new Set();
  return (Array.isArray(items) ? items : []).filter((item) => {
    const key = keyFn(item);
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function deriveWatchItems(items) {
  const cautionPattern = /(troubleshoot|issue|warning|problem|fault|anomaly|hold|delay|scrub|abort|leak|comm|communication|toilet|concern)/i;
  return items.filter((item) => cautionPattern.test(`${item.title} ${item.summary}`)).slice(0, 4);
}

async function fetchArtemisUpdates(env) {
  const cached = await env.HN_STATE_DATA.get(ARTEMIS_UPDATES_CACHE_KEY, { type: "json" });
  const cachedAt = cached?.cachedAt ? Date.parse(cached.cachedAt) : 0;
  if (cached?.payload && Number.isFinite(cachedAt) && (Date.now() - cachedAt) < ARTEMIS_UPDATES_TTL_MS) {
    return cached.payload;
  }

  const [blogItems, postItems] = await Promise.all([
    fetchJson(`${NASA_WP_BASE}/nasa-blog?categories=${ARTEMIS_CATEGORY_ID}&per_page=8&_fields=id,date_gmt,link,title,excerpt`),
    fetchJson(`${NASA_WP_BASE}/posts?categories=${ARTEMIS_CATEGORY_ID}&per_page=6&_fields=id,date_gmt,modified_gmt,link,title,excerpt`),
  ]);

  const officialUpdates = normalizeWpItems(blogItems, "NASA Blog");
  const officialBriefings = normalizeWpItems(postItems, "NASA");
  const combined = uniqueBy(
    [...officialUpdates, ...officialBriefings].sort((left, right) => Date.parse(right.published_at || 0) - Date.parse(left.published_at || 0)),
    (item) => item.url || item.title
  );

  const payload = {
    source: "worker",
    fetchedAt: new Date().toISOString(),
    officialUpdates,
    officialBriefings,
    updates: combined.slice(0, 10),
    watchItems: deriveWatchItems(combined),
    missionUrl: "https://www.nasa.gov/mission/artemis-ii/",
    coverageUrl: "https://www.nasa.gov/missions/artemis/artemis-2/nasa-sets-coverage-for-artemis-ii-moon-mission/",
    trackUrl: "https://www.nasa.gov/missions/artemis-ii/arow/",
  };

  await env.HN_STATE_DATA.put(ARTEMIS_UPDATES_CACHE_KEY, JSON.stringify({
    cachedAt: new Date().toISOString(),
    payload,
  }));

  return payload;
}

function getNamespaceFromPath(pathname) {
  const match = pathname.match(/^\/v1\/state\/([^/]+)$/);
  if (!match) {
    return null;
  }

  try {
    const namespace = decodeURIComponent(match[1]);
    if (!/^[A-Za-z0-9._-]{1,120}$/.test(namespace)) {
      return null;
    }
    return namespace;
  } catch {
    return null;
  }
}

function isAuthorized(request, env) {
  const expected = String(env.SYNC_API_TOKEN || "").trim();
  if (!expected) {
    return true;
  }

  const authHeader = request.headers.get("Authorization") || "";
  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") {
    return false;
  }

  return parts[1] === expected;
}

function parseRssProxyTarget(url) {
  const raw = String(url.searchParams.get("url") || "").trim();
  if (!raw) {
    return { ok: false, error: "Missing url parameter" };
  }

  let target;
  try {
    target = new URL(raw);
  } catch {
    return { ok: false, error: "Invalid target URL" };
  }

  if (!RSS_PROXY_ALLOWED_PROTOCOLS.has(target.protocol)) {
    return { ok: false, error: "Unsupported URL protocol" };
  }

  const host = String(target.hostname || "").toLowerCase();
  const isBlockedName = RSS_PROXY_BLOCKED_HOSTS.has(host) ||
    host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".localhost");
  if (!host || isBlockedName || isPrivateAddress(host)) {
    return { ok: false, error: "Blocked target host" };
  }

  return { ok: true, target: target.toString() };
}

async function fetchRssThroughProxy(request, env, url) {
  if (request.method !== "GET") {
    return jsonResponse({ ok: false, error: "Method not allowed" }, 405, request, env);
  }

  const parsed = parseRssProxyTarget(url);
  if (!parsed.ok) {
    return jsonResponse({ ok: false, error: parsed.error }, 400, request, env);
  }

  let upstream;
  try {
    upstream = await fetch(parsed.target, {
      headers: {
        Accept: "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        // Browser-style UA: Google News and Reddit started returning 503 to
        // the previous "HAPPENING-NOW/1.0 RSS Proxy" UA from Cloudflare
        // Worker IPs. A current Chrome UA bypasses the heuristic.
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        // CONSENT=YES+ is Google's documented bypass for the consent.google.com
        // redirect that non-browser clients otherwise get steered into; without
        // it, news.google.com RSS responses return a consent HTML page or 503.
        Cookie: "CONSENT=YES+cb",
      },
      cf: {
        cacheEverything: true,
        cacheTtl: 120,
      },
    });
  } catch {
    return jsonResponse({ ok: false, error: "Failed to fetch target feed" }, 502, request, env);
  }

  if (!upstream.ok) {
    return jsonResponse({ ok: false, error: `Target feed error: ${upstream.status}` }, 502, request, env);
  }

  const xmlText = await upstream.text();

  // Always answer as XML, never echo the upstream Content-Type. Some publishers
  // serve a perfectly valid feed as text/html (canarymedia.com/rss.xml does),
  // and this Worker sits behind our own Cloudflare zone — which post-processes
  // anything labelled HTML and appended its tracking beacon *after* `</rss>`.
  // That trailing junk is not well-formed XML, so browser DOMParser rejected
  // the whole document and the feed rendered zero items while every curl-and-
  // grep check called it healthy. Upstream charset is handled too: .text()
  // has already decoded to a JS string, so what we emit is always UTF-8 and
  // passing through e.g. `charset=ISO-8859-1` would actively mislabel it.
  return new Response(xmlText, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=120",
      "X-RSS-Proxy": "happening-now-sync",
      ...getCorsHeaders(request, env),
    },
  });
}

// Finnhub drops a meaningful share of connections from Cloudflare Worker IPs and
// sometimes answers with a non-JSON error body. Both used to surface as a bare
// 502 from the catch below, so a measured ~40% of /v1/stocks/quote calls failed
// while the same key worked fine from a browser. One retry plus a tolerant parse
// recovers most of those; whatever still fails returns a status the page's
// fallback chain (TwelveData, Yahoo, Stooq) can act on straight away.
async function proxyUpstreamJson(upstreamUrl, { cacheTtl, maxAge }, request, env, errorLabel) {
  let lastError = "unknown error";
  for (let attempt = 0; attempt < 2; attempt++) {
    let upstream;
    try {
      upstream = await fetch(upstreamUrl, { cf: { cacheEverything: true, cacheTtl } });
    } catch (err) {
      lastError = err?.message || "fetch failed";
      continue;
    }

    let body;
    try {
      body = await upstream.text();
    } catch (err) {
      lastError = err?.message || "response read failed";
      continue;
    }

    let data;
    try {
      data = JSON.parse(body);
    } catch {
      // The server answered, it just didn't answer with JSON — overwhelmingly a
      // 429 from Finnhub's 60/min free tier, since one page load asks for ~20
      // symbols at once. Retrying that immediately only spends another call
      // against the same limit, so pass the status back and let the caller drop
      // to TwelveData straight away.
      return jsonResponse(
        { ok: false, error: `${errorLabel}: upstream ${upstream.status}` },
        upstream.status === 429 ? 429 : 502,
        request, env
      );
    }

    return new Response(JSON.stringify(data), {
      status: upstream.ok ? 200 : upstream.status,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": `public, max-age=${maxAge}`,
        ...getCorsHeaders(request, env),
      },
    });
  }
  return jsonResponse({ ok: false, error: `${errorLabel}: ${lastError}` }, 502, request, env);
}

async function fetchStockQuote(request, env, url) {
  if (request.method !== "GET") {
    return jsonResponse({ ok: false, error: "Method not allowed" }, 405, request, env);
  }
  const symbol = String(url.searchParams.get("symbol") || "").trim().toUpperCase();
  if (!symbol) {
    return jsonResponse({ ok: false, error: "Missing symbol parameter" }, 400, request, env);
  }
  const key = String(env.FINNHUB_KEY || "").trim();
  if (!key) {
    return jsonResponse({ ok: false, error: "Stock quotes not configured" }, 503, request, env);
  }
  return proxyUpstreamJson(
    `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${key}`,
    { cacheTtl: 60, maxAge: 60 },
    request, env, "Failed to fetch stock quote"
  );
}

async function fetchStockCandle(request, env, url) {
  if (request.method !== "GET") {
    return jsonResponse({ ok: false, error: "Method not allowed" }, 405, request, env);
  }
  const symbol = String(url.searchParams.get("symbol") || "").trim().toUpperCase();
  const resolution = String(url.searchParams.get("resolution") || "D").trim();
  const from = String(url.searchParams.get("from") || "").trim();
  const to = String(url.searchParams.get("to") || "").trim();
  if (!symbol || !from || !to) {
    return jsonResponse({ ok: false, error: "Missing required parameters: symbol, from, to" }, 400, request, env);
  }
  const key = String(env.FINNHUB_KEY || "").trim();
  if (!key) {
    return jsonResponse({ ok: false, error: "Stock candles not configured" }, 503, request, env);
  }
  return proxyUpstreamJson(
    `https://finnhub.io/api/v1/stock/candle?symbol=${encodeURIComponent(symbol)}&resolution=${encodeURIComponent(resolution)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&token=${key}`,
    { cacheTtl: 300, maxAge: 300 },
    request, env, "Failed to fetch stock candles"
  );
}

async function fetchStockTimeSeries(request, env, url) {
  if (request.method !== "GET") {
    return jsonResponse({ ok: false, error: "Method not allowed" }, 405, request, env);
  }
  const symbol = String(url.searchParams.get("symbol") || "").trim().toUpperCase();
  const interval = String(url.searchParams.get("interval") || "1h").trim();
  const outputsize = String(url.searchParams.get("outputsize") || "24").trim();
  if (!symbol) {
    return jsonResponse({ ok: false, error: "Missing symbol parameter" }, 400, request, env);
  }
  const key = String(env.TWELVEDATA_KEY || "").trim();
  if (!key) {
    return jsonResponse({ ok: false, error: "Time series not configured" }, 503, request, env);
  }
  return proxyUpstreamJson(
    `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&outputsize=${encodeURIComponent(outputsize)}&apikey=${key}`,
    { cacheTtl: 300, maxAge: 300 },
    request, env, "Failed to fetch time series"
  );
}

// TwelveData's own quote endpoint, the first fallback when Finnhub has nothing.
// It needs a route of its own because /v1/stocks/quote is Finnhub-backed.
async function fetchStockQuoteTwelveData(request, env, url) {
  if (request.method !== "GET") {
    return jsonResponse({ ok: false, error: "Method not allowed" }, 405, request, env);
  }
  const symbol = String(url.searchParams.get("symbol") || "").trim().toUpperCase();
  if (!symbol) {
    return jsonResponse({ ok: false, error: "Missing symbol parameter" }, 400, request, env);
  }
  const key = String(env.TWELVEDATA_KEY || "").trim();
  if (!key) {
    return jsonResponse({ ok: false, error: "Stock quotes not configured" }, 503, request, env);
  }
  return proxyUpstreamJson(
    `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(symbol)}&apikey=${key}`,
    { cacheTtl: 60, maxAge: 60 },
    request, env, "Failed to fetch stock quote"
  );
}

// The whole watchlist in one request, answered from a per-symbol KV cache — see
// quotes.js. Separate from /v1/stocks/quote, which stays Finnhub-backed as the
// per-symbol fallback for anything this misses.
async function fetchStockQuotes(request, env, url) {
  if (request.method !== "GET") {
    return jsonResponse({ ok: false, error: "Method not allowed" }, 405, request, env);
  }
  const symbols = parseSymbols(url.searchParams.get("symbols"));
  if (!symbols.length) {
    return jsonResponse({ ok: false, error: "Missing or invalid symbols parameter" }, 400, request, env);
  }
  try {
    return jsonResponse({ ok: true, ...(await getQuotes(env, symbols)) }, 200, request, env);
  } catch (error) {
    return jsonResponse(
      { ok: false, error: error instanceof Error ? error.message : "Failed to fetch quotes" },
      502, request, env
    );
  }
}

export default {
  // Daily cron. Each firing checks the next slice of curated feeds and parks
  // its position in KV; when the sweep wraps it emails the admin a digest.
  // See curate.js for why it's chunked rather than done in one pass.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      runCurationSweep(env)
        .then(r => console.log("[curate]", JSON.stringify(r)))
        .catch(err => console.error("[curate] failed:", err?.message || err)),
    );
  },

  async fetch(request, env, ctx) {
    if (!isOriginAllowed(request, env)) {
      return jsonResponse({ ok: false, error: "Origin not allowed" }, 403, request, env);
    }

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: getCorsHeaders(request, env) });
    }

    const url = new URL(request.url);

    if (url.pathname === "/health" || url.pathname === "/v1/health") {
      return jsonResponse({
        ok: true,
        service: "happening-now-sync",
        version: "v1",
        rssProxyRoute: "/v1/rss/raw",
        timestamp: new Date().toISOString(),
      }, 200, request, env);
    }

    if (url.pathname === "/v1/artemis/updates") {
      if (request.method !== "GET") {
        return jsonResponse({ ok: false, error: "Method not allowed" }, 405, request, env);
      }

      try {
        const payload = await fetchArtemisUpdates(env);
        return jsonResponse(payload, 200, request, env);
      } catch (error) {
        return jsonResponse({ ok: false, error: error instanceof Error ? error.message : "Failed to fetch Artemis updates" }, 502, request, env);
      }
    }

    if (url.pathname === "/v1/rss/raw") {
      return fetchRssThroughProxy(request, env, url);
    }

    if (url.pathname === "/v1/markets/snapshot") {
      return jsonResponse(await getMarketSnapshot(env, ctx), 200, request, env);
    }

    if (url.pathname === "/v1/stocks/quotes") {
      return fetchStockQuotes(request, env, url);
    }

    if (url.pathname === "/v1/stocks/quote") {
      return fetchStockQuote(request, env, url);
    }

    if (url.pathname === "/v1/stocks/candle") {
      return fetchStockCandle(request, env, url);
    }

    if (url.pathname === "/v1/stocks/td-quote") {
      return fetchStockQuoteTwelveData(request, env, url);
    }

    if (url.pathname === "/v1/stocks/ts") {
      return fetchStockTimeSeries(request, env, url);
    }

    const namespace = getNamespaceFromPath(url.pathname);
    if (!namespace) {
      return jsonResponse({ ok: false, error: "Not found" }, 404, request, env);
    }

    if (!isAuthorized(request, env)) {
      return jsonResponse({ ok: false, error: "Unauthorized" }, 401, request, env);
    }

    const storageKey = `state:${namespace}`;

    if (request.method === "GET") {
      const existing = await env.HN_STATE_DATA.get(storageKey, { type: "json" });
      if (!existing) {
        return jsonResponse({ ok: false, error: "No data for namespace" }, 404, request, env);
      }
      return jsonResponse(existing, 200, request, env);
    }

    if (request.method === "PUT") {
      let payload;
      try {
        payload = await request.json();
      } catch {
        return jsonResponse({ ok: false, error: "Invalid JSON body" }, 400, request, env);
      }

      if (!payload || typeof payload !== "object") {
        return jsonResponse({ ok: false, error: "Request body must be an object" }, 400, request, env);
      }

      const wrapped = {
        ...payload,
        syncedAt: new Date().toISOString(),
      };

      await env.HN_STATE_DATA.put(storageKey, JSON.stringify(wrapped));
      return jsonResponse({ ok: true, namespace, syncedAt: wrapped.syncedAt }, 200, request, env);
    }

    return jsonResponse({ ok: false, error: "Method not allowed" }, 405, request, env);
  },
};
