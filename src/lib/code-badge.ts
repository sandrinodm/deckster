/**
 * The language badge on a code block (globals.css) sits over the top-right corner of the block.
 * When a line runs past the right edge, the block scrolls and its text passes under the badge, so
 * mark those blocks with `data-overflows` and let the CSS hide their badge. Console blocks wrap
 * (prose.css) and keep theirs.
 */
function mark(pre: HTMLElement): void {
  pre.parentElement?.toggleAttribute("data-overflows", pre.scrollWidth > pre.clientWidth + 1);
}

let observer: ResizeObserver | undefined;

function setUp(): void {
  observer?.disconnect();
  observer = new ResizeObserver((entries) => entries.forEach((e) => mark(e.target as HTMLElement)));
  for (const pre of document.querySelectorAll<HTMLElement>(".nb-code-figure[data-nb-lang] > pre.astro-code")) {
    mark(pre);
    observer.observe(pre);
  }
}

export function codeBadges(): void {
  // Astro's ClientRouter swaps pages without reloading this module; astro:page-load fires for the
  // first page too.
  document.addEventListener("astro:page-load", setUp);
}
