// Reader "Report a problem" — POST /v1/report, summarised in the digest email.
//
// This is the one place a visitor's browser sends anything to us, so it is
// built to carry as little as possible:
//
//   - A report is { feed, article, reason } and nothing else. No free text
//     (nobody can type personal details into it, and spammers get nothing to
//     publish), no cookie, no ID. The row stores the UTC day, not a time, and
//     never the IP or User-Agent.
//   - `reason` must be one of REASONS. Anything else is refused.
//   - The page sends text/plain so the browser makes a "simple" request with
//     no CORS preflight; we parse the JSON ourselves.
//
// Abuse is bounded rather than prevented: a request must come from one of our
// own origins, each browser reports an article once (enforced client-side in
// assets/report.js), and DAILY_CAP stops a script filling the table. Hitting
// the cap is silent to the sender and shows in the digest.
//
// D1, not KV — see wrangler.jsonc. Schema: schema/reports.sql.

export const REASONS = {
  paywall: "Hit a paywall",
  broken: "Link broken or won't load",
  stale: "Old news",
  notnews: "Not news (ads, spam)",
  unreadable: "Hard to read on my device",
};

const DAILY_CAP = 500;
const MAX_URL = 600;
const KEEP_DAYS = 90;

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n) => new Date(Date.now() - n * 86400e3).toISOString().slice(0, 10);

function cleanUrl(value) {
  const s = String(value || "").trim();
  if (!s || s.length > MAX_URL) return "";
  try {
    const u = new URL(s);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : "";
  } catch {
    return "";
  }
}

// Validates a raw request body. Returns the row to store, or null.
export function parseReport(text) {
  if (!text || text.length > 2000) return null;
  let body;
  try { body = JSON.parse(text); } catch { return null; }
  const feed = cleanUrl(body?.feed);
  const article = cleanUrl(body?.article);
  const reason = String(body?.reason || "");
  if (!feed || !article || !Object.hasOwn(REASONS, reason)) return null;
  return { feed, article, reason };
}

// `allowedOrigins` comes from index.js's ALLOWED_ORIGINS parsing. A browser
// always sends Origin on a POST, so a missing one means a script.
export async function handleReport(request, env, allowedOrigins, respond) {
  if (request.method !== "POST") return respond({ ok: false, error: "POST only" }, 405);
  const origin = String(request.headers.get("Origin") || "").replace(/\/+$/, "");
  if (!origin || !allowedOrigins.includes(origin)) return respond({ ok: false, error: "Forbidden" }, 403);
  if (!env.HN_REPORTS) return respond({ ok: false, error: "Reports unavailable" }, 503);

  const row = parseReport(await request.text());
  if (!row) return respond({ ok: false, error: "Invalid report" }, 400);

  const day = today();
  try {
    const { n } = await env.HN_REPORTS.prepare("SELECT COUNT(*) AS n FROM reports WHERE day = ?").bind(day).first();
    if (n < DAILY_CAP) {
      await env.HN_REPORTS.prepare("INSERT INTO reports (day, feed, article, reason) VALUES (?, ?, ?, ?)")
        .bind(day, row.feed, row.article, row.reason).run();
    }
  } catch {
    return respond({ ok: false, error: "Could not save" }, 500);
  }
  // Same answer whether or not the cap swallowed it.
  return respond({ ok: true }, 200);
}

// For the digest: every report after `sinceDay` and before today (today is
// still filling up — it goes in the next digest), grouped by feed
// and reason, with up to three example articles each. Also prunes rows older
// than KEEP_DAYS — reports are for acting on, not for keeping.
export async function summarizeReports(env, sinceDay) {
  if (!env.HN_REPORTS) return { rows: [], total: 0, capped: [] };
  const since = sinceDay || daysAgo(30);
  // Grouped per article and folded in JS: group_concat would join URLs with
  // commas, and URLs can contain commas.
  const { results } = await env.HN_REPORTS.prepare(
    `SELECT feed, reason, article, COUNT(*) AS n
       FROM reports WHERE day > ? AND day < ? GROUP BY feed, reason, article ORDER BY n DESC LIMIT 500`
  ).bind(since, today()).all();
  const { results: days } = await env.HN_REPORTS.prepare(
    "SELECT day, COUNT(*) AS n FROM reports WHERE day > ? AND day < ? GROUP BY day HAVING n >= ?"
  ).bind(since, today(), DAILY_CAP).all();
  await env.HN_REPORTS.prepare("DELETE FROM reports WHERE day < ?").bind(daysAgo(KEEP_DAYS)).run();
  const byKey = new Map();
  for (const r of results || []) {
    const key = `${r.feed}\n${r.reason}`;
    const g = byKey.get(key) || { feed: r.feed, reason: r.reason, label: REASONS[r.reason] || r.reason, n: 0, articles: [] };
    g.n += r.n;
    if (g.articles.length < 3) g.articles.push(r.article);
    byKey.set(key, g);
  }
  const rows = [...byKey.values()].sort((a, b) => b.n - a.n).slice(0, 60);
  return { rows, total: rows.reduce((s, r) => s + r.n, 0), capped: (days || []).map((d) => d.day) };
}

// The last day a digest sent now has fully covered.
export const reportsCoveredThrough = () => daysAgo(1);
