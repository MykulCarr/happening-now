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

  const pageVis = cfg.pageVisibility || { news: true, weather: true, stocks: true, astrolab: true };

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
      navLinkHtml('astrolab', 'AstroLab.html', 'ASTROLAB') +
      '<a href="settings.html" class="hn-nav-link hn-settings-link" title="Settings" aria-label="Settings">⚙️</a>';
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
          <div class="hn-actions" id="hnActions">
            <div class="hn-slot" id="hnSlot1"></div>
            <div class="hn-slot" id="hnSlot2"></div>
          </div>
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
    for (const key of ['news', 'weather', 'stocks', 'astrolab']) {
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


  // (Search UI moved into the info bar)

  // Allow pages to insert into the two action slots via IDs
  // e.g., page scripts can find #hnSlot1 and append buttons

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
        <p class="hnWelcomeSub">Your personal dashboard for news, weather, stocks, and the night sky. Set your location to see a live weather summary everywhere in the app.</p>

        <div class="hnWelcomeLocRow">
          <input id="hnWelcomeZip" class="input hnWelcomeZipInput" type="text"
            inputmode="numeric" maxlength="5" placeholder="Enter your ZIP code"
            aria-label="ZIP code" />
          <button id="hnWelcomeVerifyBtn" class="btn hnWelcomeVerifyBtn" type="button">Verify</button>
        </div>
        <div id="hnWelcomeLocStatus" class="hnWelcomeLocStatus" aria-live="polite"></div>

        <div class="hnWelcomeActions">
          <button id="hnWelcomeSaveBtn" class="btn hnWelcomeSaveBtn" type="button" disabled>Save &amp; Get Started</button>
          <button id="hnWelcomeSkipBtn" class="btn hnWelcomeSkipBtn" type="button">Skip for now</button>
        </div>
        <p class="hnWelcomeSettingHint">You can always update your location in <a href="settings.html">Settings</a>.</p>
      </div>
    `;

    document.body.appendChild(overlay);

    const zipInput    = overlay.querySelector("#hnWelcomeZip");
    const verifyBtn   = overlay.querySelector("#hnWelcomeVerifyBtn");
    const statusEl    = overlay.querySelector("#hnWelcomeLocStatus");
    const saveBtn     = overlay.querySelector("#hnWelcomeSaveBtn");
    const skipBtn     = overlay.querySelector("#hnWelcomeSkipBtn");

    let resolvedZip   = "";
    let resolvedLabel = "";

    function setStatus(msg, type = "default") {
      statusEl.textContent = msg;
      statusEl.className = "hnWelcomeLocStatus hnWelcomeLocStatus--" + type;
    }

    async function doVerify() {
      const zip = zipInput.value.trim();
      if (!/^\d{5}$/.test(zip)) {
        setStatus("Please enter a 5-digit US ZIP code.", "error");
        saveBtn.disabled = true;
        return;
      }
      verifyBtn.disabled = true;
      setStatus("Looking up…", "loading");
      try {
        const geo = await window.App.geocodeZip(zip);
        if (geo?.city) {
          resolvedZip   = zip;
          resolvedLabel = `${geo.city}, ${geo.state}`;
          setStatus(`✓ Found: ${resolvedLabel}`, "success");
          saveBtn.disabled = false;
        } else {
          setStatus("ZIP not found. Double-check and try again.", "error");
          saveBtn.disabled = true;
        }
      } catch {
        setStatus("Lookup failed. Check your connection and try again.", "error");
        saveBtn.disabled = true;
      } finally {
        verifyBtn.disabled = false;
      }
    }

    verifyBtn.addEventListener("click", doVerify);
    zipInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); doVerify(); } });

    // Clear resolved result if user edits the input after a successful verify
    zipInput.addEventListener("input", () => {
      resolvedZip = "";
      saveBtn.disabled = true;
      statusEl.textContent = "";
    });

    function closeModal() {
      overlay.remove();
    }

    saveBtn.addEventListener("click", () => {
      if (!resolvedZip) return;
      try {
        const { loadConfig, saveConfig, syncTimezoneFromZip } = window.App;
        const cfg = loadConfig();
        cfg.zipCode = resolvedZip;
        saveConfig(cfg);
        syncTimezoneFromZip?.(cfg);
      } catch (err) {
        console.warn("[welcome] could not save location:", err);
      }
      markWelcomed();
      closeModal();
    });

    skipBtn.addEventListener("click", () => {
      markWelcomed();
      closeModal();
    });

    // Focus the ZIP input after a brief paint delay
    requestAnimationFrame(() => zipInput.focus());
  }

  if (isFirstRun()) {
    // Defer until DOMContentLoaded so document.body is available
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", buildWelcomeModal, { once: true });
    } else {
      buildWelcomeModal();
    }
  }
  // ── End first-run welcome ──────────────────────────────────────────────────

})();
