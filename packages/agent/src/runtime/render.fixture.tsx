import type { ReactNode } from 'react';

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/**
 * A component rendered into the document for a test.
 */
export type Rendered = {
  /**
   * The element it was rendered into.
   */
  readonly container: HTMLElement;

  /**
   * Renders something else in its place.
   */
  readonly rerender: (node: ReactNode) => void;

  /**
   * Unmounts it and removes the container.
   */
  readonly unmount: () => void;
};

Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);

/**
 * Renders a node into a fresh container in the document.
 *
 * @param node - What to render.
 */
export function render(node: ReactNode): Rendered {
  const container = document.createElement('div');
  document.body.append(container);
  const root: Root = createRoot(container);
  act(() => root.render(node));
  return {
    container,
    rerender: (next) => act(() => root.render(next)),
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

/**
 * Presses a key on an element, bubbling, the way a person would.
 *
 * @param target - The element.
 * @param key - The `KeyboardEvent.key`.
 * @param init - Modifiers.
 */
export function pressKey(
  target: Element,
  key: string,
  init: { readonly shiftKey?: boolean } = {},
): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    shiftKey: init.shiftKey ?? false,
  });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
}

/**
 * Clicks an element.
 *
 * @param target - The element.
 */
export function click(target: Element | null): void {
  if (target === null) {
    throw new Error('Nothing to click.');
  }

  act(() => {
    (target as HTMLElement).click();
  });
}

/**
 * Finds a button by its text or accessible name.
 *
 * @param container - Where to look.
 * @param name - The text, or a pattern.
 */
export function button(container: Element, name: string | RegExp): HTMLButtonElement {
  const found = [...container.querySelectorAll('button')].find((candidate) => {
    const label = candidate.getAttribute('aria-label') ?? candidate.textContent ?? '';
    return typeof name === 'string' ? label.trim() === name : name.test(label);
  });
  if (found === undefined) {
    throw new Error(`No button named ${String(name)}.`);
  }

  return found;
}
