// Settings > System: install this site as an app (the browser's own prompt,
// step-by-step instructions per browser, and a Windows desktop shortcut).
// Split out of settings.js on 2026-11-17; loaded just before it.
(() => {
  "use strict";
  const S = (window.App.settingsPage ||= {});
  // From the main script, looked up when called (it loads after this file).
  const setStatus = (...args) => S.setStatus(...args);

  // PWA Install functionality
  let deferredPrompt;
  let canAutoInstall = false;
  let pendingInstallClick = false;
  const installAppBtn = document.getElementById("installAppBtn");
  const installBtnText = document.getElementById("installBtnText");
  const installStatus = document.getElementById("installStatus");
  const installStatusText = document.getElementById("installStatusText");
  const installModal = document.getElementById("installModal");
  const installModalClose = document.getElementById("installModalClose");
  const browserSpecificInstructions = document.getElementById("browserSpecificInstructions");

  // Enhanced browser detection
  function detectBrowser() {
    const ua = navigator.userAgent;
    const platform = navigator.platform;
    
    // Detect operating system
    const isWindows = /Win/.test(platform);
    const isMac = /Mac/.test(platform);
    const isLinux = /Linux/.test(platform) && !/Android/.test(ua);
    const isIOS = /iPhone|iPad|iPod/.test(ua);
    const isAndroid = /Android/.test(ua);
    
    // Detect browser
    const isFirefox = /Firefox/.test(ua);
    const isDuckDuckGo = /DuckDuckGo/.test(ua);
    const isChrome = /Chrome/.test(ua) && !/Edg|OPR|DuckDuckGo/.test(ua);
    const isEdge = /Edg/.test(ua);
    const isOpera = /OPR/.test(ua);
    const isSafari = /Safari/.test(ua) && !/Chrome|Edg|OPR|DuckDuckGo/.test(ua);
    const isBrave = navigator.brave !== undefined;
    
    return {
      isWindows, isMac, isLinux, isIOS, isAndroid,
      isFirefox, isDuckDuckGo, isChrome, isEdge, isOpera, isSafari, isBrave,
      name: isFirefox ? 'Firefox' : 
            isDuckDuckGo ? 'DuckDuckGo' : 
            isEdge ? 'Edge' : 
            isChrome ? 'Chrome' : 
            isSafari ? 'Safari' : 
            isOpera ? 'Opera' : 
            isBrave ? 'Brave' : 
            'your browser',
      os: isWindows ? 'Windows' : 
          isMac ? 'macOS' : 
          isLinux ? 'Linux' : 
          isIOS ? 'iOS' : 
          isAndroid ? 'Android' : 
          'your device'
    };
  }

  // Generate browser-specific installation instructions
  function generateInstallInstructions(browser) {
    let html = '<div style="font-size: 13px; font-weight: 600; margin-bottom: 12px;">📱 Installation Steps:</div>';
    
    // Firefox instructions
    if (browser.isFirefox) {
      html += `
        <div class="install-step" style="margin-bottom: 16px; padding: 14px; background: var(--card-bg); border: 2px solid var(--accent); border-radius: 8px;">
          <div style="font-weight: 600; font-size: 14px; margin-bottom: 8px; color: var(--accent);">🦊 Firefox ${browser.os}</div>
          <div style="font-size: 12px; color: var(--text); line-height: 1.6;">
            <strong>Step 1:</strong> Look for the <strong>install icon</strong> (⊕ or 🏠) in the address bar<br>
            <strong>Step 2:</strong> Click it and select <strong>"Install"</strong><br><br>
            <em style="color: var(--muted);">Alternative:</em> Menu (☰) → "Install this site as an app"
          </div>
        </div>
      `;
    }
    
    // DuckDuckGo instructions
    else if (browser.isDuckDuckGo) {
      if (browser.isAndroid) {
        html += `
          <div class="install-step" style="margin-bottom: 16px; padding: 14px; background: var(--card-bg); border: 2px solid var(--accent); border-radius: 8px;">
            <div style="font-weight: 600; font-size: 14px; margin-bottom: 8px; color: var(--accent);">🦆 DuckDuckGo (Android)</div>
            <div style="font-size: 12px; color: var(--text); line-height: 1.6;">
              <strong>Step 1:</strong> Tap the <strong>menu</strong> (⋮) in the top right<br>
              <strong>Step 2:</strong> Select <strong>"Add to Home screen"</strong><br>
              <strong>Step 3:</strong> Tap <strong>"Add"</strong> to confirm<br><br>
              <em style="color: var(--muted);">The app icon will appear on your home screen!</em>
            </div>
          </div>
        `;
      } else {
        html += `
          <div class="install-step" style="margin-bottom: 16px; padding: 14px; background: var(--card-bg); border: 2px solid var(--accent); border-radius: 8px;">
            <div style="font-weight: 600; font-size: 14px; margin-bottom: 8px; color: var(--accent);">🦆 DuckDuckGo Browser</div>
            <div style="font-size: 12px; color: var(--text); line-height: 1.6;">
              <strong>Step 1:</strong> Look for the <strong>install icon</strong> in your address bar or menu<br>
              <strong>Step 2:</strong> Click it and select <strong>"Install"</strong><br><br>
              <em style="color: var(--muted);">You can also bookmark this page for quick access!</em>
            </div>
          </div>
        `;
      }
    }
    
    // Chrome/Edge instructions
    else if (browser.isChrome || browser.isEdge) {
      const browserName = browser.isEdge ? 'Edge' : 'Chrome';
      html += `
        <div class="install-step" style="margin-bottom: 16px; padding: 14px; background: var(--card-bg); border: 2px solid var(--accent); border-radius: 8px;">
          <div style="font-weight: 600; font-size: 14px; margin-bottom: 8px; color: var(--accent);">🖥️ ${browserName} (${browser.os})</div>
          <div style="font-size: 12px; color: var(--text); line-height: 1.6;">
            <strong>Step 1:</strong> Look for the <strong>install icon</strong> (⊕ or 💻) in the address bar<br>
            <strong>Step 2:</strong> Click it and select <strong>"Install"</strong><br><br>
            <em style="color: var(--muted);">Or: Menu (⋮) → "Install HAPPENING NOW..."</em>
          </div>
        </div>
      `;
    }
    
    // Safari instructions
    else if (browser.isSafari) {
      if (browser.isIOS) {
        html += `
          <div class="install-step" style="margin-bottom: 16px; padding: 14px; background: var(--card-bg); border: 2px solid var(--accent); border-radius: 8px;">
            <div style="font-weight: 600; font-size: 14px; margin-bottom: 8px; color: var(--accent);">🍎 Safari (iOS)</div>
            <div style="font-size: 12px; color: var(--text); line-height: 1.6;">
              <strong>Step 1:</strong> Tap the <strong>Share button</strong> (□↑) at the bottom of the screen<br>
              <strong>Step 2:</strong> Scroll down and tap <strong>"Add to Home Screen"</strong><br>
              <strong>Step 3:</strong> Tap <strong>"Add"</strong> in the top right<br><br>
              <em style="color: var(--muted);">The app will appear on your home screen!</em>
            </div>
          </div>
        `;
      } else {
        html += `
          <div class="install-step" style="margin-bottom: 16px; padding: 14px; background: var(--card-bg); border: 2px solid var(--accent); border-radius: 8px;">
            <div style="font-weight: 600; font-size: 14px; margin-bottom: 8px; color: var(--accent);">🍎 Safari (macOS)</div>
            <div style="font-size: 12px; color: var(--text); line-height: 1.6;">
              <strong>Step 1:</strong> Click <strong>File</strong> in the menu bar<br>
              <strong>Step 2:</strong> Select <strong>"Add to Dock"</strong><br><br>
              <em style="color: var(--muted);">You can also add this page to your favorites for quick access!</em>
            </div>
          </div>
        `;
      }
    }
    
    // Generic/fallback instructions
    else {
      html += `
        <div class="install-step" style="margin-bottom: 16px; padding: 14px; background: var(--card-bg); border: 2px solid var(--accent); border-radius: 8px;">
          <div style="font-weight: 600; font-size: 14px; margin-bottom: 8px; color: var(--accent);">🌐 ${browser.name} (${browser.os})</div>
          <div style="font-size: 12px; color: var(--text); line-height: 1.6;">
            <strong>Option 1:</strong> Look for an <strong>install icon</strong> (⊕, 💻, or 📱) in your address bar or menu<br>
            <strong>Option 2:</strong> Check browser menu → Look for "Install", "Add to Home Screen", or "Add to Dock"<br>
            <strong>Option 3:</strong> Bookmark this page for quick access<br><br>
            <em style="color: var(--muted);">Installation steps vary by browser, but most support PWAs!</em>
          </div>
        </div>
      `;
    }
    
    return html;
  }

  // Check if already installed
  function checkInstalled() {
    if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) {
      installAppBtn.style.display = "none";
      installStatus.style.display = "block";
      installStatusText.textContent = "App is installed! Launch from your home screen or app menu.";
      return true;
    }
    return false;
  }

  // Render browser-specific install guide into #installBrowserGuide
  function renderInstallGuide(browser) {
    const guide = document.getElementById("installBrowserGuide");
    if (!guide) return;

    const isChromium = browser.isChrome || browser.isEdge || browser.isBrave || browser.isOpera || browser.isDuckDuckGo;

    // Chromium — native install dialog handles Desktop/Start menu/Taskbar; just explain + offer shortcut
    if (isChromium) {
      const name = browser.isBrave ? "Brave" : browser.isEdge ? "Edge" : browser.isOpera ? "Opera" : browser.isDuckDuckGo ? "DuckDuckGo" : "Chrome";
      let bodyHtml = "";
      if (browser.isAndroid) {
        bodyHtml = `<p class="installGuideNote">Tap <strong>Install</strong> above to add the app to your home screen and app drawer.</p>`;
      } else if (browser.isWindows) {
        bodyHtml = `<p class="installGuideNote">${name}'s install dialog lets you choose where to add the app &mdash; <strong>Desktop</strong>, <strong>Start menu</strong>, and/or <strong>Taskbar</strong>.</p>
          <p class="installGuideNote installGuideSub">Prefer just a shortcut? <button id="downloadDesktopShortcutBtn" type="button" class="installGuideLinkBtn">Download desktop shortcut (.url)</button></p>`;
      } else if (browser.isMac) {
        bodyHtml = `<p class="installGuideNote">${name}'s install dialog adds the app to your <strong>Applications</strong> folder and Dock.</p>`;
      } else {
        bodyHtml = `<p class="installGuideNote">Click <strong>Install</strong> above to add the app to your system.</p>`;
      }
      guide.innerHTML = bodyHtml;
      const shortcutBtn = guide.querySelector("#downloadDesktopShortcutBtn");
      if (shortcutBtn) shortcutBtn.addEventListener("click", () => downloadWindowsDesktopShortcut());
      return;
    }

    // Non-Chromium — numbered manual steps
    let title = "";
    let steps = [];
    let note = "";

    if (browser.isSafari && browser.isIOS) {
      title = "Install on iPhone / iPad (Safari)";
      steps = [
        'Tap the <strong>Share button</strong> (&#9633;&#8593;) at the bottom of the screen',
        'Scroll down and tap <strong>Add to Home Screen</strong>',
        'Tap <strong>Add</strong> in the top right to confirm',
      ];
    } else if (browser.isSafari) {
      title = "Install on macOS (Safari)";
      steps = [
        'In the menu bar, click <strong>File</strong>',
        'Select <strong>Add to Dock</strong>',
      ];
      note = "Requires macOS Sonoma (14) or later with Safari 17+.";
    } else if (browser.isFirefox && browser.isAndroid) {
      title = "Install on Android (Firefox)";
      steps = [
        'Tap the <strong>menu</strong> (&#8942;) in the top right',
        'Tap <strong>Install</strong> or <strong>Add to Home screen</strong>',
      ];
    } else if (browser.isFirefox) {
      title = "Install in Firefox";
      steps = [
        'Look for the <strong>install icon</strong> (a download arrow &#8659; in a tray) at the right end of the address bar &mdash; click it, then click <strong>Install</strong>',
        'Or: open the menu (&#9776;) and choose <strong>Install this site as an app</strong>',
      ];
      if (browser.isWindows) {
        note = 'Or: <button id="downloadDesktopShortcutBtn" type="button" class="installGuideLinkBtn">download a desktop shortcut</button> without a full install.';
      }
    } else if (browser.isDuckDuckGo && browser.isAndroid) {
      title = "Install on Android (DuckDuckGo)";
      steps = [
        'Tap the <strong>menu</strong> (&#8942;) in the top right',
        'Tap <strong>Add to Home screen</strong>',
        'Tap <strong>Add</strong> to confirm',
      ];
    } else {
      title = "Install in " + browser.name;
      steps = [
        'Look for an <strong>install icon</strong> in the address bar',
        'Or open the browser menu and look for <strong>Install</strong>, <strong>Add to Home Screen</strong>, or <strong>Add to Dock</strong>',
      ];
    }

    const stepsHtml = steps.map((s) => `<li>${s}</li>`).join("");
    const noteHtml = note ? `<p class="installGuideNote">${note}</p>` : "";
    guide.innerHTML = `<p class="installGuideTitle">${title}</p><ol class="installGuideSteps">${stepsHtml}</ol>${noteHtml}`;
    const shortcutBtn = guide.querySelector("#downloadDesktopShortcutBtn");
    if (shortcutBtn) shortcutBtn.addEventListener("click", () => downloadWindowsDesktopShortcut());
  }

  function getShortcutLaunchUrl(){
    return new URL("/", window.location.href).href;
  }

  function buildWindowsShortcutContent(){
    const launchUrl = getShortcutLaunchUrl();
    return [
      "[InternetShortcut]",
      `URL=${launchUrl}`,
      "IconIndex=0"
    ].join("\r\n");
  }

  function downloadWindowsDesktopShortcut(){
    const shortcutBlob = new Blob([buildWindowsShortcutContent()], { type: "application/internet-shortcut" });
    const fileUrl = URL.createObjectURL(shortcutBlob);
    const a = document.createElement("a");
    a.href = fileUrl;
    a.download = "H!.url";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(fileUrl), 1000);
  }

  function getManualShortcutPanel(browser){
    if(!browser.isWindows){
      return "";
    }

    return `
      <div style="margin-top: 14px; padding: 12px; border: 1px dashed var(--accent); border-radius: 8px; background: var(--panel2);">
        <div style="font-size: 12px; margin-bottom: 8px; line-height: 1.5; color: var(--muted);">
          If install is unavailable in ${browser.name}, you can download a Windows desktop shortcut now.
        </div>
        <button id="downloadDesktopShortcutBtn" type="button" class="btn btnSubtle">Download Desktop Shortcut (H!)</button>
        <div style="margin-top: 8px; font-size: 11px; color: var(--muted);">
          After download: move <strong>H!.url</strong> to your Desktop. Browsers cannot place files directly on Desktop without your action.
        </div>
      </div>
    `;
  }

  function bindManualShortcutActions(browser){
    const shortcutBtn = document.getElementById("downloadDesktopShortcutBtn");
    if(!shortcutBtn || !browser.isWindows) return;

    shortcutBtn.addEventListener("click", () => {
      downloadWindowsDesktopShortcut();
      setStatus("Shortcut downloaded. Move H!.url to Desktop.", "default");
    });
  }

  function showInlineInstallFallback(){
    const browser = detectBrowser();
    if(browser.isWindows){
      downloadWindowsDesktopShortcut();
      setStatus("Downloaded H!.url. Move it to Desktop.", "default");
      return;
    }
    setStatus("Install instructions unavailable on this build. Use browser menu: Install/Add to Home Screen.", "default");
  }

  // Show install modal with browser-specific instructions
  function showInstallModal() {
    const browser = detectBrowser();
    if(!installModal || !browserSpecificInstructions){
      showInlineInstallFallback();
      return;
    }

    browserSpecificInstructions.innerHTML = generateInstallInstructions(browser) + getManualShortcutPanel(browser);
    bindManualShortcutActions(browser);
    installModal.style.display = "flex";
    setStatus("Showing install options", "default");
  }

  // Hide install modal
  function hideInstallModal() {
    installModal.style.display = "none";
  }

  // Modal close handlers
  if (installModalClose) {
    installModalClose.addEventListener('click', hideInstallModal);
  }
  installModal?.addEventListener('click', (e) => {
    if (e.target === installModal) hideInstallModal();
  });

  // Listen for beforeinstallprompt event — only fires on Chromium-based browsers
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    canAutoInstall = true;
    // Reveal the install button now that native prompt is available
    if (installAppBtn) {
      installAppBtn.style.display = "";
      installAppBtn.disabled = false;
      if (installBtnText && installBtnText.textContent === "Preparing install…") {
        installBtnText.textContent = installAppBtn.dataset.origLabel || "Install HAPPENING NOW!";
      }
    }
    // User clicked install before the event fired — trigger now
    if (pendingInstallClick) {
      pendingInstallClick = false;
      installAppBtn?.click();
    }
    console.log('[PWA] Auto-install available');
  });

  // Handle install button click
  if (installAppBtn) {
    installAppBtn.addEventListener('click', async () => {
      // If already installed, do nothing
      if (checkInstalled()) return;

      // If browser supports auto-install, use it
      if (canAutoInstall && deferredPrompt) {
        try {
          setStatus("Opening install prompt...", "default");
          await deferredPrompt.prompt();
          const { outcome } = await deferredPrompt.userChoice;

          if (outcome === 'accepted') {
            console.log('[PWA] User accepted the install prompt');
            installAppBtn.style.display = "none";
            installStatus.style.display = "block";
            installStatusText.textContent = "Installing... check your home screen!";
          } else {
            console.log('[PWA] User dismissed the install prompt');
          }

          deferredPrompt = null;
          canAutoInstall = false;
        } catch (err) {
          console.warn('[PWA] Install prompt failed:', err);
          showInstallModal();
        }
      } else {
        // beforeinstallprompt not ready yet — queue the click and wait for it to fire
        const b = detectBrowser();
        const isChromium = b.isChrome || b.isEdge || b.isBrave || b.isOpera || b.isDuckDuckGo;
        if (isChromium) {
          // Only queue if we're on a secure origin where the event can still fire
          const isSecure = location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1";
          if (!isSecure) {
            const guide = document.getElementById("installBrowserGuide");
            if (guide) guide.innerHTML = `<p class="installGuideNote"><strong>Install button unavailable.</strong> Install prompts require a secure connection (HTTPS). This page is being served over ${location.protocol}</p>`;
            if (installAppBtn) installAppBtn.style.display = "none";
            return;
          }
          pendingInstallClick = true;
          if (installAppBtn) {
            installAppBtn.dataset.origLabel = installBtnText?.textContent || "Install HAPPENING NOW!";
            installAppBtn.disabled = true;
          }
          if (installBtnText) installBtnText.textContent = "Preparing install…";
        } else {
          showInstallModal();
        }
      }
    });
  }

  // Listen for app installed event
  window.addEventListener('appinstalled', () => {
    console.log('[PWA] App was installed');
    if (installAppBtn) installAppBtn.style.display = "none";
    if (installStatus) installStatus.style.display = "block";
    if (installStatusText) installStatusText.textContent = "Successfully installed!";
    const guide = document.getElementById("installBrowserGuide");
    if (guide) guide.innerHTML = "";
    setTimeout(hideInstallModal, 500);
  });

  // Initialize install state
  if (!checkInstalled()) {
    const browser = detectBrowser();
    renderInstallGuide(browser);
    // Show install button immediately for Chromium-based browsers
    // (beforeinstallprompt fires asynchronously; show button now, native dialog activates it)
    const isChromium = browser.isChrome || browser.isEdge || browser.isBrave || browser.isOpera || browser.isDuckDuckGo;
    if (installAppBtn && isChromium) {
      installAppBtn.style.display = "";
      if (installBtnText) {
        if (browser.isEdge) installBtnText.textContent = "Install in Edge";
        else if (browser.isBrave) installBtnText.textContent = "Install in Brave";
        else if (browser.isOpera) installBtnText.textContent = "Install in Opera";
        else if (browser.isDuckDuckGo) installBtnText.textContent = "Install in DuckDuckGo";
        else installBtnText.textContent = "Install in Chrome";
      }

      // Timeout: if beforeinstallprompt never fires the site isn't installable here
      // (file://, non-HTTPS, already installed in another profile, etc.)
      setTimeout(() => {
        if (canAutoInstall) return; // already fired, all good
        // Cancel any pending click
        pendingInstallClick = false;
        if (installAppBtn) {
          installAppBtn.disabled = false;
          installAppBtn.style.display = "none";
        }
        const guide = document.getElementById("installBrowserGuide");
        if (guide) {
          const isSecure = location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1";
          const reason = isSecure
            ? "The browser hasn't offered an install prompt. The app may already be installed, or the browser requires an interaction first."
            : "Install prompts require a secure connection (HTTPS). This page is being served over " + location.protocol;
          guide.innerHTML = `<p class="installGuideNote"><strong>Install button unavailable.</strong> ${reason}</p>
            <p class="installGuideNote installGuideSub">Look for the install icon (&#10010; or monitor icon) in the address bar, or open the menu (&#8942;) and choose <strong>Install HAPPENING NOW</strong>.</p>`;
        }
        console.log('[PWA] beforeinstallprompt did not fire — install button hidden.');
      }, 5000);
    }
  }


  Object.assign(S, {  });
})();
