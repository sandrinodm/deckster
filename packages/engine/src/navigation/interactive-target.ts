/**
 * The attribute that marks an element, and everything inside it, as interactive: mouse clicks and
 * Space there belong to it, not to deck navigation. Mini apps, live components and overlays put it
 * on their root.
 */
export const INTERACTIVE_ATTRIBUTE = 'data-deck-interactive';

/**
 * Elements whose clicks and Space presses are their own: links, form controls, disclosures, media
 * (their controls), editable content, embedded frames, ARIA widgets, and anything marked
 * {@link INTERACTIVE_ATTRIBUTE}.
 */
const INTERACTIVE_SELECTOR = [
  'a[href]',
  'button',
  'input',
  'select',
  'textarea',
  'label',
  'summary',
  'audio',
  'video',
  'iframe',
  'embed',
  'object',
  '[contenteditable]:not([contenteditable="false"])',
  '[role="button"]',
  '[role="link"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="switch"]',
  '[role="menuitem"]',
  '[role="option"]',
  '[role="tab"]',
  '[role="slider"]',
  '[role="textbox"]',
  `[${INTERACTIVE_ATTRIBUTE}]:not([${INTERACTIVE_ATTRIBUTE}="false"])`,
].join(', ');

/**
 * Whether an event target is interactive content, or inside it, so a click or Space press there
 * must not move the deck.
 *
 * @param target - The event target. A text node counts as its parent element; anything else that is
 *   not an element, such as the window, counts as not interactive.
 */
export function isInteractiveTarget(target: EventTarget | null): boolean {
  const element =
    target instanceof Node && !(target instanceof Element) ? target.parentElement : target;
  if (!(element instanceof Element)) {
    return false;
  }

  return element.closest(INTERACTIVE_SELECTOR) !== null;
}
