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
- `cloudflare-sync-worker/src/index.js` — routing for every `/v1/*` endpoint
- `cloudflare-sync-worker/src/markets.js` — the cached board snapshot, and the
  one Yahoo v8 chart reader both it and the watchlist use
- `cloudflare-sync-worker/src/quotes.js` — `/v1/stocks/quotes`, the per-symbol
  cached watchlist quotes (see "Stock quotes" below)
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
- **The RSS cache-buster is named `_hn`, and it must never collide with a real
  feed parameter.** It used to be `t`. TownNews search feeds — the whole
  `/search/?f=rss&t=article&c=news` family, nine papers and stations in
  `data/local-stations.json` — use `t` for *type*, so `&t=<timestamp>` overrode
  `t=article` and the endpoint answered with a valid, completely empty feed.
  Nothing errored; Madison, St. Louis, Manchester, Wilmington and Pittsburgh
  just quietly showed no local news. Separately, some hosts reject *any*
  unrecognised param (Vox Media — The Verge and Eater — plus Business Insider
  and hnrss.org, which 404/502), so `fetchRssItems` retries the untouched URL
  when the busted one fails and known offenders are listed in
  `NO_CACHE_BUST_HOSTS` to skip the wasted round trip.
- **`/v1/rss/raw` must answer `application/xml`, never the upstream
  Content-Type.** canarymedia.com serves a perfectly valid feed as `text/html`;
  echoing that label made our *own* Cloudflare zone treat the proxied response
  as a web page and append its tracking beacon after `</rss>`. That trailing
  junk is not well-formed XML, so browser DOMParser rejected the whole document
  and the Climate tab rendered nothing — while every curl-and-grep check
  reported 100 healthy items.
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

## Privacy posture — what leaves a visitor's browser

Audited 2026-08-27. The site collects **nothing** about visitors server-side: no
cookies of its own, no accounts, no `POST`/`PUT` from the browser anywhere, and
KV holds only the market snapshot, Artemis updates and feed-sweep state. Settings
live in three `localStorage` keys and never leave the device — `settings-sync.js`
writes to a file the user picked and has no network code at all.

Keep it that way. Two rules follow from the audit:

- **Never point client code at a third-party asset host.** It is not the obvious
  trackers that leak; it is the convenient ones. Source icons used to come
  straight from `google.com/s2/favicons`, which handed Google one request per
  news source per reader — carrying the reader's IP and a happening-now.net
  referrer, and so building a per-visitor record of *which outlets they read*.
  That was more identifying than the GA4 tag, and it wasn't in the privacy
  policy. It now goes through `/v1/favicon`. Fonts, icons, embeds and image CDNs
  are all the same trap: proxy them or self-host them.
- **Prefer the Worker as a shield.** `/v1/rss/raw` sends a synthetic User-Agent
  and forwards none of the visitor's headers, so publishers and Yahoo see the
  Worker rather than readers. That is a real privacy feature — don't "fix" it by
  passing headers through.

What still legitimately leaves the browser, and why:

| Destination | Carries | Why |
| --- | --- | --- |
| `googletagmanager.com` | cookieless GA4 ping | analytics; consent denied by default and never granted |
| Cloudflare | hosting + RUM | operational |
| `api.open-meteo.com`, `geocoding-api.open-meteo.com`, `api.weather.gov` | lat/lon | forecasts and alerts |
| `api.zippopotam.us` | ZIP | ZIP → coordinates |
| `api.bigdatacloud.net`, `nominatim.openstreetmap.org` | lat/lon | reverse geocoding |
| `embed.windy.com` | lat/lon in an **iframe** URL, plus IP and referrer | radar map; the leakiest remaining item |
| publisher CDN | image request | the Comic widget only (`news.js`) — headline cards load no publisher images |
| `api.codetabs.com`, `corsproxy.io` | feed URL + IP | fallback CORS proxies, only when the first-party path fails |
| `duckduckgo.com` | the query | `form-action`, only on an explicit search |

`/v1/state/<namespace>` is a dormant route from the sync-worker heritage that the
site never calls. It is bearer-token protected — verified live, it answers 401.
Don't remove the token check to "simplify" it.

`observability` is on in `wrangler.jsonc`, so Cloudflare retains Worker request
logs, and those URLs include `?symbols=NVDA,MSFT,...`. That is the one place
per-visitor data gets written down.

### Source icons: `/v1/favicon`

`cloudflare-sync-worker/src/favicon.js` proxies Google's favicon service, with a
7-day edge cache and a 30-day browser cache. Google still sees which domains the
site shows icons for, in aggregate, but can no longer tie any of it to a reader.

**Self-hosting the publishers' own icons was measured and rejected** — don't
re-propose it without new numbers. From a Worker IP: `bbc.com/favicon.ico` is
39 KB and `arstechnica.com` 41 KB against Google's 285 bytes,
`propublica.org` answers with a 272-byte stub, and Gray-owned stations
(`wilx.com`) **502** outright, the same block that affects their RSS. Normalising
that spread down to the 14–18px these render at needs Cloudflare Image Resizing,
a paid feature. Through Google, `wilx.com` returns a working 7 KB icon.

Both call sites go through `App.faviconUrl(siteOrHostname, size)` — the news card
header in `common.js` and the stocks news list in `stocks.js`, which used to
build the URL inline. Keep it that way, and note the route is built from
`API_ORIGIN` like every other first-party path: a bare `/v1/favicon` works in
production and 404s every icon in local dev.

## Stock quotes

Two different shapes, for two different problems:

- **The board** (`/v1/markets/snapshot`) is a fixed list, so it's one cached
  bundle in KV, built by `markets.js` and shared by every visitor.
- **The watchlist** (`/v1/stocks/quotes?symbols=A,B,C`) can't be — its symbols
  are whatever each visitor added — so `quotes.js` caches **per symbol** with a
  5-minute freshness window instead. Two people holding NVDA cost one upstream
  call between them, and the browser makes one request rather than one per row.

Both need the browser User-Agent — Yahoo answers a bare API client from a Worker
IP with an error page rather than JSON. They parse the same `meta` block through
the same `quoteFromMeta`, but they fetch differently:

- The board uses Yahoo's **v7 `spark`** endpoint, which takes many symbols per
  call and needs no crumb. **The cap is exactly 20 symbols — 21 answers 400**,
  verified from a Worker IP. Raising `SPARK_BATCH` past 20 doesn't fail loudly;
  it silently drops a whole batch of twenty tiles. 149 symbols is 8 calls, which
  is what makes the board affordable — a Worker request may only make 50
  subrequests on the free plan, so one-call-per-symbol could never have grown
  past ~45 tiles.
- The watchlist stays on **v8 `chart`**, one symbol at a time, via the exported
  `fetchYahooChartQuote`.

**The board catalog lives in two files that must agree**: `INSTRUMENTS` in the
Worker's `markets.js` (which owns the Yahoo symbol) and `MARKET_INDEX_DEFS` in
`assets/common.js` (which owns `type`/`region` for the Settings picker and the
session dot). A key in one and not the other is a permanently empty tile, or a
fetched quote nothing renders. Every `region` on a `global-indices` entry also
needs a row in `EXCHANGE_HOURS` in `assets/stocks.js`, or its dot reads CLOSED
around the clock.

**New catalog keys must default to hidden.** Both `normalizeConfig` (common.js)
and `getConfiguredIndices` (stocks.js) append keys a saved config has never seen;
both used to append them **visible**. That was harmless when the catalog gained
one index at a time — going from 23 to 101 would have buried every existing
six-tile board under ninety-five uninvited ones.

**Currencies are live FX quotes, not reference rates.** They were on
open.er-api.com, whose free tier publishes once a day, which is why they used to
render a "daily rate" label where every other tile shows a percentage. They're
Yahoo `USD<code>=X` symbols now, batched with everything else, so they carry a
real move and a 24/5 session dot. Verify a new code through the proxy before
adding it, the same way feeds are checked:

```bash
curl -s 'https://happening-now.net/v1/rss/raw?url=<urlencoded yahoo spark url>' | head -c 300
```

**Don't put Finnhub back at the front of the watchlist.** `fetchYahooBatchQuotes`
was a stub returning `null` (Yahoo's v7 *quote* endpoint needs an authenticated
crumb — note that v7 *spark*, used by the board, does not), which sent every
symbol down the browser fallback chain starting at Finnhub — 60 calls a minute
shared by all visitors. The four
default symbols alone drew 429s on a single page load. `/v1/stocks/quote`
(singular, Finnhub-backed) is still there as the per-symbol fallback for whatever
the batch misses; that's the only job it should have.

The gainers / losers / trending widgets still fan out over `POPULAR_STOCKS`
through Finnhub, but only after both Yahoo movers and FMP have failed, so it's a
rare path rather than a per-load one.

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
which runs its own `server.js` and only borrows the subdomain — it never calls
`/v1/*`. It used to be served from the MEOOEM laptop; on 2026-08-26 it moved to
OEMMEO, so every part of happening-now now lives on this machine. It reaches the
internet through a cloudflared tunnel rather than Cloudflare's edge, so it is
the one piece that does **not** come back with `scripts/deploy-prod.ps1` — see
`C:\TEMP\Projectslighttrack\deploy\` for how it is installed. AstroLAB is fully separate (own Cloudflare
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

**Counting `<item>` is not the same question as "does it render".** The browser
parses with `DOMParser`, and one XML error voids the *whole* document — so a
feed can serve a hundred valid items and still show zero headlines. That gap
hid three live breakages at once (canarymedia.com, lwlies.com, and ktla.com,
whose channel title contains a bare `&` — that one blanked all of Los Angeles).
`cloudflare-sync-worker/src/feed-health.mjs` is the single definition of a
usable feed, shared by `check-feeds`, `curate-report` and the digest email so
they can't disagree. It mirrors the repairs `assets/common.js` applies before
parsing — leading blank lines, junk after the closing root tag, bare
ampersands, undeclared namespace prefixes — so anything the browser fixes is
not reported, and anything it chokes on is. **Keep the two in step**;
`common.js` is a browser IIFE with no exports, so the copy is deliberate.

The digest email (`cloudflare-sync-worker/src/curate.js`) sweeps **both**
catalogs. It used to check only `local-stations.json`, which is why five topic
feeds rotted with nothing reporting it. At ~400 feeds and `BATCH = 40` a full
sweep is ~10 daily firings, so the digest arrives every week and a half rather
than weekly — raise `BATCH` toward the 50-subrequest cap or fire the cron twice
a day to tighten that.

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
