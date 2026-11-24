// @vitest-environment happy-dom
import type { DeckPlugin } from '@deckster/engine';

import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import pageLink, { readPlacedElements } from '#runtime/page-link.ts';
import { render, type Rendered } from '#runtime/render.fixture.tsx';

vi.mock('@deckster/engine', () => ({
  definePlugin: (plugin: DeckPlugin) => plugin,
  useDeck: () => ({ isStatic: true, position: { slide: 0, step: 0 } }),
}));

/**
 * The mounted page reporter, removed after each test.
 */
let mounted: Rendered | undefined;

afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
  vi.restoreAllMocks();
});

describe('page link identity', () => {
  it('allocates one page id per mount and retains it across renders', () => {
    const Overlay = pageLink.overlay;
    if (Overlay === undefined) {
      throw new Error('The page link has no overlay.');
    }

    const random = vi.spyOn(Math, 'random').mockReturnValue(0.25);
    mounted = render(<Overlay />);
    mounted.rerender(<Overlay />);
    mounted.rerender(<Overlay />);
    expect(random).toHaveBeenCalledTimes(1);
    mounted.unmount();
    mounted = render(<Overlay />);
    expect(random).toHaveBeenCalledTimes(2);
  });
});

/**
 * Builds a minimal DOMRect-like object for stubbing `getBoundingClientRect` in happy-dom.
 *
 * @param left - Left coordinate in CSS pixels.
 * @param top - Top coordinate in CSS pixels.
 * @param width - Width in CSS pixels.
 * @param height - Height in CSS pixels.
 */
function domRect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON: () => ({}),
  };
}

describe('readPlacedElements', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('returns an empty array when there is no active slide', () => {
    document.body.innerHTML = `
      <div class="deck-canvas">
        <section class="deck-slide" data-slide-active="false">
          <div class="deck-placed">
            <div data-placed="shape" data-placed-rect="10,20,300,100"></div>
          </div>
        </section>
      </div>
    `;
    expect(readPlacedElements()).toEqual([]);
  });

  it('collects placed elements from the active slide and ignores inactive slides and unknown kinds', () => {
    document.body.innerHTML = `
      <div class="deck-canvas">
        <section class="deck-slide" data-slide-active="false">
          <div class="deck-placed">
            <div data-placed="shape" data-placed-name="ignored" data-placed-rect="0,0,100,100"></div>
          </div>
        </section>
        <section class="deck-slide" data-slide-active="true">
          <div class="deck-placed">
            <div
              data-placed="shape"
              data-placed-name="badge"
              data-placed-spec="top-right"
              data-placed-zone="safe"
              data-placed-rect="1520,80,320,120"
            ></div>
            <div
              data-placed="text"
              data-placed-spec="cols=2-5 rows=5-6"
              data-placed-zone="footer"
              data-placed-rect="120,980,500,60"
            ></div>
            <div data-placed="place" data-placed-rect="100,200,400,300"></div>
            <div data-placed="unknown" data-placed-rect="0,0,50,50"></div>
          </div>
        </section>
      </div>
    `;
    expect(readPlacedElements()).toEqual([
      {
        kind: 'shape',
        name: 'badge',
        place: 'top-right',
        zone: 'safe',
        rect: [1520, 80, 320, 120],
      },
      {
        kind: 'text',
        place: 'cols=2-5 rows=5-6',
        zone: 'footer',
        rect: [120, 980, 500, 60],
      },
      {
        kind: 'place',
        rect: [100, 200, 400, 300],
      },
    ]);
  });

  it('falls back to canvas-scaled bounding rect when data-placed-rect is missing or invalid', () => {
    document.body.innerHTML = `
      <div class="deck-canvas">
        <section class="deck-slide" data-slide-active="true">
          <div class="deck-placed">
            <div id="missing" data-placed="shape" data-placed-spec="box=1520,80,320,120"></div>
            <div id="invalid" data-placed="text" data-placed-rect="10,bad,30,40"></div>
          </div>
        </section>
      </div>
    `;
    const canvas = document.querySelector('.deck-canvas');
    const missing = document.getElementById('missing');
    const invalid = document.getElementById('invalid');
    if (canvas === null || missing === null || invalid === null) {
      throw new Error('Expected test DOM nodes.');
    }

    // Half-scale canvas (960x540) offset at (100, 50) in the viewport.
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue(domRect(100, 50, 960, 540));
    vi.spyOn(missing, 'getBoundingClientRect').mockReturnValue(domRect(860, 90, 160, 60));
    vi.spyOn(invalid, 'getBoundingClientRect').mockReturnValue(domRect(150, 150, 200, 50));

    expect(readPlacedElements()).toEqual([
      {
        kind: 'shape',
        place: 'box=1520,80,320,120',
        rect: [1520, 80, 320, 120],
      },
      {
        kind: 'text',
        rect: [100, 200, 400, 100],
      },
    ]);
  });
});
