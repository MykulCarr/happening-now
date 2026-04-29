Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot

# 1. Stage and deploy the static Pages site
& (Join-Path $PSScriptRoot "stage-public-assets.ps1")

Push-Location $repoRoot
try {
  wrangler deploy
}
finally {
  Pop-Location
}

# 2. Deploy the API Worker (happening-now-sync)
& (Join-Path $PSScriptRoot "deploy-worker.ps1")
