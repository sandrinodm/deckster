/**
 * The attribute that names an element for a morph: an element on one slide and an element on the
 * next one with the same value fly from one place to the other when the deck moves between them. A
 * marked element that is `display: contents` (a wrapper with no box of its own, as the kit's
 * `Morph` is) stands for its first child element, which flies in its place.
 */
export const MORPH_ATTRIBUTE = 'data-morph';

/**
 * Marks the outgoing slide's copy of a morphing element while the morph plays, so the slide that
 * stays in place under the incoming one does not show it a second time; `deck.css` hides it.
 */
const AWAY_ATTRIBUTE = 'data-morph-away';

/**
 * Marks an element that arrived by a morph on the slide on screen, until the deck leaves that
 * slide, so a stylesheet can keep an entrance animation from fading it in a second time; the kit's
 * `morph.css` does for its slide entrance.
 */
export const MORPH_ARRIVED_ATTRIBUTE = 'data-morph-arrived';

/**
 * The prefix of the `view-transition-name` a pair gets. The names are numbered rather than taken
 * from the author's value, so any value works and two decks on one page cannot clash.
 */
const NAME_PREFIX = 'deck-morph-';

/**
 * The stage slide at a zero-based index inside the canvas, if it is mounted.
 *
 * @param canvas - The deck's canvas.
 * @param index - The slide index.
 */
export function stageSlide(canvas: Element, index: number): Element | undefined {
  return canvas.querySelector(`:scope > .deck-slide[data-slide-index="${index}"]`) ?? undefined;
}

/**
 * The morph names on a slide, shown or not; a cheap test for whether a move could morph at all,
 * made before the incoming slide is on screen.
 *
 * @param slide - A stage slide.
 */
export function morphNames(slide: Element): ReadonlySet<string> {
  const names = new Set<string>();
  for (const element of slide.querySelectorAll(`[${MORPH_ATTRIBUTE}]`)) {
    names.add(element.getAttribute(MORPH_ATTRIBUTE) ?? '');
  }

  names.delete('');
  return names;
}

/**
 * The elements a slide shows for each morph name: the first one with that name that is rendered and
 * visible (not in a step that is still hidden), or its first child for a `display: contents`
 * wrapper. A second element with the same name does not morph.
 *
 * @param slide - A stage slide on screen.
 * @param names - The names to look for; every name when left out.
 */
export function shownMorphs(
  slide: Element,
  names?: ReadonlySet<string>,
): ReadonlyMap<string, HTMLElement> {
  const shown = new Map<string, HTMLElement>();
  for (const marked of slide.querySelectorAll<HTMLElement>(`[${MORPH_ATTRIBUTE}]`)) {
    const name = marked.getAttribute(MORPH_ATTRIBUTE) ?? '';
    const isWanted = name !== '' && !shown.has(name) && (names === undefined || names.has(name));
    const element = isWanted ? flyingElement(marked) : undefined;
    if (element !== undefined && isShown(element, slide)) {
      shown.set(name, element);
    }
  }

  return shown;
}

/**
 * The elements of one morph that carry a transition name, so they can be cleared again.
 */
export type NamedMorphs = {
  /**
   * The `view-transition-name` each morph name was given, by morph name.
   */
  names: ReadonlyMap<string, string>;

  /**
   * Every element that carries a name or the away mark.
   */
  elements: HTMLElement[];
};

/**
 * Gives the outgoing slide's morphing elements their transition names before the old state is
 * captured.
 *
 * @param outgoing - Each morph name's element on the slide on screen.
 * @returns The names given, for {@link nameIncoming} and {@link clearMorphs}.
 */
export function nameOutgoing(outgoing: ReadonlyMap<string, HTMLElement>): NamedMorphs {
  const names = new Map<string, string>();
  const elements: HTMLElement[] = [];
  for (const [name, element] of outgoing) {
    const transitionName = `${NAME_PREFIX}${names.size}`;
    names.set(name, transitionName);
    element.style.viewTransitionName = transitionName;
    elements.push(element);
  }

  return { names, elements };
}

/**
 * Moves the transition names from the outgoing slide's elements to the incoming slide's, after the
 * deck has moved and before the new state is captured. The outgoing copies are hidden while the
 * morph plays; a name the incoming slide does not show fades out where it was. When the moves
 * brought the deck back to the slide it started on, its elements keep their names and stay. The
 * incoming elements are marked {@link MORPH_ARRIVED_ATTRIBUTE} until the deck leaves the slide.
 *
 * @param named - The names {@link nameOutgoing} gave.
 * @param incoming - The slide now on screen.
 */
export function nameIncoming(named: NamedMorphs, incoming: Element | undefined): void {
  const shown =
    incoming === undefined ? new Map() : shownMorphs(incoming, new Set(named.names.keys()));
  const staying = new Set<HTMLElement>(shown.values());
  for (const element of named.elements) {
    if (!staying.has(element)) {
      element.style.viewTransitionName = '';
      element.setAttribute(AWAY_ATTRIBUTE, '');
    }
  }

  for (const [name, element] of shown) {
    element.style.viewTransitionName = named.names.get(name) ?? '';
    element.setAttribute(MORPH_ARRIVED_ATTRIBUTE, '');
    if (!named.elements.includes(element)) {
      named.elements.push(element);
    }
  }
}

/**
 * Takes the transition names and the away marks off again once the morph has ended.
 *
 * @param named - The names given for the morph.
 */
export function clearMorphs(named: NamedMorphs): void {
  for (const element of named.elements) {
    element.style.viewTransitionName = '';
    element.removeAttribute(AWAY_ATTRIBUTE);
  }

  named.elements.length = 0;
}

/**
 * Takes the arrival marks off the elements of every stage slide but the one on screen, once the
 * deck has left the slide they arrived on.
 *
 * @param canvas - The deck's canvas.
 */
export function clearArrivals(canvas: Element): void {
  const left = `:scope > .deck-slide:not([data-slide-state="current"]) [${MORPH_ARRIVED_ATTRIBUTE}]`;
  for (const element of canvas.querySelectorAll(left)) {
    element.removeAttribute(MORPH_ARRIVED_ATTRIBUTE);
  }
}

/**
 * The element that flies for a marked one: the element itself, or the first child element of a
 * `display: contents` wrapper, which has no box to capture.
 *
 * @param marked - An element with {@link MORPH_ATTRIBUTE}.
 * @returns The element, or `undefined` for a wrapper with no child element.
 */
function flyingElement(marked: HTMLElement): HTMLElement | undefined {
  if (getComputedStyle(marked).display !== 'contents') {
    return marked;
  }

  const child = marked.firstElementChild;
  return child instanceof HTMLElement ? child : undefined;
}

/**
 * Whether an element is rendered and visible on its slide: not `display: none`, not in a hidden
 * step. It is read right after the deck has moved, while the incoming slide's own visibility has
 * just switched on, so an element whose visibility is still in a transition counts with the value
 * the transition goes to: a part that fades its visibility in with the slide is shown, a step that
 * stays hidden is not.
 *
 * @param element - The element to test, which may sit inside a step that is still hidden.
 * @param slide - The stage slide it is on, where the walk up its ancestors stops.
 */
function isShown(element: HTMLElement, slide: Element): boolean {
  if (typeof element.checkVisibility === 'function' && !element.checkVisibility()) {
    return false;
  }

  let node: Element | null = element;
  while (node !== null) {
    const target = visibilityTarget(node);
    if (target !== undefined) {
      return isVisibleValue(target);
    }

    if (isVisibleValue(getComputedStyle(node).visibility)) {
      return true;
    }

    // Hidden now: shown only when the hidden comes from an ancestor that is turning visible.
    const parent: Element | null = node.parentElement;
    if (node === slide || (parent !== null && isSettledVisible(parent))) {
      return false;
    }

    node = parent;
  }

  return false;
}

/**
 * Whether an element is visible and not in a visibility transition.
 *
 * @param element - The element to check; a visibility transition it is running makes it unsettled.
 */
function isSettledVisible(element: Element): boolean {
  return (
    visibilityTarget(element) === undefined && isVisibleValue(getComputedStyle(element).visibility)
  );
}

/**
 * Whether a `visibility` value shows the element: anything but `hidden` and `collapse`.
 *
 * @param value - The computed value.
 */
function isVisibleValue(value: string): boolean {
  return value !== 'hidden' && value !== 'collapse';
}

/**
 * The visibility an element's running visibility transition goes to, if it has one.
 *
 * @param element - The element whose running animations are read.
 */
function visibilityTarget(element: Element): string | undefined {
  if (typeof element.getAnimations !== 'function' || typeof CSSTransition === 'undefined') {
    return undefined;
  }

  for (const animation of element.getAnimations()) {
    const isVisibility =
      animation instanceof CSSTransition && animation.transitionProperty === 'visibility';
    const effect = isVisibility ? animation.effect : null;
    const keyframes = effect instanceof KeyframeEffect ? effect.getKeyframes() : [];
    const last = keyframes.at(-1)?.['visibility'];
    if (typeof last === 'string') {
      return last;
    }
  }

  return undefined;
}
