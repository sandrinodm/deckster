import type { Browser, Page } from 'playwright';

import { Effect } from 'effect';
import { chromium } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';

import type { VerifyRegion } from '#verify/regions.ts';

import { compareImages, drawComparison, type ImageComparison } from '#verify/compare-images.ts';
import { judgeRegion, type RegionVerdict } from '#verify/regions.ts';

/**
 * Comparisons decode and scan full slides in Chromium.
 */
const TIMEOUT_MS = 60_000;

/**
 * Something drawn on a synthetic slide.
 */
type Drawn =
  | {
      /**
       * Text lines from a top-left corner.
       */
      kind: 'text';

      /**
       * The lines.
       */
      lines: string[];

      /**
       * The left edge.
       */
      x: number;

      /**
       * The top of the first line.
       */
      y: number;
    }
  | {
      /**
       * Bars, as a chart draws them.
       */
      kind: 'bars';

      /**
       * Bar heights, left to right.
       */
      heights: number[];

      /**
       * The left edge.
       */
      x: number;

      /**
       * The baseline.
       */
      y: number;
    };

/**
 * A 1920x1080 PNG with text and bars on a light gradient, drawn in the page.
 *
 * @param page - A blank page.
 * @param items - What to draw.
 */
async function slide(page: Page, items: Drawn[]): Promise<Uint8Array> {
  const base64 = await page.evaluate((drawn: Drawn[]) => {
    const canvas = document.createElement('canvas');
    canvas.width = 1920;
    canvas.height = 1080;
    const context = canvas.getContext('2d');
    if (context === null) {
      return '';
    }

    const gradient = context.createLinearGradient(0, 0, 1920, 1080);
    gradient.addColorStop(0, '#fcfcfd');
    gradient.addColorStop(1, '#dfe4f2');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 1920, 1080);
    context.fillStyle = '#161920';
    context.font = '48px sans-serif';
    context.textBaseline = 'top';
    for (const item of drawn) {
      if (item.kind === 'text') {
        item.lines.forEach((text, index) => {
          context.fillText(text, item.x, item.y + index * 60);
        });
      } else {
        item.heights.forEach((height, index) => {
          context.fillRect(item.x + index * 80, item.y - height, 50, height);
        });
      }
    }

    const url = canvas.toDataURL('image/png');
    return url.slice(url.indexOf(',') + 1);
  }, items);
  return new Uint8Array(Buffer.from(base64, 'base64'));
}

/**
 * The text region of the synthetic slides.
 */
const TEXT: VerifyRegion = {
  id: 'r1',
  kind: 'text',
  label: 'text "Quarterly revenue"',
  rect: { x: 200, y: 200, width: 640, height: 110 },
  lines: 2,
  linePitch: 60,
  margin: 60,
  extend: { x: 160, y: 90 },
  anchor: 'left',
};

/**
 * The chart region of the synthetic slides.
 */
const CHART: VerifyRegion = {
  id: 'r2',
  kind: 'chart',
  label: 'chart "Tickets"',
  rect: { x: 1100, y: 500, width: 420, height: 320 },
  lines: null,
  linePitch: null,
  margin: 96,
  extend: { x: 42, y: 32 },
  anchor: 'center',
};

/**
 * The web slide: two lines of text and five bars.
 */
const WEB: Drawn[] = [
  { kind: 'text', lines: ['Quarterly revenue grew', 'faster than costs'], x: 200, y: 200 },
  { kind: 'bars', heights: [120, 200, 260, 180, 300], x: 1100, y: 820 },
];

/**
 * The verdict for a region of a comparison.
 *
 * @param result - The comparison.
 * @param region - The region.
 */
function verdictOf(result: ImageComparison, region: VerifyRegion): RegionVerdict {
  const measurement = result.regions.find((candidate) => candidate.id === region.id);
  expect(measurement).toBeDefined();
  return judgeRegion(
    region,
    measurement ?? {
      id: region.id,
      blank: true,
      match: 0,
      offset: { x: 0, y: 0 },
      reference: null,
      candidate: null,
      referenceInk: 0,
      candidateInk: 0,
    },
  );
}

describe('compareImages', () => {
  let browser: Browser;
  let page: Page;
  beforeAll(async () => {
    browser = await chromium.launch();
    page = await browser.newPage();
  }, TIMEOUT_MS);
  afterAll(async () => {
    await browser.close();
  });

  it(
    'finds unchanged regions in place',
    async () => {
      const web = await slide(page, WEB);
      const result = await Effect.runPromise(compareImages(page, web, web, [TEXT, CHART]));
      expect(result.score).toBe(1);
      const verdicts = [TEXT, CHART].map((region) => verdictOf(result, region));
      expect(verdicts.map((verdict) => verdict.problems)).toEqual([[], []]);
      expect(verdicts[0]?.match).toBeGreaterThan(0.95);
    },
    TIMEOUT_MS,
  );

  it(
    'reports text that moved and wrapped to another line, and bars that changed',
    async () => {
      const web = await slide(page, WEB);
      const render = await slide(page, [
        { kind: 'text', lines: ['Quarterly revenue', 'grew faster than', 'costs'], x: 200, y: 224 },
        { kind: 'bars', heights: [300, 60, 60, 300, 60], x: 1100, y: 820 },
      ]);
      const result = await Effect.runPromise(compareImages(page, web, render, [TEXT, CHART]));
      const text = verdictOf(result, TEXT);
      const chart = verdictOf(result, CHART);
      expect(text.offset.y).toBeGreaterThanOrEqual(20);
      expect(text.problems).toContain('3 lines vs 2');
      expect(text.problems.some((problem) => problem.startsWith('shifted'))).toBe(true);
      expect(chart.problems.length).toBeGreaterThan(0);
    },
    TIMEOUT_MS,
  );

  it(
    'does not count a neighbour just beside and below a region as its own line',
    async () => {
      const eyebrow: VerifyRegion = {
        ...TEXT,
        label: 'text "Eyebrow"',
        rect: { x: 200, y: 200, width: 300, height: 48 },
        lines: 1,
        linePitch: 48,
        extend: { x: 80, y: 72 },
      };
      // A capitalised eyebrow over a title whose next word starts past the eyebrow's end.
      const drawn: Drawn[] = [
        { kind: 'text', lines: ['EYEBROW'], x: 200, y: 200 },
        { kind: 'text', lines: ['Title'], x: 520, y: 270 },
      ];
      const web = await slide(page, drawn);
      const result = await Effect.runPromise(compareImages(page, web, web, [eyebrow]));
      expect(verdictOf(result, eyebrow).problems).toEqual([]);
    },
    TIMEOUT_MS,
  );

  it(
    'reports a region the render leaves out, and draws marks and crops',
    async () => {
      const web = await slide(page, WEB);
      const render = await slide(page, WEB.slice(0, 1));
      const result = await Effect.runPromise(compareImages(page, web, render, [TEXT, CHART]));
      expect(verdictOf(result, CHART).problems).toEqual(['missing in the render']);
      const pictures = await Effect.runPromise(
        drawComparison(
          page,
          web,
          render,
          ['web', 'render'],
          [{ rect: CHART.rect, offset: { x: 0, y: 0 }, tag: '1' }],
        ),
      );
      expect(pictures.crops).toHaveLength(1);
      expect(Array.from(pictures.sideBySide.subarray(1, 4))).toEqual([0x50, 0x4e, 0x47]);
    },
    TIMEOUT_MS,
  );

  it(
    'fails with an export error for a picture that does not decode',
    async () => {
      const web = await slide(page, WEB);
      const error = await Effect.runPromise(
        Effect.flip(compareImages(page, web, new Uint8Array([1, 2, 3]), [TEXT])),
      );
      expect(error.message).toContain('did not decode');
    },
    TIMEOUT_MS,
  );
});
