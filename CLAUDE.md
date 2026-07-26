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

### Reddit: use the `.rss` endpoints, never the JSON API

Reddit's JSON API (`/subreddits/search.json`, `/api/subreddit_autocomplete_v2`)
returns **403** to anonymous *and* Cloudflare-Worker-origin requests — that's why
live discovery was ripped out in `fdbf508`. But the **`.rss` variants of the same
searches are not blocked**: `https://www.reddit.com/subreddits/search.rss?q=<kw>`
returns an Atom feed of matching subreddits, and that's what
`assets/source-search.js` uses to do keyword discovery. Re-verify through the
proxy before assuming it still holds; if it breaks, the symptom is an empty
"Reddit communities" group, not an error.

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
