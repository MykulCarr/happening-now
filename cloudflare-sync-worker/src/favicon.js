// Source icons for news cards and the stocks news list.
//
// These used to be fetched straight from google.com/s2/favicons by the browser,
// which handed Google one request per source per reader — carrying the reader's
// IP and a happening-now.net referrer, and so building a per-visitor record of
// which outlets they read. Routing the same call through the Worker keeps
// Google's small optimised PNGs while Google only ever sees this Worker, once
// per domain per cache period.
//
// Self-hosting the publishers' own icons instead was measured and rejected:
// from a Worker IP, bbc.com/favicon.ico is 39 KB and arstechnica.com 41 KB
// against Google's 285 bytes, propublica.org answers with a 272-byte stub, and
// Gray-owned stations (wilx.com) 502 outright — the same block that affects
// their RSS. Normalising that spread down to the 14-18px these actually render
// at would need Cloudflare Image Resizing, which is a paid feature.
//
// No CORS headers: these are consumed by plain <img> tags, which don't need them.

const UPSTREAM = "https://www.google.com/s2/favicons";
const ALLOWED_SIZES = new Set([16, 32, 64, 128]);
const EDGE_TTL_S = 604800;      // 7 days in Cloudflare's cache
const BROWSER_TTL_S = 2592000;  // 30 days in the visitor's browser
const FAILURE_TTL_S = 300;      // don't pin a transient failure for a month

// Hostname only — never a path or a scheme. At least one dot, so the stocks
// list's "source" placeholder from a failed extractDomain is rejected here.
const HOSTNAME_RE = /^(?=.{1,253}$)[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;

// A 404 rather than a placeholder pixel: both call sites hide the icon in an
// onerror handler, and a transparent square would leave the bordered container
// sitting there looking broken.
function iconMiss() {
  return new Response(null, {
    status: 404,
    headers: { "Cache-Control": `public, max-age=${FAILURE_TTL_S}` },
  });
}

export async function fetchFavicon(request, url) {
  if (request.method !== "GET") {
    return new Response(null, { status: 405 });
  }

  const domain = String(url.searchParams.get("domain") || "").trim().toLowerCase();
  if (!HOSTNAME_RE.test(domain)) {
    return iconMiss();
  }

  const requested = Number(url.searchParams.get("sz"));
  const sz = ALLOWED_SIZES.has(requested) ? requested : 64;

  let upstream;
  try {
    upstream = await fetch(`${UPSTREAM}?domain=${encodeURIComponent(domain)}&sz=${sz}`, {
      cf: { cacheEverything: true, cacheTtl: EDGE_TTL_S },
    });
  } catch {
    return iconMiss();
  }

  if (!upstream.ok) {
    return iconMiss();
  }

  // Declare image/png rather than echoing the upstream label. Passing a wrong
  // Content-Type through this zone is what silently broke the Climate tab once
  // already (see the /v1/rss/raw note in CLAUDE.md).
  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": `public, max-age=${BROWSER_TTL_S}, immutable`,
    },
  });
}
