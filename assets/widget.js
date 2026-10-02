// Standalone widgets: /widget?w=weather (more types are added to WIDGETS below).
// Reuses common.js for saved settings + theme and common-weather.js for the
// location lookup, so a widget shows exactly what the main site would.
(function () {
  const App = window.App;
  const root = document.getElementById("widget");
  const esc = App.escapeHtml;
  const cfg = App.cfg;

  const say = (msg) => { root.innerHTML = `<div class="wMsg">${msg}</div>`; };

  // ---- weather ------------------------------------------------------------
  async function weather() {
    const loc = await App.resolvePreferredLocation({ cfg, autoDetect: false });
    if (!loc || !Number.isFinite(+loc.lat) || !Number.isFinite(+loc.lon)) {
      say(`No location set. <a href="/settings#weather" target="_top">Set one in Settings</a>.`);
      return;
    }
    const tempUnit = cfg.weatherTempUnit || "fahrenheit";
    const windUnit = cfg.weatherWindUnit || "mph";
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${+loc.lat}&longitude=${+loc.lon}` +
      `&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m` +
      `&hourly=temperature_2m,weather_code,precipitation_probability` +
      `&daily=temperature_2m_max,temperature_2m_min` +
      `&forecast_days=2&temperature_unit=${tempUnit}&wind_speed_unit=${windUnit}&timezone=auto`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error("weather " + res.status);
    const d = await res.json();

    const deg = (n) => (Number.isFinite(n) ? Math.round(n) + "°" : "--");
    const c = d.current || {};
    const h = d.hourly || {};

    // Next 8 hours, starting from the current hour. The API returns local-time
    // strings without an offset, and `current.time` is in the same frame.
    const start = Math.max(0, (h.time || []).findIndex((t) => t >= (c.time || "").slice(0, 13)));
    const hours = (h.time || []).slice(start, start + 8).map((t, i) => {
      const k = start + i;
      const hr = new Date(t).toLocaleTimeString("en-US", { hour: "numeric" });
      const rain = h.precipitation_probability?.[k];
      return `<div class="wHour">
        <div>${i === 0 ? "Now" : hr}</div>
        <div class="wHIcon">${App.getWeatherIcon(h.weather_code?.[k])}</div>
        <div>${deg(h.temperature_2m?.[k])}</div>
        <div class="wHRain">${rain >= 10 ? rain + "%" : ""}</div>
      </div>`;
    }).join("");

    root.innerHTML = `
      <div class="wHead">
        <span class="wTitle">${esc(loc.city || loc.label || "Weather")}</span>
        <span class="wMeta">Updated ${new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>
      </div>
      <div class="wNow">
        <div class="wIcon">${App.getWeatherIcon(c.weather_code)}</div>
        <div>
          <div class="wTemp">${deg(c.temperature_2m)}</div>
          <div class="wDesc">${esc(App.wmoDesc(c.weather_code))}</div>
          <div class="wSub">Feels ${deg(c.apparent_temperature)} · H ${deg(d.daily?.temperature_2m_max?.[0])} L ${deg(d.daily?.temperature_2m_min?.[0])}</div>
        </div>
      </div>
      <div class="wHours">${hours}</div>
      <a class="wMeta" href="/weather" target="_top">Full forecast →</a>`;
  }

  // ---- boot ---------------------------------------------------------------
  const WIDGETS = { weather };
  const name = new URLSearchParams(location.search).get("w") || "weather";
  const render = WIDGETS[name];

  async function run() {
    try { await render(); }
    catch (e) { console.warn("[widget]", e); say("Couldn't load. Will retry shortly."); }
  }

  if (!render) {
    say(`Unknown widget “${esc(name)}”. Try <a href="?w=weather">?w=weather</a>.`);
  } else {
    run();
    setInterval(run, Math.max(2, +cfg.weatherRefreshMinutes || 10) * 60_000);
  }
})();
