# Status - news-pages (happening-now.net)

Read by the Projects Dashboard's sync and used to rank what to work on next.
Only the `key: value` lines below are parsed; prose around them is ignored, so
write freely.

updated: 2026-11-18
health: ok
next: Android widget app version of the price-and-charts pop-up (the website version is live since 2026-11-18)
blocked:
capabilities: public news/weather/stocks aggregation at happening-now.net, per-symbol price charts (1D/1W/1M/1Y) from Yahoo through the site proxy, Cloudflare Pages and Workers hosting, installable PWA, RSS proxy with last-good caching, curated 409-feed local and topic news catalog, privacy-first usage analytics with daily visitor hash (reference for site-analytics), admin dashboard for Cloudflare analytics, Today view at /widget?w=all, Android home-screen widget app distributed at /android (android-widget/), settings backup and transfer links for any browser, end-to-end encrypted settings sync

2026-11-18: production caught up with beta. Settings sync launched, plus the
About page, the what's-new card and the Economic Calendar (BEA + FOMC, real
data; CPI and jobs left out because BLS refuses honest clients). The Search Console "Page with redirect" report is
old URLs Google keeps re-crawling (all correct 301s) and needs no action.
