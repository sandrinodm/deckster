import { describe, expect, it } from 'vite-plus/test';

import { keyToAction, type KeyInput } from '#navigation/keyboard.ts';

function press(key: string, modifiers: Partial<KeyInput> = {}): ReturnType<typeof keyToAction> {
  return keyToAction({
    key,
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    ...modifiers,
  });
}

describe('keyToAction', () => {
  it('moves forward on right, down, space and PageDown', () => {
    for (const key of ['ArrowRight', 'ArrowDown', ' ', 'PageDown']) {
      expect(press(key), key).toEqual({ type: 'next' });
    }
  });

  it('moves back on left, up, PageUp and Shift+Space', () => {
    for (const key of ['ArrowLeft', 'ArrowUp', 'PageUp']) {
      expect(press(key), key).toEqual({ type: 'prev' });
    }

    expect(press(' ', { shiftKey: true })).toEqual({ type: 'prev' });
  });

  it('jumps to the ends on Home and End', () => {
    expect(press('Home')).toEqual({ type: 'first' });
    expect(press('End')).toEqual({ type: 'last' });
  });

  it('leaves browser shortcuts and other keys alone', () => {
    expect(press('ArrowRight', { metaKey: true })).toBeUndefined();
    expect(press('ArrowLeft', { altKey: true })).toBeUndefined();
    expect(press('Home', { ctrlKey: true })).toBeUndefined();
    expect(press('f')).toBeUndefined();
    expect(press('Enter')).toBeUndefined();
  });
});
