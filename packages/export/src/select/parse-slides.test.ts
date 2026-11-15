import { describe, expect, it } from 'vite-plus/test';

import { parseSlideSelection } from '#select/parse-slides.ts';

const IDS = ['cover', 'why', 'data', 'plan', 'ask', 'end', 'q', 'a', 'thanks'];

describe('parseSlideSelection', () => {
  it('reads numbers, ranges and ids, sorted and without repeats', () => {
    expect(parseSlideSelection('3,5-7, cover,6', IDS)).toEqual({
      ok: true,
      indexes: [0, 2, 4, 5, 6],
    });
  });

  it('rejects numbers outside the deck, backward ranges, unknown ids and empty parts', () => {
    expect(parseSlideSelection('10', IDS)).toMatchObject({
      ok: false,
      message: expect.stringContaining('1 to 9'),
    });
    expect(parseSlideSelection('5-3', IDS)).toMatchObject({
      ok: false,
      message: expect.stringContaining('backwards'),
    });
    expect(parseSlideSelection('nope', IDS)).toMatchObject({
      ok: false,
      message: expect.stringContaining('no slide "nope"'),
    });
    expect(parseSlideSelection('1,,2', IDS)).toMatchObject({ ok: false });
    expect(parseSlideSelection('0', IDS)).toMatchObject({ ok: false });
  });
});
