import type { InitMessage } from '#protocol/messages.ts';

/**
 * The id of the `<style>` element that holds the deck's font faces.
 */
const FONT_STYLE_ID = 'deck-app-bridge-fonts';

/**
 * Puts the deck's brand on the app's page: its custom properties and `color-scheme` on the root
 * element, `data-deck-scheme` and `data-deck-brand` for selectors, and the brand's font faces in a
 * style element. The custom properties include the surface's background. The app's own CSS reads
 * them, for example `color: var(--brand-color-fg)`.
 *
 * @param root - The document's root element.
 * @param init - The deck's `init` message.
 */
export function applyTheme(root: HTMLElement, init: typeof InitMessage.Type): void {
  for (const [name, value] of Object.entries(init.cssVariables)) {
    root.style.setProperty(name, value);
  }

  root.style.colorScheme = init.scheme;
  root.dataset['deckScheme'] = init.scheme;
  root.dataset['deckBrand'] = init.brand.name;
  applyFontFaces(root.ownerDocument, init.fontFaces);
}

/**
 * Writes the brand's `@font-face` rules into the page's font style element. The text is set only
 * when it changed, so a repeated `init` does not make the browser parse the fonts again.
 *
 * @param ownerDocument - The document the root element belongs to.
 * @param fontFaces - The `@font-face` CSS from the deck's `init`.
 */
function applyFontFaces(ownerDocument: Document, fontFaces: string): void {
  const style = fontStyleElement(ownerDocument);
  if (style.textContent !== fontFaces) {
    style.textContent = fontFaces;
  }
}

/**
 * The page's font style element, created and appended to the head the first time it is needed.
 *
 * @param ownerDocument - The document to look in.
 * @returns The existing or new style element.
 */
function fontStyleElement(ownerDocument: Document): HTMLElement {
  const existing = ownerDocument.getElementById(FONT_STYLE_ID);
  if (existing !== null) {
    return existing;
  }

  const style = ownerDocument.createElement('style');
  style.id = FONT_STYLE_ID;
  ownerDocument.head.append(style);
  return style;
}
