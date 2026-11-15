import { describe, expect, it } from 'vite-plus/test';

import type { RegionMeasurement, VerifyRegion } from '#verify/regions.ts';

import { boxNode, line, paragraph, scene, textNode } from '#scene/scene.fixture.ts';
import {
  attributeOverlaps,
  formatVerdict,
  judgeRegion,
  slideRegions,
  worstRegions,
} from '#verify/regions.ts';

/**
 * A two-line text region at 200,100 with a 50px line pitch.
 */
const TEXT: VerifyRegion = {
  id: 'r1',
  kind: 'text',
  label: 'text "Revenue grew 18%"',
  rect: { x: 200, y: 100, width: 600, height: 94 },
  lines: 2,
  linePitch: 50,
  margin: 52,
  extend: { x: 150, y: 75 },
  anchor: 'left',
};

/**
 * A chart region.
 */
const CHART: VerifyRegion = {
  ...TEXT,
  id: 'r2',
  kind: 'chart',
  label: 'chart "Tickets per month"',
  lines: null,
  linePitch: null,
};

/**
 * A measurement that found the region exactly where the web drew it.
 *
 * @param overrides - Fields that differ.
 */
function found(overrides: Partial<RegionMeasurement> = {}): RegionMeasurement {
  return {
    id: 'r1',
    blank: false,
    match: 0.9,
    offset: { x: 0, y: 0 },
    reference: { x: 200, y: 104, width: 580, height: 90 },
    candidate: { x: 200, y: 104, width: 584, height: 90 },
    referenceInk: 2000,
    candidateInk: 2100,
    ...overrides,
  };
}

describe('slideRegions', () => {
  it('names a text frame by its words, with its line count, pitch and glyph box', () => {
    const body = paragraph([line('Revenue grew', 140), line('18% this year', 190)]);
    const regions = slideRegions(scene(), {
      items: [
        { kind: 'native', node: boxNode(1) },
        { kind: 'native', node: textNode(2, body) },
      ],
    });
    expect(regions).toHaveLength(1);
    expect(regions[0]).toMatchObject({
      id: 'r1',
      kind: 'text',
      label: 'text "Revenue grew 18% this year"',
      lines: 2,
      linePitch: 50,
    });
    expect(regions[0]?.rect.y).toBeCloseTo(140 - 34.9);
    expect(regions[0]?.rect.height).toBeCloseTo(50 + 34.9 + 8.7);
  });

  it('keeps a picture as one region and leaves out what is too small or off the slide', () => {
    const picture = boxNode(1, { rect: { x: 1800, y: 900, width: 400, height: 400 } });
    const tiny = boxNode(2, { rect: { x: 10, y: 10, width: 4, height: 4 } });
    const regions = slideRegions(scene(), {
      items: [
        { kind: 'picture', node: picture, scope: 'subtree', reasons: [] },
        { kind: 'picture', node: tiny, scope: 'subtree', reasons: [] },
      ],
    });
    expect(regions.map((region) => [region.kind, region.rect])).toEqual([
      ['picture', { x: 1800, y: 900, width: 120, height: 180 }],
    ]);
  });
});

describe('judgeRegion', () => {
  it('passes a region found in place at the same size', () => {
    const verdict = judgeRegion(TEXT, found());
    expect(verdict.problems).toEqual([]);
    expect(verdict.severity).toBe(0);
    expect(verdict.renderedLines).toBe(2);
  });

  it('counts a line more when the text grows by a line pitch', () => {
    const verdict = judgeRegion(
      TEXT,
      found({ candidate: { x: 200, y: 104, width: 560, height: 141 } }),
    );
    expect(verdict.renderedLines).toBe(3);
    expect(verdict.problems).toEqual(['3 lines vs 2']);
  });

  it('flags a shift beyond a few percent and ignores a few pixels', () => {
    expect(judgeRegion(TEXT, found({ offset: { x: 4, y: -5 } })).problems).toEqual([]);
    expect(judgeRegion(TEXT, found({ offset: { x: 0, y: 14 } })).problems).toEqual([
      'shifted 14px down',
    ]);
  });

  it('flags a narrower render and a chart drawn differently', () => {
    const verdict = judgeRegion(
      CHART,
      found({ match: 0.3, candidate: { x: 200, y: 104, width: 480, height: 90 } }),
    );
    expect(verdict.problems).toEqual(['drawn differently (30% of edges match)', '17% narrower']);
  });

  it('flags a region the render does not draw, and skips one the web left blank', () => {
    expect(judgeRegion(TEXT, found({ candidate: null, candidateInk: 0 })).problems).toEqual([
      'missing in the render',
    ]);
    expect(judgeRegion(TEXT, found({ blank: true, reference: null })).problems).toEqual([]);
  });
});

describe('worstRegions', () => {
  it('keeps failing verdicts, worst first, and formats them', () => {
    const shifted = judgeRegion(TEXT, found({ offset: { x: 0, y: 30 } }));
    const missing = judgeRegion(CHART, found({ candidate: null, candidateInk: 0 }));
    const fine = judgeRegion(TEXT, found());
    const worst = worstRegions([shifted, fine, missing], 5);
    expect(worst.map((verdict) => verdict.id)).toEqual(['r2', 'r1']);
    expect(formatVerdict(worst[1] ?? fine)).toBe('text "Revenue grew 18%": shifted 30px down');
  });
});

describe('attributeOverlaps', () => {
  it('blames the block above when the render draws over the top of a text block', () => {
    const title: VerifyRegion = {
      ...TEXT,
      id: 'r1',
      label: 'text "Eastgate has a quarter"',
      rect: { x: 200, y: 20, width: 1200, height: 70 },
      lines: 1,
    };
    const body: VerifyRegion = { ...TEXT, id: 'r2', label: 'text "The gap"' };
    const overlapped = judgeRegion(
      body,
      found({
        id: 'r2',
        candidate: { x: 200, y: 64, width: 584, height: 130 },
      }),
    );
    expect(overlapped.problems).toEqual(['overlapped by content above (40px)']);
    const fine = judgeRegion(title, found({ reference: title.rect, candidate: title.rect }));
    const [blamed] = attributeOverlaps([title, body], [fine, overlapped]);
    expect(blamed?.problems).toEqual(['runs into text "The gap" below (more lines or taller)']);
  });
});
