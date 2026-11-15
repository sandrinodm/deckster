import { loadBrand } from '@deckster/brand/node';
import { NodeServices } from '@effect/platform-node';
import { describe, expect, it, layer } from '@effect/vitest';
import { Effect } from 'effect';
import path from 'node:path';

import { isOutlineCandidate, outlineBox, outlineFonts, outlineSvg } from '#pptx/outline-text.ts';
import { line, paragraph, run, runStyle } from '#scene/scene.fixture.ts';

/**
 * The framework's workspace, with the shipped brands.
 */
const WORKSPACE_ROOT = path.resolve(import.meta.dirname, '../../../..');

/**
 * A display heading: "94" in the stat step with a smaller "%".
 */
const STAT = paragraph(
  [
    line('94%', 300, {
      runs: [
        run('94', {
          style: runStyle({
            family: 'Bricolage Grotesque',
            size: 184,
            weight: 620,
            axes: { wght: 620, wdth: 88, opsz: 96 },
          }),
          rect: { x: 128, y: 150, width: 180, height: 170 },
        }),
        run('%', {
          style: runStyle({
            family: 'Bricolage Grotesque',
            size: 46,
            weight: 620,
            color: '#2d4ae0',
          }),
          rect: { x: 310, y: 260, width: 40, height: 45 },
        }),
      ],
    }),
  ],
  { box: { x: 128, y: 150, width: 240, height: 170 } },
);

describe('outline frames', () => {
  it('outlines a frame by its largest run, so a stat with a small unit is outlined whole', () => {
    expect(isOutlineCandidate([STAT])).toBe(true);
    expect(isOutlineCandidate([paragraph([line('Body text', 140)])])).toBe(false);
  });

  it('pictures a frame with room for glyphs past its box, inside the canvas', () => {
    const box = outlineBox({ x: 10, y: 150, width: 240, height: 170 }, [STAT], {
      width: 1920,
      height: 1080,
    });
    expect(box.x).toBe(0);
    expect(box.y).toBeCloseTo(94.8, 5);
    expect(box.width).toBeCloseTo(305.2, 5);
    expect(box.height).toBeCloseTo(280.4, 5);
  });
});

layer(NodeServices.layer)('outlined text', (it) => {
  it.effect('draws every run of a frame as SVG paths in the brand font, in the run colors', () =>
    Effect.gen(function* () {
      const brand = yield* loadBrand(WORKSPACE_ROOT, 'default');
      const fonts = outlineFonts(
        brand.fontFaces
          .filter((face) => /-latin-(?!ext)/.test(face.url))
          .map((face) => ({ family: face.family, file: face.url, style: face.style })),
      );
      const svg = outlineSvg([STAT], fonts, { x: 100, y: 100, width: 300, height: 260 }) ?? '';
      expect(svg).toMatch(
        /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="100.00 100.00 300.00 260.00"/,
      );
      expect(svg.match(/<path /g)).toHaveLength(2);
      expect(svg).toContain('fill="#2d4ae0"');
      expect(outlineSvg([STAT], fonts, { x: 0, y: 0, width: 1, height: 1 })).not.toBeNull();
    }),
  );
});
