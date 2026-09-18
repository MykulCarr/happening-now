import { runCurationSweep } from "./curate.js";
import { runReminders } from "./reminders.mjs";
import { getMarketSnapshot } from "./markets.js";
import { getQuotes, parseSymbols } from "./quotes.js";
import { fetchFavicon } from "./favicon.js";
import { RSS_FETCH_HEADERS } from "./upstream-headers.mjs";
import { looksLikeFeed, readLastGood, writeLastGood, staleAllowed } from "./rss-cache.mjs";

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

async function fetchRssThroughProxy(request, env, url, ctx) {
  if (request.method !== "GET") {
    return jsonResponse({ ok: false, error: "Method not allowed" }, 405, request, env);
  }

  const parsed = parseRssProxyTarget(url);
  if (!parsed.ok) {
    return jsonResponse({ ok: false, error: parsed.error }, 400, request, env);
  }

  const cache = caches.default;
  const mayServeStale = staleAllowed(request.url);

  // Falls back to the last good copy of this feed instead of a bare 502. See
  // rss-cache.mjs for why that replaced the third-party proxy that used to sit
  // here. Transport failures only — a 200 carrying an empty or malformed feed
  // is passed through untouched further down, so the health sweep can still
  // diagnose it precisely rather than seeing a blanket 502.
  const serveStaleOr = async (errorBody, status) => {
    if (mayServeStale) {
      const stale = await readLastGood(cache, parsed.target);
      if (stale) {
        return rssResponse(await stale.text(), request, env, {
          cacheState: "stale",
          storedAt: stale.headers.get("X-HN-Stored-At") || "",
        });
      }
    }
    return jsonResponse({ ok: false, error: errorBody }, status, request, env);
  };

  let upstream;
  try {
    upstream = await fetch(parsed.target, {
      headers: RSS_FETCH_HEADERS,
      cf: {
        cacheEverything: true,
        cacheTtl: 120,
      },
    });
  } catch {
    return serveStaleOr("Failed to fetch target feed", 502);
  }

  if (!upstream.ok) {
    return serveStaleOr(`Target feed error: ${upstream.status}`, 502);
  }

  const xmlText = await upstream.text();

  // Refresh the good copy only when this really is a feed, so a bot-wall page
  // served with a 200 can never become what we fall back to. Deliberately not
  // awaited: storing it must not add latency to the reader's response.
  if (looksLikeFeed(xmlText)) {
    const stored = writeLastGood(cache, parsed.target, xmlText);
    if (ctx?.waitUntil) ctx.waitUntil(stored); else await stored;
  } else if (mayServeStale) {
    // Reachable but not serving a feed — prefer the last good copy if we have
    // one, otherwise fall through and hand the body over as-is.
    const stale = await readLastGood(cache, parsed.target);
    if (stale) {
      return rssResponse(await stale.text(), request, env, {
        cacheState: "stale",
        storedAt: stale.headers.get("X-HN-Stored-At") || "",
      });
    }
  }

  return rssResponse(xmlText, request, env, { cacheState: "live" });
}

// Always answer as XML, never echo the upstream Content-Type. Some publishers
// serve a perfectly valid feed as text/html (canarymedia.com/rss.xml does),
// and this Worker sits behind our own Cloudflare zone — which post-processes
// anything labelled HTML and appended its tracking beacon *after* `</rss>`.
// That trailing junk is not well-formed XML, so browser DOMParser rejected
// the whole document and the feed rendered zero items while every curl-and-
// grep check called it healthy. Upstream charset is handled too: .text()
// has already decoded to a JS string, so what we emit is always UTF-8 and
// passing through e.g. `charset=ISO-8859-1` would actively mislabel it.
//
// A stale body gets a much shorter max-age than a live one: the reader still
// sees headlines, but their browser comes back for the real thing in a minute
// rather than sitting on an outage for two.
function rssResponse(xmlText, request, env, { cacheState = "live", storedAt = "" } = {}) {
  return new Response(xmlText, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": cacheState === "stale" ? "public, max-age=60" : "public, max-age=120",
      "X-RSS-Proxy": "happening-now-sync",
      "X-HN-Cache": cacheState,
      ...(storedAt ? { "X-HN-Stored-At": storedAt } : {}),
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
    // Rides on the same daily firing rather than getting its own cron — see
    // reminders.mjs. Kept on a separate waitUntil and its own catch so neither
    // job can take the other down.
    ctx.waitUntil(
      runReminders(env)
        .then(r => console.log("[reminders]", JSON.stringify(r)))
        .catch(err => console.error("[reminders] failed:", err?.message || err)),
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

    if (url.pathname === "/v1/rss/raw") {
      return fetchRssThroughProxy(request, env, url, ctx);
    }

    if (url.pathname === "/v1/favicon") {
      return fetchFavicon(request, url);
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
