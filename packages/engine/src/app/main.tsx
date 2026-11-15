import { createRoot } from 'react-dom/client';
import deck from 'virtual:deck';
import plugins from 'virtual:deck/plugins';

import type { DeckManifest } from '#contract/manifest.ts';

import { Deck } from '#deck/deck.tsx';
import { readStaticMode } from '#static/static-mode.ts';
import '#app/app.css';

/**
 * The id of the element in `index.html` the deck renders into.
 */
const ROOT_ELEMENT_ID = 'deck-root';

/**
 * The deck's root element; the page fails to start with an error naming the id when it is missing.
 */
const container = document.getElementById(ROOT_ELEMENT_ID);
if (container === null) {
  throw new Error(`The deck page has no #${ROOT_ELEMENT_ID} element to render into.`);
}

/**
 * The React root the deck renders into, reused across hot updates.
 */
const root = createRoot(container);

/**
 * Whether the page was opened with `?static`, read once at start-up.
 */
const isStatic = readStaticMode(window.location.search);
render(deck);

// A changed slide or manifest re-renders in place; the position survives in the URL hash.
if (import.meta.hot) {
  import.meta.hot.accept('virtual:deck', (next) => {
    if (next !== undefined) {
      render(next.default);
    }
  });
}

/**
 * Renders a deck manifest. The key changes when the slide list changes, so adding, removing or
 * reordering slides remounts the deck instead of reconciling stale slide state.
 *
 * @param manifest - The deck to render.
 */
function render(manifest: DeckManifest): void {
  const slideIds = manifest.slides.map((slide) => slide.id).join(',');
  root.render(<Deck key={slideIds} manifest={manifest} plugins={plugins} isStatic={isStatic} />);
}
