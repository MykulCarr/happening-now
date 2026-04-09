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

  let isNavigating = false;

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
  function removeDynamicPageAssets() {
    document.querySelectorAll('[data-hn-page-head="1"]').forEach(node => node.remove());
    document.querySelectorAll('[data-hn-page-script="1"]').forEach(node => node.remove());
  }

  function markInitialNonCoreHeadAssets() {
    document.head.querySelectorAll('style, link[rel="stylesheet"]').forEach(node => {
      if (node.tagName === 'LINK') {
        const href = node.getAttribute('href') || '';
        if (/assets\/styles\.css(?:\?|$)/i.test(href)) return;
      }
      if (!node.hasAttribute('data-hn-page-head')) {
        node.setAttribute('data-hn-page-head', '1');
      }
    });
  }

  function syncPageHead(doc) {
    removeDynamicPageAssets();

    const headNodes = doc.head.querySelectorAll('style, link[rel="stylesheet"]');
    headNodes.forEach(node => {
      if (node.tagName === 'LINK') {
        const href = node.getAttribute('href') || '';
        if (/assets\/styles\.css(?:\?|$)/i.test(href)) return;
      }

      const clone = node.cloneNode(true);
      clone.setAttribute('data-hn-page-head', '1');
      document.head.appendChild(clone);
    });
  }

  function loadExternalScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.async = false;
      script.setAttribute('data-hn-page-script', '1');
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Failed loading script: ${src}`));
      document.body.appendChild(script);
    });
  }

  function runInlineScript(code) {
    const script = document.createElement('script');
    script.setAttribute('data-hn-page-script', '1');
    script.textContent = `(() => {\n${code}\n})();`;
    document.body.appendChild(script);
  }

  async function runPageScripts(doc) {
    const scripts = doc.querySelectorAll('body script');
    for (const node of scripts) {
      const src = node.getAttribute('src');
      if (src) {
        const abs = new URL(src, window.location.href).href;
        if (/\/assets\/(common|topbar|infobar)\.js(?:\?|$)/i.test(abs)) continue;
        await loadExternalScript(abs);
      } else {
        const code = node.textContent || '';
        if (code.trim()) runInlineScript(code);
      }
    }
  }

  function replaceMainAndFooter(doc) {
    const nextMain = doc.querySelector('main.container');
    const currentMain = document.querySelector('main.container');
    if (!nextMain || !currentMain) return false;

    currentMain.replaceWith(nextMain);

    document.querySelectorAll('.page-footer').forEach(el => el.remove());
    const nextFooter = doc.querySelector('.page-footer');
    if (nextFooter) {
      const main = document.querySelector('main.container');
      if (main) main.insertAdjacentElement('afterend', nextFooter);
    }

    return true;
  }

  async function navigatePartial(targetHref, pushHistory = true) {
    if (isNavigating) return;
    const targetUrl = new URL(targetHref, window.location.href);
    if (targetUrl.origin !== window.location.origin) {
      window.location.href = targetUrl.href;
      return;
    }

    isNavigating = true;
    try {
      const response = await fetch(targetUrl.href, { cache: 'no-store' });
      if (!response.ok) {
        window.location.href = targetUrl.href;
        return;
      }

      const html = await response.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');

      const replaced = replaceMainAndFooter(doc);
      if (!replaced) {
        window.location.href = targetUrl.href;
        return;
      }

      syncPageHead(doc);
      document.title = doc.title || document.title;
      if (pushHistory) {
        window.history.pushState({ partial: true }, '', `${targetUrl.pathname}${targetUrl.search}${targetUrl.hash}`);
      }

      setActiveNav(targetUrl.pathname);
      await runPageScripts(doc);
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      window.dispatchEvent(new CustomEvent('hn:page-changed', { detail: { path: targetUrl.pathname } }));
    } catch (err) {
      console.error('[topbar] partial navigation failed', err);
      window.location.href = targetHref;
    } finally {
      isNavigating = false;
    }
  }

  markInitialNonCoreHeadAssets();
  setActiveNav();

  // Click on brand: fully refresh the page
  const brand = document.getElementById('hnBrand');
  brand.addEventListener('click', (e) => {
    e.preventDefault();
    navigatePartial('index.html');
  });

  mount.addEventListener('click', (event) => {
    const link = event.target.closest('.hn-nav-link, .hn-settings-link');
    if (!link) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (link.target === '_blank') return;

    event.preventDefault();
    navigatePartial(link.getAttribute('href'));
  });

  window.addEventListener('popstate', () => {
    navigatePartial(window.location.href, false);
  });

  window.addEventListener('resize', syncTopbarSectionSpacing);

  // (Search UI moved into the info bar)

  // Allow pages to insert into the two action slots via IDs
  // e.g., page scripts can find #hnSlot1 and append buttons

  // Expose a small API on window.App if available
  try {
    if (window.App) window.App.TopBar = { mount: root, navigatePartial };
  } catch (err) { /* ignore */ }

})();
