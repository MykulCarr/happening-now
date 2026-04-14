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

  // Build navigation links for mobile menu only
  const navParts = [];
  if (pageVis.news !== false) navParts.push('<a href="index.html" class="hn-nav-link">NEWS</a>');
  if (pageVis.weather !== false) navParts.push('<a href="weather.html" class="hn-nav-link">WEATHER</a>');
  if (pageVis.stocks !== false) navParts.push('<a href="stocks.html" class="hn-nav-link">STOCKS</a>');
  if (pageVis.astrolab !== false) navParts.push('<a href="AstroLab.html" class="hn-nav-link">ASTROLAB</a>');
  navParts.push('<a href="settings.html" class="hn-nav-link hn-settings-link" title="Settings" aria-label="Settings">⚙️</a>');
  const mobileNavHtml = navParts.join('·');

  // Create structure
  mount.classList.add('hn-topbar');
  mount.innerHTML = `
    <div class="hn-inner">
      <div class="hn-rowTop">
        <button class="hn-hamburger" id="hnMenuToggle" aria-label="Menu" aria-expanded="false">
          <span></span>
          <span></span>
          <span></span>
        </button>
        
        <!-- Yellow: Brand/Title -->
        <a href="index.html" class="hn-brand" id="hnBrand" aria-label="HAPPENING NOW Home">
          <span class="hn-dot" aria-hidden="true"></span>
          <span class="hn-title">HAPPENING NOW!</span>
        </a>
        
        <!-- Orange: Nav links -->
        <div class="hn-nav-section" id="hnNavDesktop">
          ${mobileNavHtml}
        </div>
        
        <!-- Light Blue: Time/Date -->
        <div class="hn-time-section" id="hnTimeSection" aria-live="polite"></div>
        
        <!-- Green: Search -->
        <div class="hn-host-search" id="hnSearchHost"></div>
        
        <!-- Purple: Weather -->
        <div class="hn-host-weather" id="hnWeatherHost"></div>
        
        <div class="hn-actions" id="hnActions">
          <div class="hn-slot" id="hnSlot1"></div>
          <div class="hn-slot" id="hnSlot2"></div>
        </div>
      </div>
      <nav class="hn-mobile-menu" id="hnMobileMenu" aria-hidden="true">
        <div class="hn-mobile-nav" id="hnNavMobile">
          ${mobileNavHtml}
        </div>
      </nav>
      
    </div>
  `;

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
  syncTopbarSectionSpacing();
  setActiveNav();

  // Click on brand: refresh current page data by reloading this page.
  const brand = document.getElementById('hnBrand');
  brand.addEventListener('click', (e) => {
    e.preventDefault();
    window.location.reload();
  });

  window.addEventListener('resize', syncTopbarSectionSpacing);

  // (Search UI moved into the info bar)

  // Allow pages to insert into the two action slots via IDs
  // e.g., page scripts can find #hnSlot1 and append buttons

  // Expose a small API on window.App if available
  try {
    if (window.App) window.App.TopBar = { mount: root };
  } catch (err) { /* ignore */ }

})();
