# Status - news-pages (happening-now.net)

Read by the Projects Dashboard's sync and used to rank what to work on next.
Only the `key: value` lines below are parsed; prose around them is ignored, so
write freely.

updated: 2026-11-16
health: ok
next: Mike approves the privacy wording in docs/cloud-sync.md and tries sync on beta; then launch sync (5 steps) and deploy production, which also ships /about and the what's-new card
blocked:
capabilities: public news/weather/stocks aggregation at happening-now.net, Cloudflare Pages and Workers hosting, installable PWA, RSS proxy with last-good caching, curated 409-feed local and topic news catalog, privacy-first usage analytics with daily visitor hash (reference for site-analytics), admin dashboard for Cloudflare analytics, Today view at /widget?w=all, Android home-screen widget app distributed at /android (android-widget/), settings backup and transfer links for any browser, end-to-end encrypted settings sync (built, not launched)

As of 2026-11-16 the last commit is on beta only: production is one deploy behind (About page, what's-new card, sync held back). The Search Console "Page with
redirect" report is old URLs Google keeps re-crawling (all correct 301s) and
needs no action. The one genuinely dead feed is Patch Jacksonville, deliberately
left listed (editorial call; Jacksonville has two working sources).
