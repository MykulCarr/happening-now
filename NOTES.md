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

**GA4.** Installed with **Consent Mode denied by default and never granted**, so
GA4 sends cookieless pings only: no cookies, no device identifier, no banner
needed in any region, keeping the same posture as the EU-excluded Cloudflare Web
Analytics. Trade-off: returning visitors count as new each session, so
"users"/retention numbers are not meaningful — page views, referrers and
geography are.

Wired into all 7 pages, `https://www.googletagmanager.com` added to `script-src`
in `_headers` (the only restrictive CSP directive; `connect-src`/`img-src`
already allow `https:`), and `privacy.html` updated to disclose it honestly.

**Got this wrong the first time.** It was initially built as a tidy
`assets/analytics.js` that injected the tag at runtime. Hits fired correctly
(confirmed via Chrome net-log: `/g/collect` requests were going out), but GA4
reported **"tag not installed"** — Google's detection scans the *served HTML
source*, and there was nothing in the markup to find. Fixed by moving Google's
standard snippet inline into `<head>` on each page, consent lines still ahead of
`config`. Bonus: it now fires earlier than a deferred end-of-body script.

**Local news coverage: now all 50 states + DC.** Went from 15 states / 53 cities
/ 172 feeds to **51 blocks / 90 cities / 250 feeds**. Every added feed was
verified through the Worker proxy first, per `_meta.howToAdd` — several
plausible candidates failed and were dropped rather than shipped.

Useful pattern knowledge from the sweep, now recorded in `CLAUDE.md`: Nexstar
(`/feed/`), Scripps (`/news.rss`), TownNews (`/search/?f=rss…`), Arc
(`/arc/outboundfeeds/rss/`) and the States Newsroom nonprofits (`/feed/`) all
work through the proxy. **Gannett (`/rss/`) and Gray (`/arcio/rss/`) reliably
do not** — every candidate from those two families returned zero items.
Statewide coverage leans on the States Newsroom nonprofits, which are the same
shape as the Bridge Michigan entry that was already there.

Verified in a real browser that `getStationsForGeo` resolves the new cities
(including `St. Louis, Missouri` → `MO`/`st. louis`), that Detroit still returns
its original 6 feeds, and that the haversine nearest-city fallback now spans the
new data (Omaha → Des Moines, Sioux Falls).

**Coverage list on sources.html.** New "Local News Coverage" section, generated
from the JSON by `scripts/update-coverage.mjs` (`npm run coverage`) into a
marker-delimited block, so the public list can't drift from the data. It writes
into the committed HTML rather than rendering client-side, so crawlers see the
city names — this page is the natural organic hook for "&lt;city&gt; local news".
Checked at 390px and desktop.

## 2026-07-26 (later still) — Source search: address lookup + Reddit keyword

Removed the duplicate `Crosscut` entry from WA statewide (same outlet as Cascade
PBS since the rename; both URLs served identical content, and the URL-based
dedupe couldn't catch it). 249 feeds now.

**The find of the day:** Reddit's JSON API is still 403 for anonymous and
Worker-origin requests — the thing that killed live discovery in `fdbf508`. But
the **`.rss` variants of the same searches are not blocked**.
`subreddits/search.rss?q=detroit` returns a clean Atom feed of 25 matching
subreddits through our proxy. So keyword discovery is back, without an API key.

Built `assets/source-search.js` (new module rather than growing common.js, which
is already ~3,700 lines). The custom row on both the Local and Across Your State
cards now takes three kinds of input behind one box:

- a **pasted RSS URL** — added directly, as before
- a **place**: city, ZIP, or full street address. Open-Meteo's geocoder handles
  city-level; it returns nothing for street addresses, so there's a Nominatim
  fallback (already a dependency for reverse geocoding, so nothing new).
- a **keyword** — searches Reddit and lists matching communities

The button relabels itself Add/Search based on what's typed. Providers are
declared in a `PROVIDERS` array and run in parallel, each catching its own
errors — verified that with Reddit down (404 locally) the place results still
come back. Adding a third backend later is one array entry, which is the
"more robust search later" hook.

**Bug caught while testing:** the first cut used
`getStationsForGeo(...).length > 0` to decide whether a place was covered. That
always returns true inside a covered state, because statewide entries are folded
into every city's list — so "Ann Arbor, MI" came back with four *Michigan
statewide* feeds labelled as though they were Ann Arbor's, and the nearest-city
fallback was unreachable dead code. `hasCitySources()` exists for exactly this
distinction and its comment says so. Now Ann Arbor correctly offers Jackson
(33 mi) and Detroit (36 mi), with statewide feeds listed separately and
labelled honestly.

### Next up

- **Not deployed yet.** GA4 collects nothing until `scripts/deploy-prod.ps1`
  runs. That needs `npm install` in this clone first, or the deploy silently
  ships unminified assets (the stage script only warns).
- `docs/web-presence-baseline.md` line 14 is stale (says GSC/Bing still need
  setup) and §4 still describes GA4 as hypothetical; worth a refresh.
- `docs/ops-monitoring-checklist.md` checks `/weather.html`-style URLs that now
  301 to extensionless ones.
