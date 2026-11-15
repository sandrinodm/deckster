import type { MDXComponents } from 'mdx/types';

import { act, createElement, type ComponentType, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import type { DeckManifest, SlideEntry, SlideMeta } from '#contract/manifest.ts';
import type { DeckPlugin } from '#plugins/deck-plugin.ts';

import { SLOT_ELEMENT, SLOTS_ELEMENT } from '#contract/slots.ts';
import { Deck } from '#deck/deck.tsx';

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
 * What a test slide renders, given the components MDX would pass it.
 */
type RenderSlide = (components: MDXComponents) => ReactNode;

/**
 * A slide the way the build would emit an MDX slide: its content wrapped in `<DeckSlots>`, with
 * `slot(name, ...)` for each top-level slot tag.
 *
 * @param id - The slide id.
 * @param render - Builds the top-level content from the components the engine passes.
 * @param meta - Overrides for the slide metadata.
 */
export function mdxSlide(
  id: string,
  render: RenderSlide,
  meta: Partial<SlideMeta> = {},
): SlideEntry {
  /**
   * The compiled MDX content.
   */
  const Content = ({ components = {} }: { components?: MDXComponents }) =>
    createElement(component(components, SLOTS_ELEMENT), null, render(components));
  return {
    id,
    file: `slides/${id}.mdx`,
    kind: 'mdx',
    module: { default: Content, slideMeta: slideMeta(id, meta) },
  };
}

/**
 * A top-level slot element as the build writes `<Left>` in an MDX slide.
 *
 * @param components - The components the engine passes.
 * @param name - The slot name.
 * @param children - The slot content.
 */
export function slot(components: MDXComponents, name: string, children: ReactNode): ReactNode {
  return createElement(component(components, SLOT_ELEMENT), { key: name, name }, children);
}

/**
 * A TSX slide: its default export fills `body`, and `exports` fill named slots.
 *
 * @param id - The slide id.
 * @param body - The default export.
 * @param meta - Overrides for the slide metadata.
 * @param exports - Slot components by tag name, such as `{ Left }`.
 */
export function tsxSlide(
  id: string,
  body: ComponentType,
  meta: Partial<SlideMeta> = {},
  exports: Record<string, ComponentType> = {},
): SlideEntry {
  return {
    id,
    file: `slides/${id}.tsx`,
    kind: 'tsx',
    module: { ...exports, default: body, slideMeta: slideMeta(id, meta) },
  };
}

/**
 * A deck manifest of the given slides.
 *
 * @param slides - The slides, in order.
 */
export function manifestOf(...slides: SlideEntry[]): DeckManifest {
  return { id: 'test', title: 'Test deck', brand: 'default', slides };
}

/**
 * A mounted deck, removed by `unmount`.
 */
export type MountedDeck = {
  /**
   * The element the deck renders into.
   */
  container: HTMLElement;

  /**
   * Unmounts the deck and removes its container.
   */
  unmount: () => void;
};

/**
 * Renders a deck into a fresh container inside `act()`.
 *
 * @param manifest - The deck.
 * @param options - Plugins and static mode.
 */
export function renderDeck(
  manifest: DeckManifest,
  options: { plugins?: readonly DeckPlugin[]; isStatic?: boolean } = {},
): MountedDeck {
  const container = document.createElement('div');
  document.body.append(container);
  const root: Root = createRoot(container);
  act(() => {
    root.render(<Deck manifest={manifest} {...options} />);
  });
  return {
    container,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

/**
 * Presses a key on the window, or on `target`, inside `act()`.
 *
 * @param key - The `key` value, such as `ArrowRight` or a space.
 * @param target - The element the key is pressed on; the window by default.
 */
export function press(key: string, target: EventTarget = window): void {
  act(() => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  });
}

/**
 * Lets pending timers and promises run inside `act()`.
 *
 * @param ms - How long to wait, in milliseconds.
 */
export async function wait(ms: number): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

/**
 * The slide metadata of a test slide.
 *
 * @param id - The slide id.
 * @param meta - Overrides.
 */
function slideMeta(id: string, meta: Partial<SlideMeta>): SlideMeta {
  return {
    frontmatter: { layout: 'default' },
    title: id,
    notes: '',
    slots: [],
    ...meta,
  };
}

/**
 * A component from the MDX components, failing the test when the engine did not pass it.
 *
 * @param components - The components the engine passes.
 * @param name - The component name.
 */
function component(components: MDXComponents, name: string): ComponentType<{ name?: string }> {
  const found: unknown = components[name];
  if (typeof found !== 'function') {
    throw new Error(`The engine passed no ${name} component.`);
  }

  return found as ComponentType<{ name?: string }>;
}
