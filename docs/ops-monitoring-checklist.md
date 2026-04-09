# Ops Monitoring Checklist (Happening Now)

Last updated: 2026-04-09

## Check-In Cadence (Required)
- Daily check-in: 5 minutes, every morning.
- Weekly check-in: 15-20 minutes, same day each week.
- Monthly maintenance check-in: 30 minutes, first week of month.
- Quarterly maintenance review: 45-60 minutes, first month of quarter.
- Owner: Site operator.
- Backup owner: Secondary operator.
- Calendar import file: docs/happening-now-ops-checkins.ics

## Daily (5 minutes)
- Confirm site loads:
  - https://happening-now.net/index.html
  - https://happening-now.net/weather.html
  - https://happening-now.net/stocks.html
- Check worker health endpoint:
  - https://happening-now.net/v1/artemis/updates
- Confirm no obvious stale data in weather/stocks news widgets.

## Weekly (15-20 minutes)
- Run endpoint status sweep for:
  - core pages
  - legal pages
  - robots/sitemap
  - worker API endpoint
- Verify domain and TLS certificate status in Cloudflare.
- Review Cloudflare analytics for traffic anomalies and error spikes.
- Spot-check mobile layout on at least one phone viewport.

## Monthly (30 minutes)
- Review CSP and headers for any needed source updates.
- Validate sitemap freshness and robots accessibility.
- Test rollback steps from rollback-runbook.md.
- Re-check third-party API behavior and limits:
  - weather APIs
  - RSS feeds/proxy behavior
  - stock/market data fallbacks

## Maintenance Checks (Explicit)
- Verify backups/export paths for configuration and critical content still work.
- Review Cloudflare Pages and Worker deployment history for unexpected changes.
- Confirm custom domain DNS records remain correct and proxied as intended.
- Validate legal contact details and policy dates are still current.
- Confirm key API providers have no breaking changes, deprecations, or quota changes.

## Quarterly (45-60 minutes)
- Run full launch checklist from launch-signoff.md.
- Review legal pages for policy/contact updates.
- Review dependencies/tooling versions and Cloudflare config drift.

## Alert Triggers
Treat as immediate investigation:
- Worker endpoint non-200 for 2 consecutive checks.
- Any core page non-200.
- News sections empty for prolonged period across multiple tabs.
- Unexpected CORS/CSP errors affecting main user flows.

## Lightweight Evidence Log
Record after each weekly check:
- Date/time
- Checker name
- Pass/fail summary
- Any anomalies
- Follow-up owner and due date

Minimum evidence retention:
- Keep at least 90 days of check-in records.
