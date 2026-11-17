// Exercises the last-known-good cache logic against a stubbed Cache API.
//
// Worth having as a real test because the failure mode it guards is invisible:
// if the stale path silently stopped working, every feed would still look fine
// until a publisher went down, and if it stopped being bypassable the health
// sweep would start calling dead feeds healthy.
//
//   node scripts/test-rss-cache.mjs
import {
  looksLikeFeed, readLastGood, writeLastGood, staleAllowed, lastGoodKey,
  withoutBuster, isXmlDocument, mayPassThrough, trimForReaders, READER_MAX_ITEMS,
} from "../cloudflare-sync-worker/src/rss-cache.mjs";

class FakeCache {
  constructor() { this.store = new Map(); this.puts = 0; }
  async match(req) { const hit = this.store.get(req.url); return hit ? hit.clone() : undefined; }
  async put(req, res) { this.puts += 1; this.store.set(req.url, res.clone()); }
}

let failures = 0;
const ok = (label, cond) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) failures += 1;
};

const FEED = `<?xml version="1.0"?><rss version="2.0"><channel><title>T</title><item><title>a</title></item></channel></rss>`;
const ATOM = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><entry><title>a</title></entry></feed>`;
const BOTWALL = `<!DOCTYPE html><html><body>Access denied. Enable JavaScript.</body></html>`;
const EMPTY_FEED = `<?xml version="1.0"?><rss version="2.0"><channel><title>T</title></channel></rss>`;

// --- looksLikeFeed: the gate that decides what may become a fallback copy
ok("RSS with an item is a feed", looksLikeFeed(FEED));
ok("Atom with an entry is a feed", looksLikeFeed(ATOM));
ok("bot-wall HTML is not a feed", !looksLikeFeed(BOTWALL));
ok("feed with zero items is not stored", !looksLikeFeed(EMPTY_FEED));
ok("empty body is not a feed", !looksLikeFeed(""));

// --- store and retrieve
const cache = new FakeCache();
const target = "https://example.com/feed/";
ok("storing a real feed succeeds", await writeLastGood(cache, target, FEED) === true);
const hit = await readLastGood(cache, target);
ok("stored copy comes back", hit !== null);
ok("stored copy is byte-identical", await hit.text() === FEED);
ok("stored copy carries a timestamp", !!(await readLastGood(cache, target)).headers.get("X-HN-Stored-At"));

// --- junk must never become the fallback
ok("storing a bot-wall is refused", await writeLastGood(cache, target + "x", BOTWALL) === false);
ok("and nothing was written for it", await readLastGood(cache, target + "x") === null);

// --- a feed we have never seen has no fallback
ok("unknown feed has no stale copy", await readLastGood(cache, "https://never-seen.example/feed") === null);

// --- cache keys must not collide across feeds
ok("different targets use different keys",
  lastGoodKey("https://a.example/feed").url !== lastGoodKey("https://b.example/feed").url);
ok("query strings survive in the key",
  lastGoodKey("https://a.example/s?f=rss&t=article").url.includes(encodeURIComponent("t=article")));

// --- a broken cache must never take the request down with it
const brokenCache = {
  async match() { throw new Error("cache exploded"); },
  async put() { throw new Error("cache exploded"); },
};
ok("read survives a throwing cache", await readLastGood(brokenCache, target) === null);
ok("write survives a throwing cache", await writeLastGood(brokenCache, target, FEED) === false);

// --- the health-sweep bypass
ok("readers may be served stale", staleAllowed("https://happening-now.net/v1/rss/raw?url=x") === true);
ok("nostale=1 forbids stale", staleAllowed("https://happening-now.net/v1/rss/raw?url=x&nostale=1") === false);
ok("nostale=0 still allows stale", staleAllowed("https://happening-now.net/v1/rss/raw?url=x&nostale=0") === true);
ok("a malformed url defaults to allowing stale", staleAllowed("not a url") === true);

// --- one key per feed, whatever the browser's cache-buster says
ok("buster alone is removed", withoutBuster("https://feeds.npr.org/1001/rss.xml?_hn=179") === "https://feeds.npr.org/1001/rss.xml");
ok("buster last is removed", withoutBuster("https://x.com/s/?f=rss&t=article&c=news&_hn=9") === "https://x.com/s/?f=rss&t=article&c=news");
ok("buster first keeps the rest", withoutBuster("https://x.com/f?_hn=9&a=1") === "https://x.com/f?a=1");
ok("buster in the middle keeps both sides", withoutBuster("https://x.com/f?a=1&_hn=9&b=2") === "https://x.com/f?a=1&b=2");
ok("no buster: untouched, encoding and all", withoutBuster("https://news.google.com/rss/search?q=a+b%20c") === "https://news.google.com/rss/search?q=a+b%20c");
ok("a param merely ending in _hn is kept", withoutBuster("https://x.com/f?my_hn=1") === "https://x.com/f?my_hn=1");
{
  const store = new FakeCache();
  await writeLastGood(store, withoutBuster("https://feeds.npr.org/1001/rss.xml?_hn=1"), FEED);
  const later = await readLastGood(store, withoutBuster("https://feeds.npr.org/1001/rss.xml?_hn=2"));
  ok("a copy stored on one visit is found on the next", Boolean(later));
}

// --- only feeds (or Yahoo's JSON) pass through
ok("rss passes", isXmlDocument('<?xml version="1.0"?><rss><channel></channel></rss>'));
ok("atom with leading blank lines passes", isXmlDocument('\n\n  <feed xmlns="http://www.w3.org/2005/Atom"></feed>'));
ok("an empty but real feed passes (the sweep judges it)", isXmlDocument("<rss version=\"2.0\"><channel></channel></rss>"));
ok("a byte-order mark is tolerated", isXmlDocument("\uFEFF<?xml version=\"1.0\"?><rss/>"));
ok("a comment before the rss tag passes", isXmlDocument("<!-- generator: x -->\n<rss version=\"2.0\"><channel/></rss>"));
ok("an html page that mentions rss is refused", !isXmlDocument("<!DOCTYPE html><html><link rel=alternate type=application/rss+xml><rss "));
ok("an html page is refused", !isXmlDocument("<!doctype html><html><head><title>A Farewell</title>"));
ok("a bot wall is refused", !mayPassThrough("https://texastribune.org/feed/", "<html><body>Checking your browser...</body></html>"));
ok("yahoo json passes", mayPassThrough("https://query1.finance.yahoo.com/v8/finance/chart/AAPL", '{"chart":{}}'));
ok("json from anywhere else is refused", !mayPassThrough("https://example.com/api", '{"a":1}'));

// --- readers get a trimmed feed
{
  const item = (i, body) => `<item><title>t${i}</title>${body}</item>`;
  const both = "<description>short</description><content:encoded><![CDATA[<p>the whole article</p>]]></content:encoded>";
  const many = `<rss><channel>${Array.from({ length: 40 }, (_, i) => item(i, both)).join("")}</channel></rss>`;
  const out = trimForReaders(many);
  ok("at most READER_MAX_ITEMS items", (out.match(/<item>/g) || []).length === READER_MAX_ITEMS);
  ok("the first items are the ones kept", out.includes("<title>t0</title>") && !out.includes("<title>t30</title>"));
  ok("full text dropped where a description exists", !out.includes("content:encoded") && out.includes("<description>short</description>"));
  const onlyFull = `<rss><channel>${item(0, "<content:encoded>the only text</content:encoded>")}</channel></rss>`;
  ok("full text kept when it is the only text", trimForReaders(onlyFull).includes("the only text"));
  const atom = `<feed>${Array.from({ length: 35 }, (_, i) => `<entry><title>a${i}</title></entry>`).join("")}</feed>`;
  ok("atom entries are capped too", (trimForReaders(atom).match(/<entry>/g) || []).length === READER_MAX_ITEMS);
  ok("still a feed afterwards", looksLikeFeed(out) && out.endsWith("</channel></rss>"));
}

console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
