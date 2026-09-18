// Weekly curation digest, emailed to the site admin.
//
// Workers cap subrequests per invocation (50 on the free plan) and we curate
// ~400 feeds across both catalogs — data/local-stations.json (places) and
// data/topic-sources.json (the topic tabs) — so a full sweep can't happen in
// one go. Instead the cron fires once a day and works through two phases,
// parking its position in KV between firings. At BATCH=40 a full sweep is
// ~10 firings, so the digest lands every week and a half rather than weekly;
// raise BATCH toward the subrequest cap or fire the cron twice a day to
// tighten that up.
//
//   scan   — checks the next BATCH feeds. When the cursor wraps, every feed
//            has been probed exactly once and some fraction will have failed.
//   verify — most single-probe failures turn out to be a same-day platform
//            hiccup (a shared host like States Newsroom or TownNews having a
//            bad hour), not a dead feed — two live audits in a row (2026-07-26
//            and 2026-08-14) found 40/41 and 15/16 "dead" feeds were fine
//            again within the hour. So instead of emailing straight off the
//            scan, the flagged feeds sit for at least a day and get re-probed
//            in their own BATCH-sized pass. Only what's still dead on the
//            second look reaches the report. If the scan found nothing, this
//            phase is skipped and the "all healthy" email goes out immediately.
//
//            The re-probe goes through /v1/rss/raw rather than straight at the
//            publisher, so the two looks ask genuinely different questions.
//            Waiting a day is not enough on its own: a WAF rule answers a
//            Worker IP the same way every day, so a second identical probe
//            confirms it rather than clearing it.
//
// A bad scan week (many feeds flagged) can push verify past one day's BATCH,
// which delays the email by an extra cron firing or two — an acceptable
// trade for not crying wolf. It only ever reports; adding or removing a news
// source is an editorial decision, and an automated check has no idea
// whether an outlet is reputable.
//
// `cloudflare:email` is imported lazily, inside the send path, on purpose. A
// static top-level import is evaluated when the module loads, so if the email
// binding is ever missing or misconfigured the whole Worker fails to start —
// taking /v1/rss, /v1/stocks and /v1/favicon down with it. This is a weekly
// nice-to-have; it must not be able to break the endpoints the site depends on.

import { feedProblem } from "./feed-health.mjs";
// Same headers /v1/rss/raw sends, so this sweep tests the path that feeds the
// site rather than a client nobody uses.
import { RSS_FETCH_HEADERS } from "./upstream-headers.mjs";
// Shared with the ops reminders; see mailer.mjs for why the email binding
// is imported lazily rather than at the top of the file.
import { sendHtmlMail } from "./mailer.mjs";

const STATE_KEY = "curate:state";
const STATIONS_URL = "https://happening-now.net/data/local-stations.json";
const TOPICS_URL = "https://happening-now.net/data/topic-sources.json";
const BATCH = 40;              // + 2 subrequests for the two catalog files
const TIMEOUT_MS = 15000;

// Returns "" when the feed is healthy, or a short reason why it isn't.
//
// This used to return an item count, which asked the wrong question. A feed can
// serve a hundred valid <item> elements and still render nothing, because the
// browser parses with DOMParser and one XML error voids the whole document.
// canarymedia.com and lwlies.com were both broken on the live site for weeks
// while this sweep reported them healthy every single night. feed-health.js
// applies the same repairs the browser does and then judges what's left.
//
// RSS_FETCH_HEADERS is not optional: it is the difference between asking "can
// some HTTP client reach this feed?" and "can the site?". On 2026-09-12 a
// sweep using its own curator User-Agent called 17 healthy feeds dead and 7
// dead ones healthy — see upstream-headers.mjs for what went wrong and why the
// two-day verify phase could not catch it.
async function probe(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      cf: { cacheTtl: 0 },
      headers: RSS_FETCH_HEADERS,
    });
    if (!res.ok) return `HTTP ${res.status}`;
    return feedProblem(await res.text());
  } catch (err) {
    return err?.name === "AbortError" ? "timeout" : "unreachable";
  } finally {
    clearTimeout(timer);
  }
}

// Second opinion, over the site's own path, used only to confirm a finding
// before it can reach the email.
//
// probe() above fetches the publisher directly. That answers "is the publisher
// refusing us?", which is a *lead*, not a verdict — the 2026-09-12 digest
// reported 21 feeds and every one of them rendered fine on the site. Publisher
// WAFs return 401/403 to a Cloudflare Worker IP intermittently, and the two-day
// verify phase cannot filter that on its own: re-probing the same way a day
// later reproduces the same WAF answer.
//
// So verification asks a different question, through /v1/rss/raw — the exact
// path readers' feeds travel, and the arbiter scripts/check-feeds.mjs already
// uses. A row now has to fail a direct probe *and* fail through the site, on
// two different days, before anyone is emailed about it.
//
// nostale=1 for the same reason check-feeds.mjs sends it: readers may be
// covered by the 24h last-good cache, but the thing deciding what is broken
// must never be handed a cached copy of a feed that died days ago.
const SITE_PROXY = "https://happening-now.net/v1/rss/raw?url=";

async function probeViaSite(rss) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${SITE_PROXY}${encodeURIComponent(rss)}&nostale=1`, {
      signal: controller.signal,
      cf: { cacheTtl: 0 },
    });
    if (!res.ok) {
      // The proxy reports a failed upstream as 502 carrying the real status,
      // e.g. "Target feed error: 403". Prefer that over a blanket "HTTP 502".
      try {
        const body = await res.json();
        if (body && typeof body.error === "string") return body.error;
      } catch { /* not JSON; fall through */ }
      return `HTTP ${res.status}`;
    }
    return feedProblem(await res.text());
  } catch (err) {
    return err?.name === "AbortError" ? "timeout" : "unreachable";
  } finally {
    clearTimeout(timer);
  }
}

// One row per feed URL, first occurrence winning. Both sweep phases accumulate
// across cron firings, and neither the scan nor the verify pass can assume it
// ran exactly once over a given slice.
function dedupeByRss(rows) {
  const seen = new Map();
  for (const r of rows) if (!seen.has(r.rss)) seen.set(r.rss, r);
  return [...seen.values()];
}

// Both catalogs flattened into one list. Topic feeds rot exactly like the
// geographic ones and were previously swept by nothing at all — the Climate,
// Tech, Screen, Business and Food tabs each lost a source with no alert.
// `state: "topic"` matches how scripts/check-feeds.mjs labels them.
function flatten(states, topics) {
  const out = [];
  for (const [state, block] of Object.entries(states || {})) {
    for (const [place, node] of Object.entries(block)) {
      for (const e of node.entries || []) {
        out.push({ state, place: place === "_state" ? "(statewide)" : place, name: e.name, rss: e.rss });
      }
    }
  }
  for (const [id, topic] of Object.entries(topics || {})) {
    for (const e of topic.entries || []) {
      out.push({ state: "topic", place: id, name: e.name, rss: e.rss });
    }
  }
  // Sorted so the cursor stays meaningful across runs even as the list grows.
  return out.sort((a, b) => a.rss.localeCompare(b.rss));
}

function buildReport(findings, total) {
  const rows = findings.map(f =>
    `<tr><td style="padding:6px 10px;border-top:1px solid #ddd">${escapeHtml(f.state === "topic" ? `topic · ${f.place}` : `${f.state}/${f.place}`)}</td>
         <td style="padding:6px 10px;border-top:1px solid #ddd">${escapeHtml(f.name)}</td>
         <td style="padding:6px 10px;border-top:1px solid #ddd">${escapeHtml(f.problem || "no items")}</td>
         <td style="padding:6px 10px;border-top:1px solid #ddd"><a href="${escapeHtml(f.rss)}">${escapeHtml(f.rss)}</a></td></tr>`).join("");
  const html = `<div style="max-width:900px;font:14px system-ui;color:#111">
    <h1 style="font-size:18px">Happening Now — feed digest</h1>
    <p style="color:#555">${total} feeds checked · <b>${findings.length} not usable on the site</b></p>
    ${findings.length ? `<table style="border-collapse:collapse;width:100%;font:13px system-ui">
      <tr><th align="left" style="padding:6px 10px;background:#f3f4f6">Where</th>
          <th align="left" style="padding:6px 10px;background:#f3f4f6">Source</th>
          <th align="left" style="padding:6px 10px;background:#f3f4f6">Problem</th>
          <th align="left" style="padding:6px 10px;background:#f3f4f6">Feed</th></tr>${rows}</table>
      <p>Each of these failed on two separate days, at least a day apart — most one-day platform
      hiccups are already filtered out. Still worth a quick eyeball before acting, since a
      multi-day outage can happen too.</p>
      <p>"Problem" is what a browser would hit, not just an item count: a feed whose XML won't
      parse renders nothing even when it looks full of items.</p>
      <p>To fix a <b>place</b> row, run <code>npm run curate</code> locally — it hunts the
      outlet's own site for a replacement feed and proposes new Patch coverage. It only covers
      places; a <b>topic</b> row needs a replacement picked by hand into
      <code>data/topic-sources.json</code>. Either way finish with
      <code>npm run check-feeds</code>.</p>`
    : `<p>Everything is returning items. Nothing to do.</p>`}
    <p style="color:#777;font-size:12px">Nothing has been changed automatically.</p></div>`;
  return { subject: `Happening Now: ${findings.length ? `${findings.length} feed(s) need attention` : "all feeds healthy"}`, html };
}

const escapeHtml = s => String(s).replace(/[&<>"]/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m]));

async function sendDigest(env, findings, checked) {
  const { subject, html } = buildReport(findings, checked);
  await sendHtmlMail(env, { subject, html });
  await env.HN_STATE_DATA.put(STATE_KEY, JSON.stringify({ phase: "scan", cursor: 0, findings: [], checked: 0 }));
  return { sent: true, checked, dead: findings.length };
}

// Second look at whatever the scan flagged, at least a day later. Same BATCH
// budget, walking `findings` instead of the full feed list — but a *different*
// probe: probeViaSite, over /v1/rss/raw.
//
// Re-probing the same way a day later only filters same-day hiccups. It cannot
// filter a publisher WAF that refuses Cloudflare Worker IPs, because that
// reproduces perfectly on day two — which is how the 2026-09-12 digest
// confirmed 21 feeds that were all rendering fine.
async function runVerifyPhase(env, state) {
  const start = Math.min(state.cursor, state.findings.length);
  const slice = state.findings.slice(start, start + BATCH);

  const stillDead = [];
  for (const f of slice) {
    // Deliberately probeViaSite, not probe: confirmation has to come from the
    // path the site actually uses, or a publisher WAF that dislikes Worker IPs
    // gets reported as a dead feed. See probeViaSite.
    const problem = await probeViaSite(f.rss);
    if (problem) stillDead.push({ ...f, problem });
  }

  const confirmed = dedupeByRss([...(state.confirmed || []), ...stillDead]);
  const next = start + slice.length;

  if (next < state.findings.length) {
    await env.HN_STATE_DATA.put(STATE_KEY, JSON.stringify({
      phase: "verify", cursor: next, findings: state.findings, confirmed, checked: state.checked,
    }));
    return { verifying: `${next}/${state.findings.length}`, confirmedSoFar: confirmed.length };
  }

  return sendDigest(env, confirmed, state.checked);
}

export async function runCurationSweep(env) {
  if (!env.ADMIN_EMAIL) return { skipped: "no ADMIN_EMAIL binding" };

  const state = (await env.HN_STATE_DATA.get(STATE_KEY, { type: "json" }))
    || { phase: "scan", cursor: 0, findings: [], checked: 0 };

  if (state.phase === "verify") return runVerifyPhase(env, state);

  const [stationsRes, topicsRes] = await Promise.all([
    fetch(STATIONS_URL, { cf: { cacheTtl: 0 } }),
    fetch(TOPICS_URL, { cf: { cacheTtl: 0 } }),
  ]);
  if (!stationsRes.ok) return { error: `stations fetch ${stationsRes.status}` };
  if (!topicsRes.ok) return { error: `topics fetch ${topicsRes.status}` };
  const feeds = flatten((await stationsRes.json()).states, (await topicsRes.json()).topics);

  // The list changes between runs; if it shrank past the cursor, start over.
  // Restarting has to drop the findings too. Keeping them meant a wrapped scan
  // re-walked feeds it had already flagged and appended a second copy, so
  // TribLive printed twice in one digest and read as two separate breakages.
  const wrapped = state.cursor >= feeds.length;
  const start = wrapped ? 0 : state.cursor;
  const carried = wrapped ? [] : state.findings;
  const slice = feeds.slice(start, start + BATCH);

  const dead = [];
  for (const f of slice) {
    const problem = await probe(f.rss);
    if (problem) dead.push({ ...f, problem });
  }

  // Keyed by feed URL: a scheduled event can be delivered more than once, and
  // a re-run slice would otherwise append duplicates of everything in it.
  //
  // Then dropped to what the catalog still lists. A full sweep spans ~10 daily
  // firings, so a feed fixed or removed partway through would otherwise sit in
  // `findings` and get emailed days later as though it were still broken. The
  // 2026-09-12 digest did exactly that for three feeds — Sky & Telescope,
  // Atlanta Civic Circle and TribLive's old /rss/ URL — all three already
  // replaced in a209b0a while the sweep was mid-flight. Pruning here is free:
  // this phase has the fresh catalog in hand anyway.
  const listed = new Set(feeds.map(f => f.rss));
  const findings = dedupeByRss([...carried, ...dead]).filter(f => listed.has(f.rss));
  // Resets with the findings on a wrap, or the digest's "N feeds checked"
  // keeps climbing past the size of the catalog.
  const checked = (wrapped ? 0 : state.checked) + slice.length;
  const next = start + slice.length;

  if (next < feeds.length) {
    await env.HN_STATE_DATA.put(STATE_KEY, JSON.stringify({ phase: "scan", cursor: next, findings, checked }));
    return { progress: `${next}/${feeds.length}`, deadSoFar: findings.length };
  }

  // Scan complete. Nothing flagged — skip the verify phase entirely rather
  // than delay a clean "all healthy" email by a day for no reason.
  if (!findings.length) return sendDigest(env, [], checked);

  // Hand off to the verify phase instead of reporting immediately. See the
  // file-level comment for why: a second look after real time has passed is
  // what actually filters same-day platform hiccups, not a fast retry.
  await env.HN_STATE_DATA.put(STATE_KEY, JSON.stringify({ phase: "verify", cursor: 0, findings, confirmed: [], checked }));
  return { scanned: checked, pendingVerification: findings.length };
}
