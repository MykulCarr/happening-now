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

Serve the repo root over HTTP — `file://` breaks fetch and the service worker.
All internal nav/footer links (topbar, footer) point at **clean paths**
(`/weather`, not `weather.html`), matching production and `_redirects` — so
use the clean-URL dev server, which resolves `/weather` → `weather.html` the
same way Cloudflare does, or nav clicks will 404:

```powershell
python scripts/dev-server.py 8080
```

Plain `python -m http.server 8080` still works for loading a page directly by
its `.html` filename, but clicking nav links from it will 404.

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

- **Internal links must use clean paths (`/weather`), never `.html`.** The
  topbar (`scripts/topbar-template.html` + its dev-time fallback
  `assets/topbar.js`, plus the legacy renderer in `assets/common.js`) and
  every page's footer used to link to `index.html`/`weather.html`/etc.
  Those still worked — `_redirects` 301s them to the clean path — but it meant
  the site perpetually re-fed Google its own non-canonical URLs, which is
  exactly what Search Console's "Page with redirect" report was flagging
  (2026-09-21). A 301 target is for outside links and old bookmarks; a site's
  *own* nav should link straight to the canonical path so neither Googlebot
  nor a real visitor ever takes the redirect hop. Test locally with
  `scripts/dev-server.py`, not plain `python -m http.server` — see "Running
  and testing changes" above.
- **New public files don't ship unless you list them.** `scripts/stage-public-assets.ps1`
  copies an explicit `$publicFiles` allow-list (plus the `assets/`, `data/`,
  `.well-known/` directories). Add a new top-level file to that array or it
  silently never reaches production.
- **`sw.js` and `.well-known/security.txt` contain placeholders** (`__BUILD_ID__`,
  `__EXPIRES__`) that are substituted at stage time. Don't "fix" them in source.
- **`/v1/rss/raw` identifies honestly first, then retries as Chrome.** It
  used to send only a Chrome User-Agent, and on 2026-10-18 that was what got
  39 feeds blocked: the WordPress-hosted nonprofits (Texas Tribune,
  CalMatters, VTDigger, WyoFile, CT Mirror, MinnPost...) share a 403
  "Checking your browser..." wall (`/__challenge/probes.js`) aimed at clients
  that claim to be a browser and can't run JavaScript. Measured from a Worker
  IP across all 471 feeds: Chrome UA 420 worked, the honest
  `happening-now.net feed reader` UA 457. Only CBC (and Yahoo's JSON) need the
  browser UA, and they're in `BROWSER_FIRST_HOSTS`. All of it lives in
  `fetchFeedUpstream` in `upstream-headers.mjs` — don't go back to a single
  disguised UA.
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
  local dev. That used to be invisible, because RSS fell through to a
  third-party proxy while the news page's own health probe reported the proxy
  "unreachable" when it was fine; with that fallback gone the symptom is now
  simply that no feeds load locally. Five copies of this bug had accumulated
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
cookies of its own, no accounts, and KV holds only the market snapshot,
quote cache and feed-sweep state. Settings
live in three `localStorage` keys and never leave the device — `settings-sync.js`
writes to a file the user picked and has no network code at all.

**The one exception (2026-10-18): "Report a problem."** The ⚑ on each
headline (`assets/report.js`) POSTs `{ feed, article, reason }` to
`/v1/report` (`cloudflare-sync-worker/src/reports.mjs`), stored in the
`hn-reports` D1 database and summarised in the digest email. It is the only
browser-to-us write, and it is shaped to stay boring: a fixed reason list and
**no free-text field** (nothing personal can be typed in, nothing to spam),
the row keeps the UTC day only — never IP, User-Agent or time — our-origin
only, once per article per browser (`hn_reported_v1`, outside the config),
a daily cap, and 90-day deletion. Its sibling is the one-question survey on
`/feedback` (`assets/feedback.js` → `/v1/pulse`, `pulse` table): yes /
somewhat / no plus which of news/weather/stocks, same rules, once per 30
days per browser (`hn_pulse_v1`). Free text deliberately goes by `mailto:`
from the reader's own mail app, so it never reaches our servers.
`privacy.html` describes exactly this; if
the payload grows, the policy changes in the same commit. Don't add a
free-text box, and don't add a second browser write without the same audit.
`npm run test:reports` forces every branch against a stand-in D1; run the
real SQL with `wrangler d1 execute hn-reports --remote` after touching it.

**Anonymous usage counts (2026-10-18).** `assets/usage.js` (on every public
page) batches what was used, sent by `sendBeacon` to `/v1/usage`
(`cloudflare-sync-worker/src/usage.mjs`, `usage` table): page/tab moves as
`from → to` pairs, named controls, the **hostname** of a clicked headline
(never the article), the visitor's country from `request.cf`, once per
arrival, and time on screen per page as a **range** (`TIME_BUCKETS`, e.g.
`1-3m`), sent each time the page leaves the screen — never exact seconds. Each event only increments a `(day, kind, a, b)` counter — no ID,
IP, UA or time.

**Journeys, visit length and unique visitors (2026-10-19, owner's decision)**
come from a *daily visitor hash* in `src/visitors.mjs`: SHA-256 of a random
per-UTC-day salt + IP + User-Agent, first 16 hex. The salt lives in the D1
`salts` table and yesterday's is **deleted** as soon as today's exists, so a
past vid can never be recomputed or tied to an IP. One `visitors` row per vid
per day: path (capped 400 chars), steps, on-screen seconds. IP and UA are
hashed, never stored. **The line now: links last one UTC day.** Never keep a
salt longer, never derive it from a fixed secret (that would make old vids
recomputable), never add a cookie or any ID that survives the day.
`npm run test:visitors` runs the real schema on node:sqlite.

This design is being generalised for all of the owner's sites in the
separate **site-analytics** project (`C:\TEMP\Projects\site-analytics`),
which holds a frozen copy of these files as its reference. This site keeps
its own copy until that project is proven; switching over will arrive as a
TODO line here. Don't edit site-analytics from this repo.
Stock symbols are deliberately not sent. The only state kept is
`hn_usage_place` in sessionStorage (where this tab was). Off for GPC/DNT,
`navigator.webdriver` and localhost (dev pages call the production Worker).
Control names live in two lists that must agree: `TAPS` in usage.js and
`TAPS` in usage.mjs; an unknown one is dropped by itself, not the batch.
Shown on /admin (`assets/admin-analytics.js`, which also renders the
Cloudflare view from `/v1/admin/cloudflare` — one GraphQL request per view,
since parallel queries exhausted the API's rate budget). `npm run test:usage`.

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
| `embed.windy.com` | lat/lon in an **iframe** URL, plus IP and referrer | radar map — **click-to-load**, see below; nothing is requested until asked |
| publisher CDN | image request | the Comic widget only (`news.js`) — headline cards load no publisher images |
| ~~`api.codetabs.com`, `corsproxy.io`~~ | — | **removed 2026-09-12.** No third-party proxy is in the path any more; see "Feed resilience" below |
| `duckduckgo.com` | the query | `form-action`, only on an explicit search |

`/v1/state/<namespace>` is a dormant route from the sync-worker heritage that the
site never calls. It is bearer-token protected — verified live, it answers 401.
Don't remove the token check to "simplify" it.

`observability` is on in `wrangler.jsonc`, so Cloudflare retains Worker request
logs, and those URLs include `?symbols=NVDA,MSFT,...`. That is the one place
per-visitor data gets written down.

### What the CSP allows, and why

Tightened 2026-09-12. It had been `default-src 'self' https:` with
`connect-src 'self' https:` and `frame-src 'self' https:` — which let the page
talk to, and embed, any host on the internet. It documented nothing and
stopped nothing. It now names every origin the client actually reaches:

| Directive | Allowed beyond `'self'` | Why |
| --- | --- | --- |
| `script-src` | `static.cloudflareinsights.com`, `*.googletagmanager.com` | RUM beacon (injected by the CF edge, so it never appears in a local build) and the GA4 tag |
| `connect-src` | `happening-now.net`, `cloudflareinsights.com`, `static.cloudflareinsights.com`, `*.googletagmanager.com`, `*.google-analytics.com`, `*.analytics.google.com`, `api.open-meteo.com`, `geocoding-api.open-meteo.com`, `api.weather.gov`, `api.zippopotam.us`, `api.bigdatacloud.net`, `nominatim.openstreetmap.org` | the Worker plus the six geo/weather APIs the browser calls directly |
| `frame-src` | `embed.windy.com` | the radar map, the only iframe on the site |
| `img-src` | `https:` (wildcard) | **deliberate** — the Comic widget renders images from whatever webcomic host a feed names, so the set is unknowable. Images can't execute; this is the cheap wildcard |
| `font-src` | *(nothing)* | system fonts only |
| `media-src` | `blob:` | no `<audio>`/`<video>` anywhere |

`'unsafe-inline'` stays on `script-src` and `style-src`: the GA4 tag must be
inline in `<head>` on every page, and JS sets inline styles throughout. A
nonce can't come from a static `_headers` file — it would need the Worker to
rewrite every HTML response.

Things that are **not** in the policy because nothing reaches them:
`cdn.jsdelivr.net` was allowed for scripts and styles and is referenced
nowhere. `www.alphavantage.co`, `cloud.iexapis.com`, `newsapi.org`,
`gnews.io` and `mediastack.com` all appear in `assets/` but behind
`if (KEY)` guards on keys that are empty strings, so they are never contacted
— don't re-add them to the CSP without re-adding a key. Every stock and feed
call that looks third-party goes through `/v1/rss/raw`, which is `'self'`.

**`https://happening-now.net` is listed in `connect-src` even though it is
`'self'` in production.** That is for previews: a staged build served from
127.0.0.1 still calls the production Worker for `/v1` data (`API_ORIGIN` in
`assets/common.js`), which is cross-origin there. Note `wrangler dev` rewrites
that entry to the dev origin in the response header, so it cannot be used to
test the real policy — serve `.deploy-public` with the header applied verbatim
instead.

Verified in headless Chrome at a real 390px viewport: all seven pages clean,
with the ZIP → `zippopotam` → `open-meteo` → `weather.gov` chain, the Windy
frame, and the three geocoders all exercised. Plus a negative test — the
policy actually refuses `api.codetabs.com`, an arbitrary host, an unlisted CDN
script and a non-Windy iframe. A policy that allows everything also reports
zero violations, so re-run the negative half whenever this changes.

### The weather map is gated — keep it that way

The Windy embed is the one remaining third party that gets a viewer's location,
and an iframe is the worst shape for it: the coordinates are in the URL, and the
frame can set its own cookies. So `weatherMapWrap` **ships with `isGated`** in
`weather.html` and the iframe sits on `about:blank` until someone clicks.

The default lives in the markup, not in JS, deliberately — the same reasoning as
the collapsed News settings sections. A JS failure then leaves the map unloaded
rather than silently loading a third party.

Three things not to "tidy up":

- `updateMap()` and `scheduleMapLoad()` both check `mapConsented`. The second
  check is not redundant: `scheduleMapLoad` also starts an IntersectionObserver
  and an idle timer, and neither should exist for a map nobody asked for.
- **Changing the layer dropdown or hitting Recenter lifts the gate for that
  visit.** Those are explicit interactions with the map, and leaving them as
  dead controls is worse. They do *not* persist the choice — only the checkbox
  does.
- The remembered answer is `hn_map_consent_v1` in localStorage, **not** in
  `cfg`. It must not travel in a settings export: importing someone else's
  config should never silently grant a third party access to a new browser.
  Same reasoning as `hn_sync_prefs_v1`.

Verified at a real 390px viewport: gated on first visit with zero windy.com
requests, one request after the click, gated again on reload when the box was
left unticked, auto-loading once ticked, and still unloaded when the radar card
is hidden in Settings.

### Map pin, zoom and distance rings (2026-10-18)

The Windy URL now asks for `marker=true`, and zoom **10** when the location
came from the device GPS (`lastGeo.precise`, from `resolvePreferredLocation`'s
`device-*` sources) versus **8** for a ZIP or city, which only knows the town
centre. The consent text and privacy policy say plainly that a GPS location
reaches Windy exactly.

The ◎ rings (`drawMapRings` in `weather.js`) are an SVG over the frame,
sized by Web Mercator: metres per CSS px = 156543.03 · cos(lat) / 2^zoom,
verified against Jackson to Napoleon, MI (predicted 140 px, measured 139).
Three rules that each fixed a real bug:

- **Use `toggleAttribute("hidden")` on the SVG, not `.hidden`.** `hidden` is
  an HTMLElement property; on SVG it silently creates an expando, the
  attribute stays, and the rings were invisible while reporting "shown".
- **Rings wait for the frame's `load` event** (plus a moment for Windy to
  paint). The frame keeps showing the *previous* view while the new URL
  loads, so rings drawn on `src` change were sized for a view not on screen.
- **We can't see Windy pan or zoom** (cross-origin). A transparent shield
  takes the reader's first touch or wheel, hides the rings and steps aside;
  Recenter restores them. Don't remove the shield to "fix" the swallowed
  gesture without another way to know the view moved.

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

## News source picker (all four scopes)

**Local / State joined the same picker on 2026-10-18.** `App.openSourcePicker`
(common.js) is now a thin wrapper that hands `localSources`/`regionalSources`
to `assets/news-picker.js`, with the data coming from
`assets/news-picker-local.js` (curated outlets for the reader's city/state,
the nearest covered places when theirs isn't, and Reddit via
`discoverSourcesForScope`). Add/remove saves at once; there is no "Save
selection" any more. "Add all suggested" reproduces what the old picker
pre-ticked. **Closing with nothing saved sets `*SourcesSkipped`**, which is
what the old Skip button did and is what stops the news page re-opening the
picker on every visit. Up to 8 per scope (news.js shows the first 8). The
place / Reddit keyword search (`source-search.js`) lives inside the picker
now and is loaded on the news page too. Bing searches were dropped (that
helper had returned nothing for months; Bing/Google/Yahoo news RSS block
Worker IPs). Local feeds are NOT vetted for paywalls the way the national
catalog is, so the picker doesn't claim they're free.

### National / International

Rebuilt 2026-10-18. Settings > News leads with **National News** and
**International News**: a compact list per scope (favicon, name, −/+ headline
count, ↑/↓, ✕) and a **Browse sources** button that opens
`assets/news-picker.js` (+ `news-picker.css`). The picker browses
`data/news-sources.json`, filters by beat (national) or region
(international), and a tap on any source **peeks**: its five latest real
headlines plus "N stories in the last 24 hours · newest Xh ago", measured live
from the same `App.fetchRssItems` path the news page uses.

Rules that matter:

- **Free to read, full stop.** No meters, no premium-article mix. The
  catalog's `_meta.excluded` lists what was rejected and why (BBC: US paywall
  since June 2025; CS Monitor: 5-article meter) — check it before "adding
  back" a big name. A clearly-labelled, off-by-default "free articles each
  month" tier was floated and not decided; do **not** build anything that
  circumvents a meter (archive links, full-text fetching).
- **Peek numbers are measured, never typed in.** That's the honesty of it.
  Don't add hand-written "posts daily" claims to the catalog.
- **The six-per-scope defaults live twice**: `default: true` in the catalog and
  `DEFAULT_CONFIG.widgets` in `common.js` (a first visit can't wait on a fetch).
  Keep them in step. Existing visitors' saved lists are never rewritten.
- **These lists save immediately**, like Local and State beside them. The old
  editor waited for Save Changes with no unsaved-changes warning.
- Reordering is ↑/↓ buttons because HTML5 drag-and-drop never fires on touch.
- **Probe every new feed with *and* without the `_hn` cache-buster.** The Hill
  answers a busted URL with a valid one-item feed (100 without), so nothing
  errors and the retry never fires. CBS, NBC, Vox, UN News, Politico Europe and
  AllAfrica return empty. All are in `NO_CACHE_BUST_HOSTS`.
- **Check freshness, not just parsing.** CNN's RSS parses perfectly and its
  newest item is from 2023. `check-feeds` now reports `STALE` (newest dated
  item older than 14 days) alongside `DEAD`. A stale feed can be a quiet
  section rather than a dead one — Sci.News stopped posting archaeology for a
  month in Sept–Oct 2026 while the rest of the site carried on.

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
`/v1/stocks` and `/v1/favicon` all live in `cloudflare-sync-worker`, and a
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

**Anything that asks "is this feed usable?" must send `RSS_FETCH_HEADERS`**
(`cloudflare-sync-worker/src/upstream-headers.mjs`). Sharing `feed-health.mjs`
is not enough — a verdict only judges bytes somebody already fetched, and the
fetch is where the two checkers diverged. The digest used to fetch publishers
**direct** with its own `happening-now-curator/1.0` UA while the site goes
through `/v1/rss/raw` with a browser UA, and from Worker IPs publishers treat
those as different clients. The 2026-09-12 digest was wrong both ways at once:
of the 18 feeds it flagged, **17 were healthy** (nine NBC O&Os "403", six
TownNews papers "401/451/404" — WAF signatures, not outages) and it **missed 7
genuinely dead feeds**, including two cities serving nothing. The two-day
verify phase cannot catch this: it re-probes with the same headers, and a WAF
rule reproduces perfectly on day two. Don't add a third fetch path.

Corollary: a digest row is a *lead*, not a verdict. Re-probe it through the
proxy before editing the catalog — `scripts/check-feeds.mjs` is the arbiter,
and it reports `emptyBlocks` for places left with no working feed at all,
which is the line that actually matters.

**That corollary is now enforced in code (2026-09-18).** Matching the headers
was not enough: the 2026-09-12 digest reported 21 feeds and *every one* was
healthy. Two more things were wrong, both fixed in `curate.js`:

- **The two phases asked the same question.** `scan` probes the publisher
  direct; `verify` used to re-probe the same way a day later, which confirms a
  WAF rule rather than clearing it. `verify` now calls `probeViaSite`, going
  through `/v1/rss/raw?...&nostale=1` — the site's own path, the same arbiter
  `check-feeds.mjs` uses. A row must fail a direct probe **and** fail through
  the site, on two different days, before it is emailed. This is not the
  "third fetch path" warned about above; it is the site's path, used as the
  final gate.
- **Findings outlived the catalog.** A full sweep spans ~10 daily firings, so
  feeds fixed mid-sweep were still emailed days later. Three of the 21 rows
  were feeds already replaced in `a209b0a` — including TribLive's old `/rss/`
  URL, which had simply moved to `/feed/`. The scan phase now prunes
  `findings` to what the freshly-fetched catalog still lists.

Replayed against those 21 rows, the gates drop 3 as unlisted and clear 18 via
the site path: the digest reports **zero**. If a digest still surprises you,
re-probe by hand before editing anything — the failures are intermittent and
were not reproducible from a Worker IP by any client shape, including the old
curator UA.

### Feed resilience: the Worker keeps the last good copy

`/v1/rss/raw` stores every healthy feed response in the Cloudflare **Cache
API** and serves that copy when the publisher is down, rate-limiting, or
blocking Cloudflare Worker IPs (`cloudflare-sync-worker/src/rss-cache.mjs`,
24h TTL). That replaced `api.codetabs.com`, which sat behind the first-party
route as a CORS fallback until 2026-09-12.

Why the cache is the more reliable design, so nobody re-adds a public proxy:

- codetabs was **down (522) for the whole day** that was measured, and
  `corsproxy.io` answered 403. Free public proxies are not a safety net.
- Every feed that reached the dead fallback paid a **9s timeout** first, so
  the fallback made outages slower rather than shorter.
- It could never cover the outage that matters most — **this Worker being
  unavailable** — because the site's own pages are served by Workers too. So
  it only ever covered "publisher blocks Worker IPs", which a cached copy
  covers *and* extends to publisher outages and transient 5xx.
- It handed a third party each reader's IP and the list of feeds they read,
  which the privacy posture above is explicitly against.

Two things not to break:

- **Cache API, not KV.** KV allows 1,000 writes/day on the free plan and a
  single popular feed on a 120s cache would burn that by itself. The cost is
  that entries are per-colo, so a reader in a cold data centre may have no
  stale copy — partial cover, but no quota risk and no third party.
- **`&nostale=1` must stay on the health checkers.** `scripts/check-feeds.mjs`
  sends it, and it turns the fallback off for that request. Without it the
  sweep gets handed a cached copy of a feed that died days ago and reports it
  healthy — the same blind spot the curator User-Agent had, reintroduced from
  the other end. Readers get the cache; the thing that decides what is broken
  never does. (`curate.js`'s scan phase fetches publishers directly; its verify
  phase goes through the proxy and sends `nostale=1` for this exact reason.)

  Note `nostale=1` is not a *cold* fetch: `/v1/rss/raw` fetches upstream with
  `cf: { cacheEverything: true, cacheTtl: 120 }`, so a feed pulled by anyone in
  the last two minutes is answered from Cloudflare's edge cache. 120s is far too
  short to hide a dead feed, so it doesn't affect health sweeps — but to test
  whether a publisher is blocking Worker IPs *right now*, add a unique `_hn`
  value to the target URL so the edge cache key differs.

`npm run test:rss-cache` exercises the logic against a stubbed Cache API —
including that a bot-wall page can never become the stored "good" copy, and
that a throwing cache can't take the request down with it. Run it after
touching `rss-cache.mjs`. Responses carry `X-HN-Cache: live|stale`, so which
path served a feed is visible from `curl -I`.

After changing that file, regenerate the public list on `sources.html`:

```bash
npm run coverage
```

That rewrites the block between the `coverage:start`/`coverage:end` markers from
the JSON, so the page can't drift from the data. It's written into the committed
HTML rather than rendered client-side so crawlers can see the city names.

## Ops reminders

The two things here that fail *silently* get an email, sent by
`cloudflare-sync-worker/src/reminders.mjs`:

- the **weekly / monthly / quarterly check-ins** in
  `docs/ops-monitoring-checklist.md`, which were backed only by
  `docs/happening-now-ops-checkins.ics` — if that calendar was never imported,
  nothing ever asked for them, and the omission looked exactly like everything
  being fine;
- **`.well-known/security.txt`**, whose RFC 9116 `Expires` is stamped at deploy
  time. Any deploy re-stamps it a year out, so it self-heals — but a year
  without one leaves an expired, invalid file that simply stops counting.
  Warning starts 60 days out and repeats weekly.

**It rides on the existing daily curation cron rather than getting its own.**
A second scheduled task is one more thing that can quietly stop firing with
nobody noticing; riding along means it is exactly as reliable as the digest,
and dies loudly with it. It is best-effort on a separate `waitUntil` with its
own `catch`, so neither job can take the other down.

**`npm run test:reminders` forces every check to fire**, and that is the point
of it. A reminder that only ever reports "nothing due" is indistinguishable
from a broken one, so every branch — each period rollover, the expiry window,
the already-expired wording, the repeat-suppression window — is provoked on
demand rather than waited for. Run it after touching `reminders.mjs`.

Deliberately **not** covered: feed rot. The digest it rides on already owns
that question, and a second checker asking it would reproduce the exact
disagreement documented in `upstream-headers.mjs`.

Mail for both the digest and the reminders goes through
`cloudflare-sync-worker/src/mailer.mjs`, which keeps the lazy
`cloudflare:email` import in one place — a static top-level import would take
the whole Worker down if the binding were ever misconfigured.

## Deploying

```powershell
pwsh -File scripts/deploy-prod.ps1
```

**Try it on beta first** (2026-10-18):

```powershell
pwsh -File scripts/deploy-beta.ps1
```

Puts the working tree on **https://beta.happening-now.net**, behind the same
Cloudflare Access login as `/admin` (the "HN Admin" app covers the whole beta
host). Same staging and minification as production, so it tests what would
ship. Beta is fully separate: its own Workers (`news-pages-beta`,
`happening-now-sync-beta`), its own KV namespace and D1 database
(`hn-reports-beta`), **no cron and no `send_email` binding**, so it can never
email the digest, and the deploy skips IndexNow and Wayback. The beta site is a
Workers custom domain; `scripts/beta-router.js` hands `/v1/*` to the beta API
over a service binding, so the beta API has no public address. Pages still
call the *production* Worker from localhost, so local dev is unchanged.
GA4 does record your beta visits (hostname `beta.happening-now.net`); filter
that hostname in GA if it ever matters.

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
