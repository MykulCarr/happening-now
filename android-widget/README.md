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
