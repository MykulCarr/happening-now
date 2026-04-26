(() => {
  "use strict";
  const App = window.App = window.App || {};
  const {
    RSS_PROXY_BASE,
    DEFAULTS,
    loadConfig,
    saveConfig,
    getCached,
    setCached,
    handleError,
    escapeHtml
  } = App;

  async function geocodeZip(zip){
    const cacheKey = `geo:${zip}`;
    const cached = getCached(cacheKey);
    if(cached) return cached;

    try{
      const url = `https://api.zippopotam.us/us/${zip}`;
      const res = await fetch(url, { cache:"no-store" });
      if(!res.ok) throw new Error("Bad ZIP");
      const j = await res.json();
      const place = j.places?.[0];
      if(!place) throw new Error("No place");
      const result = {
        city: place["place name"],
        state: place["state abbreviation"],
        lat: Number(place.latitude),
        lon: Number(place.longitude)
      };
      setCached(cacheKey, result);
      return result;
    }catch(error){
      handleError(error, "Geocoding");
      throw error;
    }
  }

  async function getCurrentPositionAsync(options = {}){
    return new Promise((resolve, reject) => {
      if(!navigator.geolocation){
        reject(new Error("Geolocation not supported"));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        pos => resolve(pos),
        err => reject(err),
        {
          enableHighAccuracy: true,
          timeout: options.timeout || 10000,
          maximumAge: options.maximumAge || 300000 // 5 minutes
        }
      );
    });
  }

  async function reverseGeocodeCoords(lat, lon){
    const cacheKey = `revgeo:${lat.toFixed(3)}:${lon.toFixed(3)}`;
    const cached = getCached(cacheKey);
    if(cached) return cached;

    try{
      const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`;
      const res = await fetch(url, { cache:"no-store" });
      if(!res.ok) throw new Error("Reverse geocoding failed");
      const data = await res.json();
      const result = {
        city: data.city || data.locality || "",
        state: data.principalSubdivisionCode || "",
        zipCode: data.postcode || "",
        label: [data.city, data.principalSubdivisionCode].filter(Boolean).join(", ") || `${lat.toFixed(4)}, ${lon.toFixed(4)}`
      };
      setCached(cacheKey, result);
      return result;
    }catch(error){
      handleError(error, "Reverse Geocoding");
      return { city: "", state: "", zipCode: "", label: `${lat.toFixed(4)}, ${lon.toFixed(4)}` };
    }
  }

  function abbreviateState(state){
    const m = {
      "Alabama": "AL", "Alaska": "AK", "Arizona": "AZ", "Arkansas": "AR", "California": "CA",
      "Colorado": "CO", "Connecticut": "CT", "Delaware": "DE", "Florida": "FL", "Georgia": "GA",
      "Hawaii": "HI", "Idaho": "ID", "Illinois": "IL", "Indiana": "IN", "Iowa": "IA",
      "Kansas": "KS", "Kentucky": "KY", "Louisiana": "LA", "Maine": "ME", "Maryland": "MD",
      "Massachusetts": "MA", "Michigan": "MI", "Minnesota": "MN", "Mississippi": "MS", "Missouri": "MO",
      "Montana": "MT", "Nebraska": "NE", "Nevada": "NV", "New Hampshire": "NH", "New Jersey": "NJ",
      "New Mexico": "NM", "New York": "NY", "North Carolina": "NC", "North Dakota": "ND", "Ohio": "OH",
      "Oklahoma": "OK", "Oregon": "OR", "Pennsylvania": "PA", "Rhode Island": "RI", "South Carolina": "SC",
      "South Dakota": "SD", "Tennessee": "TN", "Texas": "TX", "Utah": "UT", "Vermont": "VT",
      "Virginia": "VA", "Washington": "WA", "West Virginia": "WV", "Wisconsin": "WI", "Wyoming": "WY",
      "District of Columbia": "DC", "Puerto Rico": "PR", "U.S. Virgin Islands": "VI", "American Samoa": "AS",
      "Guam": "GU", "Northern Mariana Islands": "MP"
    };
    return m[state] || state;
  }

  function hasValidDeviceCoords(cfg){
    return cfg?.useDeviceLocation &&
           Number.isFinite(Number(cfg.deviceLat)) &&
           Number.isFinite(Number(cfg.deviceLon)) &&
           cfg.deviceLocationLabel;
  }

  function shouldAutoDetectLocation(cfg){
    return cfg?.autoDetectLocation !== false;
  }

  function saveGeoPref(pref){
    try{
      localStorage.setItem("jas_geo_pref", JSON.stringify(pref));
    }catch{}
  }

  async function resolvePreferredLocation(options = {}){
    const sourceCfg = options?.cfg || loadConfig();
    const forcePrompt = options?.forcePrompt === true;
    const autoDetect = options?.autoDetect === true;
    const useSavedDevice = options?.useSavedDevice !== false;

    if(useSavedDevice && hasValidDeviceCoords(sourceCfg)){
      const lat = Number(sourceCfg.deviceLat);
      const lon = Number(sourceCfg.deviceLon);
      let label = String(sourceCfg.deviceLocationLabel || "").trim();
      let city = "";
      let state = "";

      // If label is just coordinates, try to refresh it with reverse geocoding
      if(!label || /^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(label)){
        console.log("[geo] Refreshing coordinate label for saved device location");
        try{
          const rev = await reverseGeocodeCoords(lat, lon);
          if(rev?.label){
            label = rev.label;
            city = rev.city || "";
            state = rev.state || "";
            // Update saved label for next time
            saveConfig({ ...sourceCfg, deviceLocationLabel: label });
          }
        }catch(e){
          console.log("[geo] Failed to refresh label:", e.message);
        }
      }else{
        // Try to get city/state from reverse geocoding for display
        try{
          const rev = await reverseGeocodeCoords(lat, lon);
          city = rev?.city || "";
          state = rev?.state || "";
        }catch(e){
          console.log("[geo] Failed to get city/state:", e.message);
        }
      }

      label = label || `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
      return { lat, lon, city, state, label, source: "device-saved" };
    }

    const shouldPrompt = forcePrompt || (autoDetect && shouldAutoDetectLocation(sourceCfg));
    if(shouldPrompt){
      if(!resolvePreferredLocation._inFlightPrompt){
        resolvePreferredLocation._inFlightPrompt = (async () => {
          try{
            const pos = await getCurrentPositionAsync(options);
            const lat = Number(pos?.coords?.latitude);
            const lon = Number(pos?.coords?.longitude);
            if(Number.isFinite(lat) && Number.isFinite(lon)){
              const rev = await reverseGeocodeCoords(lat, lon);
              const weather = await fetchCurrentWeather(lat, lon);
              const nextCfg = {
                ...sourceCfg,
                useDeviceLocation: true,
                deviceLat: lat,
                deviceLon: lon,
                deviceLocationLabel: rev?.label || `${lat.toFixed(4)}, ${lon.toFixed(4)}`,
                timezone: weather?.timezone || sourceCfg?.timezone || DEFAULTS.timezone,
                _geoLocatedAt: Date.now()
              };
              if(rev?.zipCode) nextCfg.zipCode = rev.zipCode;

              saveConfig(nextCfg);
              saveGeoPref({ attempted: true, granted: true, updatedAt: Date.now() });

              return {
                lat,
                lon,
                city: rev?.city || "",
                state: rev?.state || "",
                zipCode: rev?.zipCode || "",
                label: nextCfg.deviceLocationLabel,
                source: "device-live"
              };
            }
            return null;
          }catch(error){
            saveGeoPref({
              attempted: true,
              granted: false,
              updatedAt: Date.now(),
              reason: error?.message || "denied"
            });
            return null;
          }
        })().finally(() => {
          resolvePreferredLocation._inFlightPrompt = null;
        });
      }

      const detected = await resolvePreferredLocation._inFlightPrompt;
      if(detected) return detected;
    }

    const zip = String(sourceCfg?.zipCode || "").trim();
    if(/^\d{5}$/.test(zip)){
      const byZip = await geocodeZip(zip);
      return {
        lat: byZip.lat,
        lon: byZip.lon,
        city: byZip.city,
        state: byZip.state,
        zipCode: zip,
        label: `${byZip.city}, ${abbreviateState(byZip.state)}`,
        source: "zip"
      };
    }
    return null;
  }

  async function syncTimezoneFromZip(cfg){
    try{
      const zip = String(cfg?.zipCode || "").trim();
      if(!/^\d{5}$/.test(zip)) return cfg;

      // If we've already resolved a timezone for this ZIP, reuse it.
      if(cfg?._zipTz === zip && cfg.timezone) return cfg;

      const loc = await geocodeZip(zip);
      const wx = await fetchCurrentWeather(loc.lat, loc.lon);
      const tz = wx?.timezone;

      if(tz && tz !== cfg.timezone){
        return saveConfig({ ...cfg, timezone: tz, _zipTz: zip });
      }
      if(tz && tz === cfg.timezone && cfg?._zipTz !== zip){
        return saveConfig({ ...cfg, _zipTz: zip });
      }
      // If we can't resolve a timezone, keep whatever is set; otherwise default.
      if(!cfg.timezone) return saveConfig({ ...cfg, timezone: DEFAULTS.timezone });
      return cfg;
    }catch{
      return cfg; // best-effort only
    }
  }

  async function fetchCurrentWeather(lat, lon){
    const cacheKey = `weather:${lat}:${lon}`;
    const cached = getCached(cacheKey);
    if(cached) return cached;

    try{
      const url =
        `https://api.open-meteo.com/v1/forecast` +
        `?latitude=${lat}&longitude=${lon}` +
        `&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m,relative_humidity_2m` +
        `&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto`;

      const res = await fetch(url, { cache:"no-store" });
      if(!res.ok) throw new Error("Weather API failed");
      const data = await res.json();
      const result = {
        temp: data.current?.temperature_2m,
        feels: data.current?.apparent_temperature,
        code: data.current?.weather_code,
        wind: data.current?.wind_speed_10m,
        windGust: data.current?.wind_gusts_10m,
        windDirection: data.current?.wind_direction_10m,
        humidity: data.current?.relative_humidity_2m,
        timezone: data.timezone
      };
      // Cache for 5 minutes
      setCached(cacheKey, result);
      return result;
    }catch(error){
      handleError(error, "Weather Fetch");
      return null;
    }
  }

  async function fetchAndDisplayWeather(_cfg){
    try{
      // Always read the latest cfg so stale references after saveConfig don't break this
      const cfg = window.App?.cfg || loadConfig();
      console.log("[topbar] fetchAndDisplayWeather start", cfg);
      const loc = await resolvePreferredLocation({
        cfg,
        autoDetect: false
      });
      if(!loc || !Number.isFinite(Number(loc.lat)) || !Number.isFinite(Number(loc.lon))){
        console.warn("[topbar] fetchAndDisplayWeather: unable to resolve location");
        const weatherEl = document.getElementById("topWeather");
        if(weatherEl){
          weatherEl.innerHTML = `
            <a href="settings.html#weather" class="topWeatherSetLoc" aria-label="Set location for weather">
              <span class="topWeatherSetLocIcon">📍</span>
              <span class="topWeatherSetLocText">Set location</span>
            </a>
          `;
        }
        return;
      }

      const url =
        `https://api.open-meteo.com/v1/forecast` +
        `?latitude=${Number(loc.lat)}&longitude=${Number(loc.lon)}` +
        `&current=temperature_2m,weather_code,temperature_2m_min,temperature_2m_max` +
        `&daily=temperature_2m_max,temperature_2m_min` +
        `&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto`;

      const res = await fetch(url, { cache:"no-store" });
      if(!res.ok) return;

      const data = await res.json();
      const current = data.current || {};
      const daily = (data.daily?.temperature_2m_max || [])[0];
      const dailyMin = (data.daily?.temperature_2m_min || [])[0];

      const weatherEl = document.getElementById("topWeather");
      if(!weatherEl) return;

      const temp = current.temperature_2m;
      const code = current.weather_code;
      const icon = getWeatherIcon(code);
      const hi = daily;
      const lo = dailyMin;

      const tempTxt = Number.isFinite(temp) ? `${Math.round(temp)}°` : "--";
      const hiTxt = Number.isFinite(hi) ? `${Math.round(hi)}` : "--";
      const loTxt = Number.isFinite(lo) ? `${Math.round(lo)}` : "--";

      weatherEl.innerHTML = `
        <div class="weatherIcon">${icon}</div>
        <div class="weatherInfo">
          <div class="weatherTemp">${tempTxt}</div>
          <div class="weatherRange">L: ${loTxt} H: ${hiTxt}</div>
          <div class="weatherLoc">${escapeHtml(loc.city || loc.label || "Current")}</div>
        </div>
      `;
    }catch{/* best-effort only */}
  }

  // Weather utilities
  function wmoDesc(code){
    const m = {
      0:"Clear", 1:"Mostly clear", 2:"Partly cloudy", 3:"Overcast",
      45:"Fog", 48:"Rime fog",
      51:"Light drizzle", 53:"Drizzle", 55:"Heavy drizzle",
      61:"Light rain", 63:"Rain", 65:"Heavy rain",
      71:"Light snow", 73:"Snow", 75:"Heavy snow",
      80:"Rain showers", 81:"Showers", 82:"Violent showers",
      95:"Thunderstorm"
    };
    return m[code] || `Code ${code}`;
  }

  function getWeatherIcon(code){
    // Simple emoji-based icons
    if(code === 0 || code === 1) return "☀️";
    if(code === 2) return "⛅";
    if(code === 3 || code === 45 || code === 48) return "☁️";
    if(code >= 51 && code <= 55) return "🌦️";
    if(code >= 61 && code <= 65) return "🌧️";
    if(code >= 71 && code <= 75) return "❄️";
    if(code >= 80 && code <= 82) return "🌦️";
    if(code === 95) return "⛈️";
    return "🌤️";
  }

  // Timezone utilities
  const TIMEZONES = [
    { value: "America/New_York", label: "Eastern (ET)", offset: -5 },
    { value: "America/Chicago", label: "Central (CT)", offset: -6 },
    { value: "America/Denver", label: "Mountain (MT)", offset: -7 },
    { value: "America/Los_Angeles", label: "Pacific (PT)", offset: -8 },
    { value: "America/Anchorage", label: "Alaska (AKT)", offset: -9 },
    { value: "Pacific/Honolulu", label: "Hawaii (HST)", offset: -10 },
    { value: "Europe/London", label: "London (GMT)", offset: 0 },
    { value: "Europe/Paris", label: "Paris (CET)", offset: 1 },
    { value: "Asia/Tokyo", label: "Tokyo (JST)", offset: 9 },
    { value: "Asia/Shanghai", label: "Shanghai (CST)", offset: 8 },
    { value: "Australia/Sydney", label: "Sydney (AEDT)", offset: 11 },
    { value: "UTC", label: "UTC", offset: 0 }
  ];

  function formatTime(date, timezone){
    try{
      return new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
        hour12: true
      }).format(date);
    }catch{
      return date.toLocaleTimeString();
    }
  }

  function formatDate(date, timezone){
    try{
      return new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        weekday: "short",
        month: "short",
        day: "numeric"
      }).format(date);
    }catch{
      return date.toLocaleDateString();
    }
  }

  function getTimezoneLabel(timezone){
    const tz = TIMEZONES.find(t => t.value === timezone);
    return tz ? tz.label : timezone.split("/").pop();
  }

  function getTimezoneAbbrev(timezone){
    const full = getTimezoneLabel(timezone);       // e.g. "Eastern (ET)"
    const m = /\(([^)]+)\)/.exec(full);
    return m ? m[1] : full;                         // => "ET"
  }

  Object.assign(App, {
    geocodeZip,
    getCurrentPositionAsync,
    reverseGeocodeCoords,
    abbreviateState,
    resolvePreferredLocation,
    syncTimezoneFromZip,
    fetchCurrentWeather,
    fetchAndDisplayWeather,
    wmoDesc,
    getWeatherIcon,
    TIMEZONES,
    formatTime,
    formatDate,
    getTimezoneLabel,
    getTimezoneAbbrev
  });
})();