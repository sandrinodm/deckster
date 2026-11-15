import { describe, expect, it } from 'vite-plus/test';

import { clampSize, DOCK_SIZES, loadDockPrefs, saveDockPrefs } from '#runtime/dock-prefs.ts';

/**
 * An in-memory storage.
 */
function memoryStorage(): Pick<Storage, 'getItem' | 'setItem'> {
  const items = new Map<string, string>();
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
  };
}

describe('dock settings', () => {
  it('starts at the position the dev server asked for, at the default sizes', () => {
    expect(loadDockPrefs('hello', 'bottom', memoryStorage())).toEqual({
      position: 'bottom',
      sizes: { right: DOCK_SIZES.right.initial, bottom: DOCK_SIZES.bottom.initial },
      collapsed: false,
      configured: 'bottom',
    });
  });

  it('remembers position, sizes and collapse per deck, until --agent-panel changes', () => {
    const storage = memoryStorage();
    saveDockPrefs(
      'hello',
      {
        position: 'bottom',
        sizes: { right: 500, bottom: 300 },
        collapsed: true,
        configured: 'right',
      },
      storage,
    );
    expect(loadDockPrefs('hello', 'right', storage)).toMatchObject({
      position: 'bottom',
      sizes: { right: 500, bottom: 300 },
      collapsed: true,
    });
    expect(loadDockPrefs('other', 'right', storage).position).toBe('right');
    expect(loadDockPrefs('hello', 'bottom', storage).position).toBe('bottom');
  });

  it('survives storage that throws or holds garbage', () => {
    const throwing = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(loadDockPrefs('hello', 'right', throwing).position).toBe('right');
    expect(() =>
      saveDockPrefs('hello', loadDockPrefs('hello', 'right', throwing), throwing),
    ).not.toThrow();
    const garbage = { getItem: () => '{"sizes":{"right":"wide"},"position":"left"}' };
    expect(loadDockPrefs('hello', 'right', garbage)).toMatchObject({
      position: 'right',
      sizes: { right: DOCK_SIZES.right.initial },
    });
  });

  it('keeps sizes inside the limits and leaves the slide at least 30% of the window', () => {
    expect(clampSize('right', 100)).toBe(DOCK_SIZES.right.min);
    expect(clampSize('right', 9000)).toBe(DOCK_SIZES.right.max);
    expect(clampSize('right', 600, 700)).toBe(490);
    expect(clampSize('bottom', 400, 500)).toBe(350);
  });
});
