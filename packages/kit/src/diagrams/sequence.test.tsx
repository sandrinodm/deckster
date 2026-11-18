// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import { Actor, Message } from '#diagrams/form-parts.tsx';
import { SequenceDiagram } from '#diagrams/sequence.tsx';

vi.mock('@deckster/engine', () => ({
  useReadyHold: () => undefined,
  useSlide: () => ({ isActive: false, state: 'current', direction: 'forward' }),
  useStatic: () => true,
  useStep: () => 0,
  useStepAt: () => ({ visible: true, current: false, past: false }),
}));

vi.mock('@deckster/brand/runtime', () => ({
  getBrand: () => ({ brand: { icons: { set: 'lucide' } } }),
}));

/**
 * The diagram's box: five actors share it, so each box is narrower than the widest an actor gets.
 */
const DIAGRAM_SIZE = { width: 1000, height: 600 };

/**
 * Actor boxes narrower than this wrap the longest title onto a second line.
 */
const WRAP_BELOW_PX = 200;

/**
 * A node body's height with its title on one line, and on two.
 */
const ONE_LINE_PX = 89;
const TWO_LINES_PX = 120;

/**
 * The mounted tree, cleaned up even when an assertion fails.
 */
let root: Root | undefined;

/**
 * Where the tree is mounted.
 */
let container: HTMLDivElement | undefined;

/**
 * The widths the hidden measuring copy's actors were measured at, in order; before the diagram's
 * size is read they are measured at the widest an actor box gets.
 */
let measuredWidths: number[] = [];

beforeEach(() => {
  Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
  measuredWidths = [];
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(DIAGRAM_SIZE.width);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(DIAGRAM_SIZE.height);
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (
    this: HTMLElement,
  ) {
    return bodyHeight(this);
  });
});

afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  container?.remove();
  container = undefined;
  vi.restoreAllMocks();
});

/**
 * A node body's height as a browser would lay it out: its title wraps in a narrow actor box.
 * Records the widths the hidden measuring copy is measured at.
 *
 * @param element - The element whose height is read.
 */
function bodyHeight(element: HTMLElement): number {
  if (element.getAttribute('data-measure') !== 'node') {
    return 0;
  }

  const width = Number.parseFloat(element.parentElement?.style.width ?? '');
  if (element.closest('[data-measuring]') !== null) {
    measuredWidths.push(width);
  }

  return width < WRAP_BELOW_PX ? TWO_LINES_PX : ONE_LINE_PX;
}

/**
 * Renders a five-actor sequence, as wide as {@link DIAGRAM_SIZE}, and returns its container.
 */
function mountSequence(): HTMLElement {
  container = document.createElement('div');
  document.body.append(container);
  const mounted = createRoot(container);
  root = mounted;
  act(() =>
    mounted.render(
      <SequenceDiagram title="One drop from booking to handover">
        <Actor id="shop" title="Shop" icon="none" />
        <Actor id="api" title="Open Network" icon="none" />
        <Actor id="flock" title="Flock" icon="none" />
        <Actor id="rider" title="Rider" icon="none" />
        <Actor id="recipient" title="Recipient" icon="none" />
        <Message from="shop" to="api" label="POST /v1/drops" />
      </SequenceDiagram>,
    ),
  );
  return container;
}

/**
 * The drawn actor boxes, not the hidden measuring copy.
 *
 * @param box - The rendered diagram.
 */
function drawnActors(box: HTMLElement): HTMLElement[] {
  return Array.from(
    box.querySelectorAll<HTMLElement>('.kit-flow-html:not([data-measuring]) > .kit-flow-node'),
  );
}

describe('SequenceDiagram', () => {
  it('measures its hidden actors at the width it draws them, once its size is known', () => {
    const actors = drawnActors(mountSequence());
    const drawn = new Set(actors.map((actor) => Number.parseFloat(actor.style.width)));
    expect(actors).toHaveLength(5);
    expect(drawn.size).toBe(1);
    expect(drawn).toContain(measuredWidths.at(-1));
  });

  it('draws every actor as tall as a title that wraps in its box', () => {
    const heights = drawnActors(mountSequence()).map((actor) => actor.style.height);
    expect(heights).toEqual(Array.from({ length: 5 }, () => `${TWO_LINES_PX}px`));
  });
});
