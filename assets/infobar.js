(() => {
  "use strict";

  const { cfg, loadConfig, saveConfig, geocodeZip, fetchCurrentWeather, wmoDesc, getWeatherIcon, formatTime, formatDate, getTimezoneLabel, TIMEZONES, escapeHtml, applyThemeDensity } = window.App;

  // Apply theme, density, and font size on page load
  applyThemeDensity(cfg);

  let weatherData = null;
  let timeInterval = null;
  let weatherInterval = null;

  function createTopbarWidgets(){

    // Time display for topbar header (time + date inline)
    const timeDisplay = document.createElement("div");
    timeDisplay.className = "hn-time-display";
    timeDisplay.id = "timeDisplay";
    timeDisplay.innerHTML = `
      <div class="time-value" id="timeDisplayValue">--:-- --</div>
      <div class="time-date" id="timeDisplayDate">--</div>
    `;
    timeDisplay.setAttribute("aria-label", "Current time and date");

    // Weather widget
    const weatherWidget = document.createElement("div");
    weatherWidget.className = "infoBarWidget weatherWidget";
    weatherWidget.id = "weatherWidget";
    weatherWidget.innerHTML = `
      <div class="weatherWidgetIcon" aria-hidden="true">🌤️</div>
      <div class="weatherWidgetContent">
        <div class="weatherWidgetTemp">--°</div>
        <div class="weatherWidgetRange"><span class="weatherLo">--</span>°/<span class="weatherHi">--</span>°</div>
      </div>
      <div class="weatherWidgetDetails">
        <div class="weatherDetail">
          <span class="weatherDetailLabel">Feels</span>
          <span class="weatherDetailValue weatherFeels">--°</span>
        </div>
        <div class="weatherDetail">
          <span class="weatherDetailLabel">Wind</span>
          <span class="weatherDetailValue weatherWind">-- <span class="windArrow">↑</span></span>
        </div>
        <div class="weatherDetail humiditySection">
          <span class="weatherDetailLabel">Humidity</span>
          <div class="humidityBar">
            <div class="humidityFill"></div>
          </div>
        </div>
        <div class="weatherDetail precipSection">
          <span class="weatherDetailLabel">Precip</span>
          <div class="precipBar">
            <div class="precipFill"></div>
          </div>
        </div>
      </div>
    `;
    weatherWidget.setAttribute("aria-label", "Current weather conditions");
    weatherWidget.addEventListener("click", () => {
      window.location.href = "weather.html";
    });
    weatherWidget.setAttribute("role", "button");
    weatherWidget.setAttribute("tabindex", "0");
    weatherWidget.addEventListener("keydown", (e) => {
      if(e.key === "Enter" || e.key === " "){
        e.preventDefault();
        window.location.href = "weather.html";
      }
    });

    // Search area
    const searchWrap = document.createElement('div');
    searchWrap.className = 'hn-inlineSearch';
    searchWrap.innerHTML = `
      <form id="hnSearchForm" class="hn-search" action="#" role="search">
        <input id="hnSearchInput" class="searchBar" type="search" placeholder="Search DuckDuckGo…" aria-label="Search" />
      </form>
    `;

    return { timeDisplay, weatherWidget, searchWrap };
  }

  async function loadWeather(){
    try{
      // Always read fresh config so location changes are picked up immediately
      const liveCfg = window.App?.cfg || loadConfig();
      const zip = liveCfg.zipCode;
      if(!zip || !/^\d{5}$/.test(zip)){
        updateWeatherDisplay({});
        return;
      }
      const geo = await geocodeZip(zip);
      
      // Fetch both current and daily weather data
      const weatherData = {};
      try {
        const current = await fetchCurrentWeather(geo.lat, geo.lon);
        Object.assign(weatherData, current);
      } catch(e) {
        console.error("Error fetching current weather:", e);
      }
      
      // Fetch daily high/low
      try {
        const dailyUrl = `https://api.open-meteo.com/v1/forecast?latitude=${geo.lat}&longitude=${geo.lon}&daily=temperature_2m_max,temperature_2m_min&temperature_unit=fahrenheit`;
        const dailyRes = await fetch(dailyUrl, { cache: "no-store" });
        if(dailyRes.ok) {
          const dailyData = await dailyRes.json();
          weatherData.dailyHi = (dailyData.daily?.temperature_2m_max || [])[0];
          weatherData.dailyLo = (dailyData.daily?.temperature_2m_min || [])[0];
        }
      } catch(e) {
        console.error("Error fetching daily weather:", e);
      }
      
      if(weatherData.temp !== undefined){
        Object.assign(weatherData, { location: `${geo.city}, ${geo.state}` });
        updateWeatherDisplay(weatherData);

        // If the center search exists in the infoBar, wire its form
        const searchForm = document.getElementById('hnSearchForm');
        const searchInput = document.getElementById('hnSearchInput');
        if(searchForm && searchInput){
          searchForm.addEventListener('submit', (ev) => {
            ev.preventDefault();
            const q = searchInput.value.trim();
            if(!q) return;
            const url = `https://duckduckgo.com/?q=${encodeURIComponent(q)}`;
            window.open(url, '_blank', 'noopener,noreferrer');
          });
        }
      }else{
        updateWeatherDisplay({})
      }
    }catch(error){
      console.error("Failed to load weather:", error);
      updateWeatherDisplay(true);
    }
  }

  function updateWeatherDisplay(data=null){
    const widget = document.getElementById("weatherWidget");
    if(!widget) return;

    // If data is true (error flag) or falsy, show error state
    if(!data || data === true){
      widget.querySelector(".weatherWidgetIcon").textContent = "⚠️";
      widget.querySelector(".weatherWidgetTemp").textContent = "--°";
      widget.querySelector(".weatherWidgetRange").textContent = "--°/--°";
      widget.querySelector(".weatherFeels").textContent = "--°";
      widget.querySelector(".weatherWind").textContent = "--";
      const humidityFill = widget.querySelector(".humidityFill");
      if(humidityFill) humidityFill.style.width = "0%";
      const precipFill = widget.querySelector(".precipFill");
      if(precipFill) precipFill.style.width = "0%";
      return;
    }

    weatherData = data;
    const icon = getWeatherIcon(weatherData.code);
    const temp = weatherData.temp != null ? `${Math.round(weatherData.temp)}°` : "--°";
    const hi = weatherData.dailyHi != null ? `${Math.round(weatherData.dailyHi)}` : "--";
    const lo = weatherData.dailyLo != null ? `${Math.round(weatherData.dailyLo)}` : "--";
    const feels = weatherData.feels != null ? `${Math.round(weatherData.feels)}°` : "--°";
    const wind = weatherData.wind != null ? `${Math.round(weatherData.wind)}` : "--";
    const windGust = weatherData.windGust != null ? ` (${Math.round(weatherData.windGust)})` : "";
    const humidity = weatherData.humidity != null ? `${weatherData.humidity}%` : "--";

    widget.querySelector(".weatherWidgetIcon").textContent = icon;
    widget.querySelector(".weatherWidgetTemp").textContent = temp;
    widget.querySelector(".weatherLo").textContent = lo;
    widget.querySelector(".weatherHi").textContent = hi;
    
    // Precipitation
    const precip = weatherData.precip != null ? `${Math.round(weatherData.precip * 100)}%` : "0%";
    const precipFill = widget.querySelector(".precipFill");
    if(precipFill){
      precipFill.style.width = `${Math.min(100, weatherData.precip * 100 || 0)}%`;
    }
    
    // Details
    widget.querySelector(".weatherFeels").textContent = feels;
    widget.querySelector(".weatherWind").textContent = wind + windGust;
    
    // Humidity bar fill
    const humidityFill = widget.querySelector(".humidityFill");
    if(humidityFill){
      humidityFill.style.width = `${Math.min(100, weatherData.humidity || 0)}%`;
    }
    
    // Wind direction arrow
    const windArrow = widget.querySelector(".windArrow");
    if(windArrow && weatherData.windDirection != null){
      windArrow.style.transform = `rotate(${weatherData.windDirection}deg)`;
    }
    
    // Color code based on temperature
    let tempClass = "tempCold";
    if(weatherData.temp != null){
      if(weatherData.temp > 85) tempClass = "tempHot";
      else if(weatherData.temp > 70) tempClass = "tempWarm";
      else if(weatherData.temp > 50) tempClass = "tempMild";
    }
    widget.className = `infoBarWidget weatherWidget ${tempClass}`;
    
    const fullDesc = `Current: ${temp}, H: ${hi}° L: ${lo}°, Feels: ${feels}, Wind: ${wind}${windGust}, Humidity: ${humidity}`;
    widget.setAttribute("aria-label", `Weather: ${fullDesc}`);
  }

  function updateTime(){
    const timeVal = document.getElementById("timeDisplayValue");
    const dateVal = document.getElementById("timeDisplayDate");
    
    if(!timeVal || !dateVal) return;

    const timeSelect = document.getElementById("timezoneSelect");
    const selectedTimezone = timeSelect?.value || cfg.timezone;
    const now = new Date();

    const timeStr = formatTime(now, selectedTimezone);
    const dateStr = formatDate(now, selectedTimezone);

    timeVal.textContent = timeStr;
    dateVal.textContent = dateStr;
  }

  function updateNewsStats(stats){
    // Target the news page status line (statusLine)
    const statusEl = document.getElementById("statusLine");
    if(statusEl && stats){
      statusEl.textContent = stats;
    }
  }

  function init(){
    const { timeDisplay, weatherWidget, searchWrap } = createTopbarWidgets();
    const timeSection = document.getElementById('hnTimeSection');
    const searchHost = document.getElementById('hnSearchHost');
    const weatherHost = document.getElementById('hnWeatherHost');

    if(timeSection) timeSection.appendChild(timeDisplay);
    if(searchHost) searchHost.appendChild(searchWrap);
    if(weatherHost) weatherHost.appendChild(weatherWidget);

    // Load weather
    loadWeather();
    // Wire search form immediately so it's available even if loadWeather is slow
    const searchFormInit = document.getElementById('hnSearchForm');
    const searchInputInit = document.getElementById('hnSearchInput');
    if(searchFormInit && searchInputInit){
      searchFormInit.addEventListener('submit', (ev) => {
        ev.preventDefault();
        const q = searchInputInit.value.trim();
        if(!q) return;
        const url = `https://duckduckgo.com/?q=${encodeURIComponent(q)}`;
        window.open(url, '_blank', 'noopener,noreferrer');
      });
    }
    
    // Update time immediately and then every second
    updateTime();
    timeInterval = setInterval(updateTime, 1000);

    // Refresh weather every 5 minutes
    weatherInterval = setInterval(() => {
      loadWeather();
    }, 5 * 60 * 1000);

    // No timezone dropdown: city display is updated after geocode in loadWeather
  }

  // Cleanup on page unload
  window.addEventListener("beforeunload", () => {
    if(timeInterval) clearInterval(timeInterval);
    if(weatherInterval) clearInterval(weatherInterval);
  });

  // Export function to update stats from news.js
  window.updateNewsStats = updateNewsStats;

  // Expose weather refresh so other pages can trigger a topbar update after a location change
  window.refreshTopbarWeather = loadWeather;

  // Initialize when DOM is ready
  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", init);
  }else{
    init();
  }
})();
