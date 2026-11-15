import { describe, expect, it } from 'vite-plus/test';

import {
  focusAt,
  highlightAts,
  linesOutOfRange,
  parseHighlight,
  parseLineRanges,
} from '#code/highlight-spec.ts';

describe('parseLineRanges', () => {
  it('reads numbers and ranges', () => {
    expect([...(parseLineRanges('2-4,7') ?? [])]).toEqual([2, 3, 4, 7]);
  });

  it('treats empty, star, dash and none as clearing the focus', () => {
    for (const entry of ['', '*', '-', 'none', '  ']) {
      expect(parseLineRanges(entry)).toBeUndefined();
    }
  });

  it('rejects reversed ranges, zero and words, naming the entry', () => {
    expect(() => parseLineRanges('4-2')).toThrow(/"4-2".*not a line or a range/);
    expect(() => parseLineRanges('0')).toThrow(RangeError);
    expect(() => parseLineRanges('a')).toThrow(/"a"/);
    expect(() => parseLineRanges('1-99999')).toThrow(RangeError);
  });
});

describe('parseHighlight', () => {
  it('numbers the steps of a string from the first step', () => {
    const steps = parseHighlight('2-4|7');
    expect(steps.map((step) => step.at)).toEqual([1, 2]);
    expect([...(steps[1]?.lines ?? [])]).toEqual([7]);
  });

  it('starts at a chosen step, for strings and lists', () => {
    expect(parseHighlight('1|2', 3).map((step) => step.at)).toEqual([3, 4]);
    expect(parseHighlight(['1', '2'], 2).map((step) => step.at)).toEqual([2, 3]);
  });

  it('reads an object keyed by step, in ascending order', () => {
    const steps = parseHighlight({ 3: '9', 1: '2-4' });
    expect(highlightAts(steps)).toEqual([1, 3]);
  });

  it('returns no steps for no input', () => {
    expect(parseHighlight(undefined)).toEqual([]);
  });

  it('rejects a step below 1', () => {
    expect(() => parseHighlight({ 0: '1' })).toThrow(/not valid/);
  });
});

describe('focusAt', () => {
  const steps = parseHighlight('2-4||7');

  it('focuses nothing before the first step', () => {
    expect(focusAt(steps, 0)).toBeUndefined();
  });

  it('follows the latest step reached', () => {
    expect([...(focusAt(steps, 1) ?? [])]).toEqual([2, 3, 4]);
    expect([...(focusAt(steps, 3) ?? [])]).toEqual([7]);
  });

  it('clears the focus at a step that names no lines', () => {
    expect(focusAt(steps, 2)).toBeUndefined();
  });

  it('holds the last step beyond it, and follows gapped steps by their at values', () => {
    expect([...(focusAt(steps, 9) ?? [])]).toEqual([7]);
    const gapped = parseHighlight({ 2: '1', 5: '3' });
    expect(focusAt(gapped, 1)).toBeUndefined();
    expect([...(focusAt(gapped, 2) ?? [])]).toEqual([1]);
    expect([...(focusAt(gapped, 4) ?? [])]).toEqual([1]);
    expect([...(focusAt(gapped, 5) ?? [])]).toEqual([3]);
  });
});

describe('linesOutOfRange', () => {
  it('names the lines each step asks for that the block does not have', () => {
    const steps = parseHighlight('2|99|3-6');
    expect(linesOutOfRange(steps, 4)).toEqual([
      { at: 2, lines: [99] },
      { at: 3, lines: [5, 6] },
    ]);
  });

  it('finds nothing when every line exists or a step clears the focus', () => {
    expect(linesOutOfRange(parseHighlight('1-3|*'), 3)).toEqual([]);
  });
});
