// Weather page: the radar map (Windy embed). Consent gate, layer picker, the
// distance rings and their shield, Recenter, Reset, and the legend pop-up.
// Split out of weather.js on 2026-11-17; loaded just before it. The map's
// privacy rules are in CLAUDE.md ("The weather map is gated"); they apply here.
(() => {
  "use strict";
  const S = (window.App.weatherPage ||= {});
  // From the main script, looked up when called (it loads after this file).
  const { cfg, getCurrentPositionAsync, saveConfig } = window.App;


  // Map type selector
  const mapTypeSelect = document.getElementById("mapTypeSelect");
  const weatherMapFrame = document.getElementById("weatherMapFrame");
  const weatherMapWrap = document.getElementById("weatherMapWrap");
  const weatherMapSection = document.getElementById("weatherMapSection");
  let mapLoadScheduled = false;
  let mapHasLoaded = false;
  let mapObserver = null;

  // Windy is a third-party embed, and the coordinates sit in the iframe URL, so
  // loading it hands them the viewer's location, IP and referrer before the
  // viewer has asked for a map at all. It stays gated until an explicit click.
  //
  // The remembered answer lives in its own localStorage key rather than in cfg
  // on purpose: it is a per-browser decision to share data with someone else,
  // and it must not ride along in a settings export into a browser whose owner
  // never agreed to it. Same reasoning as hn_sync_prefs_v1.
  const MAP_CONSENT_KEY = "hn_map_consent_v1";
  let mapConsented = (() => {
    try { return localStorage.getItem(MAP_CONSENT_KEY) === "always"; }
    catch { return false; }
  })();
  if (mapConsented) weatherMapWrap?.classList.remove("isGated");

  // Lifts the gate. Does not load anything itself — callers already know
  // whether they want updateMap(true) now or the deferred scheduler.
  function grantMapConsent(remember) {
    mapConsented = true;
    // The caller loads directly, so the idle timer and observer would only
    // duplicate the work.
    mapLoadScheduled = true;
    weatherMapWrap?.classList.remove("isGated");
    if (remember) {
      try { localStorage.setItem(MAP_CONSENT_KEY, "always"); } catch { /* private mode */ }
    }
  }

  document.getElementById("weatherMapLoadBtn")?.addEventListener("click", () => {
    grantMapConsent(!!document.getElementById("weatherMapRemember")?.checked);
    updateMap(true);
  });

  // Apply show/hide map preference
  if(weatherMapSection){
    weatherMapSection.style.display = cfg.weatherShowMap !== false ? "" : "none";
  }

  // Pre-select default map layer from config
  if(mapTypeSelect && cfg.weatherDefaultMapLayer){
    mapTypeSelect.value = cfg.weatherDefaultMapLayer;
  }

  const mapOverlayMap = {
    radar: "radar",
    wind: "wind",
    temp: "temp",
    clouds: "clouds",
    air: "air"
  };

  function setMapLoadingState(pending){
    if(!weatherMapWrap) return;
    weatherMapWrap.classList.toggle("isPending", !!pending);
  }

  // Distance-ring state (see drawMapRings below). Declared before updateMap,
  // which writes it and can run during start-up.
  let ringsView = null;          // { lat, zoom } of the view the frame is showing
  let ringsPending = null;       // view requested, frame still loading it
  let ringsSuppressed = false;   // the reader has moved the map since
  function updateMap(forceLoad = false) {
    if (!weatherMapFrame) return;
    if (!mapConsented) return;
    if(!forceLoad && !mapHasLoaded) return;
    // Skip the heavy Windy embed when the radar card is hidden via Settings.
    if(window.App?.isSectionHidden?.("weather","radar")) return;

    const mapType = mapTypeSelect?.value || cfg.weatherDefaultMapLayer || "radar";
    const overlay = mapOverlayMap[mapType] || "radar";

    // Get current coordinates from S.lastGeo (set during weather fetch) or default to US center
    const lat = S.lastGeo?.lat || 39.5;
    const lon = S.lastGeo?.lon || -98.35;
    // A GPS position is exact, so zoom to street-and-neighbourhood level with a
    // pin on it. A ZIP or city lookup only knows the town centre, so a pin
    // there would claim a precision we don't have: keep the wider view.
    // No location at all: US overview, no pin.
    const zoom = !S.lastGeo ? 4 : S.lastGeo.precise ? 10 : 8;
    const marker = S.lastGeo ? "true" : "";

    // Build Windy embed URL with the selected overlay
    const windyUrl = `https://embed.windy.com/embed2.html?lat=${lat}&lon=${lon}&detailLat=${lat}&detailLon=${lon}&width=650&height=450&zoom=${zoom}&level=surface&overlay=${overlay}&menu=&message=true&marker=${marker}&calendar=now&pressure=&type=map&location=coordinates&detail=&metricWind=default&metricTemp=default&radarRange=-1`;

    if(!forceLoad && weatherMapFrame.dataset.loadedSrc === windyUrl) return;

    // A fresh view. Rings wait for it to load: until then the frame still
    // shows the previous view, and rings sized for the new one would lie.
    ringsView = null;
    ringsPending = { lat, zoom };
    ringsSuppressed = false;
    weatherMapFrame.dataset.loadedSrc = windyUrl;
    setMapLoadingState(true);
    weatherMapFrame.src = windyUrl;
    mapHasLoaded = true;
    drawMapRings();   // hides the old rings
  }

  weatherMapFrame?.addEventListener("load", () => {
    setMapLoadingState(false);
    // The frame now shows the view we asked for. Windy paints a moment after
    // its load event, so give it that moment before drawing.
    if(ringsPending){
      const view = ringsPending;
      const src = weatherMapFrame.dataset.loadedSrc;
      ringsPending = null;
      setTimeout(() => {
        if(weatherMapFrame.dataset.loadedSrc !== src) return;   // view changed again meanwhile
        ringsView = view;
        drawMapRings();
      }, 600);
    }
  });

  // ── Distance rings over the radar map ────────────────────────────────
  // Windy is a cross-origin iframe, so we can't draw inside it or see it pan.
  // What we do know is the view we asked for (centre + zoom), and Windy uses
  // standard Web Mercator: metres per CSS pixel = 156543.03 * cos(lat) / 2^zoom.
  // Checked against real towns (Jackson -> Napoleon, MI: 15.9 km, predicted
  // 140 px, measured 139). So rings are exact while the map sits where we put
  // it. The moment the reader moves the map we can't follow, so the first
  // touch / drag / scroll on the map hides them (a transparent shield takes
  // that one gesture, then steps aside); the Reset button on the map, or
  // Recenter in the header, brings them back.
  const mapRings = document.getElementById("weatherMapRings");
  // On the map itself, once it has loaded. A tap inside Windy plants its
  // pointer and a pop-up we cannot reach or close (cross-origin, and on a
  // phone Windy offers no close button), so the way out is to load the map
  // afresh: same place, same layer, pop-up gone, rings back. Unlike the pin
  // in the card header it asks for no new GPS fix.
  const mapResetBtn = document.getElementById("weatherMapResetBtn");
  mapResetBtn?.addEventListener("click", () => updateMap(true));
  const mapRingsBtn = document.getElementById("mapRingsBtn");
  const RING_STEPS = [0.5, 1, 2, 3, 5, 10, 15, 25, 50, 100, 250];

  let ringsShield = null;
  function setShield(on){
    if(!weatherMapWrap) return;
    if(!ringsShield){
      ringsShield = document.createElement("div");
      ringsShield.className = "weatherMapRingsShield";
      const hide = () => { ringsSuppressed = true; drawMapRings(); };
      ringsShield.addEventListener("pointerdown", hide);
      ringsShield.addEventListener("wheel", hide, { passive: true });
      weatherMapWrap.appendChild(ringsShield);
    }
    ringsShield.hidden = !on;
  }

  function drawMapRings(){
    if(!mapRings) return;
    const on = cfg.weatherMapRings !== false;
    if(mapRingsBtn){
      mapRingsBtn.setAttribute("aria-pressed", String(on));
      mapRingsBtn.classList.toggle("isOn", on);
    }
    const loaded = mapHasLoaded && weatherMapFrame && weatherMapFrame.src !== "about:blank";
    const show = on && loaded && S.lastGeo && ringsView && !ringsSuppressed;
    // toggleAttribute, not .hidden: `hidden` is an HTMLElement property, and
    // on an <svg> assigning it just creates an expando while the attribute
    // stays put — the rings were invisible while reporting themselves shown.
    mapRings.toggleAttribute("hidden", !show);
    setShield(!!show);
    if(mapResetBtn){
      mapResetBtn.hidden = !loaded;
      // Say why the rings went, where the reader is already looking.
      mapResetBtn.textContent = on && ringsSuppressed ? "↺ Reset map · rings come back" : "↺ Reset map";
    }
    if(!show) return;

    const w = weatherMapFrame.clientWidth, h = weatherMapFrame.clientHeight;
    const cx = w / 2, cy = h / 2;
    const mpp = 156543.03392 * Math.cos(ringsView.lat * Math.PI / 180) / Math.pow(2, ringsView.zoom);
    // Distance unit follows the wind-speed setting: mph reads in miles.
    const miles = (cfg.weatherWindUnit || "mph") === "mph";
    const unitM = miles ? 1609.344 : 1000;
    const maxR = Math.min(w, h) / 2 - 10;
    const rings = RING_STEPS.map(d => ({ d, r: d * unitM / mpp })).filter(x => x.r >= 22 && x.r <= maxR).slice(-3);

    mapRings.setAttribute("viewBox", `0 0 ${w} ${h}`);
    mapRings.style.height = `${h}px`;
    // White on a dark halo: readable on Windy's grey basemap and on every
    // radar colour from blue to purple.
    mapRings.innerHTML = rings.map(({ d, r }) => {
      const label = `${d} ${miles ? "mi" : "km"}`;
      const lw = label.length * 6.4 + 12;
      return `<circle cx="${cx}" cy="${cy}" r="${r.toFixed(1)}" class="ringHalo"/>
        <circle cx="${cx}" cy="${cy}" r="${r.toFixed(1)}" class="ringLine"/>
        <rect x="${(cx - lw / 2).toFixed(1)}" y="${(cy - r - 9).toFixed(1)}" width="${lw.toFixed(1)}" height="18" rx="9" class="ringPill"/>
        <text x="${cx}" y="${(cy - r + 4).toFixed(1)}" class="ringText">${label}</text>`;
    }).join("");
  }

  mapRingsBtn?.addEventListener("click", () => {
    cfg.weatherMapRings = cfg.weatherMapRings === false;
    saveConfig(cfg);
    ringsSuppressed = false;
    drawMapRings();
  });
  window.addEventListener("resize", () => drawMapRings());

  weatherMapFrame?.addEventListener("error", () => {
    setMapLoadingState(false);
  });

  // Recenter button: get a fresh GPS fix and reload the Windy iframe at
  // those coords. If GPS isn't available (denied / no support / timeout),
  // we still force-reload at the current S.lastGeo so the user's Windy pan
  // and zoom state resets to their saved location. We can't programmatically
  // pan/zoom inside the iframe — only reload it with a new URL.
  const mapRecenterBtn = document.getElementById("mapRecenterBtn");
  mapRecenterBtn?.addEventListener("click", async () => {
    if(!mapConsented) grantMapConsent(false);
    mapRecenterBtn.disabled = true;
    const originalLabel = mapRecenterBtn.textContent;
    mapRecenterBtn.textContent = "⌛";
    try {
      let lat, lon;
      if (typeof getCurrentPositionAsync === "function") {
        try {
          const pos = await getCurrentPositionAsync({ timeout: 8000 });
          lat = Number(pos?.coords?.latitude);
          lon = Number(pos?.coords?.longitude);
        } catch { /* permission denied, no fix, etc. — fall back below */ }
      }
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        S.lastGeo = { ...(S.lastGeo || {}), lat, lon, precise: true };
      }
      updateMap(true);
    } finally {
      mapRecenterBtn.textContent = originalLabel;
      mapRecenterBtn.disabled = false;
    }
  });

  function scheduleMapLoad(){
    if(!weatherMapFrame || mapLoadScheduled) return;
    if(!mapConsented) return;
    mapLoadScheduled = true;
    let triggered = false;

    const loadMapNow = () => {
      if(triggered) return;
      triggered = true;
      updateMap(true);
      if(mapObserver){
        mapObserver.disconnect();
        mapObserver = null;
      }
    };

    const idleTimer = window.setTimeout(loadMapNow, 1400);

    if(typeof window.requestIdleCallback === "function"){
      window.requestIdleCallback(() => {
        window.clearTimeout(idleTimer);
        loadMapNow();
      }, { timeout: 2200 });
    }

    if("IntersectionObserver" in window && weatherMapSection){
      mapObserver = new IntersectionObserver((entries) => {
        if(entries.some((entry) => entry.isIntersecting)){
          window.clearTimeout(idleTimer);
          loadMapNow();
        }
      }, { rootMargin: "180px 0px" });
      mapObserver.observe(weatherMapSection);
    }
  }

  if (mapTypeSelect) {
    mapTypeSelect.addEventListener("change", () => {
      // Picking a layer is an explicit request to see the map, so it lifts the
      // gate for this visit — but only the checkbox remembers the answer.
      if(!mapConsented) grantMapConsent(false);
      scheduleMapLoad();
      updateMap(true);
    });
  }

  // Map legends
  const legendDefinitions = {
    radar: {
      title: "Radar Legend",
      sections: [
        {
          heading: "Precipitation",
          items: [
            { color: "#00eaf9", label: "Light drizzle / Trace rain" },
            { color: "#00a5ff", label: "Light rain" },
            { color: "#0071ff", label: "Moderate rain" },
            { color: "#00e90f", label: "Heavy rain" },
            { color: "#ffff00", label: "Very heavy rain" },
            { color: "#ff7e00", label: "Severe rain" },
            { color: "#ff0000", label: "Extreme rainfall" }
          ]
        },
        {
          heading: "Intensity Scale",
          items: [
            { label: "Darker colors indicate stronger precipitation and/or hail" }
          ]
        }
      ],
      mapInfo: "Based on NOAA National Weather Service Radar"
    },
    wind: {
      title: "Wind Legend",
      sections: [
        {
          heading: "Wind Speed",
          items: [
            { color: "#4575b4", label: "Calm / Very light" },
            { color: "#74add1", label: "Light" },
            { color: "#abd9e9", label: "Moderate" },
            { color: "#e0f3f8", label: "Fresh" },
            { color: "#ffffbf", label: "Strong" },
            { color: "#fee090", label: "Very strong" },
            { color: "#fdae61", label: "Gale / Severe" }
          ]
        },
        {
          heading: "Direction",
          items: [
            { label: "Arrows show wind direction (where wind is coming FROM)" }
          ]
        }
      ],
      mapInfo: "Wind vectors at surface level"
    },
    temp: {
      title: "Temperature Legend",
      sections: [
        {
          heading: "Temperature Range",
          items: [
            { color: "#1a1a50", label: "Extremely cold (< -40°F)" },
            { color: "#0000ff", label: "Very cold (-40 to 0°F)" },
            { color: "#00ffff", label: "Cold (0 to 32°F)" },
            { color: "#00ff00", label: "Cool (32 to 50°F)" },
            { color: "#ffff00", label: "Mild (50 to 70°F)" },
            { color: "#ff7f00", label: "Warm (70 to 90°F)" },
            { color: "#ff0000", label: "Very warm (> 90°F)" }
          ]
        }
      ],
      mapInfo: "2-meter surface temperature °F"
    },
    clouds: {
      title: "Cloud Cover Legend",
      sections: [
        {
          heading: "Cloud Coverage",
          items: [
            { color: "rgba(0, 0, 0, 0.05)", label: "Clear / Few clouds (0-25%)" },
            { color: "rgba(150, 150, 150, 0.3)", label: "Partially cloudy (25-50%)" },
            { color: "rgba(150, 150, 150, 0.6)", label: "Mostly cloudy (50-75%)" },
            { color: "rgba(100, 100, 100, 0.9)", label: "Overcast / Full coverage (75-100%)" }
          ]
        },
        {
          heading: "Cloud Tops",
          items: [
            { label: "Brighter areas indicate higher cloud tops; darker indicates lower clouds" }
          ]
        }
      ],
      mapInfo: "Total cloud coverage from satellite imagery"
    },
    air: {
      title: "Air Quality Legend",
      sections: [
        {
          heading: "Air Quality Index (AQI)",
          items: [
            { color: "#009966", label: "Good (0-50) - Air quality is satisfactory" },
            { color: "#ffff00", label: "Moderate (51-100) - Acceptable air quality" },
            { color: "#ff9933", label: "Unhealthy for Sensitive Groups (101-150)" },
            { color: "#cc0000", label: "Unhealthy (151-200)" },
            { color: "#990099", label: "Very Unhealthy (201-300)" },
            { color: "#8b0000", label: "Hazardous (301+)" }
          ]
        },
        {
          heading: "Primary Pollutants",
          items: [
            { label: "PM2.5, PM10, O₃, NO₂, SO₂, and CO levels determine the index" }
          ]
        }
      ],
      mapInfo: "Real-time air quality from monitoring stations"
    }
  };

  function showLegend() {
    const modal = document.getElementById("mapLegendModal");
    const mapType = mapTypeSelect?.value || "radar";
    const legend = legendDefinitions[mapType] || legendDefinitions.radar;
    const title = document.getElementById("mapLegendTitle");
    const body = document.getElementById("mapLegendBody");

    title.textContent = legend.title;
    body.innerHTML = "";

    legend.sections.forEach(section => {
      const sectionDiv = document.createElement("div");
      sectionDiv.className = "legendSection";

      if (section.heading) {
        const heading = document.createElement("h4");
        heading.textContent = section.heading;
        sectionDiv.appendChild(heading);
      }

      section.items.forEach(item => {
        const itemDiv = document.createElement("div");
        itemDiv.className = "legendItem";

        if (item.color) {
          const colorBox = document.createElement("div");
          colorBox.className = "legendColor";
          colorBox.style.background = item.color;
          colorBox.style.border = "1px solid var(--border)";
          itemDiv.appendChild(colorBox);
        } else {
          const spacer = document.createElement("div");
          spacer.style.width = "20px";
          itemDiv.appendChild(spacer);
        }

        const label = document.createElement("div");
        label.className = "legendLabel";
        label.textContent = item.label;
        itemDiv.appendChild(label);

        sectionDiv.appendChild(itemDiv);
      });

      body.appendChild(sectionDiv);
    });

    if (legend.mapInfo) {
      const mapInfo = document.createElement("div");
      mapInfo.className = "legendMap";
      mapInfo.textContent = "📍 " + legend.mapInfo;
      body.appendChild(mapInfo);
    }

    modal.classList.add("isOpen");
    modal.setAttribute("aria-hidden", "false");
  }

  function closeLegend() {
    const modal = document.getElementById("mapLegendModal");
    modal.classList.remove("isOpen");
    modal.setAttribute("aria-hidden", "true");
  }

  // Attach legend button handlers
  const mapLegendBtn = document.getElementById("mapLegendBtn");
  const mapLegendClose = document.getElementById("mapLegendClose");
  if (mapLegendBtn) mapLegendBtn.addEventListener("click", showLegend);
  if (mapLegendClose) mapLegendClose.addEventListener("click", closeLegend);

  // Close legend on modal background click
  const modal = document.getElementById("mapLegendModal");
  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeLegend();
    });
  }


  Object.assign(S, { scheduleMapLoad, updateMap });
})();
