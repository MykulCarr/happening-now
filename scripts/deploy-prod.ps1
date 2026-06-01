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

# 2. Notify IndexNow (Bing, Yandex, DuckDuckGo's underlying Bing index,
#    Naver, Seznam) that the public URLs may have changed. A single POST
#    fans out to every participating engine. Google killed sitemap pings
#    in mid-2023 and the general Indexing API is restricted to job/event
#    payloads, so Googlebot still picks up changes via the sitemap that
#    robots.txt advertises — no programmatic notify needed there. We
#    treat any non-2xx from IndexNow as a warning, not a hard failure,
#    so a transient outage on the IndexNow side never blocks a deploy.
$indexNowKey = "a696f0db77a904974a99a9fa08cd18bb"
$indexNowKeyLocation = "https://happening-now.net/$indexNowKey.txt"

# Pull the URL list from the just-staged sitemap so it stays in sync
# with whatever pages we're actually advertising. One source of truth.
$sitemapPath = Join-Path $repoRoot ".deploy-public/sitemap.xml"
$urls = @()
if (Test-Path $sitemapPath) {
  $xml = [xml](Get-Content $sitemapPath -Raw)
  $urls = $xml.urlset.url | ForEach-Object { $_.loc }
}

if ($urls.Count -gt 0) {
  $payload = @{
    host        = "happening-now.net"
    key         = $indexNowKey
    keyLocation = $indexNowKeyLocation
    urlList     = $urls
  } | ConvertTo-Json -Compress
  try {
    $resp = Invoke-WebRequest `
      -Uri "https://api.indexnow.org/IndexNow" `
      -Method Post `
      -ContentType "application/json; charset=utf-8" `
      -Body $payload `
      -UseBasicParsing `
      -TimeoutSec 15
    Write-Host "IndexNow: HTTP $($resp.StatusCode)  ($($urls.Count) URLs submitted)"
  } catch {
    Write-Warning "IndexNow ping failed (deploy continues): $($_.Exception.Message)"
  }
} else {
  Write-Warning "IndexNow: skipped — no URLs found in $sitemapPath"
}

# 3. Trigger an Internet Archive Wayback Machine snapshot for each public
#    URL. Not a search engine — this is preservation/archival. The free
#    Save Page Now (SPN) endpoint is one-URL-per-request, so we loop.
#    A successful submission usually returns a 302 redirect to the
#    captured snapshot; we just follow it. Same soft-fail posture as
#    IndexNow: any individual failure is a warning, never blocks the
#    deploy. SPN can take 20-40 seconds per page when queues are deep,
#    so the per-URL timeout is generous.
if ($urls.Count -gt 0) {
  $archived = 0
  $skipped = 0
  foreach ($u in $urls) {
    try {
      $resp = Invoke-WebRequest `
        -Uri "https://web.archive.org/save/$u" `
        -Method Get `
        -UserAgent "happening-now-deploy/1.0" `
        -UseBasicParsing `
        -TimeoutSec 45 `
        -ErrorAction Stop | Out-Null
      $archived++
    } catch {
      $skipped++
    }
  }
  Write-Host "Wayback Machine: $archived snapshots queued, $skipped skipped"
} else {
  Write-Warning "Wayback Machine: skipped — no URLs"
}

# 4. Deploy the API Worker (happening-now-sync)
& (Join-Path $PSScriptRoot "deploy-worker.ps1")
