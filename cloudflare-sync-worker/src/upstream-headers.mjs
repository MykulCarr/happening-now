// The headers we send when fetching a publisher's feed, in one place.
//
// This exists because the nightly digest and the live site disagreed for
// months. /v1/rss/raw sent these headers; the curation sweep sent a
// self-identifying "happening-now-curator/1.0" UA and fetched publishers
// directly. Publishers' bot defenses treat those two requests completely
// differently from a Cloudflare Worker IP, so the digest measured a client
// nobody uses:
//
//   - False alarms (17 of the 18 feeds it flagged on 2026-09-12): nine NBC
//     owned-and-operated stations reported 403 and six TownNews papers
//     401/451/404, all of them serving the site fine. The verify phase
//     re-probed with the same UA a day later and "confirmed" every one of
//     them, because a WAF rule is not a transient hiccup.
//   - Missed breakages (7 of them): Cal Coast News, Bandcamp Daily and
//     Sky & Telescope answered the direct fetch happily while the proxy — the
//     path that actually feeds the site — got 502s, so the digest called them
//     healthy while they rendered nothing. Two cities, Indianapolis and
//     Louisville, were left with no working feed at all and went unreported.
//
// So anything that asks "is this feed usable on the site?" must send exactly
// what the site sends. Import this rather than retyping a copy. (curate.js's
// scan sends RSS_FETCH_HEADERS alone, without the browser retry, to stay
// inside the 50-subrequest budget; its verify phase goes through
// /v1/rss/raw, which has the retry, so a CBC-style lead is cleared there.)
//
// .mjs for the same reason feed-health.mjs is: the repo has no
// "type": "module", so a .js extension makes plain-node imports warn.
import { looksLikeFeed } from "./rss-cache.mjs";

// Which User-Agent, measured 2026-10-18 from a real Worker IP across all 471
// catalog feeds (scratch `wrangler dev --remote` probe, both UAs, same run):
//
//   - Pretending to be Chrome: 420 worked. 39 failed with a 403 "Checking your
//     browser..." page (/__challenge/probes.js) — the bot wall shared by the
//     WordPress-hosted nonprofits: Texas Tribune, CalMatters, VTDigger,
//     WyoFile, CT Mirror, MinnPost, Bridge Michigan, Longreads... It targets
//     clients that *claim* to be a browser and then can't run JavaScript,
//     which is exactly what a Worker with a Chrome UA looks like. Nine places
//     were left with no working feed.
//   - Saying honestly what we are: 457 worked, including Reddit (the old
//     "HAPPENING-NOW/1.0 RSS Proxy" UA had once drawn 503s there; this one
//     doesn't). Only CBC refused it (520) and wanted the browser UA.
//
// So: identify honestly first, and fall back to the browser UA only when the
// answer isn't a feed. The retry costs a subrequest on the handful of
// CBC-style hosts, never on a healthy fetch.
export const FEED_READER_UA = "happening-now.net feed reader (+https://happening-now.net/sources)";
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const BASE_HEADERS = {
  Accept: "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  // CONSENT=YES+ is Google's documented bypass for the consent.google.com
  // redirect that non-browser clients otherwise get steered into; without
  // it, news.google.com RSS responses return a consent HTML page or 503.
  Cookie: "CONSENT=YES+cb",
};
export const RSS_FETCH_HEADERS = { ...BASE_HEADERS, "User-Agent": FEED_READER_UA };
export const RSS_FETCH_HEADERS_BROWSER = { ...BASE_HEADERS, "User-Agent": BROWSER_UA };

// Fetch a feed the way /v1/rss/raw does: honest UA, then the browser UA if the
// first answer wasn't a usable feed. Resolves to { ok, status, text }; throws
// only if both attempts fail at the network level.
// Hosts that only answer the browser UA, so asking honestly first would just
// waste a round trip. Yahoo isn't a feed at all — the stocks page sends its
// JSON through /v1/rss/raw — so without this every quote would pay double.
const BROWSER_FIRST_HOSTS = new Set([
  "query1.finance.yahoo.com", "query2.finance.yahoo.com",
  "www.cbc.ca",
]);

export async function fetchFeedUpstream(url, init = {}) {
  const attempt = async (headers) => {
    try {
      const res = await fetch(url, { ...init, headers });
      return { ok: res.ok, status: res.status, text: res.ok ? await res.text() : "" };
    } catch (err) {
      return { error: err };
    }
  };
  let host = "";
  try { host = new URL(url).host; } catch {}
  if (BROWSER_FIRST_HOSTS.has(host)) {
    const only = await attempt(RSS_FETCH_HEADERS_BROWSER);
    if (only.error) throw only.error;
    return only;
  }
  const first = await attempt(RSS_FETCH_HEADERS);
  if (first.ok && looksLikeFeed(first.text)) return first;
  const second = await attempt(RSS_FETCH_HEADERS_BROWSER);
  if (second.ok && looksLikeFeed(second.text)) return second;
  // Neither is a feed — or it was never meant to be one: the stocks page sends
  // Yahoo JSON through /v1/rss/raw, and Yahoo wants the browser UA. So prefer
  // the browser answer, which is exactly what this route returned before the
  // honest-first change, then any 200, then the first refusal.
  const answered = [second, first].find((r) => r.ok) || [first, second].find((r) => !r.error);
  if (answered) return answered;
  throw first.error;
}
