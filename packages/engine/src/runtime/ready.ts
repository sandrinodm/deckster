import type { ReadinessRegistry } from '#readiness/readiness-registry.ts';

/**
 * How long `ready()` waits for a slide to settle before it gives up, in milliseconds.
 */
export const READY_TIMEOUT_MS = 30_000;

/**
 * Milliseconds per second, for the timeout in the error message.
 */
const MS_PER_SECOND = 1000;

/**
 * Matches each `url(...)` in a computed `background-image`, capturing the URL.
 */
const CSS_URL_PATTERN = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/g;

/**
 * The pseudo-elements whose backgrounds are checked besides the element's own.
 */
const PSEUDO_ELEMENTS = ['::before', '::after'] as const;

/**
 * What the wait for web fonts is called in the error.
 */
const FONTS_WAIT = 'web fonts are still loading';

/**
 * How many pending waits the deadline error names before it says how many more there were.
 */
const MAX_NAMED_WAITS = 5;

/**
 * What {@link waitUntilReady} waits for.
 */
export type ReadyTarget = {
  /**
   * The deck's root element.
   */
  root: HTMLElement;

  /**
   * The zero-based indexes of the slides to wait for: the one on screen, or all in static mode.
   */
  slides: readonly number[];

  /**
   * The holds components placed with `useReadyHold`.
   */
  readiness: ReadinessRegistry;

  /**
   * Whether a step the deck was sent to still waits for its slide to settle; it lands once the
   * slide's holds are released, a commit later.
   */
  isPending?: () => boolean;
};

/**
 * Resolves once the given slides are ready to capture: React has painted, no component holds them
 * (`useReadyHold`), web fonts have loaded, and every `<img>` and CSS background image on them
 * (pseudo-elements included) has loaded or failed. It checks again after each wait, because
 * released holds and loaded fonts can bring new content, and resolves after a pass that found
 * nothing left to wait for, holds read again after the last wait, with no requested step still
 * pending. A failed image does not reject, so a broken asset shows up in the screenshot instead of
 * hanging the export. One deadline of {@link READY_TIMEOUT_MS} covers the whole wait; on expiry
 * every waiter and listener it added is removed.
 *
 * @param target - The deck root, the slides, the readiness holds and the pending step.
 * @throws Error (as a rejection) after {@link READY_TIMEOUT_MS}, naming what was still pending: the
 *   slides still held, web fonts or images that never finished, or the requested step that never
 *   landed.
 */
export async function waitUntilReady(target: ReadyTarget): Promise<void> {
  const controller = new AbortController();
  const waiting = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      const error = gaveUpError(target, waiting);
      controller.abort();
      reject(error);
    }, READY_TIMEOUT_MS);
  });
  try {
    await Promise.race([settleSlides(target, controller.signal, waiting), expired]);
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

/**
 * Loops until a pass finds nothing left to wait for. Stops quietly when the signal aborts, which
 * {@link waitUntilReady} does at its deadline.
 *
 * @param target - The deck root, the slides, the readiness holds and the pending step.
 * @param signal - Aborts every wait and removes its listeners.
 * @param waiting - Receives what the pass is waiting for, for the error at the deadline.
 */
async function settleSlides(
  target: ReadyTarget,
  signal: AbortSignal,
  waiting: Set<string>,
): Promise<void> {
  const seen = new Set<string>();
  while (!signal.aborted) {
    await nextFrame(signal);
    await nextFrame(signal);
    const heldBefore = target.readiness.heldSlides(target.slides);
    await target.readiness.whenReleased(target.slides, signal);
    const fontsLoading = document.fonts.status === 'loading';
    waiting.add(FONTS_WAIT);
    await document.fonts.ready;
    waiting.delete(FONTS_WAIT);
    const sections = slideSections(target);
    const images = sections.flatMap((section) => Array.from(section.querySelectorAll('img')));
    const loadingImages = images.filter((image) => !image.complete);
    const backgrounds = backgroundUrls(sections).filter((url) => !seen.has(url));
    for (const url of backgrounds) {
      seen.add(url);
    }

    const loads = [
      ...loadingImages.map((image) => trackedImage(image, image.currentSrc || image.src, waiting)),
      ...backgrounds.map((url) => trackedPreload(url, waiting)),
    ];
    await Promise.all(loads.map((load) => load(signal)));
    // Holds and the step are read again now: a component can hold a slide during any wait above.
    const heldAfter = target.readiness.heldSlides(target.slides);
    const pending = target.isPending?.() ?? false;
    if (
      !pending &&
      heldBefore.length === 0 &&
      heldAfter.length === 0 &&
      !fontsLoading &&
      loadingImages.length === 0 &&
      backgrounds.length === 0
    ) {
      return;
    }
  }
}

/**
 * A wait for an image element, marked as pending until it settles.
 *
 * @param image - The image.
 * @param label - The URL, for the error.
 * @param waiting - The set of pending waits.
 */
function trackedImage(
  image: HTMLImageElement,
  label: string,
  waiting: Set<string>,
): (signal: AbortSignal) => Promise<void> {
  return (signal) => tracked(waitForImage(image, signal), `image ${label} has not loaded`, waiting);
}

/**
 * A wait for a background image, marked as pending until it settles.
 *
 * @param url - The image URL.
 * @param waiting - The set of pending waits.
 */
function trackedPreload(url: string, waiting: Set<string>): (signal: AbortSignal) => Promise<void> {
  return (signal) => tracked(preloadImage(url, signal), `image ${url} has not loaded`, waiting);
}

/**
 * Marks a wait as pending until its promise settles.
 *
 * @param promise - The wait.
 * @param label - What it waits for, for the error.
 * @param waiting - The set of pending waits.
 */
async function tracked(promise: Promise<void>, label: string, waiting: Set<string>): Promise<void> {
  waiting.add(label);
  await promise;
  waiting.delete(label);
}

/**
 * The stage sections of the target slides; `SlideView` copies are not waited for.
 *
 * @param target - The deck root and the slides.
 */
function slideSections(target: ReadyTarget): HTMLElement[] {
  return target.slides.flatMap((slide) =>
    Array.from(
      target.root.querySelectorAll<HTMLElement>(
        `section[data-slide-active][data-slide-index="${slide}"]`,
      ),
    ),
  );
}

/**
 * The URLs of the CSS background images on the sections and everything inside them, their
 * `::before` and `::after` included.
 *
 * @param sections - The slide sections.
 */
function backgroundUrls(sections: readonly HTMLElement[]): string[] {
  const urls = new Set<string>();
  for (const section of sections) {
    for (const element of [section, ...Array.from(section.querySelectorAll('*'))]) {
      addBackgroundUrls(element, urls);
    }
  }

  return [...urls];
}

/**
 * Adds the background image URLs of one element and its pseudo-elements to a set.
 *
 * @param element - The element to read.
 * @param urls - The set the URLs are added to, in the order they are found.
 */
function addBackgroundUrls(element: Element, urls: Set<string>): void {
  for (const pseudo of [null, ...PSEUDO_ELEMENTS]) {
    for (const url of cssUrls(getComputedStyle(element, pseudo).backgroundImage)) {
      urls.add(url);
    }
  }
}

/**
 * The URLs in a computed `background-image` value; none for `none` or gradients.
 *
 * @param value - The computed value.
 */
function cssUrls(value: string): string[] {
  if (!value.includes('url(')) {
    return [];
  }

  return Array.from(value.matchAll(CSS_URL_PATTERN), (match) =>
    (match[1] ?? match[2] ?? match[3] ?? '').trim(),
  ).filter((url) => url !== '');
}

/**
 * Resolves once an image URL has loaded or failed; the browser's cache makes a background that is
 * already shown resolve at once.
 *
 * @param url - The image URL.
 * @param signal - Stops the wait and removes its listeners.
 */
function preloadImage(url: string, signal: AbortSignal): Promise<void> {
  const image = new Image();
  image.src = url;
  return waitForImage(image, signal);
}

/**
 * Resolves on the next animation frame, or at once when the signal aborts.
 *
 * @param signal - Stops the wait.
 */
function nextFrame(signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }

    const frame = requestAnimationFrame(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    });
    /**
     * Cancels the frame and resolves.
     */
    function onAbort(): void {
      cancelAnimationFrame(frame);
      resolve();
    }

    signal.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Resolves once an image has loaded or failed to load, or when the signal aborts; never rejects.
 * Its listeners are removed whichever comes first.
 *
 * @param image - The image to wait for.
 * @param signal - Stops the wait and removes its listeners.
 */
function waitForImage(image: HTMLImageElement, signal: AbortSignal): Promise<void> {
  if (image.complete || signal.aborted) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    /**
     * Removes the listeners and resolves.
     */
    const done = (): void => {
      image.removeEventListener('load', done);
      image.removeEventListener('error', done);
      signal.removeEventListener('abort', done);
      resolve();
    };
    image.addEventListener('load', done, { once: true });
    image.addEventListener('error', done, { once: true });
    signal.addEventListener('abort', done, { once: true });
  });
}

/**
 * The error at the deadline, naming everything still pending.
 *
 * @param target - The slides, the holds and the pending step.
 * @param waiting - The waits in progress.
 */
function gaveUpError(target: ReadyTarget, waiting: ReadonlySet<string>): Error {
  const held = target.readiness.heldSlides(target.slides).map((slide) => slide + 1);
  const reasons: string[] = [];
  if (held.length > 0) {
    reasons.push(
      `slide ${held.join(', ')} is still held. ` +
        'A component called useReadyHold(true) and never released it; pass false once its ' +
        'content has loaded.',
    );
  }

  if (held.length === 0 && (target.isPending?.() ?? false)) {
    reasons.push(
      'the step the deck was sent to never landed, because the slide never reported a final ' +
        'step count.',
    );
  }

  const others = [...waiting];
  if (others.length > 0) {
    const shown = others.slice(0, MAX_NAMED_WAITS);
    const more = others.length > shown.length ? ` and ${others.length - shown.length} more` : '';
    reasons.push(`${shown.join('; ')}${more}.`);
  }

  return new Error(
    `ready() gave up after ${READY_TIMEOUT_MS / MS_PER_SECOND}s: ${reasons.join(' ') || 'the slides never settled.'}`,
  );
}
