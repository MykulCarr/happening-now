// Drag left/right on the news page to move between the category tabs,
// wrapping round at either end. The cards follow the finger; let go past
// about a fifth of the screen (or flick) and the switch completes, let go
// early and they spring back. While dragging, the name of the category being
// pulled in shows at the edge it comes from, so the direction is never a guess.
//
// It deliberately does no switching of its own: completing a drag just
// *clicks* the next tab, so the saving, re-rendering, scroll-to-top and usage
// counting all stay in news.js's one click handler and a swipe can never
// drift from a tap. news.js pre-loads the neighbouring categories, which is
// what lets the new one appear the moment the old one slides away.
(function () {
  const bar = document.getElementById("tickerScopeBar");
  const grid = document.getElementById("newsGrid");
  if (!bar || !grid) return;
  // Listen on the whole document, not just <main>: a category with few or no
  // stories leaves <main> shorter than the screen, and a swipe across the
  // empty space below it has to work too.
  const area = document;

  const EDGE = 24;        // px — leave the screen edges to the phone's own back gesture
  const SLOP = 12;        // px of travel before deciding whether this is a sideways drag
  const COMMIT = 0.22;    // share of the screen width that completes the switch on release
  const FLICK_MS = 300;   // ...or a quick flick: at least FLICK_PX within this time
  const FLICK_PX = 50;
  const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches; // no sliding, just switch

  let start = null;       // where and when the finger went down
  let dragging = false;   // true once the gesture is clearly sideways
  let hint = null;        // the edge label

  // The ticker and the tab row scroll sideways themselves, and so might
  // anything inside a card; a drag that starts there belongs to that element.
  function scrollsSideways(el) {
    for (; el; el = el.parentElement) {
      if (el.classList.contains("pageSticky")) return true;
      if (el.scrollWidth > el.clientWidth + 1 && /auto|scroll/.test(getComputedStyle(el).overflowX)) return true;
    }
    return false;
  }

  function neighbour(step) {
    const tabs = [...bar.querySelectorAll(".tickerScopeBtn")];
    const at = tabs.findIndex(b => b.classList.contains("active"));
    if (tabs.length < 2 || at < 0) return null;
    return tabs[(at + step + tabs.length) % tabs.length]; // the modulo is the infinite loop
  }

  // ---- what the finger sees -------------------------------------------------
  function follow(dx) {
    if (calm) return;
    grid.style.transform = `translateX(${dx}px)`;
    grid.style.opacity = String(1 - Math.min(Math.abs(dx) / window.innerWidth, 0.5));

    const step = dx < 0 ? 1 : -1; // finger moves left → next tab, like turning a page
    const next = neighbour(step);
    if (!next) return;
    if (!hint) {
      hint = document.createElement("div");
      hint.className = "swipeHint";
      hint.setAttribute("aria-hidden", "true");
      document.body.appendChild(hint);
    }
    const progress = Math.min(Math.abs(dx) / (window.innerWidth * COMMIT), 1);
    hint.textContent = step > 0 ? `${next.textContent} ›` : `‹ ${next.textContent}`;
    hint.dataset.side = step > 0 ? "right" : "left";
    hint.style.opacity = String(progress);
    hint.classList.toggle("armed", progress >= 1); // letting go now will switch
  }

  function clearHint() { hint?.remove(); hint = null; }

  function resetGrid() {
    grid.style.transition = "";
    grid.style.transform = "";
    grid.style.opacity = "";
  }

  // Let go early: ease back to where it was.
  function settle() {
    clearHint();
    if (calm) return;
    grid.style.transition = "transform .18s ease-out, opacity .18s ease-out";
    grid.style.transform = "";
    grid.style.opacity = "";
    setTimeout(() => { grid.style.transition = ""; }, 200);
  }

  // Let go far enough: finish sliding out, then switch.
  function commit(step) {
    clearHint();
    if (calm) return go(step);
    grid.style.transition = "transform .12s ease-in, opacity .12s ease-in";
    grid.style.transform = `translateX(${step > 0 ? -45 : 45}%)`;
    grid.style.opacity = "0";
    setTimeout(() => { resetGrid(); go(step); }, 120);
  }

  function go(step) {
    const next = neighbour(step);
    if (!next) return;
    next.click(); // news.js also scrolls the tab row to keep the new tab in view

    // Slide the new category in from the side the finger pulled it from.
    grid.classList.remove("swipeFromRight", "swipeFromLeft");
    void grid.offsetWidth; // restart the animation if one was mid-flight
    grid.classList.add(step > 0 ? "swipeFromRight" : "swipeFromLeft");
  }

  // ---- the gesture ----------------------------------------------------------
  area.addEventListener("touchstart", (e) => {
    start = null;
    dragging = false;
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    if (t.clientX < EDGE || t.clientX > window.innerWidth - EDGE) return;
    // Only the page itself counts. The top bar, its menu and every pop-up
    // (source picker, report, welcome) live outside <main> and <footer>, so
    // a drag on one of those can't change the category underneath it.
    const el = e.target.nodeType === 1 ? e.target : e.target.parentElement;
    const onPage = el === document.body || el === document.documentElement || el?.closest("main, footer");
    if (!onPage || scrollsSideways(el)) return;
    start = { x: t.clientX, y: t.clientY, time: Date.now() };
  }, { passive: true });

  area.addEventListener("touchmove", (e) => {
    if (!start) return;
    const t = e.touches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (!dragging) {
      if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return; // not enough to tell yet
      // Clearly sideways, and not a text selection — otherwise it's a scroll
      // (the browser's) and none of our business.
      if (Math.abs(dx) < Math.abs(dy) * 1.5 || String(window.getSelection?.() || "")) { start = null; return; }
      dragging = true;
      grid.style.transition = "none";
    }
    follow(dx);
  }, { passive: true });

  area.addEventListener("touchend", (e) => {
    if (!start || e.touches.length) return;
    const dx = e.changedTouches[0].clientX - start.x;
    const flick = Date.now() - start.time < FLICK_MS && Math.abs(dx) > FLICK_PX;
    const wasDragging = dragging;
    start = null;
    dragging = false;
    if (!wasDragging) return;
    if (Math.abs(dx) >= window.innerWidth * COMMIT || flick) commit(dx < 0 ? 1 : -1);
    else settle();
  }, { passive: true });

  // The browser took the gesture over (it turned into a scroll): put things back.
  area.addEventListener("touchcancel", () => {
    if (dragging) settle();
    start = null;
    dragging = false;
  }, { passive: true });

  grid.addEventListener("animationend", (e) => {
    if (e.target === grid) grid.classList.remove("swipeFromRight", "swipeFromLeft");
  });
})();
