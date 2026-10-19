// Exercises the daily visitor hash (cloudflare-sync-worker/src/visitors.mjs)
// through /v1/usage, against the REAL schema and SQL on Node's built-in
// SQLite — a stand-in for D1 that runs the same statements, ON CONFLICT and
// all. Checks: one row per visitor per day, paths join up, a new day means a
// new vid, yesterday's salt is destroyed, and no IP or User-Agent is stored.
//
//   npm run test:visitors
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { handleUsage } from "../cloudflare-sync-worker/src/usage.mjs";
import { visitorId, summarizeVisitors } from "../cloudflare-sync-worker/src/visitors.mjs";

const schema = readFileSync(new URL("../cloudflare-sync-worker/schema/reports.sql", import.meta.url), "utf8");
function fakeD1() {
  const db = new DatabaseSync(":memory:");
  db.exec(schema);
  const prepare = (sql) => ({
    bind: (...a) => ({
      run: async () => { db.prepare(sql).run(...a); return {}; },
      first: async () => db.prepare(sql).get(...a) ?? null,
      all: async () => ({ results: db.prepare(sql).all(...a) }),
    }),
  });
  const batch = async (stmts) => {
    db.exec("BEGIN");
    try { for (const s of stmts) await s.run(); db.exec("COMMIT"); } catch (e) { db.exec("ROLLBACK"); throw e; }
    return [];
  };
  return { raw: db, prepare, batch };
}

const ORIGINS = ["https://happening-now.net"];
const respond = (body, status) => ({ body, status });
const req = (body, { ip = "203.0.113.7", ua = "Mozilla/5.0 Test" } = {}) => {
  const h = { Origin: "https://happening-now.net", "CF-Connecting-IP": ip, "User-Agent": ua };
  return { method: "POST", cf: { country: "US" }, headers: { get: (k) => h[k] ?? null }, text: async () => JSON.stringify(body) };
};
let failures = 0;
const check = (name, ok) => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}`); if (!ok) failures++; };
const today = new Date().toISOString().slice(0, 10);
const yesterday = new Date(Date.now() - 86400e3).toISOString().slice(0, 10);

{
  const D1 = fakeD1(), env = { HN_REPORTS: D1 };
  await handleUsage(req({ e: [["nav", "start", "news"], ["nav", "news", "news:science"]], s: 40 }), env, ORIGINS, respond);
  await handleUsage(req({ e: [["nav", "news:science", "weather"]], s: 25 }), env, ORIGINS, respond);
  await handleUsage(req({ e: [["tap", "weather", "rings"]], s: 5 }), env, ORIGINS, respond);
  const rows = D1.raw.prepare("SELECT * FROM visitors").all();
  check("one visitor, one row", rows.length === 1);
  check("their steps join into one path", rows[0]?.path === "news>news:science>weather");
  check("steps and seconds add up", rows[0]?.pages === 3 && rows[0]?.seconds === 70);
  const stored = JSON.stringify(D1.raw.prepare("SELECT * FROM visitors").all()) + JSON.stringify(D1.raw.prepare("SELECT * FROM usage").all());
  check("no IP or User-Agent is stored anywhere", !stored.includes("203.0.113.7") && !stored.includes("Mozilla"));
  check("vid is a 16-hex hash", /^[0-9a-f]{16}$/.test(rows[0]?.vid || ""));

  await handleUsage(req({ e: [["nav", "start", "stocks"]], s: 3 }, { ua: "Other Browser" }), env, ORIGINS, respond);
  check("a different browser is a different visitor", D1.raw.prepare("SELECT COUNT(*) AS n FROM visitors").get().n === 2);

  await handleUsage(req({ e: [["nav", "start", "news"]] }, { ip: "" }), env, ORIGINS, respond);
  check("no IP header: counted, but no visitor row", D1.raw.prepare("SELECT COUNT(*) AS n FROM visitors").get().n === 2
    && D1.raw.prepare("SELECT n FROM usage WHERE kind='nav' AND a='start' AND b='news'").get().n === 2);

  await handleUsage(req({ e: [["tap", "news", "refresh"]], s: 99999 }, { ua: "Clamp" }), env, ORIGINS, respond);
  check("seconds per batch are capped at an hour", D1.raw.prepare("SELECT seconds FROM visitors WHERE path = ''").get()?.seconds === 3600);
}

{
  const D1 = fakeD1();
  D1.raw.prepare("INSERT INTO salts (day, salt) VALUES (?, ?)").run(yesterday, "yesterdays-salt");
  const r = req({});
  const a = await visitorId(r, D1, yesterday + "x");   // a fresh day key forces a salt lookup
  const b = await visitorId(r, D1, today);
  check("same person, different day, different vid", a && b && a !== b);
  const salts = D1.raw.prepare("SELECT day FROM salts").all().map((x) => x.day);
  check("yesterday's salt is destroyed once today's exists", salts.length === 1 && salts[0] === today);
  check("same person, same day, same vid", (await visitorId(r, D1, today)) === b);
}

{
  const D1 = fakeD1(), env = { HN_REPORTS: D1 };
  const long = Array.from({ length: 200 }, (_, i) => ["nav", i % 2 ? "news" : "weather", i % 2 ? "weather" : "news"]);
  for (let i = 0; i < 5; i++) await handleUsage(req({ e: long.slice(i * 40, i * 40 + 40) }), env, ORIGINS, respond);
  check("a very long visit's path is capped", D1.raw.prepare("SELECT length(path) AS n FROM visitors").get().n <= 400);

  D1.raw.prepare("INSERT INTO visitors (day, vid, path, pages, seconds) VALUES (?, 'a', 'news>weather', 2, 45), (?, 'b', 'news>weather', 2, 700), (?, 'c', 'stocks', 1, 5), ('2000-01-01', 'z', 'old', 1, 1)").run(today, today, yesterday);
  const s = await summarizeVisitors(env, yesterday);
  check("summary counts visitors in the window", s.visitors === 4);
  check("journeys are ranked", s.paths[0]?.path === "news>weather" && s.paths[0]?.n === 2);
  check("visit lengths are bucketed", s.lengths.some((x) => x.b === "10-60s") && s.lengths.some((x) => x.b === "10-30m"));
  check("rows past 90 days are pruned", D1.raw.prepare("SELECT COUNT(*) AS n FROM visitors WHERE day = '2000-01-01'").get().n === 0);
}

console.log(failures ? `\n${failures} failed` : "\nall passed");
process.exit(failures ? 1 : 0);
