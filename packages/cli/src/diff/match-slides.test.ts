import { describe, expect, it } from 'vite-plus/test';

import { matchSlides, parseShotName, type OrderedSlide } from '#diff/match-slides.ts';

/**
 * Slides numbered in the order given.
 *
 * @param ids - The slide ids.
 */
function slides(...ids: string[]): OrderedSlide[] {
  return ids.map((id, index) => ({ id, number: index + 1 }));
}

/**
 * The ids of the slides that moved.
 *
 * @param before - The base slides.
 * @param after - The current slides.
 */
function movedIds(before: OrderedSlide[], after: OrderedSlide[]): string[] {
  return matchSlides(before, after)
    .filter((match) => match.moved)
    .map((match) => match.id);
}

describe('parseShotName', () => {
  it('reads the number, id and step of the names deck shot writes', () => {
    expect(parseShotName('03-request-flow.png')).toEqual({
      number: 3,
      id: 'request-flow',
      step: null,
    });
    expect(parseShotName('12-a.step4.png')).toEqual({ number: 12, id: 'a', step: 4 });
    expect(parseShotName('notes.txt')).toBeUndefined();
    expect(parseShotName('3-x.png')).toBeUndefined();
  });
});

describe('matchSlides', () => {
  it('matches by id and lists current slides in order, then removed ones', () => {
    const result = matchSlides(slides('a', 'b', 'c'), slides('a', 'd', 'c'));
    expect(result.map((match) => [match.id, match.beforeNumber, match.afterNumber])).toEqual([
      ['a', 1, 1],
      ['d', null, 2],
      ['c', 3, 3],
      ['b', 2, null],
    ]);
  });

  it('marks nothing as moved when slides are inserted or removed', () => {
    expect(movedIds(slides('a', 'b', 'c'), slides('x', 'a', 'b', 'c'))).toEqual([]);
    expect(movedIds(slides('a', 'b', 'c'), slides('b', 'c'))).toEqual([]);
  });

  it('marks only the slide that moved', () => {
    expect(movedIds(slides('a', 'b', 'c', 'd'), slides('a', 'c', 'd', 'b'))).toEqual(['b']);
    expect(movedIds(slides('a', 'b', 'c', 'd'), slides('d', 'a', 'b', 'c'))).toEqual(['d']);
  });

  it('handles empty versions', () => {
    expect(matchSlides([], slides('a')).map((match) => match.moved)).toEqual([false]);
    expect(matchSlides(slides('a'), [])).toEqual([
      { id: 'a', beforeNumber: 1, afterNumber: null, moved: false },
    ]);
  });
});
