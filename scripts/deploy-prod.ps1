Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot

& (Join-Path $PSScriptRoot "stage-public-assets.ps1")

Push-Location $repoRoot
try {
  wrangler deploy
}
finally {
  Pop-Location
}
