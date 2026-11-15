// @vitest-environment happy-dom
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import type { AgentComment } from '#model/agent-comment.ts';

import {
  chromeAt,
  childTarget,
  cssPathOf,
  elementForStamp,
  parentTarget,
  readGeometry,
  slideTargets,
  stampOf,
  targetAt,
  targetInRegion,
  textExcerpt,
  toCanvasRect,
  toViewportRect,
} from '#overlay/element-target.ts';
import { locationLabel, targetLabel } from '#overlay/labels.ts';

/**
 * A slide, its stage and the brand chrome over it, with each element's box (`left,top,width,height`
 * in viewport pixels) in `data-box`: happy-dom does no layout.
 */
const PAGE = `
<div class="deck-main">
  <div class="stage" data-box="0,0,960,540">
    <div class="deck-canvas" data-box="0,0,960,540">
      <section class="deck-slide" data-slide-active="true" data-slide-id="intro" data-box="0,0,960,540">
        <div data-deck-source="slides/intro.mdx:3:1" data-box="0,0,960,540">
          <h2 data-deck-source="slides/intro.mdx:5:1" data-box="50,50,400,50"><span data-box="50,50,100,50">How</span>   steps
            work</h2>
          <ul data-box="50,120,400,80">
            <li data-deck-source="slides/intro.mdx:7:1" data-box="50,120,400,30">One</li>
            <li data-deck-source="slides/intro.mdx:8:1" data-box="50,160,400,30">Two</li>
          </ul>
          <p data-deck-source="slides/intro.mdx:10:1" data-box="0,0,0,0">Hidden</p>
        </div>
      </section>
      <div class="kit-chrome" data-box="0,0,960,540">
        <div class="kit-chrome-layer" data-box="0,0,960,540">
          <div class="kit-chrome-corner" data-box="800,0,140,40">
            <img class="kit-chrome-logo" alt="" data-box="850,10,80,20">
          </div>
          <div class="kit-chrome-corner" data-box="800,500,140,40">
            <span class="kit-chrome-text" data-box="880,510,50,20">2 / 4</span>
          </div>
        </div>
        <div class="kit-chrome-layer" data-leaving="true" data-box="0,0,960,540">
          <span class="kit-chrome-text" data-box="20,510,50,20">Old footer</span>
        </div>
      </div>
    </div>
  </div>
</div>`;

beforeAll(() => {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function boxFromAttribute(
    this: Element,
  ): DOMRect {
    const [left = 0, top = 0, width = 10, height = 10] = (this.getAttribute('data-box') ?? '')
      .split(',')
      .filter((part) => part !== '')
      .map(Number);
    return new DOMRect(left, top, width, height);
  });
});

afterAll(() => {
  vi.restoreAllMocks();
});

beforeEach(() => {
  document.body.innerHTML = PAGE;
});

/**
 * The element a selector names.
 *
 * @param selector - A CSS selector.
 */
function find(selector: string): Element {
  const element = document.querySelector(selector);
  if (element === null) {
    throw new Error(`No element matches ${selector}`);
  }

  return element;
}

/**
 * A value that the test needs to be there.
 *
 * @param value - The value.
 * @throws Error when it is `undefined`.
 */
function defined<T>(value: T | undefined): T {
  if (value === undefined) {
    throw new Error('Expected a value');
  }

  return value;
}

describe('element targets', () => {
  it('reads an element’s own stamp, else the nearest one up its React fiber', () => {
    expect(stampOf(find('h2'))).toBe('slides/intro.mdx:5:1');
    const span = find('h2 span');
    expect(stampOf(span)).toBeUndefined();
    Reflect.set(span, '__reactFiber$test', {
      memoizedProps: {},
      return: { memoizedProps: { 'data-deck-source': 'slides/intro.mdx:5:9' }, return: null },
    });
    expect(stampOf(span)).toBe('slides/intro.mdx:5:9');
  });

  it('walks to the parent and child element from another JSX element', () => {
    const span = { element: find('h2 span'), stamp: undefined };
    expect(parentTarget(span)?.element).toBe(find('h2'));
    const heading = { element: find('h2'), stamp: 'slides/intro.mdx:5:1' };
    expect(childTarget(heading)?.element).toBe(find('h2 span'));
    const outer = { element: find('section > div'), stamp: 'slides/intro.mdx:3:1' };
    expect(parentTarget(outer)).toBeUndefined();
  });

  it('lists the visible stamped elements of the slide in document order for Tab', () => {
    expect(slideTargets().map((target) => target.stamp)).toEqual([
      'slides/intro.mdx:3:1',
      'slides/intro.mdx:5:1',
      'slides/intro.mdx:7:1',
      'slides/intro.mdx:8:1',
    ]);
  });

  it('finds an element by its stamp, or by another stamp on the same line', () => {
    expect(elementForStamp('slides/intro.mdx:7:1')).toBe(find('li'));
    expect(elementForStamp('slides/intro.mdx:8:4')).toBe(find('li + li'));
    expect(elementForStamp('slides/other.mdx:1:1')).toBeUndefined();
  });

  it('takes the first stamped element almost wholly inside a dragged region', () => {
    expect(targetInRegion(new DOMRect(40, 110, 420, 45))?.element).toBe(find('li'));
    expect(targetInRegion(new DOMRect(600, 300, 50, 50))).toBeUndefined();
  });

  it('writes a CSS path from the slide, or from the canvas for chrome', () => {
    expect(cssPathOf(find('h2'))).toBe(
      'section[data-slide-id="intro"] > div:nth-of-type(1) > h2:nth-of-type(1)',
    );
    expect(cssPathOf(find('img'))).toBe(
      '.deck-canvas > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > img:nth-of-type(1)',
    );
  });

  it('collapses whitespace in the text excerpt', () => {
    expect(textExcerpt(find('h2'))).toBe('How steps work');
  });

  it('converts between viewport and canvas pixels', () => {
    const geometry = defined(readGeometry());
    expect(geometry.scale).toBe(0.5);
    const rect = toCanvasRect(new DOMRect(50, 120, 400, 30), geometry);
    expect(rect).toEqual({ x: 100, y: 240, width: 800, height: 60 });
    const back = toViewportRect(rect, geometry);
    expect([back.left, back.top, back.width, back.height]).toEqual([50, 120, 400, 30]);
  });
});

describe('brand chrome', () => {
  it('hit-tests the logo and page number, which take no pointer events', () => {
    expect(chromeAt(860, 15)).toEqual({ element: find('img'), stamp: undefined, chrome: true });
    expect(chromeAt(890, 515)?.element.textContent).toBe('2 / 4');
    expect(targetAt(860, 15)?.chrome).toBe(true);
  });

  it('skips a layer that is fading out and points outside the chrome', () => {
    expect(chromeAt(30, 515)).toBeUndefined();
    expect(chromeAt(300, 300)).toBeUndefined();
  });

  it('labels chrome as the brand’s, not the layout’s', () => {
    const chrome = defined(chromeAt(860, 15));
    expect(targetLabel(chrome)).toBe('img · brand chrome: edit the brand');
    expect(targetLabel({ element: find('h2'), stamp: 'slides/intro.mdx:5:1' })).toBe(
      'h2 · slides/intro.mdx:5',
    );
    expect(targetLabel({ element: find('ul'), stamp: undefined })).toBe('ul · from the layout');
  });
});

describe('location labels', () => {
  it('names the line, the old line of a lost anchor, or only the file', () => {
    const base = {
      file: 'decks/hello/slides/intro.mdx',
      anchor: { status: 'ok', originalLine: 5, stamp: null, element: null },
    } as const;
    const label = (changes: Partial<AgentComment>) =>
      locationLabel({ ...base, line: 5, ...changes } as AgentComment, 'decks/hello');
    expect(label({})).toBe('slides/intro.mdx:5');
    expect(label({ line: null, anchor: { ...base.anchor, status: 'lost' } })).toBe(
      'slides/intro.mdx (was :5)',
    );
    expect(label({ line: null, anchor: { ...base.anchor, status: 'none' } })).toBe(
      'slides/intro.mdx',
    );
  });
});
