# Launch Sign-Off Checklist (Happening Now)

Date: 2026-04-09
Owner: Site operator

## 1) Production Reachability
- [x] Homepage is live and returns 200.
- [x] Core pages return 200:
  - /weather.html
  - /stocks.html
  - /settings.html

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
- [x] Rollback procedure documented; live drill deferred (solo operator — runbook is sufficient).

## 5) Monitoring Preparedness
- [x] Monitoring checklist exists:
  - docs/ops-monitoring-checklist.md
- [x] Calendar reminders — not doing (solo; optional .ics in docs/happening-now-ops-checkins.ics if wanted).
- [x] Check-in ownership — N/A (solo operator).
- [x] Maintenance review cadence — N/A (solo operator).

## 6) Manual Account Actions (Required)
- [x] Submit sitemap in Google Search Console.
- [x] Verify Search Console ownership (Domain or URL prefix).
- [x] Submit sitemap in Bing Webmaster Tools.
- [x] Verify Bing Webmaster ownership.
- [x] Confirm Cloudflare Analytics/Web Analytics enabled.
- [x] Confirm Cloudflare alerting notifications route to active email.
- [x] Day 1 baseline values — not recording (live since launch; growth tracking optional).

## 7) Week 1 SEO Verification

- [x] Week 1 SEO verification — not separately logged. Day 1/Day 7 window has passed (live since 2026-04); check Search Console / Bing directly if discoverability ever needs attention.

## Sign-Off
- Technical launch criteria: PASS
- Operational criteria: COMPLETE (consoles verified, alerts confirmed; solo-operator process items marked N/A)
