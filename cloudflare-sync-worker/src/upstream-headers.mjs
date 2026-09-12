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
// what the site sends. Import this rather than retyping a copy.
//
// .mjs for the same reason feed-health.mjs is: the repo has no
// "type": "module", so a .js extension makes plain-node imports warn.
export const RSS_FETCH_HEADERS = {
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
};
