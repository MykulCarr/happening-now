# HAPPENING NOW — project instructions

A live, public news/weather/stocks dashboard at **happening-now.net**. Static
HTML/CSS/JS deployed to Cloudflare Workers assets, installable as a PWA, plus a
companion Worker (`cloudflare-sync-worker/`) that fetches and caches RSS feeds
the browser can't reach directly (CORS).

This is **in production**. It has a signed-off launch checklist, a rollback
runbook and an ops monitoring checklist in `docs/`. Treat changes accordingly.

## Layout

- `index.html`, `weather.html`, `stocks.html` — the three real pages
- `settings.html` — source picker / preferences; marked `noindex`, not in sitemap
- `sources.html`, `privacy.html`, `terms.html` — public info + legal
- `assets/` — all JS and `styles.css`. `common*.js` is shared; the rest is per-page
- `assets/settings-sync.js` — optional "sync settings to a file" extra (see below)
- `cloudflare-sync-worker/src/index.js` — the feed proxy behind `/v1/artemis/updates`
- `_headers` — security headers incl. CSP. `_redirects` — 301s for `/x.html` → `/x`
- `scripts/` — deploy tooling (PowerShell + one esbuild script)

No build step for source. The files you edit are the files that ship; minification
happens only inside the staged deploy bundle.

## Running and testing changes

Serve the repo root over HTTP — `file://` breaks fetch and the service worker:

```powershell
python -m http.server 8080
```

The pages call the **production** Worker for feed, stock and market data even
when served locally, so the widgets work without running anything else. That
depends on **port 8080** — the Worker's `ALLOWED_ORIGINS` lists only
`localhost:8080` and `127.0.0.1:8080`, so serving on any other port gets a CORS
refusal on every `/v1` call.

**Always check a phone-width viewport (~390px) before calling UI work done** —
this is used on a phone as an installed PWA at least as much as on desktop.

If you change the service worker or cached assets, hard-reload (or unregister the
SW) when testing; a stale SW will happily serve you the old build and make a
working fix look broken.

### Checking a phone viewport from a headless browser

Two traps that both produce confident, wrong answers:

- **`--window-size` can't go below ~500 CSS px on Windows.** Chrome clamps the
  window but still crops the screenshot to what you asked for, so a "390px"
  capture is really a 390px crop of a 504px layout — every page looks like it
  overflows on a phone. Use CDP `Emulation.setDeviceMetricsOverride`
  (`{width:390,height:844,deviceScaleFactor:2,mobile:true}`) for a real 390px
  viewport.
- **A plain `Page.navigate` re-runs the memory-cached scripts**, so edits to
  `assets/*.js` silently aren't under test — the symptom is a change that
  "doesn't work" while `curl` shows the new code being served. Follow the
  navigate with `Page.reload {ignoreCache:true}`, and set
  `Network.setBypassServiceWorker` — the dev cache key is a literal
  `__BUILD_ID__`, so it never rotates locally.

## Gotchas that have actually bitten

- **New public files don't ship unless you list them.** `scripts/stage-public-assets.ps1`
  copies an explicit `$publicFiles` allow-list (plus the `assets/`, `data/`,
  `.well-known/` directories). Add a new top-level file to that array or it
  silently never reaches production.
- **`sw.js` and `.well-known/security.txt` contain placeholders** (`__BUILD_ID__`,
  `__EXPIRES__`) that are substituted at stage time. Don't "fix" them in source.
- **Some publishers block Cloudflare Worker IPs.** PBS NewsHour had to be swapped
  for ProPublica for exactly this reason (`fb3ca6e`). If a feed works in a browser
  but 403s from the Worker, that's the cause — replace the source rather than retry.
- **Prefer publisher-direct RSS over Google News query URLs** — those proved
  unreliable and were removed in `40e537f`.
- **CSP lives in `_headers`.** Any new third-party endpoint needs adding there or
  it'll be blocked in production but fine locally.
- **Never write a bare `/v1/...` path.** Every first-party route must be built
  from `API_ORIGIN` (`assets/common.js`), which is empty in production and
  absolute on localhost. A literal path works in production and silently 404s in
  local dev, where the failure is invisible: RSS just falls through to the
  third-party codetabs proxy, and the news page's own health probe reports the
  proxy "unreachable" while it is fine. Five copies of this bug had accumulated
  — `RSS_PROXY_BASE` plus a hand-written probe URL in `news.js`, `stocks.js` and
  `weather.js` and the `PROXY` const in `source-search.js`. They now all read
  `App.RSS_PROXY_BASE`; keep it that way rather than re-typing the path.
- **Collapsible settings sections only actually collapse on the News tab.** Every
  settings section uses the same `.collapsibleSection / .collapsibleHeader /
  .collapsibleBody` markup, but the behaviour is scoped by
  `.settingsTabContent[data-tab="news"]` in both `styles.css` and `settings.js`.
  On the other tabs the arrow is hidden and the header is a plain label — that's
  deliberate, not an oversight. The News sections' **default state is collapsed,
  and it lives in the markup**: they ship without the `expanded` class. Don't
  move that default into JS, and don't add `expanded` back "for consistency".
- **`saveConfig` fires `hn:config-saved`; Reset fires `hn:config-reset`.** These
  are how `settings-sync.js` hears about changes. Wrapping `window.App.saveConfig`
  would miss the saves made *inside* `common.js` (the source pickers call the
  module-local function), which is why the event is dispatched from `saveConfig`
  itself. Keep it there.
- **Sync-to-file is Chromium-only by nature.** `assets/settings-sync.js` uses the
  File System Access API; Firefox and every browser on iOS have no
  `showSaveFilePicker`, and the UI is expected to say so and fall back to
  Export/Import JSON. The file handle lives in IndexedDB, so clearing site data
  loses it (the file survives, it just has to be re-picked). Writing needs a user
  gesture for permission, so background auto-sync only writes when permission is
  already `granted` — never call `requestPermission` from a background save. Its
  prefs live in their own `hn_sync_prefs_v1` localStorage key, deliberately
  outside the config: they're per-browser and must not travel in an export.
- **Picking a sync file must never write on its own.** `showSaveFilePicker` is
  a *write* gesture, but it's also how a user reaches a file that already
  exists — so the first version destroyed a real backup: Stop syncing (which
  forgets the handle) left re-picking the file as the only way back, and that
  wrote the current config, which after a reset meant defaults over the backup.
  `choose()` now connects, peeks at the file, and asks before overwriting
  anything that parses as settings; declining leaves it **paused** so the
  background auto-write can't finish the job. Reconnecting is a separate
  button on `showOpenFilePicker`, which cannot write. Keep those two paths
  distinct.
- **The GA4 tag must stay inline in `<head>` on every page.** It was first built
  as a tidy `assets/analytics.js` that injected the tag at runtime; hits fired
  correctly, but GA4 reported "tag not installed" because Google's detection
  scans the served HTML source and found nothing. Don't refactor it back out
  into a shared file.

## Local news coverage list

`data/local-stations.json` is the curated per-state/per-city feed list behind the
Local News picker. It documents its own rules in `_meta.howToAdd` — read that
before adding. The one that matters most: **verify every candidate feed through
the Worker proxy**, not just in a browser —

```bash
curl -s 'https://happening-now.net/v1/rss/raw?url=<urlencoded>' | grep -c '<item'
```

Zero means skip it. Feed families that work: Nexstar (`/feed/`), Scripps
(`/news.rss`), TownNews (`/search/?f=rss&t=article&c=news`), Arc
(`/arc/outboundfeeds/rss/`), and the States Newsroom nonprofits (`/feed/`).
Families that reliably fail through the proxy: Gannett (`/rss/`) and Gray
(`/arcio/rss/`).

### Reddit: use the `.rss` endpoints, never the JSON API

Reddit's JSON API (`/subreddits/search.json`, `/api/subreddit_autocomplete_v2`)
returns **403** to anonymous *and* Cloudflare-Worker-origin requests — that's why
live discovery was ripped out in `fdbf508`. But the **`.rss` variants of the same
searches are not blocked**: `https://www.reddit.com/subreddits/search.rss?q=<kw>`
returns an Atom feed of matching subreddits, and that's what
`assets/source-search.js` uses to do keyword discovery. Re-verify through the
proxy before assuming it still holds; if it breaks, the symptom is an empty
"Reddit communities" group, not an error.

**Verifying subreddits: count `<entry>`, and go slow.** Two traps, both of which
produced false "dead" verdicts on 2026-07-26:

- Reddit serves **Atom**, so a checker counting only `<item>` reports every
  subreddit as dead. Count `<(item|entry)` — and count *occurrences*, not lines:
  `grep -c` returns 1 for an entire feed, because feeds arrive on one line.
- Reddit **rate-limits** bulk checking. Probing 172 subs six-at-a-time returned
  six spurious zeroes including `r/Ohio` and `r/Seattle`; every one returned 25
  entries when retried serially a few seconds apart. Re-check any failure one at
  a time before concluding it's dead.

`scripts/check-feeds.mjs` counts both element types correctly — ad-hoc shell
loops are where this goes wrong.

**The result filter in `source-search.js` is load-bearing — don't loosen it.**
These results land in a public-facing dashboard, and Reddit gives us nothing to
lean on: the Atom output has no `over_18` marker and `include_over_18=off` is
silently ignored on the `.rss` endpoint. So filtering is entirely ours. Three
things about it that are easy to break:

- It matches **name + title + sidebar description**. The description is the most
  telling of the three; an early version ignored it and leaked.
- It **splits camelCase before matching** (`DetroitButts` → `detroit butts`) so
  every pattern can anchor on `\b`. This is what lets it block `DetroitButts`
  while keeping **Butte MT**, `Cumberland`, `Dickinson ND` and `Assateague`. An
  unanchored `butts?` blocked Butte — if you add a term, add the boundaries and
  re-run the false-positive suite of real place names.
- A result must also **earn relevance**: it names what was searched for, or it
  reads like a news/civic outlet. That's what keeps r/Pizza and r/nba out of a
  "detroit" search.

Verified against live results for detroit / chicago / phoenix / ann arbor.
False positives are the cheap error here — anything wrongly dropped is still
addable by pasting its RSS URL.

### Other things live under this zone — don't break them

`happening-now.net` is shared. **`flights.happening-now.net`** is FlightTrack,
which runs its own `server.js` on a different machine and only borrows the
subdomain — it never calls `/v1/*`. AstroLAB is fully separate (own Cloudflare
project, own repo). Worker routes are `happening-now.net/*` and
`happening-now.net/v1/*`, which match the apex hostname only, so subdomains are
untouched by anything here.

The one way to break them from this repo is the shared Worker: `/v1/rss`,
`/v1/stocks` and `/v1/artemis` all live in `cloudflare-sync-worker`, and a
module that throws at *import* time takes the whole Worker down, not just the
feature that imported it. That's why `curate.js` imports `cloudflare:email`
lazily inside the send path rather than at the top of the file. Keep optional
extras behind lazy imports.

### Feeds rot — re-check them

```bash
npm run check-feeds        # or: node scripts/check-feeds.mjs --json
```

Exits non-zero if anything is dead and shouts if a place is left with **no**
working feed. Worth running before any release that touches the list, and
periodically regardless: an audit on 2026-07-26 found **33 of 249 feeds (13%)
had died** since they were added, and four cities — Atlanta included — were
serving nothing at all. Nothing surfaced it; the page just quietly showed less.

It reports rather than edits, deliberately: dropping a source is an editorial
call, and a feed can 500 for a day without being dead.

After changing that file, regenerate the public list on `sources.html`:

```bash
npm run coverage
```

That rewrites the block between the `coverage:start`/`coverage:end` markers from
the JSON, so the page can't drift from the data. It's written into the committed
HTML rather than rendered client-side so crawlers can see the city names.

## Deploying

```powershell
pwsh -File scripts/deploy-prod.ps1
```

Needs `npm install` once (esbuild). It stages, minifies, `wrangler deploy`s, pings
IndexNow and archives URLs to the Wayback Machine. To inspect what would ship
without deploying, run `scripts/stage-public-assets.ps1` alone. Rollback procedure:
`docs/rollback-runbook.md`.

## Dashboard sync

Tracked in the Projects Dashboard as `news-pages`.

`TODO.md` here is **generated** by the dashboard's sync and is gitignored.
Edit the checkbox lines freely; never touch the `<!-- id: -->` comments, and
don't add prose around them — only checklist lines survive a sync.

Before concluding sync is broken: check the sync log
(`~/.projects-dashboard/sync.log` on Windows, `~/.config/projects-dashboard/`
on Linux). A machine can have more than one clone of the dashboard repo, and
only the one holding `sync/config.local.json` is the live sync install — a
missing config or a stale `data.json` in another clone means nothing.

This project also used to live at `C:\TEMP\Sites\news-pages`. That clone is
orphaned as of 2026-07-26; `C:\TEMP\Projects\happening-now` is canonical.
