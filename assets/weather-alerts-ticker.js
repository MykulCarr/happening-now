// Weather page: the scrolling weather-alerts ticker under the header, and the
// pop-up that shows an alert's details on hover or tap.
// Split out of weather.js on 2026-11-17; loaded just before it.
(() => {
  "use strict";
  const S = (window.App.weatherPage ||= {});
  // From the main script, looked up when called (it loads after this file).
  const { escapeHtml } = window.App;


  let topAlertsTickerState = null;
  let topAlertsHoverController = null;
  let topAlertsHoverTimeout = null;
  let topAlertsCloseTimeout = null;
  let topAlertsPopup = null;
  function destroyTopAlertsTicker(){
    if(!topAlertsTickerState) return;
    if(topAlertsTickerState.resumeTimer){
      window.clearTimeout(topAlertsTickerState.resumeTimer);
    }
    if(topAlertsTickerState.rafId){
      window.cancelAnimationFrame(topAlertsTickerState.rafId);
    }
    if(topAlertsTickerState.abortController){
      topAlertsTickerState.abortController.abort();
    }
    topAlertsTickerState = null;
  }

  function clearTopAlertsPopup(){
    if(topAlertsPopup){
      topAlertsPopup.remove();
      topAlertsPopup = null;
    }
  }

  function clearTopAlertsTimers(){
    if(topAlertsHoverTimeout){
      window.clearTimeout(topAlertsHoverTimeout);
      topAlertsHoverTimeout = null;
    }
    if(topAlertsCloseTimeout){
      window.clearTimeout(topAlertsCloseTimeout);
      topAlertsCloseTimeout = null;
    }
  }

  function destroyTopAlertsHover(){
    clearTopAlertsTimers();
    clearTopAlertsPopup();
    if(topAlertsHoverController){
      topAlertsHoverController.abort();
      topAlertsHoverController = null;
    }
  }

  function setupTopAlertsTicker(topBar){
    destroyTopAlertsTicker();

    const viewport = topBar.querySelector(".alertsTickerViewport");
    const track = topBar.querySelector(".alertsTickerTrack");
    const firstGroup = topBar.querySelector(".alertsTickerGroup");
    if(!viewport || !track || !firstGroup) return;

    const abortController = new AbortController();
    const speedPxPerSecond = 22;
    const gap = Number.parseFloat(window.getComputedStyle(track).columnGap || window.getComputedStyle(track).gap || "0") || 0;

    let cycleWidth = 0;
    let paused = false;
    let dragging = false;
    let activePointerId = null;
    let lastPointerX = 0;
    let dragDistancePx = 0;
    let pointerDownUrl = "";
    let offsetPx = 0;
    const hoverPauseGraceMs = 1200;
    let hoverPauseReadyAt = 0;
    let lastFrameTs = 0;
    let lastMeasureTs = 0;
    let rafId = 0;
    let resumeTimer = 0;

    function measure(resetPosition = false){
      cycleWidth = firstGroup.getBoundingClientRect().width + gap;
      if(resetPosition && cycleWidth > 0){
        offsetPx = 0;
        applyTrackTransform();
      }
    }

    function applyTrackTransform(){
      track.style.transform = `translate3d(${-offsetPx}px, 0, 0)`;
    }

    function normalizeScroll(){
      if(cycleWidth <= 0) return;
      while(offsetPx >= cycleWidth){
        offsetPx -= cycleWidth;
      }
      while(offsetPx < 0){
        offsetPx += cycleWidth;
      }
    }

    function clearResumeTimer(){
      if(resumeTimer){
        window.clearTimeout(resumeTimer);
        resumeTimer = 0;
      }
    }

    function queueAutoResume(delayMs = 600){
      clearResumeTimer();
      resumeTimer = window.setTimeout(() => {
        paused = false;
      }, delayMs);
    }

    function tick(timestamp){
      if(!lastFrameTs) lastFrameTs = timestamp;
      const dt = (timestamp - lastFrameTs) / 1000;
      lastFrameTs = timestamp;
      const hoverPaused = timestamp >= hoverPauseReadyAt && viewport.matches(":hover") && !dragging;

      if(paused && !dragging && !hoverPaused && !resumeTimer){
        paused = false;
      }

      if(cycleWidth <= 0){
        if(!lastMeasureTs || (timestamp - lastMeasureTs) >= 250){
          lastMeasureTs = timestamp;
          measure(false);
          if(cycleWidth > 0){
            normalizeScroll();
            applyTrackTransform();
          }
        }
      } else if(!paused && !dragging && !hoverPaused){
        offsetPx += speedPxPerSecond * dt;
        normalizeScroll();
        applyTrackTransform();
      }

      rafId = window.requestAnimationFrame(tick);
      if(topAlertsTickerState){
        topAlertsTickerState.rafId = rafId;
        topAlertsTickerState.resumeTimer = resumeTimer;
      }
    }

    measure(true);
    hoverPauseReadyAt = (window.performance?.now?.() || 0) + hoverPauseGraceMs;
    window.requestAnimationFrame(() => {
      measure(false);
      if(cycleWidth > 0){
        normalizeScroll();
        applyTrackTransform();
      }
    });
    if(document.fonts && document.fonts.ready){
      document.fonts.ready.then(() => {
        measure(false);
        if(cycleWidth > 0){
          normalizeScroll();
          applyTrackTransform();
        }
      }).catch(() => {});
    }

    viewport.addEventListener("pointerdown", (event) => {
      if(event.pointerType === "mouse" && event.button !== 0) return;
      if(activePointerId !== null) return;
      event.preventDefault();
      if(cycleWidth <= 0) measure(false);
      clearResumeTimer();
      dragging = true;
      paused = true;
      activePointerId = event.pointerId;
      lastPointerX = event.clientX;
      dragDistancePx = 0;
      pointerDownUrl = event.target?.closest(".alertItem[data-alert-url]")?.dataset?.alertUrl || "";
      viewport.classList.add("isDragging");
      viewport.setPointerCapture(event.pointerId);
    }, { signal: abortController.signal });

    viewport.addEventListener("pointermove", (event) => {
      if(!dragging || event.pointerId !== activePointerId) return;
      event.preventDefault();
      const dx = event.clientX - lastPointerX;
      lastPointerX = event.clientX;
      dragDistancePx += Math.abs(dx);
      offsetPx -= dx;
      normalizeScroll();
      applyTrackTransform();
    }, { signal: abortController.signal });

    function endDrag(event){
      if(!dragging || event.pointerId !== activePointerId) return;
      const shouldOpenLink = event.type === "pointerup" && dragDistancePx < 8 && pointerDownUrl;
      dragging = false;
      activePointerId = null;
      viewport.classList.remove("isDragging");
      if(viewport.hasPointerCapture(event.pointerId)){
        viewport.releasePointerCapture(event.pointerId);
      }
      dragDistancePx = 0;
      if(shouldOpenLink){
        window.open(pointerDownUrl, "_blank", "noopener,noreferrer");
      }
      pointerDownUrl = "";
      queueAutoResume(350);
      hoverPauseReadyAt = (window.performance?.now?.() || 0) + hoverPauseGraceMs;
    }

    viewport.addEventListener("pointerup", endDrag, { signal: abortController.signal });
    viewport.addEventListener("pointercancel", endDrag, { signal: abortController.signal });
    viewport.addEventListener("lostpointercapture", endDrag, { signal: abortController.signal });
    viewport.addEventListener("dragstart", (event) => {
      event.preventDefault();
    }, { signal: abortController.signal });

    viewport.addEventListener("wheel", (event) => {
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      if(!delta) return;
      event.preventDefault();
      clearResumeTimer();
      paused = true;
      offsetPx += delta;
      normalizeScroll();
      applyTrackTransform();
      queueAutoResume(700);
    }, { passive:false, signal: abortController.signal });

    window.addEventListener("resize", () => {
      measure(false);
      if(cycleWidth > 0){
        normalizeScroll();
        applyTrackTransform();
      }
    }, { signal: abortController.signal });

    rafId = window.requestAnimationFrame(tick);
    topAlertsTickerState = {
      abortController,
      rafId,
      resumeTimer
    };
  }

  function setupTopAlertsHover(topBar, allTickerAlerts){
    destroyTopAlertsHover();
    const controller = new AbortController();
    topAlertsHoverController = controller;

    const clearCloseTimeout = () => {
      if(topAlertsCloseTimeout){
        window.clearTimeout(topAlertsCloseTimeout);
        topAlertsCloseTimeout = null;
      }
    };

    const schedulePopupClose = (delayMs=500) => {
      clearCloseTimeout();
      if(!topAlertsPopup) return;
      topAlertsCloseTimeout = window.setTimeout(() => {
        if(topAlertsPopup && !topAlertsPopup.matches(":hover")){
          clearTopAlertsPopup();
        }
      }, delayMs);
    };

    topBar.addEventListener("mousemove", (e) => {
      const viewport = topBar.querySelector(".alertsTickerViewport");
      if(viewport?.classList.contains("isDragging")) return;

      const alertItem = e.target.closest(".alertItem");
      if(!alertItem){
        if(topAlertsHoverTimeout){
          window.clearTimeout(topAlertsHoverTimeout);
          topAlertsHoverTimeout = null;
        }
        schedulePopupClose(400);
        return;
      }

      const idx = parseInt(alertItem.dataset.alertIdx, 10);
      const alert = allTickerAlerts[idx];
      if(!alert) return;

      if(topAlertsHoverTimeout){
        window.clearTimeout(topAlertsHoverTimeout);
      }
      clearCloseTimeout();

      topAlertsHoverTimeout = window.setTimeout(() => {
        clearTopAlertsPopup();

        const popup = document.createElement("div");
        popup.className = "alertHoverPopup";
        const apiUrl = alert.apiUrl || "";
        const webUrl = alert.webUrl || "";
        const hasAlertUrl = Boolean(apiUrl || webUrl);
        const linkUrl = hasAlertUrl
          ? (webUrl || apiUrl)
          : `https://news.google.com/search?q=${encodeURIComponent(alert.title)}`;
        const linkText = hasAlertUrl ? "Open Alert Details →" : "Read News Coverage →";

        popup.innerHTML = `
          <div class="popupTitle">${alert.isLocal ? '<span class="localAlertBadge">LOCAL</span> ' : ''}${escapeHtml(alert.title)}</div>
          <div class="popupMeta">
            ${alert.severity ? escapeHtml(alert.severity) + " • " : ""}
            ${alert.area ? escapeHtml(alert.area) : ""}
          </div>
          <div class="popupDesc">${escapeHtml(alert.desc || "No additional details available.")}</div>
          <a href="${linkUrl}" target="_blank" rel="noopener noreferrer" class="popupLink">${linkText}</a>
        `;

        popup.style.left = Math.min(e.clientX + 12, window.innerWidth - 420) + "px";
        popup.style.top = Math.min(e.clientY + 12, window.innerHeight - 300) + "px";

        document.body.appendChild(popup);
        topAlertsPopup = popup;

        popup.addEventListener("mouseenter", () => {
          clearCloseTimeout();
        }, { signal: controller.signal });

        popup.addEventListener("mouseleave", () => {
          schedulePopupClose(400);
        }, { signal: controller.signal });
      }, 1500);
    }, { signal: controller.signal });

    topBar.addEventListener("mouseleave", () => {
      if(topAlertsHoverTimeout){
        window.clearTimeout(topAlertsHoverTimeout);
        topAlertsHoverTimeout = null;
      }
      schedulePopupClose(400);
    }, { signal: controller.signal });

    topBar.addEventListener("mouseenter", () => {
      clearCloseTimeout();
    }, { signal: controller.signal });
  }


  Object.assign(S, { destroyTopAlertsHover, destroyTopAlertsTicker, setupTopAlertsHover, setupTopAlertsTicker });
})();
