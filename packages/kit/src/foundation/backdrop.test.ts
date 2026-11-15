import type { BackgroundLayerTokens } from '@deckster/brand';

import { describe, expect, it } from 'vite-plus/test';

import { placedBox, planBackdrop } from '#foundation/backdrop.tsx';

/**
 * A placed layer with the given anchor and offset, 200 wide and twice as wide as tall.
 */
function placed(
  anchor: Extract<BackgroundLayerTokens, { type: 'placed' }>['anchor'],
  offset = { x: 0, y: 0 },
): Extract<BackgroundLayerTokens, { type: 'placed' }> {
  return {
    type: 'placed',
    file: 'backgrounds/mark.svg',
    aspect: 2,
    anchor,
    width: 200,
    offset,
    opacity: 1,
    rotate: 0,
  };
}

/**
 * A surface's layers: a photo and a mark.
 */
const LAYERS: BackgroundLayerTokens[] = [
  {
    type: 'image',
    file: 'backgrounds/city.jpg',
    fit: 'cover',
    focal: { x: 50, y: 50 },
    opacity: 1,
    treatment: undefined,
    tint: undefined,
  },
  placed('bottom-right'),
];

/**
 * Resolves every path to a URL under `/assets/`, except `missing.jpg`.
 */
function resolve(source: string): string | undefined {
  return source.endsWith('missing.jpg') ? undefined : `/assets/${source}`;
}

describe('planBackdrop', () => {
  it('keeps the surface layers when the slide sets no background', () => {
    expect(planBackdrop(LAYERS, undefined, resolve)).toEqual({
      layers: [
        { index: 0, layer: LAYERS[0] },
        { index: 1, layer: LAYERS[1] },
      ],
      image: undefined,
    });
  });

  it('hides them for `none`', () => {
    expect(planBackdrop(LAYERS, 'none', resolve)).toEqual({ layers: [], image: undefined });
  });

  it('replaces them with a path, filling in the image defaults', () => {
    expect(planBackdrop(LAYERS, 'assets/hall.jpg', resolve)).toEqual({
      layers: [],
      image: {
        url: '/assets/assets/hall.jpg',
        fit: 'cover',
        focal: { x: 50, y: 50 },
        opacity: 1,
        tint: undefined,
      },
    });
  });

  it('paints over them with `layers: over`, keeping the options', () => {
    const plan = planBackdrop(
      LAYERS,
      {
        src: 'assets/hall.jpg',
        fit: 'contain',
        focal: { x: 20, y: 80 },
        opacity: 0.5,
        tint: { role: 'bg', opacity: 0.4 },
        layers: 'over',
      },
      resolve,
    );
    expect(plan.layers).toHaveLength(2);
    expect(plan.image).toEqual({
      url: '/assets/assets/hall.jpg',
      fit: 'contain',
      focal: { x: 20, y: 80 },
      opacity: 0.5,
      tint: { role: 'bg', opacity: 0.4 },
    });
  });

  it('leaves out a missing image but still hides the layers it replaces', () => {
    expect(planBackdrop(LAYERS, 'assets/missing.jpg', resolve)).toEqual({
      layers: [],
      image: undefined,
    });
  });
});

describe('placedBox', () => {
  it('places a layer from each anchor on the 1920x1080 canvas', () => {
    expect(placedBox(placed('top-left'))).toEqual({ left: 0, top: 0, width: 200, height: 100 });
    expect(placedBox(placed('top'))).toMatchObject({ left: 860, top: 0 });
    expect(placedBox(placed('right'))).toMatchObject({ left: 1720, top: 490 });
    expect(placedBox(placed('center'))).toMatchObject({ left: 860, top: 490 });
    expect(placedBox(placed('bottom-right'))).toMatchObject({ left: 1720, top: 980 });
  });

  it('moves it by its offset, past the edge when negative', () => {
    expect(placedBox(placed('bottom-left', { x: -40, y: 20 }))).toMatchObject({
      left: -40,
      top: 1000,
    });
  });
});
