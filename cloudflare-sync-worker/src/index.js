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
  const cached = await env.UM_TIME_DATA.get(ARTEMIS_UPDATES_CACHE_KEY, { type: "json" });
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

  await env.UM_TIME_DATA.put(ARTEMIS_UPDATES_CACHE_KEY, JSON.stringify({
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

export default {
  async fetch(request, env) {
    if (!isOriginAllowed(request, env)) {
      return jsonResponse({ ok: false, error: "Origin not allowed" }, 403, request, env);
    }

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: getCorsHeaders(request, env) });
    }

    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return jsonResponse({ ok: true, service: "um-time-sync" }, 200, request, env);
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

    const namespace = getNamespaceFromPath(url.pathname);
    if (!namespace) {
      return jsonResponse({ ok: false, error: "Not found" }, 404, request, env);
    }

    if (!isAuthorized(request, env)) {
      return jsonResponse({ ok: false, error: "Unauthorized" }, 401, request, env);
    }

    const storageKey = `state:${namespace}`;

    if (request.method === "GET") {
      const existing = await env.UM_TIME_DATA.get(storageKey, { type: "json" });
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

      await env.UM_TIME_DATA.put(storageKey, JSON.stringify(wrapped));
      return jsonResponse({ ok: true, namespace, syncedAt: wrapped.syncedAt }, 200, request, env);
    }

    return jsonResponse({ ok: false, error: "Method not allowed" }, 405, request, env);
  },
};
