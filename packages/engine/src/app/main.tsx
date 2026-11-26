import { createRoot } from 'react-dom/client';
import deck from 'virtual:deck';
import plugins from 'virtual:deck/plugins';

import type { DeckManifest } from '#contract/manifest.ts';
import type { DeckPlugin } from '#plugins/deck-plugin.ts';

import { Deck } from '#deck/deck.tsx';
import { readEmbedMode } from '#embed/embed-mode.ts';
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

/**
 * Whether the page was opened with `?embed`, read once at start-up.
 */
const isEmbed = readEmbedMode(window.location.search);
render(deck, plugins);

// A changed slide or manifest re-renders in place; the position survives in the URL hash. So does
// a changed plugin list: a layout file that Fast Refresh cannot patch (its default export is the
// layout, not a component) reaches here through the plugins module that imports it lazily, and
// the deck picks up the new layout without a page reload.
if (import.meta.hot) {
  let current = { deck, plugins };
  import.meta.hot.accept(['virtual:deck', 'virtual:deck/plugins'], ([nextDeck, nextPlugins]) => {
    current = {
      deck: nextDeck?.default ?? current.deck,
      plugins: nextPlugins?.default ?? current.plugins,
    };
    render(current.deck, current.plugins);
  });
}

/**
 * Renders a deck manifest. The key changes when the slide list changes, so adding, removing or
 * reordering slides remounts the deck instead of reconciling stale slide state.
 *
 * @param manifest - The deck to render.
 * @param deckPlugins - The runtime plugins to render it with.
 */
function render(manifest: DeckManifest, deckPlugins: readonly DeckPlugin[]): void {
  const slideIds = manifest.slides.map((slide) => slide.id).join(',');
  root.render(
    <Deck
      key={slideIds}
      manifest={manifest}
      plugins={deckPlugins}
      isStatic={isStatic}
      isEmbed={isEmbed}
    />,
  );
}
