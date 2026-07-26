# Web Presence Baseline

Last updated: 2026-07-26

This guide turns SEO and analytics setup into a repeatable measurement process for HAPPENING NOW.

## Current Repo Baseline

- robots.txt is public and references the sitemap.
- sitemap.xml includes the core public pages.
- Core public pages now include canonical tags, robots directives, Open Graph tags, Twitter summary tags, and JSON-LD structured data.
- settings.html is marked `noindex,follow` and is not listed in the sitemap.
- Cloudflare Web Analytics / RUM is enabled in Cloudflare via automatic injection with EU exclusion.
- Google Search Console and Bing Webmaster verification are **done** (both closed
  out in `launch-signoff.md`, 2026-06-17), and **GA4 is live** as of 2026-07-26 —
  see section 4, which describes what was actually built rather than the original
  hypothetical.

## 1. Google Search Console

Recommended path:

1. Add a Domain property for `happening-now.net` if DNS access is available.
2. If Domain property is not practical, add a URL-prefix property for `https://happening-now.net/`.
3. Submit `https://happening-now.net/sitemap.xml`.
4. Run URL Inspection for:
   - `https://happening-now.net/`
   - `https://happening-now.net/weather`
   - `https://happening-now.net/stocks`
   (the `.html` forms 301 to these; inspect the canonical extensionless URLs)
5. Request indexing only if Search Console reports the URL is not yet indexed.

Baseline metrics to capture:

- Indexed pages count
- Impressions
- Clicks
- Average position
- Top queries
- Top landing pages
- Coverage or Pages warnings

Verification note:

- Domain property verification happens in DNS and does not require repo edits.
- URL-prefix verification can use an HTML file or a meta tag. If you choose the meta tag path, add the Google verification tag to the relevant page head once the token is issued.

## 2. Bing Webmaster Tools

Recommended path:

1. Add the site to Bing Webmaster Tools.
2. If available, use the Google Search Console import path to reduce duplicate setup.
3. Submit `https://happening-now.net/sitemap.xml`.
4. Inspect the same core URLs used in Google Search Console.

Baseline metrics to capture:

- Indexed pages count
- Search clicks
- Search impressions
- Average position
- Search keywords
- Crawl issues
- Sitemap status

Verification note:

- Bing supports XML file, meta tag, or DNS verification.
- If you use the meta tag route, add the Bing site verification meta tag to the page head after the token is issued.

## 3. Cloudflare Web Analytics

Recommended path:

1. Confirm Web Analytics remains enabled in the Cloudflare dashboard for `happening-now.net`.
2. Current mode uses automatic injection with visitor exclusion in the EU, so no repo-side beacon snippet is required.
3. Confirm CSP in `_headers` still allows `https://static.cloudflareinsights.com` and `https://cloudflareinsights.com`.

Baseline metrics to capture:

- Total page views
- Unique visitors
- Top pages
- Referrers
- Countries
- Core request trends by day

Note:

- The current CSP already allows the standard Cloudflare analytics endpoints.
- Because Cloudflare is injecting the script automatically, there is no repo-side analytics token to add at this time.

## 4. GA4 (live since 2026-07-26)

Measurement ID `G-XL3C28KRQX`, installed inline in the `<head>` of all seven
pages, with `https://www.googletagmanager.com` added to `script-src` in
`_headers` and the collection disclosed in `privacy.html`.

Two things about this install differ from the stock Google snippet, and both
matter if you touch it:

- **Consent Mode is set to denied by default and never granted.** GA4 therefore
  sends cookieless pings: no cookies, no device identifier, no consent banner
  required in any region. That keeps the same privacy posture as the
  EU-excluded Cloudflare Web Analytics.
- **The tag must stay inline in the HTML.** It was first built as a tidy
  external `assets/analytics.js` that injected the tag at runtime. Hits fired
  correctly, but GA4 reported *"tag not installed"* — Google's detection scans
  the served HTML source and found nothing.

What this install can and can't tell you:

- Sound: page views, referrers, approximate geography, device/browser mix.
- **Not meaningful:** users, sessions, retention, funnels. Without a persisted
  client ID every visit looks new. GA4's behavioural modelling that would
  normally fill that gap needs roughly 1,000 events/day, which this site
  won't reach.

To get real session data you would flip `analytics_storage` to `granted`, which
starts setting cookies — and that is what a consent banner exists to cover, so
it would mean adding one or geo-gating EU visitors.

Still outstanding on the Google side: data retention (defaults to 2 months —
raise to 14), property time zone, the internal-traffic filter (created inert,
must be switched to Active), and linking Search Console.

## 5. Day 1 / Day 7 / Day 30 Review

Day 1:

- Confirm both Google and Bing accepted the sitemap.
- Confirm homepage inspection succeeds.
- Confirm no robots or canonical conflicts are reported.
- Confirm Cloudflare Web Analytics begins recording traffic.

Day 7:

- Compare indexed pages against sitemap URLs.
- Record top queries and top landing pages.
- Check for excluded URLs that should be indexed.
- Confirm `settings.html` is excluded from indexing.

Day 30:

- Compare impressions and clicks trend.
- Identify pages with impressions but weak CTR.
- Refine titles and descriptions for weak pages.
- Re-check schema and canonical health using live URL inspection.

## 6. Manual Values Still Needed

These values cannot be completed from the repo alone:

Nothing outstanding in the repo — Search Console and Bing are verified, and the
GA4 Measurement ID is in place. What remains is account-side only, listed at the
end of section 4.

## 7. Quick Validation Tools

- Google Search Console URL Inspection
- Bing URL Inspection
- Schema Validator: `https://validator.schema.org/`
- Google Rich Results Test: `https://search.google.com/test/rich-results`

## 8. Recommended Evidence Log

For each weekly check, store:

- Date
- Reviewer
- Google indexed pages
- Bing indexed pages
- Cloudflare top pages
- Top 5 queries
- Anomalies
- Follow-up action
