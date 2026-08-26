// Build the curation digest: what's broken, and what's worth adding.
//
//   node scripts/curate-report.mjs                 # human-readable to stdout
//   node scripts/curate-report.mjs --html out.html # write an emailable report
//   node scripts/curate-report.mjs --json          # machine-readable
//
// Three passes, all through the production Worker proxy so a candidate is only
// ever proposed if it actually works from where the site fetches it:
//
//   1. HEALTH     — every curated feed, same check as scripts/check-feeds.mjs.
//   2. SELF-HEAL  — for each outlet, re-read its homepage <link rel=alternate>
//                   tags and look for a working feed we don't already have.
//                   This is the answer to the Tegna/Hearst rot: when a
//                   publisher moves its feed, the old URL dies but the new one
//                   is advertised right there in the homepage <head>.
//   3. GAPS       — cities with no Patch feed yet. Patch URLs are derivable
//                   from (state, city), so this needs no external directory.
//
// It never edits data/local-stations.json. Everything it finds is a proposal
// for a human to accept or reject — adding a source to a public news site is
// an editorial act, and an automated feed discovery has no idea whether an
// outlet is reputable.
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkFeedText } from "../cloudflare-sync-worker/src/feed-health.mjs";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const PROXY = "https://happening-now.net/v1/rss/raw?url=";
const CONCURRENCY = 6;
const TIMEOUT_MS = 20000;

const STATE_SLUG = {
  AL: "alabama", AK: "alaska", AZ: "arizona", AR: "arkansas", CA: "california",
  CO: "colorado", CT: "connecticut", DE: "delaware", FL: "florida", GA: "georgia",
  HI: "hawaii", ID: "idaho", IL: "illinois", IN: "indiana", IA: "iowa",
  KS: "kansas", KY: "kentucky", LA: "louisiana", ME: "maine", MD: "maryland",
  MA: "massachusetts", MI: "michigan", MN: "minnesota", MS: "mississippi",
  MO: "missouri", MT: "montana", NE: "nebraska", NV: "nevada",
  NH: "new-hampshire", NJ: "new-jersey", NM: "new-mexico", NY: "new-york",
  NC: "north-carolina", ND: "north-dakota", OH: "ohio", OK: "oklahoma",
  OR: "oregon", PA: "pennsylvania", RI: "rhode-island", SC: "south-carolina",
  SD: "south-dakota", TN: "tennessee", TX: "texas", UT: "utah", VT: "vermont",
  VA: "virginia", WA: "washington", WV: "west-virginia", WI: "wisconsin",
  WY: "wyoming",
};

async function viaProxy(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(PROXY + encodeURIComponent(url), { signal: controller.signal });
    return res.ok ? await res.text() : "";
  } catch {
    return "";
  } finally {
    clearTimeout(timer);
  }
}

// Same verdict as the digest and check-feeds: a candidate that won't parse is
// no use as a replacement, however many <item> elements it appears to hold.
const itemCount = xml => { const r = checkFeedText(xml); return r.ok ? r.items : 0; };

async function pool(items, worker, limit = CONCURRENCY) {
  const out = [];
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await worker(items[i]);
    }
  }));
  return out;
}

// Pull feed URLs a site advertises in its <head>. Publishers keep these current
// even when they quietly retire an old feed path.
function discoverFeedLinks(html, baseUrl) {
  const out = new Set();
  const re = /<link\b[^>]*>/gi;
  for (const tag of html.match(re) || []) {
    if (!/rel\s*=\s*["']?alternate/i.test(tag)) continue;
    if (!/type\s*=\s*["']?application\/(rss|atom)\+xml/i.test(tag)) continue;
    const href = (tag.match(/href\s*=\s*["']([^"']+)["']/i) || [])[1];
    if (!href) continue;
    try {
      out.add(new URL(href, baseUrl).toString());
    } catch { /* malformed href — skip */ }
  }
  return [...out];
}

const { states } = JSON.parse(
  await fs.readFile(path.join(repoRoot, "data", "local-stations.json"), "utf8"));

const feeds = [];
for (const [state, block] of Object.entries(states)) {
  for (const [place, node] of Object.entries(block)) {
    for (const e of node.entries || []) feeds.push({ state, place, ...e });
  }
}
const known = new Set(feeds.map(f => f.rss));

console.error(`[1/3] health-checking ${feeds.length} feeds…`);
const health = await pool(feeds, async f => ({ ...f, items: itemCount(await viaProxy(f.rss)) }));
const dead = health.filter(f => f.items === 0);

// Only bother self-healing outlets whose feed is actually down, plus a rolling
// sample of healthy ones — re-fetching 267 homepages every run is rude and slow.
const sites = [...new Map(dead.filter(f => f.site).map(f => [f.site, f])).values()];
console.error(`[2/3] looking for replacement feeds on ${sites.length} site(s)…`);
const healed = [];
await pool(sites, async f => {
  const html = await viaProxy(f.site);
  if (!html) return;
  for (const link of discoverFeedLinks(html, f.site)) {
    if (known.has(link)) continue;
    const n = itemCount(await viaProxy(link));
    if (n > 0) healed.push({ ...f, candidate: link, items: n });
  }
});

const missingPatch = [];
for (const [state, block] of Object.entries(states)) {
  if (!STATE_SLUG[state]) continue;
  for (const [place, node] of Object.entries(block)) {
    if (place === "_state") continue;
    if ((node.entries || []).some(e => e.rss.includes("patch.com"))) continue;
    missingPatch.push({
      state, place,
      candidate: `https://patch.com/feeds/${STATE_SLUG[state]}/${place.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`,
    });
  }
}
console.error(`[3/3] probing ${missingPatch.length} Patch gap(s)…`);
const patchFound = (await pool(missingPatch, async c => ({ ...c, items: itemCount(await viaProxy(c.candidate)) })))
  .filter(c => c.items > 0);

const emptyPlaces = [];
for (const [state, block] of Object.entries(states)) {
  for (const [place, node] of Object.entries(block)) {
    const live = (node.entries || []).filter(e => !dead.some(d => d.rss === e.rss));
    if (!live.length) emptyPlaces.push(`${state}/${place}`);
  }
}

const report = {
  generated: new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC",
  checked: feeds.length,
  dead: dead.map(({ state, place, name, rss, site }) => ({ state, place, name, rss, site })),
  emptyPlaces,
  replacements: healed.map(({ state, place, name, candidate, items }) => ({ state, place, name, candidate, items })),
  newPatch: patchFound.map(({ state, place, candidate, items }) => ({ state, place, candidate, items })),
};

const htmlArg = process.argv.indexOf("--html");
if (process.argv.includes("--json")) {
  console.log(JSON.stringify(report, null, 2));
} else if (htmlArg !== -1) {
  await fs.writeFile(process.argv[htmlArg + 1], renderHtml(report), "utf8");
  console.error(`wrote ${process.argv[htmlArg + 1]}`);
} else {
  console.log(renderText(report));
}

function renderText(r) {
  const L = [`HAPPENING NOW — curation digest ${r.generated}`,
    `${r.checked} feeds checked, ${r.dead.length} dead`, ""];
  if (r.emptyPlaces.length) L.push(`!! NO WORKING FEED: ${r.emptyPlaces.join(", ")}`, "");
  if (r.dead.length) {
    L.push("DEAD — needs removing or replacing:");
    r.dead.forEach(d => L.push(`  ${d.state}/${d.place}  ${d.name}\n      ${d.rss}`));
    L.push("");
  }
  if (r.replacements.length) {
    L.push("REPLACEMENT FOUND — the outlet now advertises a working feed:");
    r.replacements.forEach(c => L.push(`  ${c.state}/${c.place}  ${c.name}  (${c.items} items)\n      ${c.candidate}`));
    L.push("");
  }
  if (r.newPatch.length) {
    L.push("NEW PATCH COVERAGE available:");
    r.newPatch.forEach(c => L.push(`  ${c.state}/${c.place}  (${c.items} items)\n      ${c.candidate}`));
    L.push("");
  }
  if (!r.dead.length && !r.replacements.length && !r.newPatch.length) L.push("Nothing to action.");
  L.push("Approve by adding to data/local-stations.json, then: npm run coverage && npm run check-feeds");
  return L.join("\n");
}

function renderHtml(r) {
  const esc = s => String(s).replace(/[&<>]/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[m]));
  const rows = (list, cols) => list.map(x =>
    `<tr>${cols.map(c => `<td style="padding:6px 10px;border-top:1px solid #ddd">${esc(c(x))}</td>`).join("")}</tr>`).join("");
  const section = (title, list, head, cols) => !list.length ? "" :
    `<h2 style="font:600 15px system-ui;margin:22px 0 6px">${title}</h2>
     <table style="border-collapse:collapse;font:13px system-ui;width:100%">
     <tr>${head.map(h => `<th align="left" style="padding:6px 10px;background:#f3f4f6">${h}</th>`).join("")}</tr>
     ${rows(list, cols)}</table>`;
  return `<div style="max-width:800px;margin:0 auto;font:14px system-ui;color:#111">
    <h1 style="font-size:18px">Happening Now — curation digest</h1>
    <p style="color:#555">${esc(r.generated)} · ${r.checked} feeds checked · <b>${r.dead.length} dead</b></p>
    ${r.emptyPlaces.length ? `<p style="padding:10px;background:#fee2e2;border-radius:6px"><b>No working feed at all:</b> ${esc(r.emptyPlaces.join(", "))}</p>` : ""}
    ${section("Dead — remove or replace", r.dead, ["Place", "Source", "URL"],
      [d => `${d.state}/${d.place}`, d => d.name, d => d.rss])}
    ${section("Replacement found on the outlet's own site", r.replacements, ["Place", "Source", "Candidate", "Items"],
      [c => `${c.state}/${c.place}`, c => c.name, c => c.candidate, c => c.items])}
    ${section("New Patch coverage available", r.newPatch, ["Place", "Candidate", "Items"],
      [c => `${c.state}/${c.place}`, c => c.candidate, c => c.items])}
    <p style="color:#555;margin-top:22px">Approve by adding to <code>data/local-stations.json</code>,
    then <code>npm run coverage &amp;&amp; npm run check-feeds</code>. Nothing here has been changed automatically.</p>
  </div>`;
}
