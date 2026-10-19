// Daily visitor hash: links one visitor's steps within a single UTC day.
//
// The counters in usage.mjs can say "news -> weather happened 40 times" but
// not how many people that was, how long they stayed, or what route they
// took. This adds exactly that, the way Plausible does it, and no more:
//
//   vid = first 16 hex of SHA-256(dailySalt | IP | User-Agent)
//
// The salt is 32 random bytes made fresh for each UTC day and deleted the
// day after. Once it is gone, nobody (us included) can recompute a past vid
// or tie it to an IP, so yesterday's rows can't be linked to today's or to a
// person. The IP and User-Agent are only ever hashed, never stored.
//
// Not a cookie, not on the device, and never kept across days: a returning
// reader is a new visitor every day. Don't "fix" that with a persistent ID —
// it is the line the privacy policy promises.
//
// One row per visitor per day: their path (page and tab steps, capped), how
// many steps, and total seconds on screen. Schema: schema/reports.sql.

const KEEP_DAYS = 90;
const MAX_PATH = 400;              // characters of "news>weather>..." kept per visit
const MAX_SECS_PER_BATCH = 3600;

const daysAgo = (n) => new Date(Date.now() - n * 86400e3).toISOString().slice(0, 10);
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

// Salt per day, cached per isolate. D1 rather than KV so every Cloudflare
// location agrees on it at once (KV can lag ~60s, splitting one visitor in two).
let saltCache = { day: "", salt: "" };
async function dailySalt(db, day) {
  if (saltCache.day === day) return saltCache.salt;
  const fresh = hex(crypto.getRandomValues(new Uint8Array(32)));
  await db.prepare("INSERT OR IGNORE INTO salts (day, salt) VALUES (?, ?)").bind(day, fresh).run();
  const row = await db.prepare("SELECT salt FROM salts WHERE day = ?").bind(day).first();
  // Yesterday's salt goes as soon as today's exists: that is what makes old vids unrecoverable.
  await db.prepare("DELETE FROM salts WHERE day < ?").bind(day).run();
  saltCache = { day, salt: row.salt };
  return row.salt;
}

export async function visitorId(request, db, day) {
  const ip = request.headers.get("CF-Connecting-IP") || "";
  if (!ip) return null;
  const ua = request.headers.get("User-Agent") || "";
  const salt = await dailySalt(db, day);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}|${ip}|${ua}`));
  return hex(digest).slice(0, 16);
}

// The statement that folds one batch into the visitor's row for the day.
// `events` are already validated by usage.mjs.
export function visitStatement(db, day, vid, events, secs) {
  const steps = events.filter(([k]) => k === "nav").map(([, , b]) => b);
  const s = Math.max(0, Math.min(MAX_SECS_PER_BATCH, Math.round(Number(secs) || 0)));
  const path = steps.join(">").slice(0, MAX_PATH);
  // `excluded.` is SQLite's name for the row that failed to insert, so each
  // value is bound once with plain ? placeholders.
  return db.prepare(
    `INSERT INTO visitors (day, vid, path, pages, seconds) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (day, vid) DO UPDATE SET
       path = CASE WHEN excluded.path = '' OR length(path) + 1 + length(excluded.path) > ${MAX_PATH} THEN path
                   WHEN path = '' THEN excluded.path ELSE path || '>' || excluded.path END,
       pages = pages + excluded.pages,
       seconds = MIN(seconds + excluded.seconds, 86400)`
  ).bind(day, vid, path, steps.length, s);
}

// For /admin. Visit length in ranges, top journeys, visitors per day.
const LENGTH_SQL = `CASE WHEN seconds < 10 THEN '0-10s' WHEN seconds < 60 THEN '10-60s' WHEN seconds < 180 THEN '1-3m'
  WHEN seconds < 600 THEN '3-10m' WHEN seconds < 1800 THEN '10-30m' ELSE '30m+' END`;
export async function summarizeVisitors(env, sinceDay) {
  const db = env.HN_REPORTS;
  if (!db) return null;
  const [totals, byDay, lengths, paths] = await Promise.all([
    db.prepare("SELECT COUNT(*) AS visitors, COALESCE(SUM(pages), 0) AS pages, COALESCE(SUM(seconds), 0) AS seconds FROM visitors WHERE day >= ?").bind(sinceDay).first(),
    db.prepare("SELECT day, COUNT(*) AS n FROM visitors WHERE day >= ? GROUP BY day ORDER BY day").bind(sinceDay).all(),
    db.prepare(`SELECT ${LENGTH_SQL} AS b, COUNT(*) AS n FROM visitors WHERE day >= ? GROUP BY b`).bind(sinceDay).all(),
    db.prepare("SELECT path, COUNT(*) AS n FROM visitors WHERE day >= ? AND path != '' GROUP BY path ORDER BY n DESC LIMIT 25").bind(sinceDay).all(),
  ]);
  await db.prepare("DELETE FROM visitors WHERE day < ?").bind(daysAgo(KEEP_DAYS)).run();
  return { ...totals, byDay: byDay.results || [], lengths: lengths.results || [], paths: paths.results || [] };
}
