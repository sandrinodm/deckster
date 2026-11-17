/**
 * From tablet width up, the page itself doesn't scroll: the area under the
 * header does (`.nb-scroll-root`, see globals.css), so the scrollbar starts
 * below the header. On phones the document scrolls as usual. Code that reads
 * or sets the page's scroll position asks here for the element that scrolls.
 */
export function scrollRoot(): HTMLElement {
  const root = document.querySelector<HTMLElement>(".nb-scroll-root");
  if (root && getComputedStyle(root).overflowY === "auto") return root;
  return (document.scrollingElement ?? document.documentElement) as HTMLElement;
}

/**
 * Keep the scroll position of each history entry, and put it back on Back,
 * Forward and reload. The browser and Astro's router do this for the document
 * only, not for an element that scrolls.
 */
export function restoreScrollRoot(): void {
  const key = () => `nb-scroll:${history.state?.index ?? 0}:${location.pathname}`;
  let pending = false;
  // Between leaving a page and settling on the next one, the new page's first
  // scroll events must not overwrite the position saved for its entry.
  let navigating = false;

  // Scroll events don't bubble, so listen in the capture phase.
  window.addEventListener(
    "scroll",
    (event) => {
      const root = scrollRoot();
      if (event.target !== root || root === document.scrollingElement || pending || navigating) return;
      pending = true;
      requestAnimationFrame(() => {
        pending = false;
        try {
          sessionStorage.setItem(key(), String(root.scrollTop));
        } catch {}
      });
    },
    { capture: true, passive: true },
  );

  // On Back, Forward and reload the entry's own offset wins, also for a URL with a fragment: the
  // reader had scrolled on from the anchor. A saved 0 counts too, or a fragment would pull the page
  // down. An entry with nothing saved (left before any scroll) goes to its fragment's target, else
  // to the top. A fresh navigation never restores, so a link to a fragment still lands on it.
  const restore = () => {
    const root = scrollRoot();
    if (root === document.scrollingElement) return;
    let saved: string | null = null;
    try {
      saved = sessionStorage.getItem(key());
    } catch {}
    if (saved !== null && Number.isFinite(Number(saved))) {
      root.scrollTop = Number(saved);
      return;
    }
    let target: HTMLElement | null = null;
    try {
      target = location.hash ? document.getElementById(decodeURIComponent(location.hash.slice(1))) : null;
    } catch {}
    if (target) target.scrollIntoView({ block: "start", behavior: "instant" });
    else root.scrollTop = 0;
  };
  const restoreNowAndNextFrame = () => {
    restore();
    // Again after the browser's own scroll to the fragment, which can come a frame later.
    requestAnimationFrame(restore);
  };

  // The document shown, as Astro's router tells pages apart (path and query, not the fragment).
  const documentOf = () => location.pathname + location.search;
  let shown = documentOf();

  const [entry] = performance.getEntriesByType("navigation") as PerformanceNavigationTiming[];
  let returning = entry?.type === "back_forward" || entry?.type === "reload";
  document.addEventListener("astro:before-preparation", (event) => {
    returning = (event as Event & { navigationType?: string }).navigationType === "traverse";
    navigating = true;
  });
  document.addEventListener("astro:page-load", () => {
    shown = documentOf();
    const restoring = returning;
    if (restoring) restore();
    returning = false;
    requestAnimationFrame(() => {
      if (restoring) restore();
      navigating = false;
    });
  });

  // Back and Forward between two entries of the same page (`#a` and `#b`): Astro's router moves
  // the window there and returns before any astro:* event (astro/dist/transitions/router.js,
  // `transition()`), so restore here. A traversal's popstate carries the entry's state (Astro's
  // `{ index, … }`); the popstate of a fresh fragment navigation (a click on `#b`, Astro's own
  // `location.href = …`) carries null, so a fresh link still lands on its heading. A traversal to
  // another page is left to astro:page-load above.
  window.addEventListener("popstate", (event) => {
    if (event.state === null || documentOf() !== shown) return;
    restoreNowAndNextFrame();
  });
}
