Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$workerDir = Join-Path (Split-Path -Parent $PSScriptRoot) "cloudflare-sync-worker"

Push-Location $workerDir
try {
  wrangler deploy
}
finally {
  Pop-Location
}
