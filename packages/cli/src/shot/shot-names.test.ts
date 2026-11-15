import { describe, expect, it } from 'vite-plus/test';

import { SHOT_FILE_PATTERN, shotFileName } from '#shot/shot-names.ts';

describe('shotFileName', () => {
  it('numbers slides from 1 with two digits', () => {
    expect(shotFileName(2, 'request-flow', null, 12)).toBe('03-request-flow.png');
  });

  it('adds the step', () => {
    expect(shotFileName(2, 'request-flow', 2, 12)).toBe('03-request-flow.step2.png');
  });

  it('widens the number for decks of 100 slides or more', () => {
    expect(shotFileName(4, 'a', null, 120)).toBe('005-a.png');
  });

  it('produces names the cleanup pattern recognises', () => {
    expect(SHOT_FILE_PATTERN.test(shotFileName(0, 'title', 1, 4))).toBe(true);
    expect(SHOT_FILE_PATTERN.test('notes.png')).toBe(false);
  });
});
