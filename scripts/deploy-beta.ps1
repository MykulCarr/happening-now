# Put the current working tree on beta.happening-now.net. Production is not
# touched: different Workers, different KV and D1, no cron, no email.
#
#   pwsh -File scripts/deploy-beta.ps1
#
# Unlike deploy-prod.ps1 this does NOT ping IndexNow or the Wayback Machine:
# beta is behind Cloudflare Access and must never be announced to search
# engines or archived.
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot

# 1. Same staging and minification as production, so beta tests what would ship.
& (Join-Path $PSScriptRoot "stage-public-assets.ps1")

# 2. The beta API first: the site Worker's service binding points at it.
Push-Location (Join-Path $repoRoot "cloudflare-sync-worker")
try { wrangler deploy --env beta } finally { Pop-Location }

# 3. The beta site.
Push-Location $repoRoot
try { wrangler deploy --env beta } finally { Pop-Location }

Write-Host ""
Write-Host "Beta is live at https://beta.happening-now.net (Cloudflare Access login)."
