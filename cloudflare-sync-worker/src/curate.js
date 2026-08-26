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
// A bad scan week (many feeds flagged) can push verify past one day's BATCH,
// which delays the email by an extra cron firing or two — an acceptable
// trade for not crying wolf. It only ever reports; adding or removing a news
// source is an editorial decision, and an automated check has no idea
// whether an outlet is reputable.
//
// `cloudflare:email` is imported lazily, inside the send path, on purpose. A
// static top-level import is evaluated when the module loads, so if the email
// binding is ever missing or misconfigured the whole Worker fails to start —
// taking /v1/rss, /v1/stocks and /v1/artemis down with it. This is a weekly
// nice-to-have; it must not be able to break the endpoints the site depends on.

import { feedProblem } from "./feed-health.mjs";

const STATE_KEY = "curate:state";
const STATIONS_URL = "https://happening-now.net/data/local-stations.json";
const TOPICS_URL = "https://happening-now.net/data/topic-sources.json";
const BATCH = 40;              // + 2 subrequests for the two catalog files
const FROM = "digest@happening-now.net";
const TIMEOUT_MS = 15000;

// Returns "" when the feed is healthy, or a short reason why it isn't.
//
// This used to return an item count, which asked the wrong question. A feed can
// serve a hundred valid <item> elements and still render nothing, because the
// browser parses with DOMParser and one XML error voids the whole document.
// canarymedia.com and lwlies.com were both broken on the live site for weeks
// while this sweep reported them healthy every single night. feed-health.js
// applies the same repairs the browser does and then judges what's left.
async function probe(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      cf: { cacheTtl: 0 },
      headers: { "User-Agent": "happening-now-curator/1.0 (+https://happening-now.net)" },
    });
    if (!res.ok) return `HTTP ${res.status}`;
    return feedProblem(await res.text());
  } catch (err) {
    return err?.name === "AbortError" ? "timeout" : "unreachable";
  } finally {
    clearTimeout(timer);
  }
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

// Minimal RFC-5322 message. The send_email binding wants raw MIME, and pulling
// in a MIME library for one HTML part isn't worth it.
function mime({ from, to, subject, html }) {
  return [
    `From: Happening Now <${from}>`,
    `To: <${to}>`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/html; charset=utf-8",
    "",
    html,
  ].join("\r\n");
}

async function sendDigest(env, findings, checked) {
  const { subject, html } = buildReport(findings, checked);
  const to = env.ADMIN_EMAIL_ADDRESS || "hn-station@protonmail.com";
  const { EmailMessage } = await import("cloudflare:email");
  await env.ADMIN_EMAIL.send(new EmailMessage(FROM, to, mime({ from: FROM, to, subject, html })));
  await env.HN_STATE_DATA.put(STATE_KEY, JSON.stringify({ phase: "scan", cursor: 0, findings: [], checked: 0 }));
  return { sent: true, checked, dead: findings.length };
}

// Second look at whatever the scan flagged, at least a day later. Same BATCH
// budget and probe() as the scan phase, just walking `findings` instead of
// the full feed list.
async function runVerifyPhase(env, state) {
  const start = Math.min(state.cursor, state.findings.length);
  const slice = state.findings.slice(start, start + BATCH);

  const stillDead = [];
  for (const f of slice) {
    const problem = await probe(f.rss);
    if (problem) stillDead.push({ ...f, problem });
  }

  const confirmed = [...(state.confirmed || []), ...stillDead];
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
  const start = state.cursor >= feeds.length ? 0 : state.cursor;
  const slice = feeds.slice(start, start + BATCH);

  const dead = [];
  for (const f of slice) {
    const problem = await probe(f.rss);
    if (problem) dead.push({ ...f, problem });
  }

  const findings = [...state.findings, ...dead];
  const checked = state.checked + slice.length;
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
