# Rollback Runbook (Happening Now)

Last updated: 2026-04-09

## Scope
Use this when a production issue is visible on https://happening-now.net after deploy.

## Severity Decision
- P1: Site down, blank pages, critical data failures on core pages.
- P2: Major widget/data degradation with no immediate workaround.
- P3: Minor regression with available workaround.

If P1 or high P2, roll back immediately.

## Fast Rollback Targets
- Cloudflare Pages: restore previous successful deployment.
- Cloudflare Worker: deploy previous known-good worker commit.

## Preconditions
- Confirm issue is reproducible on production URL.
- Note timestamp and impacted pages/endpoints.
- Capture one screenshot and one console/network symptom if possible.

## Procedure A: Roll Back Cloudflare Pages
1. Open Cloudflare Dashboard -> Workers & Pages -> your Pages project.
2. Open Deployments.
3. Select the last known-good deployment before the incident.
4. Use Roll back / Promote deployment action.
5. Wait for deployment status to show active.
6. Verify:
   - https://happening-now.net/index.html
   - https://happening-now.net/weather.html
   - https://happening-now.net/stocks.html

## Procedure B: Roll Back Cloudflare Worker
1. In local repo, identify prior known-good commit for worker files:
   - cloudflare-sync-worker/wrangler.toml
   - cloudflare-sync-worker/src/index.js
2. Check out those files from the target commit (or reset branch to that commit if intended).
3. Deploy worker from cloudflare-sync-worker folder:
   - wrangler deploy
4. Verify endpoint:
   - https://happening-now.net/v1/artemis/updates returns HTTP 200 and JSON payload.

## Post-Rollback Verification Checklist
- Homepage and key tabs load without fatal errors.
- Legal and SEO files are reachable:
  - /privacy.html
  - /terms.html
  - /sources.html
  - /robots.txt
  - /sitemap.xml
- Worker endpoint returns JSON with updates and fetchedAt.

## Communications Template
Issue: <short summary>
Impact: <who/what is affected>
Action: Rolled back Pages/Worker to known-good deployment.
Status: Monitoring for 30 minutes.
Next update: <time>

## Recovery Exit Criteria
- No new errors for 30 minutes.
- Endpoint checks all pass.
- Incident notes logged in release notes.
