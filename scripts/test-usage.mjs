// Exercises cloudflare-sync-worker/src/usage.mjs against an in-memory stand-in
// for D1: accepting and counting, every refusal, dropping unknown events,
// country-per-arrival, the daily cap, the summary and pruning.
//
//   npm run test:usage
import { handleUsage, parseUsage, summarizeUsage } from "../cloudflare-sync-worker/src/usage.mjs";

const day = (n) => new Date(Date.now() - n * 86400e3).toISOString().slice(0, 10);
const TODAY = day(0);

// Just enough of D1 for usage.mjs: a map of "day|kind|a|b" -> n.
function fakeD1(seed = {}) {
  const db = { rows: new Map(Object.entries(seed)) };
  const rows = () => [...db.rows].map(([k, n]) => { const [d, kind, a, b] = k.split("|"); return { day: d, kind, a, b, n }; });
  db.prepare = (sql) => ({
    bind: (...v) => ({
      sql, v,
      first: async () => ({ n: rows().filter((r) => r.day === v[0]).reduce((s, r) => s + r.n, 0) }),
      run: async () => {
        if (sql.startsWith("DELETE")) for (const r of rows()) if (r.day < v[0]) db.rows.delete(`${r.day}|${r.kind}|${r.a}|${r.b}`);
        return {};
      },
      all: async () => {
        const inRange = rows().filter((r) => r.day >= v[0]);
        if (sql.includes("HAVING")) {
          const per = {};
          for (const r of inRange) per[r.day] = (per[r.day] || 0) + r.n;
          return { results: Object.entries(per).filter(([, n]) => n >= v[1]).map(([d]) => ({ day: d })) };
        }
        const g = new Map();
        for (const r of inRange) { const k = `${r.kind}|${r.a}|${r.b}`; g.set(k, { kind: r.kind, a: r.a, b: r.b, n: (g.get(k)?.n || 0) + r.n }); }
        return { results: [...g.values()].sort((x, y) => y.n - x.n) };
      },
    }),
  });
  db.batch = async (stmts) => {
    for (const s of stmts) { const [d, kind, a, b] = s.v; const k = `${d}|${kind}|${a}|${b}`; db.rows.set(k, (db.rows.get(k) || 0) + 1); }
    return [];
  };
  return db;
}

const ORIGINS = ["https://happening-now.net"];
const respond = (body, status) => ({ body, status });
const req = (events, { method = "POST", origin = "https://happening-now.net", country = "US", raw } = {}) => ({
  method,
  cf: country ? { country } : undefined,
  headers: { get: (h) => (h === "Origin" ? origin : null) },
  text: async () => raw ?? JSON.stringify({ e: events }),
});

let failures = 0;
const check = (name, ok) => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}`); if (!ok) failures++; };
const count = (db, kind, a, b) => db.rows.get(`${TODAY}|${kind}|${a}|${b}`) || 0;

{
  const env = { HN_REPORTS: fakeD1() };
  const events = [["nav", "start", "news"], ["nav", "news", "news:science"], ["tap", "weather", "radar-load"], ["source", "npr.org", "news:national"]];
  const r = await handleUsage(req(events), env, ORIGINS, respond);
  check("a valid batch is accepted", r.status === 200);
  check("each event adds one", count(env.HN_REPORTS, "nav", "start", "news") === 1 && count(env.HN_REPORTS, "source", "npr.org", "news:national") === 1);
  check("an arrival counts its country once", count(env.HN_REPORTS, "country", "US", "") === 1);
  await handleUsage(req([["nav", "news", "news:science"]]), env, ORIGINS, respond);
  check("repeat events increment the same row", count(env.HN_REPORTS, "nav", "news", "news:science") === 2);
  check("no arrival, no country", count(env.HN_REPORTS, "country", "US", "") === 1);
  await handleUsage(req([["nav", "start", "weather"]], { country: null }), env, ORIGINS, respond);
  check("missing country is XX", count(env.HN_REPORTS, "country", "XX", "") === 1);
}

{
  const env = { HN_REPORTS: fakeD1() };
  const ok = [["nav", "start", "news"]];
  check("GET refused", (await handleUsage(req(ok, { method: "GET" }), env, ORIGINS, respond)).status === 405);
  check("foreign origin refused", (await handleUsage(req(ok, { origin: "https://evil.example" }), env, ORIGINS, respond)).status === 403);
  check("missing origin refused", (await handleUsage(req(ok, { origin: "" }), env, ORIGINS, respond)).status === 403);
  check("no database: 503", (await handleUsage(req(ok), {}, ORIGINS, respond)).status === 503);
  check("garbage body refused", (await handleUsage(req(null, { raw: "{nope" }), env, ORIGINS, respond)).status === 400);
  check("empty batch refused", (await handleUsage(req([]), env, ORIGINS, respond)).status === 400);
  check("oversized batch refused", (await handleUsage(req(Array(41).fill(["tap", "news", "refresh"])), env, ORIGINS, respond)).status === 400);
  check("nothing stored by refusals", env.HN_REPORTS.rows.size === 0);
}

{
  const bad = [
    ["nav", "news", "news"],                 // not a move
    ["nav", "nowhere", "news"],              // unknown page
    ["nav", "news", "start"],                // start is origin-only
    ["nav", "news", "news:Has Spaces"],      // tab shape
    ["nav", "news", "news:a:b"],
    ["tap", "weather", "launch-missiles"],   // not a known control
    ["tap", "news", "radar-load"],           // right control, wrong page
    ["source", "1.2.3.4", "news"],           // not a hostname
    ["source", "npr.org", "nowhere"],
    ["country", "US", ""],                   // server-side only
    ["nav", "start"],                        // wrong arity
    ["time", "news", "42s"],                 // exact durations are never accepted
    ["time", "nowhere", "1-3m"],
  ];
  check("every bad event is dropped", bad.every((e) => parseUsage(JSON.stringify({ e: [e] })) === null));
  const mixed = parseUsage(JSON.stringify({ e: [["tap", "weather", "layer-unknown"], ["tap", "weather", "rings"]] }))?.events;
  check("a time range is accepted", parseUsage(JSON.stringify({ e: [["time", "weather", "1-3m"]] }))?.events.length === 1);
  check("one unknown event doesn't sink the batch", mixed?.length === 1 && mixed[0][2] === "rings");
}

{
  const env = { HN_REPORTS: fakeD1({ [`${TODAY}|tap|news|refresh`]: 20000 }) };
  const r = await handleUsage(req([["tap", "news", "sources"]]), env, ORIGINS, respond);
  check("over the daily cap: answers ok, stores nothing", r.status === 200 && count(env.HN_REPORTS, "tap", "news", "sources") === 0);
}

{
  const env = { HN_REPORTS: fakeD1({
    [`${day(1)}|source|npr.org|news`]: 3,
    [`${day(2)}|source|npr.org|news`]: 2,
    [`${day(3)}|source|cbsnews.com|news`]: 4,
    [`${day(40)}|source|old.com|news`]: 9,
    [`${day(100)}|source|ancient.com|news`]: 9,
  }) };
  const s = await summarizeUsage(env, day(30));
  check("summary sums across days", s.source[0].a === "npr.org" && s.source[0].n === 5);
  check("summary respects the window", !s.source.some((r) => r.a === "old.com"));
  check("rows past 90 days are pruned", ![...env.HN_REPORTS.rows.keys()].some((k) => k.includes("ancient.com")) && [...env.HN_REPORTS.rows.keys()].some((k) => k.includes("old.com")));
  check("no database: null summary", (await summarizeUsage({}, day(30))) === null);
}

console.log(failures ? `\n${failures} failed` : "\nall passed");
process.exit(failures ? 1 : 0);
