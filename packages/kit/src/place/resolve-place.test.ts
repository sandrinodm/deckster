import type { SpacingTokens } from '@deckster/brand';
import type { PlacedZone } from '@deckster/engine/manifest';

import { describe, expect, it } from 'vite-plus/test';

import {
  hasPlacementProps,
  isSquareShape,
  nearestPlaceSuggestion,
  parseGridRange,
  PLACED_NAMES,
  PLACED_SIZE_WORDS,
  PLACED_ZONES,
  resolvePlace,
  shapeExportKind,
  validatePlacementInput,
  zoneRect,
} from '#place/resolve-place.ts';

const DEFAULT_SPACING: SpacingTokens = {
  scale: {
    '2xs': 4,
    xs: 8,
    sm: 16,
    md: 24,
    lg: 32,
    xl: 48,
    '2xl': 64,
    '3xl': 96,
  },
  margin: { x: 96, y: 72 },
  grid: { columns: 12, rows: 6, gutter: 32 },
};

const ODD_SPACING: SpacingTokens = {
  scale: {
    '2xs': 5,
    xs: 10,
    sm: 15,
    md: 25,
    lg: 35,
    xl: 50,
    '2xl': 70,
    '3xl': 100,
  },
  margin: { x: 113, y: 89 },
  grid: { columns: 10, rows: 5, gutter: 24 },
};

describe('zoneRect', () => {
  it('computes safe, canvas, header and footer rectangles from brand margins', () => {
    expect(zoneRect('safe', DEFAULT_SPACING)).toEqual([96, 72, 1728, 936]);
    expect(zoneRect('canvas', DEFAULT_SPACING)).toEqual([0, 0, 1920, 1080]);
    expect(zoneRect('header', DEFAULT_SPACING)).toEqual([96, 0, 1728, 72]);
    expect(zoneRect('footer', DEFAULT_SPACING)).toEqual([96, 1008, 1728, 72]);
  });

  it('respects odd brand margins', () => {
    expect(zoneRect('safe', ODD_SPACING)).toEqual([113, 89, 1694, 902]);
    expect(zoneRect('header', ODD_SPACING)).toEqual([113, 0, 1694, 89]);
    expect(zoneRect('footer', ODD_SPACING)).toEqual([113, 991, 1694, 89]);
  });
});

describe('parseGridRange', () => {
  it('parses single tracks and inclusive ranges within bounds', () => {
    expect(parseGridRange('1', 12)).toEqual({ start: 1, end: 1 });
    expect(parseGridRange('2-5', 12)).toEqual({ start: 2, end: 5 });
    expect(parseGridRange('12', 12)).toEqual({ start: 12, end: 12 });
    expect(parseGridRange(' 3-6 ', 6)).toEqual({ start: 3, end: 6 });
  });

  it('rejects out-of-bounds, reversed, zero or malformed ranges', () => {
    expect(parseGridRange('0-3', 12)).toBeNull();
    expect(parseGridRange('5-2', 12)).toBeNull();
    expect(parseGridRange('1-13', 12)).toBeNull();
    expect(parseGridRange('abc', 12)).toBeNull();
    expect(parseGridRange('', 12)).toBeNull();
    expect(parseGridRange('1-2-3', 12)).toBeNull();
  });
});

describe('shapeExportKind and isSquareShape', () => {
  it('maps shape geometries and radii to OOXML preset kinds', () => {
    expect(shapeExportKind('rect')).toBe('rect');
    expect(shapeExportKind('rect', 'none')).toBe('rect');
    expect(shapeExportKind('rect', 'md')).toBe('roundRect');
    expect(shapeExportKind('square')).toBe('rect');
    expect(shapeExportKind('square', 'lg')).toBe('roundRect');
    expect(shapeExportKind('pill')).toBe('roundRect');
    expect(shapeExportKind('pill', 'none')).toBe('roundRect');
    expect(shapeExportKind('ellipse')).toBe('ellipse');
    expect(shapeExportKind('circle')).toBe('ellipse');
    expect(shapeExportKind('diamond')).toBe('diamond');
    expect(shapeExportKind('triangle')).toBe('triangle');
  });

  it('identifies square-locked shapes', () => {
    expect(isSquareShape('square')).toBe(true);
    expect(isSquareShape('circle')).toBe(true);
    expect(isSquareShape('rect')).toBe(false);
    expect(isSquareShape('ellipse')).toBe(false);
    expect(isSquareShape(undefined)).toBe(false);
  });
});

describe('resolvePlace — named places across every zone', () => {
  it('resolves all 9 named places inside every zone within that zone bounds', () => {
    for (const zone of PLACED_ZONES) {
      const [zx, zy, zw, zh] = zoneRect(zone, DEFAULT_SPACING);
      for (const place of PLACED_NAMES) {
        const res = resolvePlace({ place, zone, width: 2 }, DEFAULT_SPACING);
        expect(res.mode).toBe('place');
        expect(res.zone).toBe(zone);
        expect(res.spec).toBe(place);
        expect(res.fixedWidth).toBe(true);
        expect(res.fixedHeight).toBe(false);
        const [rx, ry, rw, rh] = res.rect;
        expect(rx).toBeGreaterThanOrEqual(zx);
        expect(ry).toBeGreaterThanOrEqual(zy);
        expect(rx + rw).toBeLessThanOrEqual(zx + zw + 1);
        expect(ry + rh).toBeLessThanOrEqual(zy + zh + 1);
      }
    }
  });

  it('anchors corners, edges and center with accurate CSS styles', () => {
    const topLeft = resolvePlace({ place: 'top-left', width: 4 }, DEFAULT_SPACING);
    expect(topLeft.style.left).toBe(96);
    expect(topLeft.style.top).toBe(72);
    expect(topLeft.style.transform).toBeUndefined();

    const topRight = resolvePlace({ place: 'top-right', width: 4 }, DEFAULT_SPACING);
    expect(topRight.style.right).toBe(96);
    expect(topRight.style.top).toBe(72);

    const bottomRightFooter = resolvePlace(
      { place: 'bottom-right', zone: 'footer' },
      DEFAULT_SPACING,
    );
    expect(bottomRightFooter.style.right).toBe(96);
    expect(bottomRightFooter.style.bottom).toBe(0);
    expect(bottomRightFooter.style.maxWidth).toBe(1728);
    expect(bottomRightFooter.style.maxHeight).toBe(72);

    const centerAuto = resolvePlace({ place: 'center' }, DEFAULT_SPACING);
    expect(centerAuto.style.left).toBe(960);
    expect(centerAuto.style.top).toBe(540);
    expect(centerAuto.style.transform).toBe('translate(-50%, -50%)');

    const centerFixed = resolvePlace({ place: 'center', width: 4, height: 2 }, DEFAULT_SPACING);
    expect(centerFixed.style.transform).toBeUndefined();
    expect(Math.abs(centerFixed.rect[0] + centerFixed.rect[2] / 2 - 960)).toBeLessThanOrEqual(1);
    expect(Math.abs(centerFixed.rect[1] + centerFixed.rect[3] / 2 - 540)).toBeLessThanOrEqual(1);
  });

  it('maps sm, md, lg width words to PLACED_SIZE_WORDS columns', () => {
    for (const [word, cols] of Object.entries(PLACED_SIZE_WORDS)) {
      const byWord = resolvePlace(
        { place: 'top-left', width: word as keyof typeof PLACED_SIZE_WORDS },
        DEFAULT_SPACING,
      );
      const byNum = resolvePlace({ place: 'top-left', width: cols }, DEFAULT_SPACING);
      expect(byWord.style.width).toBe(byNum.style.width);
      expect(byWord.rect[2]).toBe(byNum.rect[2]);
    }
  });

  it('pulls named places inward by the brand inset spacing token', () => {
    const plain = resolvePlace({ place: 'top-left', zone: 'canvas', width: 3 }, DEFAULT_SPACING);
    const inset = resolvePlace(
      { place: 'top-left', zone: 'canvas', width: 3, inset: 'lg' },
      DEFAULT_SPACING,
    );
    expect(plain.style.left).toBe(0);
    expect(plain.style.top).toBe(0);
    expect(inset.style.left).toBe(32);
    expect(inset.style.top).toBe(32);

    const brInset = resolvePlace(
      { place: 'bottom-right', zone: 'safe', width: 3, inset: 'md' },
      DEFAULT_SPACING,
    );
    expect(brInset.style.right).toBe(96 + 24);
    expect(brInset.style.bottom).toBe(72 + 24);
  });

  it('locks 1:1 dimensions when aspect is square', () => {
    const fromWidth = resolvePlace(
      { place: 'top-left', width: 2, aspect: 'square' },
      DEFAULT_SPACING,
    );
    expect(fromWidth.rect[2]).toBe(fromWidth.rect[3]);
    expect(fromWidth.style.width).toBe(fromWidth.style.height);
    expect(fromWidth.fixedWidth).toBe(true);
    expect(fromWidth.fixedHeight).toBe(true);

    const fromHeight = resolvePlace(
      { place: 'top-left', height: 2, aspect: 'square' },
      DEFAULT_SPACING,
    );
    expect(fromHeight.rect[2]).toBe(fromHeight.rect[3]);
    expect(fromHeight.style.width).toBe(fromHeight.style.height);

    const defaultSquare = resolvePlace({ place: 'center', aspect: 'square' }, DEFAULT_SPACING);
    expect(defaultSquare.rect[2]).toBe(defaultSquare.rect[3]);
    expect(defaultSquare.rect[2]).toBe(fromWidth.rect[2]);
  });

  it('works with odd brand margins and custom grid counts', () => {
    const res = resolvePlace(
      { place: 'bottom-right', zone: 'safe', width: 2, inset: 'sm' },
      ODD_SPACING,
    );
    expect(res.style.right).toBe(113 + 15);
    expect(res.style.bottom).toBe(89 + 15);
  });
});

describe('resolvePlace — grid and box modes', () => {
  it('spans full safe width and height on edge-to-edge grid ranges with exact gutters', () => {
    const full = resolvePlace({ cols: '1-12', rows: '1-6' }, DEFAULT_SPACING);
    expect(full.mode).toBe('grid');
    expect(full.spec).toBe('cols=1-12 rows=1-6');
    expect(full.rect).toEqual([96, 72, 1728, 936]);

    const leftHalf = resolvePlace({ cols: '1-6', rows: '1-3' }, DEFAULT_SPACING);
    const rightHalf = resolvePlace({ cols: '7-12', rows: '4-6' }, DEFAULT_SPACING);
    // Exact gutter between adjacent column and row tracks.
    expect(rightHalf.rect[0] - (leftHalf.rect[0] + leftHalf.rect[2])).toBe(32);
    expect(rightHalf.rect[1] - (leftHalf.rect[1] + leftHalf.rect[3])).toBe(32);
    expect(rightHalf.rect[0] + rightHalf.rect[2]).toBe(96 + 1728);
    expect(rightHalf.rect[1] + rightHalf.rect[3]).toBe(72 + 936);
  });

  it('fits a centered square inside a grid cell when aspect is square', () => {
    const rectCell = resolvePlace({ cols: '1-4', rows: '1-2' }, DEFAULT_SPACING);
    const squareCell = resolvePlace(
      { cols: '1-4', rows: '1-2', aspect: 'square' },
      DEFAULT_SPACING,
    );
    const expectedSide = Math.min(rectCell.rect[2], rectCell.rect[3]);
    expect(squareCell.rect[2]).toBe(expectedSide);
    expect(squareCell.rect[3]).toBe(expectedSide);
    expect(squareCell.rect[0] + squareCell.rect[2] / 2).toBeCloseTo(
      rectCell.rect[0] + rectCell.rect[2] / 2,
      0,
    );
    expect(squareCell.rect[1] + squareCell.rect[3] / 2).toBeCloseTo(
      rectCell.rect[1] + rectCell.rect[3] / 2,
      0,
    );

    const colsOnlySquare = resolvePlace({ cols: '10-12', aspect: 'square' }, DEFAULT_SPACING);
    expect(colsOnlySquare.rect[2]).toBe(colsOnlySquare.rect[3]);
    expect(colsOnlySquare.rect[1]).toBe(72);
  });

  it('resolves explicit pixel box in canvas coordinates', () => {
    const res = resolvePlace({ box: [1520, 80, 320, 120] }, DEFAULT_SPACING);
    expect(res.mode).toBe('box');
    expect(res.zone).toBe('canvas');
    expect(res.spec).toBe('box=1520,80,320,120');
    expect(res.rect).toEqual([1520, 80, 320, 120]);
    expect(res.style).toEqual({ left: 1520, top: 80, width: 320, height: 120 });
  });
});

describe('nearestPlaceSuggestion', () => {
  it('suggests a named place for corner boxes and footer boxes', () => {
    const topRight = nearestPlaceSuggestion([1520, 72, 304, 130], DEFAULT_SPACING);
    expect(topRight).toContain('place="top-right"');

    const footerLeft = nearestPlaceSuggestion([96, 1016, 360, 48], DEFAULT_SPACING);
    expect(footerLeft).toContain('place="bottom-left"');
    expect(footerLeft).toContain('zone="footer"');
  });

  it('suggests grid cols/rows for interior boxes that do not hug an edge', () => {
    const interior = resolvePlace({ cols: '3-6', rows: '3-5' }, DEFAULT_SPACING).rect;
    const suggestion = nearestPlaceSuggestion(interior, DEFAULT_SPACING);
    expect(suggestion).toBe('cols="3-6" rows="3-5"');
  });
});

describe('validatePlacementInput and hasPlacementProps', () => {
  it('detects presence of placement props', () => {
    expect(hasPlacementProps({})).toBe(false);
    expect(hasPlacementProps({ place: 'top-left' })).toBe(true);
    expect(hasPlacementProps({ cols: '1-4', rows: '1-2' })).toBe(true);
    expect(hasPlacementProps({ box: [100, 100, 200, 100] })).toBe(true);
  });

  it('accepts valid named, grid and box inputs', () => {
    expect(
      validatePlacementInput(
        { place: 'top-right', zone: 'safe', width: 4, inset: 'sm' },
        DEFAULT_SPACING,
      ),
    ).toEqual([]);
    expect(
      validatePlacementInput({ cols: '9-12', rows: '1-2', zone: 'safe' }, DEFAULT_SPACING),
    ).toEqual([]);
    expect(validatePlacementInput({ cols: '10-12', aspect: 'square' }, DEFAULT_SPACING)).toEqual(
      [],
    );
    expect(validatePlacementInput({ box: [100, 100, 300, 120] }, DEFAULT_SPACING)).toEqual([]);
  });

  it('reports mixed placement modes, out-of-range tracks, bad tokens and out-of-bounds boxes', () => {
    expect(
      validatePlacementInput({ place: 'top-left', cols: '1-4', rows: '1-2' }, DEFAULT_SPACING)
        .length,
    ).toBeGreaterThan(0);
    expect(
      validatePlacementInput({ place: 'top-left', box: [100, 100, 200, 100] }, DEFAULT_SPACING)
        .length,
    ).toBeGreaterThan(0);
    expect(
      validatePlacementInput({ zone: 'nowhere' as PlacedZone, place: 'top-left' }, DEFAULT_SPACING)
        .length,
    ).toBeGreaterThan(0);
    expect(
      validatePlacementInput({ place: 'top-left', inset: 'huge' }, DEFAULT_SPACING).length,
    ).toBeGreaterThan(0);
    expect(
      validatePlacementInput({ place: 'top-left', width: 20 }, DEFAULT_SPACING).length,
    ).toBeGreaterThan(0);
    expect(
      validatePlacementInput({ place: 'top-left', height: 9 }, DEFAULT_SPACING).length,
    ).toBeGreaterThan(0);
    expect(
      validatePlacementInput({ cols: '1-13', rows: '1-2' }, DEFAULT_SPACING).length,
    ).toBeGreaterThan(0);
    expect(validatePlacementInput({ cols: '2-5' }, DEFAULT_SPACING).length).toBeGreaterThan(0);
    expect(validatePlacementInput({ rows: '1-2' }, DEFAULT_SPACING).length).toBeGreaterThan(0);
    expect(validatePlacementInput({ box: [1800, 100, 200, 100] }, DEFAULT_SPACING).length).toBe(1);
    expect(validatePlacementInput({ box: [100, 100, 20, 20] }, DEFAULT_SPACING).length).toBe(1);
  });
});
