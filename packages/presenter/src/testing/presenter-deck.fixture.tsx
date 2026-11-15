import type { DeckManifest, SlideEntry, SlideMeta } from '@deckster/engine';

import { Deck, Step } from '@deckster/engine';
import { act, type ComponentType, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

import presenterPlugin from '#runtime.ts';
import { uiState } from '#ui/ui-state.ts';

/**
 * Lets React flush `act()` updates synchronously in tests.
 */
Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);

// happy-dom has no FontFaceSet; ready() only needs its status and promise.
if (!('fonts' in document)) {
  Object.defineProperty(document, 'fonts', {
    value: { status: 'loaded', ready: Promise.resolve() },
  });
}

/**
 * The state the presenter tools start in, restored before each test.
 */
const INITIAL_UI = uiState.get();

/**
 * A TSX slide for tests.
 *
 * @param id - The slide id.
 * @param body - What it renders.
 * @param meta - Overrides for its metadata.
 * @param budget - Its `budget:` frontmatter, such as `20s`.
 */
export function slide(
  id: string,
  body: ComponentType,
  meta: Partial<SlideMeta> = {},
  budget?: string,
): SlideEntry {
  return {
    id,
    file: `slides/${id}.tsx`,
    kind: 'tsx',
    module: {
      default: body,
      slideMeta: {
        frontmatter: { layout: 'default', ...(budget === undefined ? {} : { budget }) },
        title: id,
        notes: '',
        slots: [],
        ...meta,
      },
    },
  };
}

/**
 * A slide that reveals three points, so four deck steps.
 */
function ThreePoints(): ReactNode {
  return (
    <>
      <h2>How steps work</h2>
      {[1, 2, 3].map((at) => (
        <Step key={at} at={at}>
          <p>{`point ${at}`}</p>
        </Step>
      ))}
    </>
  );
}

/**
 * The hello deck's shape: a title, a slide with three steps and notes, and a closing slide. The
 * budgets add up to 2 minutes of a 4-minute talk, so the presenter view plans each at twice its
 * budget.
 */
export const TEST_DECK: DeckManifest = {
  id: 'presenter-test',
  title: 'Presenter test',
  brand: 'default',
  durationSeconds: 240,
  slides: [
    slide('title', () => <h1>Title</h1>, {}, '20s'),
    slide(
      'steps',
      ThreePoints,
      {
        title: 'How steps work',
        notes: 'Say **this** first.\n\n- one\n- `two`\n\n<b>raw</b> [docs](https://example.com)',
      },
      '40s',
    ),
    slide('closing', () => <h1>Thanks</h1>, {}, '1m'),
  ],
};

/**
 * A deck rendered with the presenter tools.
 */
export type MountedPresenterDeck = {
  /**
   * Unmounts the deck and removes its container.
   */
  unmount: () => void;
};

/**
 * Renders a deck with the presenter plugin at a URL, as the audience window (`/`) or the presenter
 * window (`/?presenter`).
 *
 * @param url - The page URL, with its hash.
 * @param manifest - The deck; {@link TEST_DECK} by default.
 */
export function renderPresenterDeck(
  url: string,
  manifest: DeckManifest = TEST_DECK,
): MountedPresenterDeck {
  window.history.replaceState(null, '', url);
  uiState.set(INITIAL_UI);
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(<Deck manifest={manifest} plugins={[presenterPlugin]} />);
  });
  return {
    unmount: () => {
      act(() => root.unmount());
      container.remove();
      uiState.set(INITIAL_UI);
    },
  };
}

/**
 * Presses a key on an element (the window by default) inside `act()`.
 *
 * @param key - The `key` value.
 * @param target - Where the key is pressed.
 * @param init - Modifiers.
 * @returns The event, to check whether something prevented its default.
 */
export function press(
  key: string,
  target: EventTarget = window,
  init: KeyboardEventInit = {},
): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
}

/**
 * Clicks an element inside `act()`.
 *
 * @param target - The element.
 */
export function click(target: Element): void {
  act(() => {
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
  });
}

/**
 * The element a selector names, failing the test when there is none.
 *
 * @param selector - A CSS selector.
 */
export function find(selector: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(selector);
  if (element === null) {
    throw new Error(`Nothing matches ${selector}.`);
  }

  return element;
}
