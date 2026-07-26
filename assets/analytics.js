// Google Analytics 4.
//
// Loaded with Consent Mode defaulting to "denied", which is the whole point of
// this file rather than Google's copy-paste snippet. With analytics_storage
// denied, GA4 sends cookieless pings: we still get aggregate page and visit
// counts, but nothing is written to the visitor's device and no cross-session
// identifier is kept. That is deliberate and permanent — there is no consent
// banner and no code path that ever grants consent — so the site needs no
// cookie prompt in any region, matching the EU-excluded posture of the
// Cloudflare Web Analytics already running.
//
// Trade-off to know about: returning visitors count as new each session, so
// "users" is inflated and engagement/retention reports are not meaningful.
// Page views, referrers and geography are still sound.
//
// Set GA4_ID to "" to switch analytics off completely — no script is fetched
// and no request is made.
(() => {
  "use strict";

  const GA4_ID = "G-XL3C28KRQX";

  if (!GA4_ID) return;

  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }

  // Must be queued before gtag.js loads, or the very first hit writes cookies.
  gtag("consent", "default", {
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
    analytics_storage: "denied"
  });

  gtag("js", new Date());
  gtag("config", GA4_ID);

  const tag = document.createElement("script");
  tag.async = true;
  tag.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(GA4_ID);
  document.head.appendChild(tag);
})();
