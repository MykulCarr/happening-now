(() => {
  "use strict";

  const mount = document.getElementById('topbar');
  if (!mount) return;

  // Get config for page visibility
  const cfg = window.App?.cfg || {};

  // Apply theme, density, and font size on page load
  if (window.App?.applyThemeDensity) {
    window.App.applyThemeDensity(cfg);
  }

  const pageVis = cfg.pageVisibility || { news: true, weather: true, stocks: true };

  // The deploy bundle injects the static topbar HTML into <header id="topbar">
  // (see scripts/stage-public-assets.ps1 + scripts/topbar-template.html) so the
  // topbar paints in its final form on first navigation, eliminating the flash
  // we used to see while this script was still building it post-load.
  // If the static HTML isn't already present (dev / pre-stage runs), build it.
  mount.classList.add('hn-topbar');
  if (!mount.querySelector('.hn-inner')) {
    const navLinkHtml = (key, href, label) =>
      pageVis[key] !== false
        ? `<a href="${href}" class="hn-nav-link" data-nav-key="${key}">${label}</a>`
        : '';
    const navHtml =
      navLinkHtml('news', 'index.html', 'NEWS') +
      navLinkHtml('weather', 'weather.html', 'WEATHER') +
      navLinkHtml('stocks', 'stocks.html', 'STOCKS') +
      '<a href="settings.html" class="hn-nav-link hn-settings-link" title="Settings" aria-label="Settings">⚙️</a>' +
      '<button type="button" class="hn-nav-link hn-nav-action hn-location-nav-btn" aria-label="Change location"><span class="hn-nav-action-icon" aria-hidden="true">📍</span> LOCATION</button>';
    mount.innerHTML = `
      <div class="hn-inner">
        <div class="hn-rowTop">
          <button class="hn-hamburger" id="hnMenuToggle" aria-label="Menu" aria-expanded="false">
            <span></span>
            <span></span>
            <span></span>
          </button>
          <a href="index.html" class="hn-brand" id="hnBrand" aria-label="HAPPENING NOW Home">
            <span class="hn-dot" aria-hidden="true"></span>
            <span class="hn-title">HAPPENING NOW!</span>
          </a>
          <div class="hn-nav-section" id="hnNavDesktop">${navHtml}</div>
          <div class="hn-time-section" id="hnTimeSection" aria-live="polite"></div>
          <div class="hn-host-search" id="hnSearchHost"></div>
          <div class="hn-host-weather" id="hnWeatherHost"></div>
        </div>
        <nav class="hn-mobile-menu" id="hnMobileMenu" aria-hidden="true">
          <div class="hn-mobile-nav" id="hnNavMobile">${navHtml}</div>
        </nav>
      </div>
    `;
  } else {
    // Static topbar already present — hide any nav links the user has disabled
    // via cfg.pageVisibility. (When we built the markup ourselves above, we
    // emitted only the visible links, so this only runs on the staged path.)
    for (const key of ['news', 'weather', 'stocks']) {
      if (pageVis[key] === false) {
        mount.querySelectorAll(`.hn-nav-link[data-nav-key="${key}"]`).forEach(a => {
          a.style.display = 'none';
        });
      }
    }
  }

  const root = mount;

  function normalizePageFromPath(pathname) {
    // Extract filename from pathname, handle edge cases
    let filename = (pathname.split('/').pop() || '').trim();
    if (!filename || filename === '') {
      // Root path defaults to index
      return 'index';
    }
    // Remove .html extension and convert to lowercase
    return filename.replace(/\.html$/i, '').toLowerCase();
  }

  function syncTopbarSectionSpacing() {
    const row = root.querySelector('.hn-rowTop');
    if (!row) return;

    // Mobile layout uses separate rules and should not use desktop spacing math.
    if (window.matchMedia('(max-width: 760px)').matches) {
      root.style.removeProperty('--hn-separator-pad');
      return;
    }

    const sections = [
      row.querySelector('.hn-brand'),
      row.querySelector('.hn-nav-section'),
      row.querySelector('.hn-time-section'),
      row.querySelector('.hn-host-search'),
      row.querySelector('.hn-host-weather')
    ].filter(Boolean);

    if (!sections.length) return;

    const totalContentWidth = sections.reduce((sum, el) => {
      const rect = el.getBoundingClientRect();
      const cs = window.getComputedStyle(el);
      const padL = Number.parseFloat(cs.paddingLeft) || 0;
      const padR = Number.parseFloat(cs.paddingRight) || 0;
      return sum + Math.max(0, rect.width - padL - padR);
    }, 0);

    const rowWidth = row.getBoundingClientRect().width;
    const dividerCount = 4;
    const dividerWidth = dividerCount;

    // Padding model: brand/nav/time/search each have left+right p; weather has left p and right 0.
    const paddingSlots = 9;
    const available = rowWidth - totalContentWidth - dividerWidth;
    const computedPad = paddingSlots > 0 ? (available / paddingSlots) : 0;
    const finalPad = Math.max(0, computedPad);

    root.style.setProperty('--hn-separator-pad', `${finalPad.toFixed(2)}px`);
  }

  function setActiveNav(pathname = window.location.pathname) {
    const currentPage = normalizePageFromPath(pathname);
    
    // Find all nav links (regular ones)
    const navLinksLocal = mount.querySelectorAll('.hn-nav-link:not(.hn-settings-link)');
    navLinksLocal.forEach(link => {
      const href = (link.getAttribute('href') || '').trim().toLowerCase();
      const normalizedHref = href.replace(/\.html$/i, '');
      
      // Match if normalized values are equal OR both resolve to index
      const isActive = normalizedHref === currentPage || 
                       (normalizedHref === 'index' && (currentPage === 'index' || currentPage === ''));
      
      link.classList.toggle('active', isActive);
    });

    // Handle settings link separately
    const settingsLinkLocal = mount.querySelector('.hn-settings-link');
    if (settingsLinkLocal) {
      const isSettingsActive = currentPage === 'settings';
      settingsLinkLocal.classList.toggle('active', isSettingsActive);
    }
  }

  // Mobile menu functionality
  function setupMobileMenu() {
    const hamburger = document.getElementById('hnMenuToggle');
    const mobileMenu = document.getElementById('hnMobileMenu');
    const mobileNavLinks = mobileMenu.querySelectorAll('.hn-nav-link');

    if (!hamburger) return;

    function toggleMenu() {
      const isOpen = hamburger.getAttribute('aria-expanded') === 'true';
      hamburger.setAttribute('aria-expanded', !isOpen);
      mobileMenu.setAttribute('aria-hidden', isOpen);
      mobileMenu.classList.toggle('open');
    }

    hamburger.addEventListener('click', toggleMenu);

    // Close menu when a nav link is clicked
    mobileNavLinks.forEach(link => {
      link.addEventListener('click', () => {
        hamburger.setAttribute('aria-expanded', 'false');
        mobileMenu.setAttribute('aria-hidden', 'true');
        mobileMenu.classList.remove('open');
      });
    });

    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
      if (!mount.contains(e.target)) {
        hamburger.setAttribute('aria-expanded', 'false');
        mobileMenu.setAttribute('aria-hidden', 'true');
        mobileMenu.classList.remove('open');
      }
    });
  }

  // Initialize mobile menu
  setupMobileMenu();
  setActiveNav();

  // Click on brand: always navigate to the news page.
  const brand = document.getElementById('hnBrand');
  brand.addEventListener('click', (e) => {
    e.preventDefault();
    window.location.href = 'index.html';
  });

  // Topbar Location button — wired here once (not per-page) so all pages
  // share the same affordance. The picker dispatches hn:locationchange on
  // apply; pages already listen to that event and re-render, so no onApply
  // hook is needed. Class selector covers both desktop + mobile nav copies.
  mount.querySelectorAll('.hn-location-nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      window.App?.openLocationPicker?.();
    });
  });

  // (Search UI moved into the info bar)

  // Expose a small API on window.App if available
  try {
    if (window.App) window.App.TopBar = { mount: root };
  } catch (err) { /* ignore */ }

  // ── First-run welcome ──────────────────────────────────────────────────────
  // Show once when the user has no saved config (brand-new visitor).
  // A separate flag "jas_welcomed_v1" ensures the modal never re-appears even
  // if the user later clears their location or imports a config.
  const WELCOMED_KEY = "jas_welcomed_v1";
  const CFG_KEY      = "jas_cfg_v3";

  function isFirstRun() {
    try {
      return !localStorage.getItem(CFG_KEY) && !localStorage.getItem(WELCOMED_KEY);
    } catch { return false; }
  }

  function markWelcomed() {
    try { localStorage.setItem(WELCOMED_KEY, "1"); } catch {}
  }

  function buildWelcomeModal() {
    const overlay = document.createElement("div");
    overlay.id = "hnWelcomeModal";
    overlay.className = "hnWelcomeModal";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "hnWelcomeTitle");

    overlay.innerHTML = `
      <div class="hnWelcomeSheet">
        <div class="hnWelcomeHead">
          <div class="hnWelcomeDot" aria-hidden="true"></div>
          <h2 id="hnWelcomeTitle" class="hnWelcomeTitle">Welcome to Happening Now!</h2>
        </div>
        <p class="hnWelcomeSub">Your personal dashboard for news, weather, stocks, and the night sky. Set your location to see a live weather summary everywhere in the app — pick from ZIP code, city name, or GPS.</p>

        <div class="hnWelcomeActions">
          <button id="hnWelcomeSetLocBtn" class="btn primary hnWelcomeSetLocBtn" type="button">📍 Set my location</button>
          <button id="hnWelcomeSkipBtn" class="btn hnWelcomeSkipBtn" type="button">Skip for now</button>
        </div>
        <p class="hnWelcomeSettingHint">You can always update your location in <a href="settings.html">Settings</a>.</p>
      </div>
    `;

    document.body.appendChild(overlay);

    const setLocBtn = overlay.querySelector("#hnWelcomeSetLocBtn");
    const skipBtn   = overlay.querySelector("#hnWelcomeSkipBtn");

    function closeModal() {
      overlay.remove();
    }

    // Delegate to the shared location picker (ZIP / City / GPS tabs). It
    // already handles geocoding, "Save as home", session overrides, and
    // permission UX, so the welcome modal stays a friendly intro instead
    // of duplicating that machinery. #locationPickerModal has a higher
    // z-index than this overlay so it floats above when invoked.
    setLocBtn.addEventListener("click", () => {
      if (typeof window.App?.openLocationPicker !== "function") {
        console.warn("[welcome] openLocationPicker not available");
        return;
      }
      window.App.openLocationPicker({
        onApply: () => {
          markWelcomed();
          closeModal();
        }
      });
    });

    skipBtn.addEventListener("click", () => {
      markWelcomed();
      closeModal();
    });

    requestAnimationFrame(() => setLocBtn.focus());
  }

  // Expose the welcome modal so callers (news page when user clicks Local/
  // Regional, weather page on load) can prompt only when location is
  // actually needed. No longer fires automatically on first visit — the
  // bare landing page (News on National scope) doesn't require location,
  // so prompting then was noise.
  function openWelcomeIfNeeded(){
    if(!isFirstRun()) return false;
    if(document.getElementById("hnWelcomeModal")) return true;
    if(document.readyState === "loading"){
      document.addEventListener("DOMContentLoaded", buildWelcomeModal, { once: true });
    } else {
      buildWelcomeModal();
    }
    return true;
  }
  try {
    if(window.App){
      window.App.openWelcomeIfNeeded = openWelcomeIfNeeded;
      window.App.isFirstRun = isFirstRun;
    }
  } catch {}
  // ── End first-run welcome ──────────────────────────────────────────────────

})();
