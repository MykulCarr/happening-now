# Build the signed Android widget app and put it where the site serves it.
#
#   pwsh -File scripts/release-widget.ps1
#
# Before running: raise versionCode (and versionName) in
# android-widget/app/build.gradle.kts. Installed copies ask the site once a
# day for version.json and offer the download when its versionCode is higher
# than their own, so a release nobody bumped is a release nobody is told about.
#
# After running: commit, then deploy as usual (deploy-beta, then deploy-prod).
# The APK is committed on purpose: a deploy from a fresh clone must ship the
# same file, and the signing key is deliberately not in the repo.

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$app = Join-Path $repoRoot "android-widget"
$out = Join-Path $repoRoot "assets/widget-app"

if (-not (Test-Path (Join-Path $app "keystore.properties"))) {
  throw "android-widget/keystore.properties is missing. It holds the signing key's location and password and is not in git; restore it from your backup."
}

# Android Studio ships the JDK the build needs.
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"

Push-Location $app
try {
  & .\gradlew.bat assembleRelease --console=plain
  if ($LASTEXITCODE -ne 0) { throw "The build failed." }
} finally {
  Pop-Location
}

$gradle = Get-Content (Join-Path $app "app/build.gradle.kts") -Raw
$code = [int]([regex]::Match($gradle, 'versionCode\s*=\s*(\d+)').Groups[1].Value)
$name = [regex]::Match($gradle, 'versionName\s*=\s*"([^"]+)"').Groups[1].Value

New-Item -ItemType Directory -Force $out | Out-Null
$apk = Join-Path $out "happening-now-widget.apk"
Copy-Item (Join-Path $app "app/build/outputs/apk/release/app-release.apk") $apk -Force

# What installed copies read to learn there is something newer.
$version = [ordered]@{ versionCode = $code; versionName = $name; apk = "/assets/widget-app/happening-now-widget.apk" }
$version | ConvertTo-Json | Set-Content (Join-Path $out "version.json") -Encoding utf8

$size = [math]::Round((Get-Item $apk).Length / 1KB)
Write-Host "Widget app $name (versionCode $code), $size KB -> assets/widget-app/"
Write-Host "Next: commit, then deploy-beta and deploy-prod."
