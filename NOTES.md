# Notes

## 2026-07-26 — Reconnected the repo to the Projects Dashboard

Picked the project back up after a gap. No code changes; this session was about
getting the folder and the dashboard telling the same story.

### What we found

- The project was already tracked as `news-pages`, but the dashboard's
  registered path was the old `C:\TEMP\Sites\news-pages` clone. Two full clones
  of the repo existed on this machine, both on `ed96a1d` and both fully pushed.
  Because sync read the *other* folder, this one never had a `TODO.md`.
- Two of the three tracked to-dos were already done — Google Search Console and
  Bing verification/sitemap were both closed out in `docs/launch-signoff.md`
  (commit `ed96a1d`, 2026-06-17). `docs/web-presence-baseline.md` still claims
  they're outstanding, but it hasn't been touched since 2026-05-30, so the
  signoff is the newer statement.
- The repo had no `README.md`, `CLAUDE.md` or `NOTES.md`, so every session
  started cold and the dashboard's CLAUDE.md snapshot was empty.

### What we did

- Made `C:\TEMP\Projects\happening-now` the canonical clone and repointed the
  dashboard registration to it.
- Marked the Search Console and Bing to-dos done; GA4 is the only one left, and
  it's explicitly optional per `web-presence-baseline.md` §4.
- Added `README.md`, `CLAUDE.md` and this file.

**Gotcha worth remembering:** repointing a project's path in `data.json` is not
enough on its own. `sync/.state.json` keeps the last-synced to-dos per project
id; if the new folder has no `TODO.md` yet, the next sync reads that as "all
items deleted locally" and wipes them from the dashboard. Clear the project's
key out of `.state.json` at the same time as the path change so the new folder
adopts the remote list instead.

## 2026-07-26 (later) — Consolidated the duplicate clones, added GA4

**Clone consolidation.** `C:\TEMP\Sites\` held second copies of AstroLAB,
MyBudget and UM_Time_Converter as well. Opposite of this project's case: there
the *Sites* copies were the newer ones (Projects was 4 and 11 commits behind),
so the Projects clones were pulled current first. Nothing was unpushed anywhere.

The real risk was gitignored files, which only existed in the Sites copies —
MyBudget's `.dev.vars` and `private/*.sql`, UM_Time's `sync-token.txt`, plus
`.claude/`/`.vscode/` settings. Those were copied into the Projects clones and
archived under `C:\TEMP\RESOURCES\Project Local Files\<Project>\`, verified
byte-identical in all three locations, then the Sites copies were deleted
(260 MB). All four projects now live under `C:\TEMP\Projects\` and the dashboard
points at them.

Still outstanding: `C:\TEMP\Sites\FlightTrack` is also a stale duplicate (the
`C:\TEMP\Projects\flighttrack` copy is 12 days newer), but FlightTrack is
registered to the *MEOOEM* laptop, so neither Windows copy is dashboard-tracked.
Left alone deliberately.

**GA4.** Added `assets/analytics.js` — a small loader rather than Google's
copy-paste snippet, because it sets **Consent Mode to denied by default and
never grants it**. GA4 therefore sends cookieless pings only: no cookies, no
device identifier, no banner needed in any region, which keeps the same posture
as the EU-excluded Cloudflare Web Analytics. Trade-off: returning visitors count
as new each session, so "users"/retention numbers are not meaningful — page
views, referrers and geography are.

Wired into all 7 pages, `https://www.googletagmanager.com` added to `script-src`
in `_headers` (the only restrictive CSP directive; `connect-src`/`img-src`
already allow `https:`), and `privacy.html` updated to disclose it honestly.
Verified in headless Chrome that the tag injects and that `dataLayer` order is
consent → js → config.

### Next up

- **Not deployed yet.** GA4 collects nothing until `scripts/deploy-prod.ps1`
  runs. That needs `npm install` in this clone first, or the deploy silently
  ships unminified assets (the stage script only warns).
- `docs/web-presence-baseline.md` line 14 is stale (says GSC/Bing still need
  setup) and §4 still describes GA4 as hypothetical; worth a refresh.
- `docs/ops-monitoring-checklist.md` checks `/weather.html`-style URLs that now
  301 to extensionless ones.
