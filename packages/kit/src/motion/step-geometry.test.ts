// @vitest-environment happy-dom
import { describe, expect, it } from 'vite-plus/test';

import { FULL_SPAN, holdsInlineContent, spanWithin, unionSpan } from '#motion/step-geometry.ts';

/**
 * A step wrapper holding the given markup, attached so computed styles resolve.
 *
 * @param html - What the step holds.
 */
function stepHolding(html: string): HTMLElement {
  const step = document.createElement('span');
  step.innerHTML = html;
  document.body.append(step);
  return step;
}

describe('spanWithin', () => {
  it('places a short left-aligned line at the start of its box', () => {
    expect(spanWithin({ left: 100, right: 1100 }, { left: 100, right: 400 })).toEqual({
      start: 0,
      end: 0.3,
    });
  });

  it('places a centred line in the middle and a right-aligned one at the end', () => {
    expect(spanWithin({ left: 0, right: 1000 }, { left: 350, right: 650 })).toEqual({
      start: 0.35,
      end: 0.65,
    });
    expect(spanWithin({ left: 0, right: 1000 }, { left: 700, right: 1000 })).toEqual({
      start: 0.7,
      end: 1,
    });
  });

  it('gives the same shares on a canvas scaled to half size, so the screen scale cancels out', () => {
    expect(spanWithin({ left: 50, right: 550 }, { left: 50, right: 200 })).toEqual(
      spanWithin({ left: 100, right: 1100 }, { left: 100, right: 400 }),
    );
  });

  it('takes the whole box when there is no content to measure, or no box', () => {
    expect(spanWithin({ left: 0, right: 500 }, { left: 0, right: 0 })).toEqual(FULL_SPAN);
    expect(spanWithin({ left: 10, right: 10 }, { left: 0, right: 5 })).toEqual(FULL_SPAN);
  });

  it('keeps content that overhangs its box within the box', () => {
    expect(spanWithin({ left: 100, right: 300 }, { left: 80, right: 320 })).toEqual(FULL_SPAN);
  });
});

describe('unionSpan', () => {
  it('covers every box of a step, and the whole box when there are none', () => {
    expect(
      unionSpan([
        { start: 0, end: 0.3 },
        { start: 0.1, end: 0.6 },
      ]),
    ).toEqual({ start: 0, end: 0.6 });
    expect(unionSpan([])).toEqual(FULL_SPAN);
  });
});

describe('holdsInlineContent', () => {
  it('is true for words written inside a sentence', () => {
    expect(holdsInlineContent(stepHolding('scaled <strong>words</strong>'))).toBe(true);
    expect(holdsInlineContent(stepHolding('<em>only</em> <strong>inline</strong>'))).toBe(true);
  });

  it('is false for a step that holds only boxes sitting in a line, which take the effect', () => {
    expect(holdsInlineContent(stepHolding('<span style="display: inline-flex">Chip</span>'))).toBe(
      false,
    );
    expect(holdsInlineContent(stepHolding('<svg></svg>'))).toBe(false);
  });

  it('is false for a step that holds blocks, or nothing', () => {
    expect(holdsInlineContent(stepHolding('<p>A paragraph</p>'))).toBe(false);
    expect(holdsInlineContent(stepHolding('\n<ul><li>An item</li></ul>\n'))).toBe(false);
    expect(holdsInlineContent(stepHolding('  '))).toBe(false);
  });
});
