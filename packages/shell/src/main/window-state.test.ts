import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vite-plus/test';

import type { ShellDisplay } from '#protocol/shell-messages.ts';

import { audienceBounds, cornerBounds, presenterBounds } from '#main/window-bounds.ts';
import {
  EMPTY_WINDOW_STATE,
  parseWindowState,
  readWindowState,
  restorableBounds,
  savedWindow,
  withSavedWindow,
  writeWindowState,
} from '#main/window-state.ts';

const DISPLAY: ShellDisplay = {
  id: 1,
  label: '',
  bounds: { x: 0, y: 0, width: 1920, height: 1080 },
  workArea: { x: 0, y: 25, width: 1920, height: 1055 },
  scaleFactor: 2,
  primary: true,
};
const SECOND: ShellDisplay = {
  ...DISPLAY,
  id: 2,
  primary: false,
  bounds: { x: 1920, y: 0, width: 1280, height: 720 },
  workArea: { x: 1920, y: 0, width: 1280, height: 720 },
};

describe('window state', () => {
  it('reads anything broken as empty', () => {
    expect(parseWindowState('nope')).toEqual(EMPTY_WINDOW_STATE);
    expect(parseWindowState('{"version":2,"decks":{}}')).toEqual(EMPTY_WINDOW_STATE);
    expect(parseWindowState('[]')).toEqual(EMPTY_WINDOW_STATE);
  });

  it('keeps each deck and role apart', () => {
    const saved = { bounds: { x: 1, y: 2, width: 800, height: 450 }, displayId: 1 };
    const state = withSavedWindow(
      withSavedWindow(EMPTY_WINDOW_STATE, 'hello', 'audience', saved),
      'hello',
      'presenter',
      { ...saved, displayId: 2 },
    );
    expect(state.decks['hello']?.audience).toEqual(saved);
    expect(state.decks['hello']?.presenter?.displayId).toBe(2);
    expect(parseWindowState(JSON.stringify(state))).toEqual(state);
  });

  it('restores bounds only on the same, still connected display', () => {
    const saved = { bounds: { x: 100, y: 100, width: 800, height: 450 }, displayId: 1 };
    expect(restorableBounds(saved, 1, [DISPLAY, SECOND])).toEqual(saved.bounds);
    expect(restorableBounds(saved, 2, [DISPLAY, SECOND])).toBeUndefined();
    expect(restorableBounds(saved, 1, [SECOND])).toBeUndefined();
    expect(restorableBounds(undefined, 1, [DISPLAY])).toBeUndefined();
    expect(
      restorableBounds({ ...saved, bounds: { ...saved.bounds, x: 5000 } }, 1, [DISPLAY]),
    ).toBeUndefined();
  });

  it('writes through a temporary file and reads it back', () => {
    const dir = mkdtempSync(join(tmpdir(), 'deck-shell-state-'));
    try {
      const file = join(dir, 'nested', 'windows.json');
      const state = withSavedWindow(EMPTY_WINDOW_STATE, 'hello', 'audience', {
        bounds: { x: 1, y: 2, width: 3, height: 4 },
        displayId: 1,
      });
      writeWindowState(file, state);
      expect(readWindowState(file)).toEqual(state);
      expect(readFileSync(file, 'utf8').endsWith('\n')).toBe(true);
      expect(readWindowState(join(dir, 'missing.json'))).toEqual(EMPTY_WINDOW_STATE);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('a hostile or damaged window state file', () => {
  const GOOD = { bounds: { x: 100, y: 100, width: 800, height: 450 }, displayId: 1 };

  it('drops malformed entries instead of failing every later start', () => {
    for (const text of [
      '{"version":1,"decks":{"hello":{"audience":{"displayId":1}}}}',
      '{"version":1,"decks":{"hello":{"audience":null}}}',
      '{"version":1,"decks":{"hello":null}}',
      '{"version":1,"decks":{"hello":[1,2]}}',
      '{"version":1,"decks":[{"audience":{}}]}',
      '{"version":1,"decks":{"hello":{"audience":{"displayId":"1","bounds":{"x":0,"y":0,"width":800,"height":450}}}}}',
      '{"version":1,"decks":{"hello":{"audience":{"displayId":1,"bounds":{"x":0,"y":0,"width":1e999,"height":450}}}}}',
      '{"version":1,"decks":{"hello":{"audience":{"displayId":1,"bounds":null}}}}',
    ]) {
      const state = parseWindowState(text);
      expect(
        () => restorableBounds(state.decks['hello']?.audience, 1, [DISPLAY]),
        text,
      ).not.toThrow();
      expect(
        () => restorableBounds(savedWindow(state, 'hello', 'audience'), 1, [DISPLAY]),
        text,
      ).not.toThrow();
      expect(savedWindow(state, 'hello', 'audience'), text).toBeUndefined();
    }
  });

  it('keeps the valid windows next to broken ones', () => {
    const state = parseWindowState(
      JSON.stringify({
        version: 1,
        decks: { hello: { audience: GOOD, presenter: { displayId: 2 } }, other: 'x' },
      }),
    );
    expect(state.decks).toEqual({ hello: { audience: GOOD } });
  });

  it('never reads a deck or a role from the prototype', () => {
    const state = parseWindowState(
      '{"version":1,"decks":{"__proto__":{"audience":{"displayId":1,"bounds":{"x":0,"y":0,"width":800,"height":450}}}}}',
    );
    expect(savedWindow(state, 'constructor', 'audience')).toBeUndefined();
    expect(savedWindow(state, 'toString', 'audience')).toBeUndefined();
    expect(savedWindow(state, 'hello', 'audience')).toBeUndefined();
    expect(({} as Record<string, unknown>)['audience']).toBeUndefined();
  });

  it('restores bounds only when enough of the window is visible', () => {
    expect(restorableBounds(GOOD, 1, [DISPLAY])).toEqual(GOOD.bounds);
    const sliver = { ...GOOD, bounds: { ...GOOD.bounds, x: 1919 } };
    expect(restorableBounds(sliver, 1, [DISPLAY])).toBeUndefined();
    const above = { ...GOOD, bounds: { ...GOOD.bounds, y: 25 - 449 } };
    expect(restorableBounds(above, 1, [DISPLAY])).toBeUndefined();
  });
});

describe('default window bounds', () => {
  it('centres a 16:9 audience window inside the work area', () => {
    const bounds = audienceBounds(DISPLAY);
    expect(bounds.width / bounds.height).toBeCloseTo(16 / 9, 1);
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.y).toBeGreaterThanOrEqual(25);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(1920);
  });

  it('shrinks the presenter window to a small display and offsets a shared one', () => {
    const small = presenterBounds(SECOND, false);
    expect(small.width).toBeLessThanOrEqual(1280);
    expect(small.height).toBeLessThanOrEqual(720);
    const apart = presenterBounds(DISPLAY, false);
    const shared = presenterBounds(DISPLAY, true);
    expect(shared.x - apart.x).toBe(48);
  });

  it('puts the test window in the bottom right corner', () => {
    const bounds = cornerBounds(DISPLAY);
    expect(bounds.x + bounds.width).toBeLessThan(1920);
    expect(bounds.y + bounds.height).toBeLessThan(1080);
    expect(bounds.x).toBeGreaterThan(1000);
  });
});
