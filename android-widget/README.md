# Happening Now — Android home-screen widget

A small native app whose only job is three home-screen widgets (a PWA can't
make one): **Today** (full launcher page: clock, weather, headlines by
category, watchlist), **medium** (clock, weather, top story) and **small**
(clock and weather). Tapping anything opens happening-now.net, in the
installed PWA when there is one.

No third-party libraries: Kotlin plus what Android ships (RemoteViews,
TextClock, JobScheduler, HttpURLConnection, org.json).

## Build and install

Needs Android Studio (for its JDK and the SDK). From this folder, in Git Bash:

```bash
export JAVA_HOME="C:/Program Files/Android/Android Studio/jbr"
./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

The **debug build is the beta**: app id `net.happeningnow.widget.debug`, name
"HN Widget (beta)", link scheme `hnwidgetdebug`, so it installs beside the
real one. ## Releasing

The app is distributed from the site (`/android`), not a store.

1. Raise `versionCode` and `versionName` in `app/build.gradle.kts`.
2. `pwsh -File scripts/release-widget.ps1` builds the signed, shrunk APK and
   writes it and `version.json` into `assets/widget-app/`.
3. Install it on a real phone and check a widget draws (R8 shrinking can
   break things a debug build never shows).
4. Commit, then deploy-beta and deploy-prod.

Installed copies read `version.json` once a day and offer the download when
its `versionCode` is higher than their own.

Signing needs `keystore.properties` here (git-ignored: `storeFile`,
`storePassword`, `keyAlias`, `keyPassword`) and the key file it points to,
`~/.android-keys/happening-now-widget.jks`. **Neither is in git. Lose the key
and no installed copy can ever be updated**, only uninstalled and replaced.

## How settings get in

The app cannot read the website's saved settings, so the site hands them over
in a link (`<scheme>://setup?k=<code>&d=<base64 JSON>`); nothing goes through
a server.

1. **Pair once:** the app's "Get my settings" opens
   `/widget?w=all&send=<scheme>&k=<code>`, where `<code>` is this install's
   private pairing code. The site remembers it (`assets/widget-link.js`).
2. **Send:** the page's "Send to phone widget" button links back with the
   settings. A link carrying the right code is applied at once; any other
   link is untrusted (any app can open it), so the app asks first. Either
   way `Store.sanitize` copies only known fields, https feeds only, with caps.
3. **Later changes:** when the site's settings differ from what was last
   sent, it shows an "Update phone widget" bar. One tap.

Site pages always open in the installed PWA (`Site.kt`), never the default
browser: the settings live in Chrome's storage.

## Files

- `Store.kt` — saved settings, cached data, current category
- `Fetch.kt` — Open-Meteo, `/v1/rss/raw`, `/v1/stocks/quotes`; tolerant feed parsing
- `RefreshJob.kt` — background refresh through the job scheduler
- `Render.kt` — draws each size from the cache (never touches the network)
- `Widgets.kt` — the widget classes and the ‹ › / refresh taps
- `Site.kt` — opens site pages in the installed PWA
- `SetupActivity.kt` — the one screen; receives settings links
