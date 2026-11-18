# Status - news-pages (happening-now.net)

Read by the Projects Dashboard's sync and used to rank what to work on next.
Only the `key: value` lines below are parsed; prose around them is ignored, so
write freely.

updated: 2026-11-18
health: ok
next: Mike tries settings sync on beta; then create the production sync table and deploy production, which launches sync and ships /about, the what's-new card and the Economic Calendar
blocked:
capabilities: public news/weather/stocks aggregation at happening-now.net, Cloudflare Pages and Workers hosting, installable PWA, RSS proxy with last-good caching, curated 409-feed local and topic news catalog, privacy-first usage analytics with daily visitor hash (reference for site-analytics), admin dashboard for Cloudflare analytics, Today view at /widget?w=all, Android home-screen widget app distributed at /android (android-widget/), settings backup and transfer links for any browser, end-to-end encrypted settings sync

As of 2026-11-18 production is behind beta: sync (privacy wording approved
that day, gate removed), the About page and the what's-new card are waiting
on one production deploy. The Search Console "Page with redirect" report is
old URLs Google keeps re-crawling (all correct 301s) and needs no action.
