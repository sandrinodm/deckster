// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import { Actor, Message } from '#diagrams/form-parts.tsx';
import { SequenceDiagram } from '#diagrams/sequence.tsx';

/**
 * Every `pending` the diagram itself (not its icon loader, which holds too) passed to the engine's
 * ready hold, in render order, and the drawn actors' heights as committed when each `false` was
 * passed.
 */
const holds = vi.hoisted(() => ({
  pending: [] as boolean[],
  heightsWhenReleased: [] as string[][],
  drawnHeights: (): string[] => [],
}));

vi.mock('@deckster/engine', () => ({
  useReadyHold: (pending: boolean) => {
    if (new Error().stack?.includes('use-kind-icons') === true) {
      return;
    }

    holds.pending.push(pending);
    if (!pending) {
      holds.heightsWhenReleased.push(holds.drawnHeights());
    }
  },
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

/**
 * How much taller than the hidden copy's body the drawn body of a `client` actor is measured: its
 * window bar, which the drawing leaves as a margin and the hidden copy does not know.
 */
const CLIENT_INSET_PX = 14;

/**
 * Extra height the test adds to every drawn body, to play a late resize (a web font arriving).
 */
let extraBodyHeight = 0;

/**
 * A resize observer whose callback never runs, as when its report is lost.
 */
class SilentObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

/**
 * The observers of {@link ReportingObserver} that are watching something.
 */
const reporters = new Set<ReportingObserver>();

/**
 * A resize observer that behaves like a browser's: it reports every element once, asynchronously,
 * when it is first observed, with the element's size then, and again when the test calls
 * {@link resizeEverything}.
 */
class ReportingObserver {
  private readonly targets = new Set<Element>();

  private readonly callback: (entries: unknown[]) => void;

  constructor(callback: (entries: unknown[]) => void) {
    this.callback = callback;
  }

  observe(target: Element): void {
    this.targets.add(target);
    reporters.add(this);
    queueMicrotask(() => this.report([target]));
  }

  unobserve(target: Element): void {
    this.targets.delete(target);
  }

  disconnect(): void {
    this.targets.clear();
    reporters.delete(this);
  }

  report(targets: Iterable<Element> = this.targets): void {
    const entries = [...targets]
      .filter((target) => this.targets.has(target))
      .map((target) => {
        const element = target as HTMLElement;
        return {
          target,
          borderBoxSize: [{ inlineSize: element.offsetWidth, blockSize: element.offsetHeight }],
        };
      });
    if (entries.length > 0) {
      this.callback(entries);
    }
  }
}

/**
 * Reports every observed element's current size, as a browser does after a layout change.
 */
function resizeEverything(): void {
  for (const reporter of reporters) {
    reporter.report();
  }
}

beforeEach(() => {
  Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
  measuredWidths = [];
  extraBodyHeight = 0;
  holds.pending.length = 0;
  holds.heightsWhenReleased.length = 0;
  holds.drawnHeights = () =>
    container === undefined ? [] : drawnActors(container).map((actor) => actor.style.height);
  vi.stubGlobal('ResizeObserver', SilentObserver);
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
  vi.unstubAllGlobals();
  reporters.clear();
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

  const lines = width < WRAP_BELOW_PX ? TWO_LINES_PX : ONE_LINE_PX;
  return element.closest('[data-measuring]') === null ? lines + extraBodyHeight : lines;
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
 * Renders three actors, one of them a `client` (a window shape, whose bar the hidden measuring copy
 * does not know), in a box wide enough that every title fits on one line.
 */
function mountClientSequence(): HTMLElement {
  container = document.createElement('div');
  document.body.append(container);
  const mounted = createRoot(container);
  root = mounted;
  act(() =>
    mounted.render(
      <SequenceDiagram title="One drop from booking to handover">
        <Actor id="web" title="Browser" kind="client" icon="none" />
        <Actor id="api" title="Open Network" icon="none" />
        <Actor id="flock" title="Flock" icon="none" />
        <Message from="web" to="api" label="POST /v1/drops" />
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

  it('draws every actor as tall as the client window bar needs, when no resize report arrives', () => {
    const heights = drawnActors(mountClientSequence()).map((actor) => actor.style.height);
    expect(heights).toEqual(Array.from({ length: 3 }, () => `${ONE_LINE_PX + CLIENT_INSET_PX}px`));
  });

  it('releases its ready hold once, after the drawing was measured and laid out again', () => {
    mountClientSequence();
    const released = holds.pending.indexOf(false);
    expect(released).toBeGreaterThan(-1);
    expect(holds.pending.slice(released).every((pending) => !pending)).toBe(true);
    expect(holds.heightsWhenReleased[0]).toEqual(
      Array.from({ length: 3 }, () => `${ONE_LINE_PX + CLIENT_INSET_PX}px`),
    );
  });

  describe('with an observer that reports like a browser', () => {
    beforeEach(() => {
      vi.stubGlobal('ResizeObserver', ReportingObserver);
    });

    it('draws what the silent observer drew, and holds the same way', async () => {
      const box = mountClientSequence();
      await act(async () => {
        await Promise.resolve();
      });
      const heights = drawnActors(box).map((actor) => actor.style.height);
      expect(heights).toEqual(
        Array.from({ length: 3 }, () => `${ONE_LINE_PX + CLIENT_INSET_PX}px`),
      );
      const released = holds.pending.indexOf(false);
      expect(released).toBeGreaterThan(-1);
      expect(holds.pending.slice(released).every((pending) => !pending)).toBe(true);
    });

    it('measures again once for a late resize and then stops', async () => {
      const box = mountClientSequence();
      await act(async () => {
        await Promise.resolve();
      });
      const rendersBefore = holds.pending.length;
      extraBodyHeight = 20;
      await act(async () => {
        resizeEverything();
        await Promise.resolve();
      });
      const heights = drawnActors(box).map((actor) => actor.style.height);
      expect(heights).toEqual(
        Array.from({ length: 3 }, () => `${ONE_LINE_PX + CLIENT_INSET_PX + extraBodyHeight}px`),
      );
      const rendersAfterResize = holds.pending.length;
      await act(async () => {
        resizeEverything();
        await Promise.resolve();
      });
      expect(holds.pending.length).toBe(rendersAfterResize);
      expect(rendersAfterResize).toBeGreaterThan(rendersBefore);
      expect(holds.pending.slice(holds.pending.indexOf(false)).every((pending) => !pending)).toBe(
        true,
      );
    });
  });
});
