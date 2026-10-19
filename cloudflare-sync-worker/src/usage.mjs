// Anonymous usage counters — POST /v1/usage, shown on /admin.
//
// This answers "which pages, tabs, controls and sources get used" without
// tracking anybody. The browser (assets/usage.js) sends small batches of
// events; each one only adds 1 to a daily total. A row is
//
//   (day, kind, a, b) -> n
//
// and nothing else: no IP, no User-Agent, no time finer than the day, no
// visitor ID. Journeys, visit length and unique visitors come from the
// separate visitors table (visitors.mjs), linked by a hash that only lives
// for one day; this table stays pure counts.
//
// Kinds, and what `a` / `b` hold:
//   nav     a = where they were, b = where they went ("start" = arrived)
//   tap     a = page, b = control (fixed list in TAPS)
//   source  a = hostname of the clicked headline, b = where it was clicked
//   time    a = page, b = how long it was on screen, as a range (TIME_BUCKETS)
//   country a = two-letter country from Cloudflare, counted once per arrival
//
// Same guard rails as reports.mjs: our origins only, text/plain (no CORS
// preflight), allow-listed values only, a daily cap, 90-day deletion.
// Schema: schema/reports.sql (same D1 database).

import { visitorId, visitStatement } from "./visitors.mjs";

const PAGES = ["news", "weather", "stocks", "settings", "sources", "privacy", "terms", "feedback", "other"];

// Must match TAP_RULES in assets/usage.js.
const TAPS = {
  news: ["sources", "refresh"],
  weather: ["days-3", "days-7", "days-14", "alerts-local", "alerts-national", "alerts-both",
    "radar-load", "radar-open", "recenter", "rings", "legend", "refresh", "news-more",
    "layer-radar", "layer-wind", "layer-temp", "layer-clouds", "layer-air"],
  stocks: ["news-major", "news-watchlist", "sort-pinned", "sort-az", "sort-symbol", "refresh"],
  settings: ["watchlist-add", "watchlist-remove"],
};

// Must match BUCKETS in assets/usage.js. Ranges, never seconds: an exact
// duration is a needlessly sharp detail about one person's visit.
export const TIME_BUCKETS = ["0-10s", "10-30s", "30-60s", "1-3m", "3-10m", "10m+"];

// Tabs (news scopes and topics, settings tabs) are ids from our own catalogs.
// A tight token shape is the allow-list here: nothing personal fits in it.
const TAB = /^[a-z][a-z0-9-]{0,23}$/;
const HOST = /^(?=.{1,100}$)([a-z0-9-]+\.)+[a-z]{2,}$/;

const DAILY_CAP = 20000;          // events per day, across all kinds
const MAX_BATCH = 40;
const KEEP_DAYS = 90;

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n) => new Date(Date.now() - n * 86400e3).toISOString().slice(0, 10);

// "news" or "news:science". "start" is only valid as a nav origin.
function isPlace(s, allowStart) {
  if (allowStart && s === "start") return true;
  const [page, tab, extra] = String(s).split(":");
  if (extra !== undefined || !PAGES.includes(page)) return false;
  return tab === undefined || TAB.test(tab);
}

function validEvent(e) {
  if (!Array.isArray(e) || e.length !== 3) return false;
  const [kind, a, b] = e.map(String);
  if (kind === "nav") return isPlace(a, true) && isPlace(b, false) && a !== b;
  if (kind === "tap") return Object.hasOwn(TAPS, a) && TAPS[a].includes(b);
  if (kind === "source") return HOST.test(a) && isPlace(b, false);
  if (kind === "time") return PAGES.includes(a) && TIME_BUCKETS.includes(b);
  return false;     // "country" is added server-side only
}

// Returns { events: [[kind, a, b], ...], secs } or null if nothing in it is
// countable. `secs` is on-screen time since the last batch (for visit length). Unknown events are dropped one by one rather than failing the
// batch, so a control added to the page before this list doesn't take the
// rest of that visit's counts with it.
export function parseUsage(text) {
  if (!text || text.length > 6000) return null;
  let body;
  try { body = JSON.parse(text); } catch { return null; }
  const events = body?.e;
  if (!Array.isArray(events) || !events.length || events.length > MAX_BATCH) return null;
  const good = events.filter(validEvent).map((e) => e.map(String));
  return good.length ? { events: good, secs: Number(body.s) || 0 } : null;
}

export async function handleUsage(request, env, allowedOrigins, respond) {
  if (request.method !== "POST") return respond({ ok: false, error: "POST only" }, 405);
  const origin = String(request.headers.get("Origin") || "").replace(/\/+$/, "");
  if (!origin || !allowedOrigins.includes(origin)) return respond({ ok: false, error: "Forbidden" }, 403);
  if (!env.HN_REPORTS) return respond({ ok: false, error: "Unavailable" }, 503);

  const parsed = parseUsage(await request.text());
  if (!parsed) return respond({ ok: false, error: "Invalid" }, 400);
  const { events, secs } = parsed;
  const steps = events.slice();   // before the country rows are added

  // Country comes from Cloudflare's own lookup, never from the page, and is
  // counted once per arrival rather than per event.
  const country = /^[A-Z]{2}$/.test(request.cf?.country || "") ? request.cf.country : "XX";
  const arrivals = events.filter(([k, a]) => k === "nav" && a === "start").length;
  for (let i = 0; i < arrivals; i++) events.push(["country", country, ""]);

  const day = today();
  try {
    const { n } = await env.HN_REPORTS.prepare("SELECT COALESCE(SUM(n), 0) AS n FROM usage WHERE day = ?").bind(day).first();
    if (n < DAILY_CAP) {
      const upsert = env.HN_REPORTS.prepare(
        "INSERT INTO usage (day, kind, a, b, n) VALUES (?, ?, ?, ?, 1) ON CONFLICT (day, kind, a, b) DO UPDATE SET n = n + 1");
      const statements = events.map(([k, a, b]) => upsert.bind(day, k, a, b));
      const vid = await visitorId(request, env.HN_REPORTS, day);
      if (vid) statements.push(visitStatement(env.HN_REPORTS, day, vid, steps, secs));
      await env.HN_REPORTS.batch(statements);
    }
  } catch {
    return respond({ ok: false, error: "Could not save" }, 500);
  }
  return respond({ ok: true }, 200);
}

// For /admin: totals per (kind, a, b) since `sinceDay`, top rows per kind.
// Also prunes rows older than KEEP_DAYS.
export async function summarizeUsage(env, sinceDay) {
  if (!env.HN_REPORTS) return null;
  const { results } = await env.HN_REPORTS.prepare(
    "SELECT kind, a, b, SUM(n) AS n FROM usage WHERE day >= ? GROUP BY kind, a, b ORDER BY n DESC LIMIT 2000"
  ).bind(sinceDay).all();
  const { results: capped } = await env.HN_REPORTS.prepare(
    "SELECT day FROM usage WHERE day >= ? GROUP BY day HAVING SUM(n) >= ?"
  ).bind(sinceDay, DAILY_CAP).all();
  await env.HN_REPORTS.prepare("DELETE FROM usage WHERE day < ?").bind(daysAgo(KEEP_DAYS)).run();
  const out = { nav: [], tap: [], source: [], time: [], country: [], capped: (capped || []).map((r) => r.day) };
  for (const r of results || []) if (out[r.kind] && out[r.kind].length < 100) out[r.kind].push({ a: r.a, b: r.b, n: r.n });
  return out;
}
