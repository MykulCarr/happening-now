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

The pages call the **production** Worker for feed data even when served locally,
so news widgets work without running anything else.

**Always check a phone-width viewport (~390px) before calling UI work done** —
this is used on a phone as an installed PWA at least as much as on desktop.

If you change the service worker or cached assets, hard-reload (or unregister the
SW) when testing; a stale SW will happily serve you the old build and make a
working fix look broken.

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
