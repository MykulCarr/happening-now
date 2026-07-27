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

**Hardened the Reddit result filter** (same day, after review). The first cut was
a thin denylist over name + title only, and it leaked: `r/DetroitButts`,
`r/PhoenixNsa` ("no strings attached") and `r/Repsneakers` all reached results.

Checked whether Reddit could do the work for us — it can't. The Atom search
output carries no `over_18` marker, and `include_over_18=off` is silently
ignored on the `.rss` endpoint (identical result sets with and without it). So
the filter is entirely client-side.

The interesting bit is the camelCase problem. Sub names are glued together
(`DetroitButts`), which forces substring matching — but naive substrings destroy
real place names: an unanchored `butts?` was blocking **Butte, MT**, and
`cum`/`anal`/`dick` would have taken out Cumberland, Analy and Dickinson ND.
Fix is to split camelCase into words *first*, then anchor every pattern on `\b`.
That gets both: `DetroitButts` blocked, `Butte` kept. Nice side effect —
`PhoenixNsa` splits to "phoenix nsa" and is blocked, while `NSAoversight` doesn't
split and survives, so a legitimate security-agency feed isn't collateral.

Also added a positive relevance requirement (names the query, or reads like a
news/civic outlet), which drops r/Pizza and r/nba from a "detroit" search on its
own. Off-topic-but-harmless matches are ranked below news ones rather than
dropped.

Tested against live results for detroit / chicago / phoenix / ann arbor plus a
false-positive suite of real place names: 19/19 junk blocked, no real place lost.

## 2026-07-26 (evening) — Feed audit, backfill, and a health checker

Asked whether the curated list had ever been held to the same criteria as the
new Reddit filter. It hadn't — the filter only ever applied to search results.
Audited it properly.

**Editorial fit: fine.** All 69 curated subreddits are general city/state
community subs; no food, hobby, sports-only or personals. Earlier curation
holds up. Gap found: only the original 15 states have subreddits at all, so the
36 states added today offer no Reddit communities. On the to-do list.

**Feed health: not fine.** 33 of 249 (13%) were dead — verified when added, and
rotted since. Failures were family-wide, not random:

| Family | URL shape | Dead |
| --- | --- | --- |
| Tegna | `/feeds/syndication/rss/news/local` | 20/20 |
| Hearst | `/topstories-rss` | 8/8 |

Both now join Gannett (`/rss/`) and Gray (`/arcio/rss/`). **Four cities had no
working feed at all** — Atlanta, Greensboro, Spokane, Victorville — and nothing
surfaced that; the page just showed less.

**Backfill: 230 → 267 feeds**, single-source cities 45 → 32. The deeper problem
was that the list was almost entirely TV + daily papers, so a platform outage
took out whole cities at once. Added source types with different owners:

- **Patch** (31 cities) — hyperlocal, and the URL is derivable from the
  `(state, city)` pair already stored, so it scales without hand-picking. New
  `community` entry type.
- Public radio (WPLN, Colorado Public Radio), nonprofit newsrooms (Denverite,
  Austin Monitor), alt-weeklies (Chicago Reader, Cleveland Scene).

Caution learned: public radio can't be assumed. NPR members on the Grove
platform (KJZZ, WUWM, OPB, Boise State) return nothing through the proxy while
the WordPress ones (WPLN, CPR) are fine — check station by station.

**`scripts/check-feeds.mjs`** (`npm run check-feeds`) makes this repeatable.
Exits non-zero on any dead feed and shouts if a place is left with none. Reports
rather than edits, on purpose. Currently 267/267 alive.

**Curation automator.** Two pieces, both report-only:

- `npm run curate` (`scripts/curate-report.mjs`) — local, no subrequest limits.
  Health-checks everything, then for each *dead* feed re-reads that outlet's
  homepage `<link rel=alternate>` tags looking for one that still works. That's
  the direct answer to the Tegna/Hearst rot: when a publisher moves its feed,
  the old URL dies but the new one is advertised in the `<head>`. Also probes
  Patch coverage for the 59 cities that don't have it.
- Worker cron — same sweep in the cloud, emailing the digest to
  `hn-station@protonmail.com`. Workers cap subrequests per invocation (50 free)
  against ~270 feeds, so it checks 40 per daily firing and parks the cursor in
  the existing KV namespace. The sweep wraps about weekly, which paces the
  email for free.

Neither edits the JSON. Adding a source to a public news site is an editorial
act; an automated check can't judge whether an outlet is reputable.

**Zone-safety note.** `happening-now.net` is shared: `flights.happening-now.net`
is FlightTrack (its own `server.js` on another machine, never calls `/v1/*`),
and AstroLAB is entirely separate. Worker routes match the apex only, so
subdomains are unaffected. The one real hazard was mine: `cloudflare:email` was
initially a top-level import, and a module that throws at *import* time takes
the whole Worker down — including `/v1/rss`, `/v1/stocks` and `/v1/artemis`.
Moved it to a lazy import inside the send path. A weekly nice-to-have must not
be able to break the endpoints the site runs on.

Not deployed yet — needs Email Routing enabled on the zone and the destination
address verified. `wrangler deploy --dry-run` builds clean and resolves the
binding.

## 2026-07-26 (late) — Subreddits everywhere, docs refreshed, and a tooling bug

**Reddit communities for all 51 states.** They'd only ever existed for the
original 15, so the 36 states added earlier today offered none. Added 70
verified subs — statewide for every state plus DC, and a city sub for 34 of the
new cities. 139 total, all resolving, none tripping the source-search filter.

The ambiguous names needed real checking rather than guessing: `r/Charleston`
turns out to be **Charleston, SC** (so WV gets `Charleston_WV`), `r/burlington`
is **Burlington, Vermont**, and `PortlandME`/`JacksonMS` keep Oregon's
`r/Portland` and Michigan's `r/JacksonMI` distinct. Each confirmed by reading
the feed's own title.

**Tooling bug worth remembering.** The scratch probe used for the big sweeps
counted only RSS `<item>` and ignored Atom `<entry>` — and used `grep -c`,
which counts *lines*, against feeds that arrive on a single line. It surfaced
when all 36 statewide subreddits came back "dead" at once; Reddit serves Atom,
so every one was a false negative.

Re-checked all 33 feeds the earlier audit removed with a corrected counter:
**32 were genuinely dead, but Chicago Sun-Times was a false negative** (returns
55 items — likely a timeout during the sweep). Restored. `check-feeds.mjs`, the
tool that actually ships, counted both element types correctly the whole time
and still reports 268/268 alive.

Lesson: when a whole category fails at once, suspect the instrument.

**Docs.** `ops-monitoring-checklist.md`, `rollback-runbook.md` and
`web-presence-baseline.md` all listed `.html` URLs that have 301'd to
extensionless since `22613e4` — a 301 reads as a fault in a health check.
Baseline §4 now documents the GA4 install as built (Consent Mode denied, why
the tag must stay inline, what the data can and can't tell you) rather than as
a hypothetical. The weekly curation digest is now part of the ops routine.

## 2026-07-26 (night) — News categories: user-selectable topic tabs

Turn on subjects in Settings; each becomes a tab on the news page beside the
four geographic ones, backed by curated verified feeds in
`data/topic-sources.json`. Seven topics, 49 feeds: Science & Space (11), Music
(8), Building & Vibe Coding (7), Human Interest (6), Technology (6), Comics (6),
Health (5).

Additive by design — `cfg.topics` defaults to empty, so nothing changes for
anyone who doesn't opt in, and the geographic tabs keep their positions. Topics
append in *file* order rather than toggle order, so the tab bar doesn't
reshuffle underneath you. Unknown ids in saved config are dropped on read, so a
config outliving a renamed topic still works.

Scope clicks are now **delegated** from the bar rather than bound per button —
the topic tabs are injected asynchronously (they depend on saved config), and
delegation means they need no re-wiring. Settings fires `hn:topicschange` so an
open news page rebuilds its tabs live.

**Comics: the syndicated strips aren't possible.** GoComics (Peanuts, Garfield,
Calvin & Hobbes) and Comics Kingdom (Blondie, Beetle Bailey) have both withdrawn
public RSS — two URL patterns each, both dead. Local newspaper comics come from
those same syndicates, so "local comics" is out too. Independent webcomics do
publish feeds.

**Copyright is encoded as data, not a code special-case.** Headline + link is
ordinary RSS use everywhere. Rendering a comic's *image* is republishing, so an
entry displays as an image only with `"embed": true`, which requires a licence
recorded in `"license"`. Only **xkcd** qualifies — CC BY-NC 2.5, verified on
xkcd.com/license.html rather than from memory; this site is non-commercial and
attributes its sources, which is what that licence asks. Everything else is
flagged all-rights-reserved. Its feed carries the image *and* the alt-text.

`check-feeds` now sweeps this file alongside `local-stations.json` — a quiet
Science tab should report itself like a quiet city does. 352/352 alive.

**Third tooling bug of the day**, same family as the other two: the ad-hoc probe
used `xargs`, and "Simon Willison's Weblog" contains an apostrophe —
`xargs: unmatched single quote` silently dropped 18 entries, which looked like
18 dead feeds. They'd never been tested. Re-ran serially with a plain
`while read` loop: 0 dead. Nature was the one genuine casualty (answered once,
then failed three consecutive serial retries) — replaced with Science News and
Scientific American.

**xkcd renders inline.** Sources flagged `embed:true` show their image; the
`<img title>` becomes a visible caption rather than a hover attribute, because
on most webcomics that text is the punchline and hover doesn't exist on a phone.
Attribution renders inside the figure since the licence requires it. Also
`referrerPolicy=no-referrer` so a reader's page isn't leaked to the image host,
and `max-width:100%` because strips are wider than a phone.

Verified against the real feed: 34 items across the Comics tab, **4 with images
— all xkcd**. The other 30, from the five all-rights-reserved comics, stay
text-only. That count is the licence gate working.

Caught a truncation bug while testing: pulling the title attribute with
`[^"']` stops at the first apostrophe inside a double-quoted value, so
"...smoke detector incident wasn't enough" arrived as "...incident wasn". Now
captures the opening quote and matches to its pair.

Worth keeping: `scratchpad/devserve.py` serves the repo but forwards `/v1/*` to
the production Worker. Without it a local page renders every feed empty, because
the RSS proxy is a Worker route that a static server knows nothing about — which
is why the first Comics screenshot showed "No articles available" everywhere.

### The sync file bug that real use found (and it cost a backup)

Shipped, then tested by hand, and the first session with it destroyed a backup.
Worth writing down because the mistake looks reasonable in code review.

`choose()` used **`showSaveFilePicker`** and wrote the current config the moment
a file was picked. That's fine for "name me a new file". It is catastrophic for
"reconnect me to my existing backup", which is the same gesture through the same
dialog. Chain of events: Stop syncing (which forgets the handle by design, but
the panel then read "Not set up", which looks broken) -> Reset to defaults ->
re-pick the backup file to reconnect -> defaults written straight over it. The
only route back from Stop was the destructive one.

Recovered from an unrelated Export JSON sitting in Downloads from the night
before. That was luck, not design.

Three fixes:

- **Choosing a file no longer writes by itself.** It connects, peeks at the
  file, and asks before overwriting anything that already parses as settings.
  Decline and it stays connected but **paused**, so a background auto-write
  can't quietly finish the job a second later.
- **"Use existing file…"** is a separate button on `showOpenFilePicker`, which
  reads and cannot write. It connects paused and offers to load the file. That
  is what reconnecting to a backup actually means, and it's now also the
  recovery tool.
- **Stop syncing** confirms, and says the file is kept. The disconnected status
  explains both buttons instead of claiming nothing is set up.

The general lesson: a Save-as picker is a *write* gesture. If the same button
is also the only way back to an existing file, the destructive path is the
default path.

### Next up

- **Not deployed yet.** GA4 collects nothing until `scripts/deploy-prod.ps1`
  runs. That needs `npm install` in this clone first, or the deploy silently
  ships unminified assets (the stage script only warns).
- `docs/web-presence-baseline.md` line 14 is stale (says GSC/Bing still need
  setup) and §4 still describes GA4 as hypothetical; worth a refresh.
- `docs/ops-monitoring-checklist.md` checks `/weather.html`-style URLs that now
  301 to extensionless ones.

## 2026-07-26 (very late) — Collapsible news settings, picker dedupe, sync-to-file

Three things, all in Settings.

### News tab sections collapse, and start collapsed

The `.collapsibleSection` markup was already there on every settings section,
but the feature was inert: the JS only toggled when the click landed on
`.collapsibleArrowHit`, and CSS set that to `display:none` — plus nothing ever
hid a body that lost the `expanded` class. So the classes were decorative.

Now the **News tab only** really collapses: the whole header is the hit target,
the arrow shows and rotates, and `:not(.expanded)` bodies are hidden. The other
tabs are untouched — their headers stay plain labels, which is why the CSS is
scoped with `.settingsTabContent[data-tab="news"]`. Default state is collapsed,
expressed by *removing* `expanded` from the markup rather than in JS, so there
is one source of truth. Nothing is remembered between visits: every open starts
collapsed, which is what was asked for.

The "i" tips toggle inside the National header lives *inside* the section body,
so opening it now also opens the section — otherwise it reads as a dead button.

### Pickers no longer offer sources you already have

- **Local / State search results** show a greyed "Added" tag instead of an Add
  button that would only report "already saved".
- **The local/regional picker overlay** tags matching rows `ADDED` and starts
  them checked. Feeds are compared on a trailing-slash- and case-insensitive
  key, because the same feed arrives as `.../detroit` and `.../detroit/` from
  different catalogues.
- The National/International discovery modal already did this ("Already Added").

**The bug found while doing it:** that picker's Save *replaces* the whole scope
list, and it never showed what was already saved. Re-opening it and saving
silently dropped any custom RSS URL you'd pasted, and any outlet from a city you
no longer resolve to. Saved sources the picker can't re-offer are now carried
into the custom list, so they survive Save by default and can still be removed
with the × there.

### Sync to a file (Settings → System)

New `assets/settings-sync.js`. Pick a file once; it's written immediately, then
rewritten (debounced ~1.2s) on every config change. Two toggles: **auto-sync on
change** and **auto-restore after a clear**. Manual **Sync now** / **Restore from
file** / **Stop syncing** alongside.

Design notes worth keeping:

- Uses the **File System Access API**. Chromium only — Firefox and every browser
  on iOS have no `showSaveFilePicker`, so the panel says so and points at the
  existing Export/Import JSON box rather than pretending.
- The handle lives in **IndexedDB** (localStorage holds strings only). Clearing
  all site data takes the handle with it; the file survives but must be re-picked
  by hand. That's the permission model, not a bug.
- **Permission needs a click.** A background save can only write if permission is
  already granted, so `autoWrite` never calls `requestPermission` — it renders a
  "Reconnect needed" state instead.
- Prefs live in their **own** localStorage key (`hn_sync_prefs_v1`), not in the
  config. They're specific to this browser, and keeping them out of the config
  means Settings' own Save can't clobber them and they never travel in an export.
- `saveConfig` now fires **`hn:config-saved`** on every write, including from
  inside common.js (the pickers call the module-local function, so wrapping
  `window.App.saveConfig` would have missed them). Reset fires
  **`hn:config-reset`**.
- **A reset pauses syncing** rather than writing defaults over your backup. The
  reset event only *stages* the change (settings.js writes nothing until Save),
  so the flag is consumed by the next save — reset-then-navigate-away doesn't
  pause anything falsely.

Loaded on all four pages so a change made in the news-page picker syncs too.

### Categories moved to the top, laid out horizontally

News Categories now leads the News tab — it's the cheapest way to change what
the news page shows (one click per tab, no picker step), so it goes first. The
chips changed from a 1/2-column grid of full-width rows to a wrapping flex row
that sizes each chip to its label: 7 categories now take 2 rows on a desktop
instead of 4. On a phone the long titles ("Human Interest & Culture") still mean
mostly one per row — the width is the title, not the padding.

### Testing note

Headless Chrome on Windows **can't be made narrower than ~500 CSS px** with
`--window-size` — it clamps, and the screenshot is then a 390px crop of a 504px
layout, which reads as "the page overflows on a phone" when it doesn't. Drive
`Emulation.setDeviceMetricsOverride` over CDP instead for a true 390px viewport.
And a plain `Page.navigate` reuses memory-cached scripts, so edits to
`assets/*.js` silently aren't under test — `Page.reload {ignoreCache:true}` plus
`Network.setBypassServiceWorker` is what actually loads what you just wrote.

### Next up

- **Not deployed.** All of the above is local only.
- The file-picker/write path is the one thing not verified end-to-end — an OS
  dialog can't be driven headlessly. Worth one manual click-through in Chrome:
  choose a file, change a setting, confirm the file's mtime moves.
- Firefox/iOS get no sync. If that matters, the fallback would be a periodic
  download of the JSON, which is a different (and worse) thing.
