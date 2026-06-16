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
  "_redirects",
  "index.html",
  "weather.html",
  "stocks.html",
  "settings.html",
  "privacy.html",
  "terms.html",
  "sources.html",
  "robots.txt",
  "sitemap.xml",
  "manifest.json",
  "sw.js",
  # IndexNow ownership-proof file. The filename IS the key; content matches.
  # Bing & Yandex fetch /<key>.txt to verify before accepting submissions.
  "a696f0db77a904974a99a9fa08cd18bb.txt"
)

foreach ($file in $publicFiles) {
  $src = Join-Path $repoRoot $file
  if (-not (Test-Path $src)) {
    throw "Required deploy file not found: $file"
  }
  Copy-Item -Path $src -Destination $target -Force
}

$publicDirs = @("assets", "data", ".well-known")
foreach ($dir in $publicDirs) {
  $srcDir = Join-Path $repoRoot $dir
  if (Test-Path $srcDir) {
    Copy-Item -Path $srcDir -Destination $target -Recurse -Force
  }
}

# Inject the static topbar HTML into every .html so the topbar paints with
# its full structure on first paint, eliminating the brief flash that occurs
# when topbar.js builds it post-load. topbar.js detects the existing markup
# and skips the build, only attaching handlers + applying user pageVisibility.
$topbarTemplate = Join-Path $PSScriptRoot "topbar-template.html"
if (Test-Path $topbarTemplate) {
  $topbarHtml = Get-Content -Path $topbarTemplate -Raw
  $needle = '<header id="topbar"></header>'
  $replacement = '<header id="topbar" class="hn-topbar">' + $topbarHtml + '</header>'
  foreach ($file in $publicFiles) {
    if (-not $file.EndsWith(".html")) { continue }
    $stagedHtml = Join-Path $target $file
    if (-not (Test-Path $stagedHtml)) { continue }
    $content = Get-Content -Path $stagedHtml -Raw
    if ($content.Contains($needle)) {
      $content.Replace($needle, $replacement) | Set-Content -Path $stagedHtml -Encoding UTF8 -NoNewline
    }
  }
}

# Force a fresh service worker version on every deploy to avoid stale asset caches.
$buildId = (Get-Date).ToUniversalTime().ToString("yyyyMMddHHmmss")
$stagedSw = Join-Path $target "sw.js"
if (Test-Path $stagedSw) {
  (Get-Content -Path $stagedSw -Raw).Replace("__BUILD_ID__", $buildId) | Set-Content -Path $stagedSw -Encoding UTF8
}

# Auto-renew the security.txt Expires field on every deploy. RFC 9116 requires
# a future date; rather than hand-manage it once a year, set it to midnight
# UTC one year from today on each stage. As long as we deploy at least
# annually (which we do constantly), the file never goes stale.
$stagedSecurityTxt = Join-Path $target ".well-known/security.txt"
if (Test-Path $stagedSecurityTxt) {
  $invariant = [System.Globalization.CultureInfo]::InvariantCulture
  $expires = [DateTime]::UtcNow.Date.AddYears(1).ToString("yyyy-MM-ddTHH:mm:ss.fffZ", $invariant)
  (Get-Content -Path $stagedSecurityTxt -Raw).Replace("__EXPIRES__", $expires) | Set-Content -Path $stagedSecurityTxt -Encoding UTF8 -NoNewline
}

# Minify JS/CSS in the staged bundle (sources stay readable; only deploy is minified).
# Requires devDependency esbuild — installed via `npm install` in repo root.
$minifyScript = Join-Path $PSScriptRoot "minify-deploy.mjs"
if (Test-Path $minifyScript) {
  $nodeModulesEsbuild = Join-Path $repoRoot "node_modules/esbuild"
  if (Test-Path $nodeModulesEsbuild) {
    & node $minifyScript
    if ($LASTEXITCODE -ne 0) {
      throw "Minification failed (exit $LASTEXITCODE). Inspect output above."
    }
  } else {
    Write-Warning "Skipping minify: node_modules/esbuild not found. Run 'npm install' in repo root."
  }
}

Write-Host "Staged deploy bundle at $target"
