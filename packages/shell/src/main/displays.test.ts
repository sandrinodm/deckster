import { describe, expect, it } from 'vite-plus/test';

import type { ShellDisplay } from '#protocol/shell-messages.ts';

import {
  findDisplay,
  listDisplays,
  nextDisplay,
  operatorDisplay,
  presenterDisplay,
} from '#main/displays.ts';

const RECT = { x: 0, y: 0, width: 100, height: 100 };

function display(id: number, primary: boolean): ShellDisplay {
  return { id, label: `d${id}`, bounds: RECT, workArea: RECT, scaleFactor: 1, primary };
}

describe('displays', () => {
  it('lists Electron displays as plain data with the primary marked', () => {
    const raw = [1, 2].map((id) => ({
      id,
      label: `d${id}`,
      bounds: RECT,
      workArea: RECT,
      scaleFactor: 1,
    }));
    const listed = listDisplays({
      getAllDisplays: () => raw,
      getPrimaryDisplay: () => raw[1]!,
      getDisplayMatching: () => raw[0]!,
    });
    expect(listed.map((d) => [d.id, d.primary])).toEqual([
      [1, false],
      [2, true],
    ]);
  });

  it('finds displays and picks the one other than the audience', () => {
    const displays = [display(1, true), display(2, false), display(3, false)];
    expect(findDisplay(displays, 2)?.id).toBe(2);
    expect(findDisplay(displays, 9)).toBeUndefined();
    expect(findDisplay(displays, undefined)).toBeUndefined();
    expect(presenterDisplay(displays, 1)?.id).toBe(2);
    expect(presenterDisplay(displays, 2)?.id).toBe(1);
    expect(presenterDisplay([display(1, true)], 1)?.id).toBe(1);
  });

  it('keeps the gallery off the planned audience display when there is an alternative', () => {
    const primary = display(2, true);
    const projector = display(1, false);
    const extra = display(3, false);
    const displays = [projector, primary, extra];
    expect(operatorDisplay(displays, projector.id, projector.id)).toBe(primary);
    expect(operatorDisplay(displays, projector.id, extra.id)).toBe(extra);
    expect(operatorDisplay(displays, primary.id, undefined)).toBe(projector);
    expect(operatorDisplay([primary], primary.id, primary.id)).toBe(primary);
    expect(operatorDisplay([], projector.id, primary.id)).toBeUndefined();
  });

  it('cycles to the next display', () => {
    const displays = [display(1, true), display(2, false)];
    expect(nextDisplay(displays, 1)?.id).toBe(2);
    expect(nextDisplay(displays, 2)?.id).toBe(1);
  });
});
