import type { DeckControls } from '@deckster/engine';

import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { formatKey, normalizeKey } from '#shortcuts/key-format.ts';
import {
  clearShortcuts,
  dispatchShortcut,
  groupShortcuts,
  listShortcuts,
  registerShortcut,
} from '#shortcuts/shortcut-registry.ts';

/**
 * A key press with only the fields the registry reads.
 */
function press(key: string, modifiers: Partial<KeyboardEvent> = {}): KeyboardEvent {
  const event = { key, ctrlKey: false, altKey: false, metaKey: false, ...modifiers };
  return event as KeyboardEvent;
}

/**
 * The deck is never read by these handlers.
 */
const deck = {} as DeckControls;

describe('shortcut registry', () => {
  afterEach(clearShortcuts);

  it('runs the shortcut whose key was pressed, in either case', () => {
    const run = vi.fn();
    registerShortcut({ id: 'sidebar', keys: ['s'], label: 'Sidebar', group: 'Panels', run });
    expect(dispatchShortcut({ event: press('S'), deck }, 'audience')).toBe(true);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('leaves Ctrl, Alt and Meta presses to the browser', () => {
    const run = vi.fn();
    registerShortcut({ id: 'sidebar', keys: ['s'], label: 'Sidebar', group: 'Panels', run });
    expect(dispatchShortcut({ event: press('s', { metaKey: true }), deck }, 'audience')).toBe(
      false,
    );
    expect(run).not.toHaveBeenCalled();
  });

  it('declines when the handler returns false and for documentation-only shortcuts', () => {
    registerShortcut({ id: 'a', keys: ['a'], label: 'A', group: 'G', run: () => false });
    registerShortcut({ id: 'arrows', keys: ['ArrowRight'], label: 'Next', group: 'G' });
    expect(dispatchShortcut({ event: press('a'), deck }, 'audience')).toBe(false);
    expect(dispatchShortcut({ event: press('ArrowRight'), deck }, 'audience')).toBe(false);
  });

  it('respects the window a shortcut belongs to', () => {
    const run = vi.fn();
    registerShortcut({ id: 'o', keys: ['o'], label: 'O', group: 'G', window: 'audience', run });
    expect(dispatchShortcut({ event: press('o'), deck }, 'presenter')).toBe(false);
    expect(dispatchShortcut({ event: press('o'), deck }, 'audience')).toBe(true);
  });

  it('replaces a shortcut registered again under the same id', () => {
    registerShortcut({ id: 'x', keys: ['x'], label: 'Old', group: 'G' });
    registerShortcut({ id: 'x', keys: ['y'], label: 'New', group: 'G' });
    expect(listShortcuts().map((shortcut) => shortcut.label)).toEqual(['New']);
  });

  it('throws naming both shortcuts when a key is taken in the same window', () => {
    registerShortcut({ id: 'first', keys: ['k'], label: 'First', group: 'G' });
    expect(() =>
      registerShortcut({ id: 'second', keys: ['K'], label: 'Second', group: 'G' }),
    ).toThrow(/"second" uses "K", which "first" already uses/);
  });

  it('lets two shortcuts share a key when they work in different windows', () => {
    registerShortcut({ id: 'a', keys: ['k'], label: 'A', group: 'G', window: 'audience' });
    expect(() =>
      registerShortcut({ id: 'p', keys: ['k'], label: 'P', group: 'G', window: 'presenter' }),
    ).not.toThrow();
  });

  it('removes a shortcut with the function register returns', () => {
    const remove = registerShortcut({ id: 'x', keys: ['x'], label: 'X', group: 'G' });
    remove();
    expect(listShortcuts()).toEqual([]);
  });

  it('groups what applies in a window, in registration order', () => {
    registerShortcut({ id: 'a', keys: ['a'], label: 'A', group: 'One' });
    registerShortcut({ id: 'b', keys: ['b'], label: 'B', group: 'Two', window: 'presenter' });
    registerShortcut({ id: 'c', keys: ['c'], label: 'C', group: 'One', window: 'audience' });
    const audience = groupShortcuts('audience');
    expect(audience.map(({ group }) => group)).toEqual(['One']);
    expect(audience[0]?.shortcuts.map(({ id }) => id)).toEqual(['a', 'c']);
    expect(groupShortcuts('presenter').map(({ group }) => group)).toEqual(['One', 'Two']);
  });
});

describe('key formatting', () => {
  it('names special keys and upper-cases letters', () => {
    expect(formatKey('ArrowLeft')).toBe('←');
    expect(formatKey(' ')).toBe('Space');
    expect(formatKey('s')).toBe('S');
    expect(formatKey('?')).toBe('?');
    expect(normalizeKey('S')).toBe('s');
    expect(normalizeKey('Enter')).toBe('Enter');
  });
});
