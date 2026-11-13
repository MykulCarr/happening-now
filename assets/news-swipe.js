// Swipe left/right on the news page to move between the category tabs,
// wrapping round at either end.
//
// It deliberately does no work of its own: a swipe just *clicks* the next
// tab, so the saving, re-rendering, scroll-to-top and usage counting all stay
// in news.js's one click handler and a swipe can never drift from a tap.
(function () {
  const bar = document.getElementById("tickerScopeBar");
  const grid = document.getElementById("newsGrid");
  if (!bar || !grid) return;
  // Listen on the whole document, not just <main>: a category with few or no
  // stories leaves <main> shorter than the screen, and a swipe across the
  // empty space below it has to work too.
  const area = document;

  const MIN_DISTANCE = 60;   // px sideways before it counts as a swipe
  const MAX_TIME = 700;      // ms — slower than this is a drag, not a swipe
  const EDGE = 24;           // px — leave the screen edges to the phone's own back gesture

  let start = null;

  // The ticker and the tab row scroll sideways themselves, and so might
  // anything inside a card; a swipe that starts there belongs to that element.
  function scrollsSideways(el) {
    for (; el; el = el.parentElement) {
      if (el.classList.contains("pageSticky")) return true;
      if (el.scrollWidth > el.clientWidth + 1 && /auto|scroll/.test(getComputedStyle(el).overflowX)) return true;
    }
    return false;
  }

  area.addEventListener("touchstart", (e) => {
    start = null;
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    if (t.clientX < EDGE || t.clientX > window.innerWidth - EDGE) return;
    // Only the page itself counts. The top bar, its menu and every pop-up
    // (source picker, report, welcome) live outside <main> and <footer>, so
    // a swipe on one of those can't change the category underneath it.
    const el = e.target.nodeType === 1 ? e.target : e.target.parentElement;
    const onPage = el === document.body || el === document.documentElement || el?.closest("main, footer");
    if (!onPage || scrollsSideways(el)) return;
    start = { x: t.clientX, y: t.clientY, time: Date.now() };
  }, { passive: true });

  area.addEventListener("touchcancel", () => { start = null; }, { passive: true });

  area.addEventListener("touchend", (e) => {
    if (!start || e.touches.length) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    const quick = Date.now() - start.time <= MAX_TIME;
    start = null;
    // Clearly sideways: at least twice as far across as up/down, so ordinary
    // scrolling with a slightly diagonal thumb never changes the category.
    if (!quick || Math.abs(dx) < MIN_DISTANCE || Math.abs(dx) < Math.abs(dy) * 2) return;
    if (String(window.getSelection?.() || "")) return; // they were selecting text
    go(dx < 0 ? 1 : -1); // finger moves left → next tab, like turning a page
  }, { passive: true });

  function go(step) {
    const tabs = [...bar.querySelectorAll(".tickerScopeBtn")];
    const at = tabs.findIndex(b => b.classList.contains("active"));
    if (tabs.length < 2 || at < 0) return;
    const next = tabs[(at + step + tabs.length) % tabs.length]; // the modulo is the infinite loop
    next.click(); // news.js also scrolls the tab row to keep the new tab in view

    // Slide the new category in from the side the finger pulled it from.
    grid.classList.remove("swipeFromRight", "swipeFromLeft");
    void grid.offsetWidth; // restart the animation if one was mid-flight
    grid.classList.add(step > 0 ? "swipeFromRight" : "swipeFromLeft");
  }

  grid.addEventListener("animationend", (e) => {
    if (e.target === grid) grid.classList.remove("swipeFromRight", "swipeFromLeft");
  });
})();
