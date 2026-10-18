// Exercises cloudflare-sync-worker/src/reports.mjs against an in-memory stand-in
// for D1, forcing every branch: accept, each refusal, the daily cap, grouping,
// the "today waits for the next digest" boundary, and pruning.
//
//   npm run test:reports
import { handleReport, summarizeReports, parseReport, reportsCoveredThrough } from "../cloudflare-sync-worker/src/reports.mjs";

const day = (n) => new Date(Date.now() - n * 86400e3).toISOString().slice(0, 10);
const TODAY = day(0);

// Just enough of D1 for the five statements reports.mjs runs.
function fakeD1(rows = []) {
  const db = { rows };
  db.prepare = (sql) => ({
    bind: (...a) => ({
      first: async () => ({ n: db.rows.filter((r) => r.day === a[0]).length }),
      run: async () => {
        if (sql.startsWith("INSERT")) db.rows.push({ day: a[0], feed: a[1], article: a[2], reason: a[3] });
        else if (sql.startsWith("DELETE")) db.rows = db.rows.filter((r) => r.day >= a[0]);
        return {};
      },
      all: async () => {
        const inRange = db.rows.filter((r) => r.day > a[0] && r.day < a[1]);
        if (sql.includes("GROUP BY day")) {
          const counts = {};
          for (const r of inRange) counts[r.day] = (counts[r.day] || 0) + 1;
          return { results: Object.entries(counts).filter(([, n]) => n >= a[2]).map(([d, n]) => ({ day: d, n })) };
        }
        const g = new Map();
        for (const r of inRange) {
          const k = `${r.feed}|${r.reason}|${r.article}`;
          g.set(k, { ...r, n: (g.get(k)?.n || 0) + 1 });
        }
        return { results: [...g.values()].sort((x, y) => y.n - x.n) };
      },
    }),
  });
  return db;
}

const ORIGINS = ["https://happening-now.net"];
const respond = (body, status) => ({ body, status });
const req = (body, { method = "POST", origin = "https://happening-now.net" } = {}) => ({
  method,
  headers: { get: (h) => (h === "Origin" ? origin : null) },
  text: async () => body,
});
const good = JSON.stringify({ feed: "https://ex.com/feed", article: "https://ex.com/a?x=1,2", reason: "paywall" });

let failures = 0;
const check = (name, ok) => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}`); if (!ok) failures++; };

{
  const env = { HN_REPORTS: fakeD1() };
  const r = await handleReport(req(good), env, ORIGINS, respond);
  check("a valid report is stored", r.status === 200 && env.HN_REPORTS.rows.length === 1 && env.HN_REPORTS.rows[0].day === TODAY);
  check("only feed/article/reason/day are stored", Object.keys(env.HN_REPORTS.rows[0]).sort().join() === "article,day,feed,reason");
}
{
  const env = { HN_REPORTS: fakeD1() };
  const cases = [
    ["GET is refused", req(good, { method: "GET" }), 405],
    ["no Origin (a script) is refused", req(good, { origin: null }), 403],
    ["a foreign origin is refused", req(good, { origin: "https://evil.example" }), 403],
    ["an unknown reason is refused", req(JSON.stringify({ feed: "https://ex.com/f", article: "https://ex.com/a", reason: "hate" })), 400],
    ["a javascript: URL is refused", req(JSON.stringify({ feed: "https://ex.com/f", article: "javascript:alert(1)", reason: "broken" })), 400],
    ["junk JSON is refused", req("{nope"), 400],
    ["an oversized body is refused", req(JSON.stringify({ feed: "https://ex.com/f", article: "https://ex.com/" + "a".repeat(3000), reason: "broken" })), 400],
  ];
  for (const [name, r, want] of cases) check(name, (await handleReport(r, env, ORIGINS, respond)).status === want);
  check("nothing refused was stored", env.HN_REPORTS.rows.length === 0);
  check("missing D1 binding answers 503, not a crash", (await handleReport(req(good), {}, ORIGINS, respond)).status === 503);
}
{
  const rows = Array.from({ length: 500 }, () => ({ day: TODAY, feed: "https://ex.com/f", article: "https://ex.com/a", reason: "broken" }));
  const env = { HN_REPORTS: fakeD1(rows) };
  const r = await handleReport(req(good), env, ORIGINS, respond);
  check("past the daily cap: answers ok but stores nothing", r.status === 200 && env.HN_REPORTS.rows.length === 500);
}
{
  const F = "https://ex.com/feed";
  const rows = [
    { day: day(3), feed: F, article: "https://ex.com/a?x=1,2", reason: "paywall" },
    { day: day(2), feed: F, article: "https://ex.com/a?x=1,2", reason: "paywall" },
    { day: day(2), feed: F, article: "https://ex.com/b", reason: "paywall" },
    { day: day(2), feed: F, article: "https://ex.com/c", reason: "stale" },
    { day: TODAY, feed: F, article: "https://ex.com/d", reason: "paywall" },     // waits for next digest
    { day: day(40), feed: F, article: "https://ex.com/old", reason: "paywall" }, // before sinceDay
    { day: day(120), feed: F, article: "https://ex.com/ancient", reason: "broken" }, // pruned
  ];
  const env = { HN_REPORTS: fakeD1(rows) };
  const s = await summarizeReports(env, day(10));
  const pay = s.rows.find((r) => r.reason === "paywall");
  check("groups by feed + reason and counts", pay?.n === 3 && s.rows.find((r) => r.reason === "stale")?.n === 1);
  check("a comma inside a URL survives", pay?.articles.includes("https://ex.com/a?x=1,2"));
  check("today's reports wait for the next digest", !s.rows.some((r) => r.articles.includes("https://ex.com/d")));
  check("reports before sinceDay are left out", !s.rows.some((r) => r.articles.includes("https://ex.com/old")));
  check("total is the sum", s.total === 4);
  check("rows older than 90 days are pruned", !env.HN_REPORTS.rows.some((r) => r.article.endsWith("ancient")));
  check("covered-through is yesterday", reportsCoveredThrough() === day(1));
}
{
  const rows = Array.from({ length: 500 }, () => ({ day: day(2), feed: "https://ex.com/f", article: "https://ex.com/a", reason: "broken" }));
  const s = await summarizeReports({ HN_REPORTS: fakeD1(rows) }, day(10));
  check("a day that hit the cap is flagged", s.capped.includes(day(2)));
}
check("parseReport keeps only the three fields", Object.keys(parseReport(JSON.stringify({ feed: "https://a.b/f", article: "https://a.b/x", reason: "stale", email: "me@x" }))).join() === "feed,article,reason");

console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
