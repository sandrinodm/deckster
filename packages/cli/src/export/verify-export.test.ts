import type { RegionVerdict, VerifyRegion } from '@deckster/export';

import { describe, expect, it } from 'vite-plus/test';

import type { SlideRender, VerifyReport } from '#export/verify-export.ts';

import { formatVerify, judgeAll, regionTotals, unrenderedSlides } from '#export/verify-export.ts';

/**
 * A text region.
 */
const REGION: VerifyRegion = {
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
 * A verdict with overrides.
 *
 * @param overrides - Fields that differ.
 */
function verdict(overrides: Partial<RegionVerdict> = {}): RegionVerdict {
  return {
    id: 'r1',
    kind: 'text',
    label: 'text "Revenue grew 18%"',
    rect: REGION.rect,
    lines: 2,
    renderedLines: 2,
    match: 0.9,
    offset: { x: 0, y: 0 },
    widthChange: 0,
    heightChange: 0,
    overlapAbove: 0,
    problems: [],
    severity: 0,
    ...overrides,
  };
}

/**
 * A slide render with some verdicts.
 *
 * @param regions - The verdicts.
 */
function render(regions: RegionVerdict[]): SlideRender {
  return {
    score: 0.95,
    changed: 0.02,
    sideBySide: '/out/verify/compare/01-cover.libreoffice.png',
    regions,
    failed: regions.filter((entry) => entry.problems.length > 0).length,
    crops: [],
  };
}

/**
 * A report with two slides rendered by two renderers.
 */
function report(): VerifyReport {
  const slides = [
    {
      number: 1,
      id: 'cover',
      step: null,
      web: '/out/verify/web/01-cover.png',
      regions: [REGION],
      renders: {
        libreoffice: render([verdict()]),
        'libreoffice-nofonts': render([
          verdict({ problems: ['3 lines vs 2', 'shifted 14px down'], severity: 0.75 }),
        ]),
      },
    },
    {
      number: 2,
      id: 'problem',
      step: null,
      web: '/out/verify/web/02-problem.png',
      regions: [REGION],
      renders: { libreoffice: render([verdict()]), 'libreoffice-nofonts': null },
    },
  ];
  return {
    outDir: '/out/verify',
    renderers: [
      { id: 'libreoffice', label: 'LibreOffice, fonts installed: Inter Deck' },
      { id: 'libreoffice-nofonts', label: 'LibreOffice, brand fonts not installed' },
    ],
    unavailable: [{ id: 'quicklook', why: 'it needs macOS' }],
    failed: [],
    unrendered: unrenderedSlides(slides, ['libreoffice', 'libreoffice-nofonts']),
    validation: { validator: 'Open XML SDK', ok: true, errors: [] },
    slides,
    regions: { checked: 3, failed: 1 },
    byRenderer: regionTotals(slides),
    ok: false,
    written: { sideBySide: 3, crops: 1 },
  };
}

describe('judgeAll', () => {
  it('judges each measured region and leaves out blank ones', () => {
    const measured = {
      id: 'r1',
      blank: false,
      match: 0.9,
      offset: { x: 0, y: 30 },
      reference: { x: 200, y: 104, width: 580, height: 90 },
      candidate: { x: 200, y: 104, width: 580, height: 90 },
      referenceInk: 2000,
      candidateInk: 2000,
    };
    expect(judgeAll([REGION], [measured]).map((entry) => entry.problems)).toEqual([
      ['shifted 30px down'],
    ]);
    expect(judgeAll([REGION], [{ ...measured, blank: true }])).toEqual([]);
  });
});

describe('regionTotals', () => {
  it('counts checked and failed regions per renderer', () => {
    expect(report().byRenderer).toEqual({
      libreoffice: { checked: 2, failed: 0 },
      'libreoffice-nofonts': { checked: 1, failed: 1 },
    });
  });
});

describe('unrenderedSlides', () => {
  it('lists the compared slides a renderer produced no picture for', () => {
    expect(report().unrendered).toEqual([{ id: 'libreoffice-nofonts', slides: [2] }]);
  });

  it('counts a renderer with no result for a slide as missing it, and skips slides never compared', () => {
    const slides = [
      { number: 1, web: 'a.png', renders: {} },
      { number: 2, web: null, renders: {} },
      { number: 3, web: 'c.png', renders: { libreoffice: render([verdict()]) } },
    ];
    expect(unrenderedSlides(slides, ['libreoffice'])).toEqual([{ id: 'libreoffice', slides: [1] }]);
    expect(unrenderedSlides([slides[2] as (typeof slides)[number]], ['libreoffice'])).toEqual([]);
  });
});

describe('formatVerify', () => {
  it('prints the worst regions per slide with the renderer, and what was written', () => {
    const lines = formatVerify(report()).map((line) => line.text);
    expect(lines).toEqual([
      'Open XML SDK: valid',
      'libreoffice: 0 of 2 regions differ (LibreOffice, fonts installed: Inter Deck)',
      'libreoffice-nofonts: 1 of 1 regions differ (LibreOffice, brand fonts not installed)',
      'quicklook: not used, it needs macOS',
      'libreoffice-nofonts: no picture for slide 2, so verification fails',
      'Regions: 1 of 3 differ',
      '  01 cover: 1 region(s) differ',
      '     text "Revenue grew 18%": 3 lines vs 2, shifted 14px down (libreoffice-nofonts)',
      '  02 problem: ok',
      'Wrote 3 side-by-side picture(s), 1 region crop(s) and report.json to /out/verify',
    ]);
  });

  it('does not claim pictures when no renderer produced any', () => {
    const empty = { ...report(), written: { sideBySide: 0, crops: 0 }, renderers: [] };
    const lines = formatVerify(empty);
    expect(lines.at(-1)).toEqual({
      text: 'No renderer produced pictures; wrote report.json to /out/verify',
      error: true,
    });
    expect(lines.some((line) => line.text.startsWith('Wrote'))).toBe(false);
  });
});
