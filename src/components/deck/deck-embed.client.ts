/**
 * DeckEmbed's behaviour: a click on a poster swaps in the live deck, and only one deck runs on the
 * page at a time. The iframe is created with its `src` already set and is removed to stop it; its
 * location is never written again, so the frame adds nothing to the host page's history.
 */

const POSTER = ".dk-embed-poster";
const FRAME = "dk-embed-frame";

/** The figure whose deck is running, if any. */
let live: HTMLElement | null = null;

function stop(figure: HTMLElement): void {
  figure.querySelector(`iframe.${FRAME}`)?.remove();
  const poster = figure.querySelector<HTMLElement>(POSTER);
  if (poster) poster.hidden = false;
  figure.removeAttribute("data-live");
  if (live === figure) live = null;
}

function start(figure: HTMLElement): void {
  if (live === figure) return;
  if (live) stop(live);
  const poster = figure.querySelector<HTMLElement>(POSTER);
  const stage = poster?.parentElement;
  const src = figure.dataset.src;
  if (!poster || !stage || !src) return;

  const frame = document.createElement("iframe");
  frame.className = FRAME;
  frame.title = figure.dataset.title ?? "Live slide";
  frame.loading = "lazy";
  frame.allow = "fullscreen; clipboard-write";
  frame.src = src;
  stage.append(frame);
  // The poster stays in the page, hidden: the zoom script and the reset both reuse it.
  poster.hidden = true;
  figure.setAttribute("data-live", "");
  live = figure;
  // Keys go to the deck once the frame has focus; the deck handles them only while focused.
  frame.focus();
}

function upgrade(poster: HTMLElement): void {
  // With the script, the poster acts as a button; without it, it stays a link to the deck.
  poster.setAttribute("role", "button");
}

// The site runs Astro's ClientRouter: this module runs once, and each page it swaps in fires
// astro:page-load (the first page too).
document.addEventListener("astro:page-load", () => {
  live = null;
  document.querySelectorAll<HTMLElement>(POSTER).forEach(upgrade);
});
document.querySelectorAll<HTMLElement>(POSTER).forEach(upgrade);

// Capture phase, so the click is claimed before the ClientRouter's own link handler (on the
// document, bubbling) navigates to the poster's href; it skips defaultPrevented clicks.
document.addEventListener("click", (event) => {
  const poster = (event.target as Element | null)?.closest<HTMLElement>(POSTER);
  if (!poster) return;
  // A modified click (new tab, new window) keeps the link's own behaviour.
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const figure = poster.closest<HTMLElement>("[data-deck-embed]");
  if (!figure) return;
  event.preventDefault();
  start(figure);
}, { capture: true });

document.addEventListener("keydown", (event) => {
  if (event.key !== " ") return;
  const poster = (event.target as Element | null)?.closest<HTMLElement>(POSTER);
  if (!poster) return;
  event.preventDefault();
  poster.click();
});
