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
real one. A release build needs a git-ignored `keystore.properties`
(`storeFile`, `storePassword`, `keyAlias`, `keyPassword`); see app/build.gradle.kts.

## How settings get in

The app can't read the website's saved settings, so: app → "Get my settings"
opens `/widget?w=all&send=<scheme>` → the page's "Send to phone widget" button
links back as `<scheme>://setup?d=<base64 JSON>` → the app asks, then saves.
Nothing goes through a server. The link is untrusted input (any app can open
it): `Store.sanitize` copies only known fields, https feeds only, with caps.

## Files

- `Store.kt` — saved settings, cached data, current category
- `Fetch.kt` — Open-Meteo, `/v1/rss/raw`, `/v1/stocks/quotes`; tolerant feed parsing
- `RefreshJob.kt` — background refresh through the job scheduler
- `Render.kt` — draws each size from the cache (never touches the network)
- `Widgets.kt` — the widget classes and the ‹ › / refresh taps
- `SetupActivity.kt` — the one screen
