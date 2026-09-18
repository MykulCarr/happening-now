// Ops reminders, riding on the daily curation cron.
//
// Why piggyback on a job that already runs rather than add a second cron: a new
// scheduled task is one more thing that can quietly stop firing, and nothing
// would notice. The curation sweep already fires daily and already emails, so a
// reminder that rides along is as reliable as the thing it rides on — and dies
// loudly with it rather than silently on its own.
//
// Why best-effort: this must never be able to break the sweep. runReminders
// swallows its own errors and the caller wraps it again.
//
// What it covers — the two things here that fail *silently*:
//
//   - docs/ops-monitoring-checklist.md defines weekly, monthly and quarterly
//     check-ins, backed only by docs/happening-now-ops-checkins.ics. If that
//     calendar was never imported, or gets dropped, nothing ever asks for them
//     and the omission looks exactly like everything being fine.
//   - .well-known/security.txt carries an RFC 9116 Expires date stamped at
//     deploy time (scripts/stage-public-assets.ps1). It self-heals on any
//     deploy, but a year without one leaves an expired, invalid file — and an
//     invalid security.txt reports nothing, it just stops counting.
//
// Deliberately NOT covered: feed rot. The digest this rides on already owns
// that, and duplicating it would put two disagreeing checkers on one question —
// the exact failure documented in upstream-headers.mjs.
//
// Control test: `npm run test:reminders` forces every check to fire. A check
// that only ever reports "nothing due" is indistinguishable from a broken one,
// so every branch here has to be provable on demand.
//
// .mjs so plain-node imports (the test script) don't warn — the repo has no
// "type": "module".

import { sendHtmlMail } from "./mailer.mjs";

const STATE_KEY = "reminders:state";
const SECURITY_TXT_URL = "https://happening-now.net/.well-known/security.txt";

// Start nagging this far out. A deploy re-stamps it a year ahead, so 60 days is
// many chances to notice without being noise the rest of the year.
export const SECURITY_WARN_DAYS = 60;
// While inside that window, repeat at most this often rather than every day.
export const REMIND_AGAIN_DAYS = 7;

const DAY_MS = 86400000;

// ISO-8601 week, so the weekly reminder lands on Monday and exactly once.
export function isoWeekKey(d) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;              // Mon=1 … Sun=7
  t.setUTCDate(t.getUTCDate() + 4 - day);      // the week's Thursday
  const yearStart = Date.UTC(t.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((t.getTime() - yearStart) / DAY_MS + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export const monthKey = d => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
export const quarterKey = d => `${d.getUTCFullYear()}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`;

// "Expires: 2027-09-12T00:00:00.000Z" -> Date, or null if absent/unparseable.
export function parseSecurityExpires(text) {
  const m = /^\s*Expires:\s*(\S+)\s*$/im.exec(String(text || ""));
  if (!m) return null;
  const when = Date.parse(m[1]);
  return Number.isFinite(when) ? new Date(when) : null;
}

// Pure: given the clock, the last-sent state and the parsed expiry, what is due?
// Each period key changes exactly once per period, so comparing against the
// stored key is the whole "have I already sent this one?" check.
export function dueReminders({ now, state = {}, securityExpires = null }) {
  const due = [];
  const periodic = [
    ["opsWeekly", isoWeekKey(now), "Weekly ops check-in (15–20 min)", "docs/ops-monitoring-checklist.md § Weekly"],
    ["opsMonthly", monthKey(now), "Monthly maintenance check-in (30 min)", "docs/ops-monitoring-checklist.md § Monthly"],
    ["opsQuarterly", quarterKey(now), "Quarterly maintenance review (45–60 min)", "docs/ops-monitoring-checklist.md § Quarterly"],
  ];
  for (const [id, stamp, label, detail] of periodic) {
    if (state[id] !== stamp) due.push({ id, stamp, label, detail });
  }

  if (securityExpires) {
    const days = Math.floor((securityExpires.getTime() - now.getTime()) / DAY_MS);
    if (days <= SECURITY_WARN_DAYS) {
      const last = state.securityTxt ? Date.parse(state.securityTxt) : 0;
      const quiet = Number.isFinite(last) && last > 0 && (now.getTime() - last) < REMIND_AGAIN_DAYS * DAY_MS;
      if (!quiet) {
        due.push({
          id: "securityTxt",
          stamp: now.toISOString(),
          label: days < 0
            ? `.well-known/security.txt EXPIRED ${Math.abs(days)} day(s) ago`
            : `.well-known/security.txt expires in ${days} day(s)`,
          detail: "Any deploy re-stamps it a year out: pwsh -File scripts/deploy-prod.ps1",
        });
      }
    }
  }
  return due;
}

export function buildReminderEmail(due) {
  const items = due.map(d =>
    `<li style="margin:6px 0"><b>${escapeHtml(d.label)}</b><br>
     <span style="color:#555">${escapeHtml(d.detail)}</span></li>`).join("");
  const html = `<div style="max-width:900px;font:14px system-ui;color:#111">
    <h1 style="font-size:18px">Happening Now — ops reminder</h1>
    <p style="color:#555">${due.length} item(s) due.</p>
    <ul style="padding-left:18px">${items}</ul>
    <p style="color:#777;font-size:12px">Rides on the daily curation cron. Nothing has been changed automatically.</p>
  </div>`;
  return { subject: `Happening Now: ${due.length} ops item(s) due`, html };
}

const escapeHtml = s => String(s).replace(/[&<>"]/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m]));

// Best-effort. Any throw is caught and reported as a value; the caller wraps
// this again so a failure here can never touch the curation sweep.
export async function runReminders(env, now = new Date()) {
  try {
    if (!env.ADMIN_EMAIL) return { skipped: "no ADMIN_EMAIL binding" };

    const state = (await env.HN_STATE_DATA.get(STATE_KEY, { type: "json" })) || {};

    let securityExpires = null;
    try {
      const res = await fetch(SECURITY_TXT_URL, { cf: { cacheTtl: 0 } });
      if (res.ok) securityExpires = parseSecurityExpires(await res.text());
    } catch { /* a missing expiry check must not stop the ops reminders */ }

    const due = dueReminders({ now, state, securityExpires });
    if (!due.length) return { due: 0 };

    await sendHtmlMail(env, buildReminderEmail(due));
    const next = { ...state };
    for (const d of due) next[d.id] = d.stamp;
    await env.HN_STATE_DATA.put(STATE_KEY, JSON.stringify(next));
    return { due: due.length, sent: due.map(d => d.id) };
  } catch (err) {
    return { error: err?.message || String(err) };
  }
}
