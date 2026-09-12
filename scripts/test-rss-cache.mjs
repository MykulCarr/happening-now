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

console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
