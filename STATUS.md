# Status — news-pages (happening-now.net)

Read by the Projects Dashboard's sync and used to rank what to work on next.
Only the `key: value` lines below are parsed; prose around them is ignored, so
write freely.

updated: 2026-09-18
health: needs-attention
next: Deploy the digest fix, Artemis removal and ops reminders — pwsh -File scripts/deploy-prod.ps1
blocked:
capabilities: public news/weather/stocks aggregation at happening-now.net, Cloudflare Pages and Workers hosting, installable PWA, RSS proxy with last-good caching, curated 409-feed local and topic news catalog

`health` is `needs-attention` rather than `ok` only because finished work is
sitting undeployed: the feed-digest false-alarm fix, the removal of the dead
`/v1/artemis/updates` route, and the new ops reminders are all committed to the
working tree but not live. The site itself is healthy — 408 of 409 feeds alive,
no place serving nothing. Once `deploy-prod.ps1` has run, this is `ok`.

Context for whoever picks this up: the 2026-09-12 feed digest reported 21
broken feeds and **every one was fine**. Three weren't even in the catalog any
more. `curate.js` now confirms findings through the site's own `/v1/rss/raw`
path before emailing, and prunes findings to feeds the catalog still lists.
Replayed against those 21 rows it reports zero. A digest row is still a lead,
not a verdict — re-probe by hand before editing the catalog.

The one genuinely dead feed left is Patch Jacksonville (empty feed). It is
deliberately still listed: dropping a source is an editorial call and
Jacksonville has two working sources without it.
