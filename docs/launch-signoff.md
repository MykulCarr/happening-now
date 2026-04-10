# Launch Sign-Off Checklist (Happening Now)

Date: 2026-04-09
Owner: Site operator

## 1) Production Reachability
- [x] Homepage is live and returns 200.
- [x] Core pages return 200:
  - /weather.html
  - /stocks.html
  - /settings.html
  - /AstroLab.html

## 2) Legal and SEO
- [x] Legal pages return 200:
  - /privacy.html
  - /terms.html
  - /sources.html
- [x] robots.txt returns 200 and includes sitemap reference.
- [x] sitemap.xml returns 200 and contains core URLs.

## 3) Worker Integration
- [x] Worker route endpoint returns 200:
  - /v1/artemis/updates
- [x] Worker response contains expected JSON fields (updates, fetchedAt).

## 4) Rollback Preparedness
- [x] Rollback runbook exists:
  - docs/rollback-runbook.md
- [ ] Team has tested rollback once this quarter.

## 5) Monitoring Preparedness
- [x] Monitoring checklist exists:
  - docs/ops-monitoring-checklist.md
- [ ] Calendar reminders created for daily/weekly/monthly checks.
- [ ] Check-in ownership assigned (primary and backup).
- [ ] Maintenance review cadence accepted (monthly and quarterly).

## 6) Manual Account Actions (Required)
- [ ] Submit sitemap in Google Search Console.
- [ ] Verify Search Console ownership (Domain or URL prefix).
- [ ] Confirm Cloudflare Analytics/Web Analytics enabled.
- [ ] Confirm Cloudflare alerting notifications route to active email.

## 7) Week 1 SEO Verification
- [ ] Day 1: Confirm sitemap submission status is healthy in Search Console.
- [ ] Day 1: Run URL Inspection for homepage and request indexing if needed.
- [ ] Day 7: Re-check indexing state for core pages and legal pages.
- [ ] Day 7: Confirm no crawl-blocking errors in Pages/Coverage reports.
- [ ] Day 7: Re-submit sitemap once only if persistent indexing lag exists.

## Sign-Off
- Technical launch criteria: PASS
- Operational criteria: PENDING manual account actions
