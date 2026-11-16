// The "what's new" card: tells a returning visitor, once, about the newest
// thing they have not been told about yet, and links to how to use it.
//
// Rules, so it informs without nagging:
//   - at most one card a day, the newest item that applies and is unseen
//     (several things can be new at once; they are told one at a time);
//   - an item counts as seen the moment it is shown, so it never follows
//     anyone from page to page;
//   - a brand-new visitor sees none: everything is new to them, and the About
//     page is where a first-timer learns the site;
//   - each item has a `when`, so nobody is told about something they cannot
//     use (the Android widget on a laptop) or already use.
//
// To announce something: add it to the TOP of ITEMS with a new id, and give
// the About page a matching entry under "What's new".
//
// What has been shown is remembered in hn_whatsnew_v1, outside cfg like the
// other per-browser keys.
(() => {
  "use strict";
  const App = window.App;
  if (!App) return;
  const KEY = "hn_whatsnew_v1";

  const ITEMS = [
    {
      id: "sync-2026-11",
      // Only where sync is shipped (App.cloudSync exists) and not already on.
      when: () => Boolean(App.cloudSync) && !App.cloudSync.enabled(),
      title: "New: your settings on every device",
      text: "Turn on sync and your news sources, watchlist and location follow you to every browser and device you use. They are encrypted first, so only you can read them.",
      action: "See how it works",
      href: "/about#sync",
      tag: "new-sync",
    },
    {
      id: "backup-2026-11",
      when: () => true,
      title: "New: back up and move your settings",
      text: "Save your settings to a file, or carry them to another browser with a link. It works in every browser, Firefox and Safari included.",
      action: "See how it works",
      href: "/about#backup",
      tag: "new-backup",
    },
    {
      id: "widget-2026-11",
      // Android only (nobody else can install it), where the app is published,
      // and not for someone who already has a widget paired.
      when: async () => /Android/i.test(navigator.userAgent) && !App.widgetLink?.paired() && Boolean(await App.widgetLink?.published()),
      title: "New: Happening Now on your home screen",
      text: "A free Android widget with the time, your weather, your headlines and your watchlist. No ads, no account.",
      action: "See the widget",
      href: "/android",
      tag: "new-widget",
    },
  ];

  const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; } };
  const write = (seen, last = 0) => { try { localStorage.setItem(KEY, JSON.stringify({ seen, last })); return true; } catch { return false; } };
  const DAY_MS = 24 * 60 * 60 * 1000;

  // Read before anything writes (the same test settings-sync.js uses): no
  // stored settings means a brand-new browser.
  let firstVisit = false;
  try { firstVisit = localStorage.getItem(App.LS_KEY || "") === null; } catch { /* storage blocked */ }

  let state = read();
  if (!state) {
    const seen = firstVisit ? ITEMS.map((i) => i.id) : [];
    // The widget's earlier, separate one-time card: don't repeat it.
    try { if (localStorage.getItem("hn_widget_announced_v1") && !seen.includes("widget-2026-11")) seen.push("widget-2026-11"); } catch { /* ignore */ }
    if (!write(seen)) return; // cannot remember what was shown, so show nothing
    state = { seen };
  }
  const seen = Array.isArray(state.seen) ? state.seen : [];
  if (Date.now() - (Number(state.last) || 0) < DAY_MS) return; // one a day

  // Not on the pages these cards point at, nor in the middle of a hand-off.
  const here = location.pathname;
  const query = new URLSearchParams(location.search);
  if (/^\/(about|android|widget)(\.html)?$/.test(here) || query.has("send") || window.__hnImport || window.__hnSync) return;

  async function pick() {
    for (const item of ITEMS) {
      if (seen.includes(item.id)) continue;
      try { if (await item.when()) return item; } catch { /* treat as "does not apply" */ }
    }
    return null;
  }

  setTimeout(async () => { // let the page settle first
    const item = await pick();
    if (!item || document.querySelector(".widgetAnnounce")) return;
    if (!write([...seen, item.id], Date.now())) return;
    const card = document.createElement("div");
    card.className = "widgetAnnounce";
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-label", item.title);
    const strong = document.createElement("strong");
    strong.textContent = item.title;
    const span = document.createElement("span");
    span.textContent = item.text;
    const actions = document.createElement("div");
    actions.className = "widgetAnnounceActions";
    const go = document.createElement("a");
    go.className = "btn";
    go.href = item.href;
    go.textContent = item.action;
    go.dataset.analytics = item.tag;
    const later = document.createElement("button");
    later.className = "btn";
    later.type = "button";
    later.textContent = "Not now";
    later.onclick = () => card.remove();
    actions.append(go, later);
    card.append(strong, span, actions);
    document.body.appendChild(card);
  }, 2500);
})();
