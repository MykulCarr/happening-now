# Maintenance — happening-now.net

What keeps the live site working. The Projects Dashboard reads only the
`- check:` and `- dep:` lines; everything else here is for people.

A check with no `last:` has never been recorded as done. That is accurate: it
may have been done, but nothing wrote it down.

## Checks

### Automated

- check: Source integrity — every news feed still returns fresh, well-formed articles that the browser can parse (DEAD/STALE/unparseable), across both catalogs | every: 2w | last: 2026-11-19 | auto: daily 13:00 UTC cron in cloudflare-sync-worker (curate.js) sweeps 40 feeds a day with feed-health.mjs, verifies failures through /v1/rss/raw on a second day, and emails the digest; a full pass takes ~10 days
- check: security.txt Expires is more than 60 days away (live: 2027-11-21) | every: 1y | last: 2026-11-21 | auto: reminders.mjs on the daily cron emails from 60 days out; every deploy re-stamps it a year ahead
- check: Live pages and /v1 endpoints answer 200 (core, legal, robots, sitemap, snapshot, calendar, quotes) | every: weekly | last: 2026-11-21 | auto: run by Claude on request, a curl loop over the URLs in docs/ops-monitoring-checklist.md; not scheduled
- check: Worker test suites pass (npm run test:rss-cache, test:reminders, test:reports, test:sync, test:calendar, test:admin) | every: 1m | last: 2026-11-21 | auto: scripts in package.json, run before touching the matching Worker file

### By hand

The daily cron also emails a reminder when the weekly, monthly and quarterly
check-ins come due (`reminders.mjs`). That only nags; the checks themselves are
done by hand, so they have no `auto:`.

- check: Full feed sweep with npm run check-feeds; re-probe any 429 slowly before dropping a feed (the sweep trips our own rate limit) | every: 1m | last: 2026-11-19
- check: Weekly ops check-in — read the curation digest, Cloudflare analytics and error spikes, Search Console and Bing indexing, phone-width spot check (docs/ops-monitoring-checklist.md, Weekly) | every: weekly
- check: Monthly check-in — CSP and headers still match what the pages call, rollback steps from docs/rollback-runbook.md, weather/RSS/market API behaviour and limits (docs/ops-monitoring-checklist.md, Monthly) | every: monthly
- check: Quarterly review — launch checklist, legal pages and dates, tooling versions, Cloudflare config drift (docs/ops-monitoring-checklist.md, Quarterly) | every: 3m
- check: Stock board count matches expected in /v1/markets/snapshot (a shortfall means a dead symbol, like the Bulgarian lev in 2026) | every: 3m
- check: Android widget app still installs and updates from /android on a real phone | every: 3m

## Dependencies

- dep: happening-now.net domain (Cloudflare Registrar) | why: the whole site, the Worker routes and flights.happening-now.net | expires: 2027-04-09
- dep: .well-known/security.txt Expires | why: an expired file is invalid under RFC 9116; any deploy renews it | expires: 2027-11-21
- dep: Cloudflare account — Workers, assets, KV, D1 (hn-reports, sync), Cache API, Email Routing, Access | why: hosting, the RSS proxy and its last-good cache, reports, settings sync, the digest email and /admin all run on it
- dep: Cloudflare free-plan limits (50 subrequests per Worker request, 1,000 KV writes a day) | why: the board's batching and the Cache-API-not-KV choice exist to stay under them
- dep: FINNHUB_KEY Worker secret | why: per-symbol fallback for watchlist quotes the Yahoo batch misses
- dep: CF_ANALYTICS_TOKEN Worker secret | why: the Cloudflare view on /admin; its expiry, if any, is set in the Cloudflare dashboard and not recorded here
- dep: Yahoo Finance spark (v7, 20 symbols max) and chart (v8) endpoints, unofficial | why: the board, watchlist, movers charts and price pop-up; Yahoo can change them without notice
- dep: Publisher RSS feeds in data/news-sources.json and data/local-stations.json | why: every headline on the site; they rot (13% in four months in 2026)
- dep: Open-Meteo, api.weather.gov, zippopotam.us, BigDataCloud, Nominatim | why: forecasts, alerts, ZIP lookup and reverse geocoding on the Weather page
- dep: embed.windy.com | why: the click-to-load radar map
- dep: Google favicon service through /v1/favicon | why: source icons
- dep: BEA iCalendar and the Fed's FOMC page | why: the Economic Calendar on Markets
- dep: site-analytics project (analytics.happening-now.net) | why: anonymous usage counts; owned by another project
- dep: GA4 tag inline on every page | why: Google-side analytics and Search Console link
- dep: Android release signing key, C:/Users/mwcdo/.android-keys/happening-now-widget.jks, alias hnwidget, SHA-256 B6:4A:BE… (not in the repo; two copies only; location and password in git-ignored android-widget/keystore.properties) | why: without it no update to the widget app can install over the old one | expires: 2054-04-02
- dep: Node, esbuild and wrangler on OEMMEO | why: deploy-prod.ps1 and deploy-beta.ps1
