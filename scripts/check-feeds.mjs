// Health-check every feed in data/local-stations.json through the production
// Worker proxy — the same check data/local-stations.json's _meta.howToAdd
// requires before a feed is added.
//
//   node scripts/check-feeds.mjs            # report only
//   node scripts/check-feeds.mjs --json     # machine-readable, for a cron job
//
// Why this exists: on 2026-07-26 an audit found 33 of 249 curated feeds (13%)
// had gone dead since they were added, and four cities — Atlanta among them —
// were serving nothing at all. Nothing surfaced that; the app just quietly
// showed fewer headlines. Feed rot is continuous, so this needs re-running.
//
// It deliberately reports rather than edits. Removing a source is an editorial
// call, and a feed can 500 for a day without being dead.
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const PROXY = "https://happening-now.net/v1/rss/raw?url=";
const CONCURRENCY = 6;   // be polite to our own worker and to publishers
const TIMEOUT_MS = 20000;

const asJson = process.argv.includes("--json");

async function check(entry) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(PROXY + encodeURIComponent(entry.rss), { signal: controller.signal });
    const text = await res.text();
    // Atom uses <entry>, RSS uses <item>; either counts as alive.
    const items = (text.match(/<(item|entry)[\s>]/g) || []).length;
    return { ...entry, items, ok: items > 0 };
  } catch (err) {
    return { ...entry, items: 0, ok: false, error: err.name === "AbortError" ? "timeout" : err.message };
  } finally {
    clearTimeout(timer);
  }
}

async function pool(items, worker, limit) {
  const out = [];
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) out.push(await worker(items[next++]));
  }));
  return out;
}

const read = async name => JSON.parse(await fs.readFile(path.join(repoRoot, "data", name), "utf8"));
const { states } = await read("local-stations.json");
const { topics } = await read("topic-sources.json");

const feeds = [];
for (const [state, block] of Object.entries(states)) {
  for (const [key, node] of Object.entries(block)) {
    for (const e of node.entries || []) {
      feeds.push({ state, place: key === "_state" ? "(statewide)" : key, name: e.name, rss: e.rss });
    }
  }
}
// Topic feeds rot exactly like the geographic ones, so they belong in the same
// sweep — otherwise the Science tab can go quiet with nothing reporting it.
for (const [id, topic] of Object.entries(topics)) {
  for (const e of topic.entries || []) {
    feeds.push({ state: "topic", place: id, name: e.name, rss: e.rss });
  }
}

if (!asJson) console.error(`Checking ${feeds.length} feeds…`);
const results = await pool(feeds, check, CONCURRENCY);
const dead = results.filter(r => !r.ok);

// A block losing every feed is the failure that actually hurts: that place
// silently shows no local news at all.
const byBlock = new Map();
for (const r of results) {
  const k = `${r.state}/${r.place}`;
  const acc = byBlock.get(k) || { total: 0, alive: 0 };
  acc.total++;
  if (r.ok) acc.alive++;
  byBlock.set(k, acc);
}
const empty = [...byBlock].filter(([, v]) => v.alive === 0).map(([k]) => k);

if (asJson) {
  console.log(JSON.stringify({
    checked: results.length,
    dead: dead.length,
    emptyBlocks: empty,
    deadFeeds: dead.map(({ state, place, name, rss, error }) => ({ state, place, name, rss, error })),
  }, null, 2));
} else {
  console.log(`\n${results.length - dead.length}/${results.length} alive`);
  if (dead.length) {
    console.log(`\nDEAD (${dead.length}):`);
    for (const r of dead.sort((a, b) => a.state.localeCompare(b.state))) {
      console.log(`  ${r.state}/${r.place}  ${r.name}\n      ${r.rss}${r.error ? `  (${r.error})` : ""}`);
    }
  }
  if (empty.length) {
    console.log(`\n*** ${empty.length} PLACE(S) WITH NO WORKING FEED: ${empty.join(", ")} ***`);
  }
  console.log("\nFeed families known to fail through the proxy: Gannett /rss/,");
  console.log("Gray /arcio/rss/, Tegna /feeds/syndication/..., Hearst /topstories-rss.");
  console.log("Known good: Nexstar /feed/, Scripps /news.rss, FOX O&O /rss/category/local-news,");
  console.log("TownNews /search?f=rss, Arc /arc/outboundfeeds/rss/, Patch /feeds/<state>/<city>.");
}

process.exit(dead.length ? 1 : 0);
