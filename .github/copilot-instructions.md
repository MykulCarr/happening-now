# AI Coding Agent Instructions for news-pages

## Project Overview
**Happening Now** is a lightweight personal information dashboard with four pages:
- **News** (index.html): RSS feed aggregator with 9 default sources via Cloudflare Worker proxy
- **Weather** (weather.html): Current conditions, hourly/daily forecast, alerts (local NWS + national) via open-meteo & weather.gov APIs
- **Stocks** (stocks.html): Symbol prices from Google Finance embeds, with pinning and sorting
- **Settings** (settings.html): Theme, density, ZIP code, news/stock management with import/export

## Architecture & Key Patterns

### Module Isolation via IIFE
All page-specific code wraps in self-executing functions:
```javascript
(() => {
  "use strict";
  const { cfg, fetchRssItems, escapeHtml } = window.App; // destructure from global
  // page logic here
})();
```
This prevents global namespace pollution. **Always** destructure required App functions at the top.

### Global `window.App` API
[common.js](assets/common.js) initializes and exposes utility functions. All pages depend on it via `window.App`.
Key exports: `cfg`, `loadConfig()`, `saveConfig()`, `fetchRssItems()`, `escapeHtml()`, `stripTags()`, `createCardHeader()`, `createPageHeader()`, `formatTime()`, `formatDate()`, `getTimezoneLabel()`, `cacheGet()`, `cacheSet()`, `cacheAgeMs()`, `formatAge()`.

### Configuration Flow
1. **Load**: `loadConfig()` gets from localStorage key `"jas_cfg_v2"`, falls back to `DEFAULTS`
2. **Normalize**: `normalizeConfig(cfg)` validates theme (dark/light), density (compact/cozy/comfortable), ZIP (5 digits), widgets/stocks arrays
3. **Save**: `saveConfig(cfg)` validates, writes to localStorage, syncs `window.App.cfg`
4. **Timezone Sync**: `syncTimezoneFromZip(cfg)` enriches config with timezone from ZIP code + weather API

**Best practice**: Always call `normalizeConfig()` after user input; call `saveConfig()` to persist and sync to global.

### Caching Strategy
In-memory Map with 5-minute TTL for API calls:
- `getCached(key)` / `setCached(key, data)` manage the cache
- Cache keys follow pattern: `${type}:${identifier}:${params}` (e.g., `"rss:https://....:5"`, `"weather:40.5:-85.5"`, `"geo:49201"`)
- localStorage is **separate**: use `cacheSet(key, value)` for page-specific data (e.g., news HTML, stock pins)
- Check age with `cacheAgeMs(savedAt)` and format with `formatAge(ms)` (returns "3m", "2h", etc.)

### HTML Sanitization & Link Normalization
Always escape user-controlled content:
- `escapeHtml(string)` for inserting into innerHTML (escapes &, <, >, ", ')
- `stripTags(html)` removes script/style tags and extracts plain text

**Google News Link Unwrapping**: `normalizeOutboundLink(url)` unwraps redirect URLs because:
- Google News RSS wraps outbound URLs as `?url=<encoded-real-url>` or `?u=<encoded-real-url>`
- Google's `/url` redirect pattern uses `?q=<target>`
- This prevents users clicking through Google redirects; always call on RSS link nodes

### Component Creation Helpers
[common.js](assets/common.js) provides factory functions that return DOM elements (not strings):
- `createCardHeader({ name, site, onOpen })` — returns card header with favicon + open button
- `createPageHeader({ title, subtitle, actions })` — returns section with title + action buttons
Always `appendChild()` these; do not use `innerHTML +=` (loses event listeners).

### External API Dependencies
- **RSS**: Cloudflare Worker proxy at `window.App.RSS_PROXY_BASE` + encoded URL
- **Geocoding**: `geocodeZip(zip)` → calls zippopotam.us, returns `{ city, state, lat, lon }`
- **Weather**: `fetchCurrentWeather(lat, lon)` → calls open-meteo, returns `{ temp, feels, code, wind, humidity, timezone }`
- **Weather Alerts (Local)**: `fetchNwsAlerts(lat, lon)` → calls weather.gov, returns array of alert objects with `{ title, severity, ends, area, desc }`
- **Weather Alerts (National)**: `fetchNwsNationalAlerts()` → filters to severe/extreme only, sorted by sent date
- All APIs use `cache:"no-store"` to bypass browser cache

## Page-Specific Conventions

### News Page (news.js)
- Destructures: `cfg, fetchRssItems, escapeHtml, createCardHeader, handleError, showError`
- Caches rendered HTML + timestamp in localStorage key `"jas_cache_news_v1"` (10-min max age)
- `applyNewsStamps(savedAt)` updates `.modStamp` elements with time, age, stale indicator
- Cards built with `buildCard(widget)` using `createCardHeader()`; headlines fetched with `fetchRssItems(rssUrl, headlinesCount)`

**RSS Parsing & Sanitization**:
- `fetchRssItems(rssUrl, limit, useCache)` parses both Atom (`<entry>`) and RSS (`<item>`) feeds
- Maps feed data: title, link (unwrapped via `normalizeOutboundLink()`), pubDate, description (stripped of HTML, max 240 chars)
- Returns `{ title, url, pubDate, desc }` array; silently returns `[]` on fetch/parse errors
- Links extracted via `.getAttribute("href")` OR `.textContent` (fallback for bare link nodes)
- Descriptions checked in order: `<description>` → `<content>` → `<content:encoded>` (handles various feed formats)

### Weather Page (weather.js)
Fetches current, hourly, and daily forecast from open-meteo in one call via `fetchOpenMeteo(lat, lon)`.

**Alert Management** — Three-tier system:
- **Local alerts**: `fetchNwsAlerts(lat, lon)` queries weather.gov by coordinates; limited to 12 most recent
- **National alerts**: `fetchNwsNationalAlerts()` filters all active US alerts to severe/extreme only (limit 20); useful for dashboard awareness
- **State management**: `alertScope` tracks "local" | "national" | "all"; stored UI in tabs (`#alertsTabs`), user clicks `[data-scope]` buttons
- **Rendering**: `renderAlerts(list)` displays alerts with severity color-coding, area, description (max 320 chars), end time
- No persistence; refetched on every page load or manual refresh

**Forecast Tables**:
- `renderHourlyTable(meteo)` — next 24 hours (time, condition, temp, pop%, wind+gust)
- `renderDailyTable(meteo)` — 7-day forecast (date, condition, hi/lo, pop%, wind)
- Both filter out past times; display fallback hint if unavailable

**Auto-Refresh**: `cfg.weatherRefreshMinutes` (default 10, validated 2–n) controls interval via `setInterval()`; clear old timer with `clearInterval(window.__intervalId)`

### Stocks Page (stocks.js)
No direct price fetches; displays user-selected symbols via Google Finance embeds.

**Pinning System**:
- **Storage**: JSON object in localStorage `"jas_stock_pins_v1"` → `{ [symbol]: true }` (presence = pinned)
- **Load/Save**: `loadPins()` → `{}`, `savePins(pins)` persists to localStorage
- **Sort Priority**: `sortedStocks(list, pins, mode)` reorders based on mode:
  - `"pinned"` (default): pinned symbols first (sorted by label A–Z), then unpinned A–Z
  - `"az"`: all alphabetical by label
  - `"symbol"`: all by symbol code
- **Persistence**: Both pins and sort mode stored separately; sort mode in `"jas_stock_sort_v1"`

**News Block**: For each symbol, queries Google News RSS via `googleNewsRssQueryForSymbol(symbol, label)` (appends "stock" keyword to reduce noise); renders per-symbol blocks + aggregated "Don't Miss" from all stocks

### Settings Page (settings.js)
- Two editors: `#stocksEditor` and `#newsEditor` — render as rows with inputs + delete buttons
- `addStockBtn` / `addNewsBtn` append empty rows; validate before save
- `exportBtn` / `importBtn`: full config as JSON
- `saveBtn` validates entire config via `normalizeConfig()`, then `saveConfig()`, updates `window.App.cfg`

## Debugging & Development Notes

### Best-Effort Error Handling
- `handleError(error, context)` logs to console but **doesn't throw** — returns `{ error: true, message, context }`
- Many async operations silently fail (e.g., `geocodeZip`, `fetchCurrentWeather`) — check return values
- **Design philosophy**: graceful degradation (show stale data or defaults rather than blocking UI)

### Timezone Handling
- `TIMEZONES` array lists 12 supported zones; others validate via `Intl.DateTimeFormat()`
- `getTimezoneAbbrev(tz)` extracts "(ET)" from "Eastern (ET)" for display
- `formatTime(date, tz)` and `formatDate(date, tz)` use Intl API with timezone parameter

### Common DOM Patterns
- ID elements: `topClockTime`, `newsGrid`, `weatherCurrent`, `stocksBody`, `saveBtn` — camelCase, descriptive
- Classes: `newsCard`, `card`, `cardHead`, `cardBody`, `editorRow` — BEM-inspired
- Aria attributes: `role`, `aria-label`, `aria-current="page"` for nav, `aria-live="polite"` for alerts

## When Adding Features

1. **New RSS source or stock**: Add to `DEFAULTS.widgets` or `DEFAULTS.stocks` in [common.js](assets/common.js)
2. **New setting**: Add to `DEFAULTS`, add normalization logic in `normalizeConfig()`, add UI in [settings.html](settings.html) + [settings.js](assets/settings.js)
3. **New API call**: Cache with `setCached()`/`getCached()`, expose via `window.App` if shared
4. **New page**: Create `.html` file, add `<script src="assets/common.js"></script>` first, then page script
5. **Responsive tweaks**: Edit [assets/styles.css](assets/styles.css); grid is mobile-first

## HAPPENING NOW Requirements

These are the initial, project-level requirements for the "HAPPENING NOW!" dashboard. Treat this as a living checklist — we'll refine and expand as you provide notes.

- **General**
  - CSS changes must not affect the top bar; the top bar must be isolated and independent.
  - Keep code and page elements modular, simple, and elegant (IIFE modules and small components preferred).
  - Fully support dark and light page themes; all components should render correctly in either theme.

- **Top bar**
  - Span the full page width and be vertically compact.
  - Sticky: remains visible while content scrolls; becomes semi-opaque when content scrolls underneath; hovering anywhere over the bar restores full opacity and focus (optional UX enhancement).
  - Left: "HAPPENING NOW!" title with "NEWS · WEATHER · STOCKS" underneath; clicking should refresh the currently visible page data.
  - Right: reserve two action element slots (placeholders to be defined later).

- **Weather page (layout & behavior)**
  - Widgets placed individually using flex; include small descriptive images/icons where appropriate.
  - The entire page scrolls together; widgets may internally scroll when content exceeds their boxes.
  - Each widget must provide its own refresh control.
  - Top: a horizontal, auto-scrolling "Alerts!" bar that prioritizes local alerts above national.
  - Suggested widget layout:
    - Current widget (left, ~30% width responsive): shows location name (ZIP) with coordinates, current temperature, hi/lo, an icon/graphic for conditions, feels-like, humidity, wind/gust, precip stats, sunrise/sunset with daylight length, and moon phase. Alerts related to the current location appear inside this widget (no external alert dot).
    - Alerts widget (right, same height as Current): a full-width selector button labeled "LOCAL | NATIONAL" where the selected item is bold and underlined; displays lines of alerts and scrolls internally when overflowing. Default: LOCAL.
    - Weather map (right, under Alerts): map-type dropdown (radar default, precipitation, wind, clouds, air quality) and a radar-focused map by default; include a small link/button bottom-right to open the area in Windy.
    - 24-hour forecast (left, under Current): scrollable horizontal/vertical list; match map widget height.
    - 7-day forecast (left, under 24-hour): static, non-scrollable; its rendered height defines pairing size for Top Weather News.
    - Top Weather News (right, under Map): same height as 7-day forecast, displays weather-related headlines.

- **News page**
  - Add three non-clickable headline scrollers at the top: WORLD, US, LOCAL (text-only tickers).
  - Improve spacing, borders, and visual hierarchy to make the page less busy and more elegant.

- **Tabs & Performance**
  - Allow toggling tabs on/off via `settings`; hidden tabs must not load data (implement lazy-loading for visible tabs only).

- **Future pages / extras**
  - Placeholder ideas: star chart, astrological tab, other visual dashboards.

Implementation notes:
- Add small feature-flag comments where behaviors are optional (e.g., hover-to-focus opacity).
- Reuse `window.App` helpers for caching and fetches; consider exposing widget-specific refresh helpers.
