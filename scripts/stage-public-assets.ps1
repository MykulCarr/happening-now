Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$target = Join-Path $repoRoot ".deploy-public"

if (Test-Path $target) {
  Remove-Item -Recurse -Force $target
}
New-Item -ItemType Directory -Path $target | Out-Null

$publicFiles = @(
  "_headers",
  "index.html",
  "weather.html",
  "stocks.html",
  "settings.html",
  "AstroLab.html",
  "privacy.html",
  "terms.html",
  "sources.html",
  "robots.txt",
  "sitemap.xml",
  "manifest.json",
  "sw.js"
)

foreach ($file in $publicFiles) {
  $src = Join-Path $repoRoot $file
  if (-not (Test-Path $src)) {
    throw "Required deploy file not found: $file"
  }
  Copy-Item -Path $src -Destination $target -Force
}

$publicDirs = @("assets", "data")
foreach ($dir in $publicDirs) {
  $srcDir = Join-Path $repoRoot $dir
  if (Test-Path $srcDir) {
    Copy-Item -Path $srcDir -Destination $target -Recurse -Force
  }
}

# Force a fresh service worker version on every deploy to avoid stale asset caches.
$buildId = (Get-Date).ToUniversalTime().ToString("yyyyMMddHHmmss")
$stagedSw = Join-Path $target "sw.js"
if (Test-Path $stagedSw) {
  (Get-Content -Path $stagedSw -Raw).Replace("__BUILD_ID__", $buildId) | Set-Content -Path $stagedSw -Encoding UTF8
}

Write-Host "Staged deploy bundle at $target"
