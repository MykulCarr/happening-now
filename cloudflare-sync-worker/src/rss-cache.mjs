// Last-known-good cache for /v1/rss/raw, so one publisher outage doesn't blank
// a widget.
//
// This replaces a third-party CORS proxy (api.codetabs.com) that sat behind the
// first-party route as a fallback. That was never reliable: it was down (522)
// for the whole of 2026-09-12, every feed it was asked about paid a 9s timeout
// before giving up, and it could not help with the one failure that would
// matter most — this Worker being down — because the site's own pages are
// served by Workers too. It also handed a third party each reader's IP and the
// list of feeds they read.
//
// A cached good copy covers strictly more ground: publishers that block
// Cloudflare Worker IPs, publishers that are simply down, rate limits and
// transient 5xx. And it stays first-party.
//
// Cache API rather than KV on purpose. KV on the free plan allows 1,000 writes
// a day; a single popular feed refreshing on a 120s cache would burn that
// alone. Cache API writes are unencumbered. The trade-off is that entries are
// per-colo, so a reader in a cold data centre may not have a stale copy to
// fall back on — partial cover, no quota risk, no third party.

// A day. Long enough to ride out an outage or a weekend, short enough that a
// feed which is genuinely gone stops being served from here before the weekly
// digest would have reported it.
export const LAST_GOOD_TTL_S = 24 * 60 * 60;

// Any host works as a cache key namespace as long as it is ours and constant;
// Cache API keys are URLs and never actually fetched.
const KEY_ORIGIN = "https://rss-last-good.happening-now.net";

export function lastGoodKey(target) {
  return new Request(`${KEY_ORIGIN}/?u=${encodeURIComponent(target)}`);
}

// Cheap structural check, deliberately NOT feedProblem(). This runs on every
// proxied response inside the free plan's CPU budget, and its only job is to
// keep a bot-wall or error page from being stored as the good copy. Judging
// whether a feed is *usable* stays with feed-health.mjs in the sweep, which is
// the one place allowed to be expensive about it.
export function looksLikeFeed(text) {
  if (!text) return false;
  const isFeedDoc = text.includes("<rss") || text.includes("<feed") || text.includes("<rdf:RDF");
  return isFeedDoc && (text.includes("<item") || text.includes("<entry"));
}

export async function readLastGood(cache, target) {
  try {
    return (await cache.match(lastGoodKey(target))) || null;
  } catch {
    // A cache miss must never be able to fail the request it was meant to save.
    return null;
  }
}

export async function writeLastGood(cache, target, xmlText) {
  if (!looksLikeFeed(xmlText)) return false;
  try {
    await cache.put(lastGoodKey(target), new Response(xmlText, {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": `public, max-age=${LAST_GOOD_TTL_S}`,
        "X-HN-Stored-At": new Date().toISOString(),
      },
    }));
    return true;
  } catch {
    return false;
  }
}

// The health checkers must never be shown a stale copy, or they would report a
// feed that died days ago as healthy — which is exactly the blind spot the
// curator User-Agent bug created. scripts/check-feeds.mjs and curate.js both
// send this, so the sweep always sees ground truth while readers get the cache.
export const NO_STALE_PARAM = "nostale";

export function staleAllowed(requestUrl) {
  try {
    return new URL(requestUrl).searchParams.get(NO_STALE_PARAM) !== "1";
  } catch {
    return true;
  }
}
