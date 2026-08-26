// What "this feed is broken" means, in one place, so the nightly curation
// sweep (curate.js) and `npm run check-feeds` can never disagree.
//
// Counting <item> in the raw text is NOT the same question as "does the
// dashboard render anything". The browser parses with DOMParser, and DOMParser
// rejects the *whole document* on any XML error — so a feed can carry a hundred
// perfectly good <item> elements and still show zero headlines. Two of those
// ran broken for weeks (canarymedia.com, lwlies.com) precisely because every
// curl-and-grep check called them healthy, including this project's own.
//
// The repairs below mirror the ones assets/common.js applies before parsing.
// They have to stay in step: anything the browser repairs must not be reported
// as dead here, and anything the browser chokes on must be. common.js is a
// browser IIFE with no exports, so this is a deliberate second copy rather than
// a shared import — keep the two in sync when either changes.
//
// .mjs, not .js: scripts/check-feeds.mjs imports this with plain node, and the
// repo has no "type": "module", so a .js extension makes every run print a
// module-type warning. Wrangler bundles either extension happily.

// Prefixes assets/common.js injects when a feed uses them without declaring
// them. A prefix outside this list is a real parse failure, not a repairable one.
const KNOWN_NAMESPACES = new Set([
  "media", "content", "dc", "atom", "sy", "slash", "wfw", "itunes", "georss",
]);

// Leading blank lines before `<?xml` and anything after the closing root tag
// both kill DOMParser; common.js trims them, so they are not failures.
export function trimFeedEnvelope(text) {
  const trimmed = text.replace(/^[\s\uFEFF]+/, "");
  const close = trimmed.lastIndexOf("</rss>") >= 0 ? "</rss>"
    : (trimmed.lastIndexOf("</feed>") >= 0 ? "</feed>" : "");
  if (!close) return trimmed;
  return trimmed.slice(0, trimmed.lastIndexOf(close) + close.length);
}

// Returns a short reason string, or "" when the feed is fine. Order matters:
// report the parse failure rather than the item count, because a document that
// won't parse renders nothing regardless of how many items it appears to hold.
export function feedProblem(text) {
  const body = trimFeedEnvelope(text);
  if (!body.trim()) return "empty response";

  // CDATA and comments may legally contain anything, so blank them before
  // looking for markup errors — otherwise every feed with an HTML summary
  // inside CDATA reports a false bare-ampersand.
  const scannable = body
    .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "")
    .replace(/<!--[\s\S]*?-->/g, "");

  const declared = new Set();
  const declRe = /xmlns:([A-Za-z_][\w.-]*)\s*=/g;
  for (let m; (m = declRe.exec(body));) declared.add(m[1]);

  const undeclared = new Set();
  const usageRe = /<\/?([A-Za-z_][\w.-]*):[A-Za-z_]/g;
  for (let m; (m = usageRe.exec(scannable));) {
    if (!declared.has(m[1]) && !KNOWN_NAMESPACES.has(m[1])) undeclared.add(m[1]);
  }
  if (undeclared.size) return `undeclared namespace prefix: ${[...undeclared].join(", ")}`;

  // Note there is deliberately no bare-ampersand rule here. A raw `&` is fatal
  // to DOMParser and it is the commonest publisher typo (KTLA 5's channel title
  // blanked all of Los Angeles with one), but common.js now escapes it before
  // parsing — so it no longer costs anyone a headline, and reporting it would
  // be crying wolf about a feed the site renders perfectly well.

  const items = (body.match(/<(item|entry)[\s>]/g) || []).length;
  if (items === 0) return "no items";
  return "";
}

// Convenience wrapper: the shape both callers actually want.
export function checkFeedText(text) {
  const problem = feedProblem(text);
  return {
    ok: !problem,
    problem,
    items: (trimFeedEnvelope(text).match(/<(item|entry)[\s>]/g) || []).length,
  };
}
