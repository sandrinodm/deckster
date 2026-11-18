// @vitest-environment happy-dom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import { Edge, Node } from '#diagrams/flow-parts.tsx';
import { Flow } from '#diagrams/flow.tsx';

/**
 * What the diagram did, in order: `hold:true` and `hold:false` for each of its own ready holds (not
 * its icon loader's), and `elk` for each automatic layout that ran.
 */
const events = vi.hoisted(() => ({ log: [] as string[], elkCalls: 0 }));

vi.mock('@deckster/engine', () => ({
  useReadyHold: (pending: boolean) => {
    if (new Error().stack?.includes('use-kind-icons') === true) {
      return;
    }

    events.log.push(`hold:${pending}`);
  },
  useSlide: () => ({ isActive: false, state: 'current', direction: 'forward' }),
  useStatic: () => true,
  useStep: () => 0,
  useStepAt: () => ({ visible: true, current: false, past: false }),
}));

vi.mock('@deckster/brand/runtime', () => ({
  getBrand: () => ({ brand: { icons: { set: 'lucide' } } }),
}));

vi.mock('#diagrams/elk-layout.ts', () => ({
  autoLayoutPositions: async (input: { spec: { nodes: { id: string }[] } }) => {
    events.elkCalls += 1;
    events.log.push('elk');
    await Promise.resolve();
    const centres = Object.fromEntries(
      input.spec.nodes.map((node, index) => [node.id, [120 + index * 260, 200]]),
    );
    return { right: centres, down: centres };
  },
}));

/**
 * The diagram's box.
 */
const DIAGRAM_SIZE = { width: 1000, height: 600 };

/**
 * A node body's height as the browser lays out its text: the same drawn or hidden.
 */
const BODY_PX = 40;

/**
 * An edge label's size.
 */
const LABEL_SIZE = { width: 80, height: 20 };

/**
 * The mounted tree, cleaned up even when an assertion fails.
 */
let root: Root | undefined;

/**
 * Where the tree is mounted.
 */
let container: HTMLDivElement | undefined;

/**
 * The height each drawn node had when its body was read, in read order.
 */
let drawnReads: { id: string; nodeHeight: number }[] = [];

/**
 * Extra height the test adds to every drawn body, to play a late resize.
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
  events.log.length = 0;
  events.elkCalls = 0;
  drawnReads = [];
  extraBodyHeight = 0;
  vi.stubGlobal('ResizeObserver', SilentObserver);
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(DIAGRAM_SIZE.width);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(DIAGRAM_SIZE.height);
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.hasAttribute('data-measure-label') ? LABEL_SIZE.width : 0;
  });
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (
    this: HTMLElement,
  ) {
    return heightOf(this);
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
 * An element's height as a browser would lay it out; records the height each drawn node has when
 * its body is read.
 *
 * @param element - The element whose height is read.
 */
function heightOf(element: HTMLElement): number {
  if (element.hasAttribute('data-measure-label')) {
    return LABEL_SIZE.height;
  }

  if (element.getAttribute('data-measure') !== 'node') {
    return 0;
  }

  if (element.closest('[data-measuring]') === null) {
    const parent = element.parentElement;
    drawnReads.push({
      id: parent?.getAttribute('data-node') ?? '',
      nodeHeight: Number.parseFloat(parent?.style.height ?? ''),
    });
    return BODY_PX + extraBodyHeight;
  }

  return BODY_PX;
}

/**
 * Renders a diagram and returns its container.
 *
 * @param flow - The diagram.
 */
function mount(flow: ReactNode): HTMLElement {
  container = document.createElement('div');
  document.body.append(container);
  const mounted = createRoot(container);
  root = mounted;
  act(() => mounted.render(flow));
  return container;
}

/**
 * Lets the diagram's promises settle: the automatic layout, and a browser's resize reports.
 */
async function settle(): Promise<void> {
  for (let round = 0; round < 5; round += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

/**
 * The drawn nodes, not the hidden measuring copy.
 *
 * @param box - The rendered diagram.
 */
function drawnNodes(box: HTMLElement): HTMLElement[] {
  return Array.from(
    box.querySelectorAll<HTMLElement>('.kit-flow-html:not([data-measuring]) > .kit-flow-node'),
  );
}

/**
 * The ready holds the diagram passed, in order.
 */
function holds(): string[] {
  return events.log.filter((event) => event.startsWith('hold:'));
}

/**
 * Whether the diagram released its hold and never took it again.
 */
function releasedForGood(): boolean {
  const all = holds();
  const released = all.indexOf('hold:false');
  return released > -1 && all.slice(released).every((hold) => hold === 'hold:false');
}

/**
 * A node of an automatic layout, which has no cell.
 *
 * @param id - The node's id.
 * @param kind - The node's kind.
 */
function autoNode(id: string, kind?: string): ReactNode {
  return <Node key={id} id={id} title={id} icon="none" {...(kind === undefined ? {} : { kind })} />;
}

/**
 * The cylinder's inset at a node height: the room above and below its body that its curved ends
 * take.
 *
 * @param height - The node's height.
 */
function cylinderInset(height: number): number {
  const ry = Math.min(height * 0.11, 10);
  return ry * 2 + ry * 0.5;
}

describe('a <Flow> with grid cells', () => {
  /**
   * A grid with a database (a cylinder, whose body has insets), and an edge with a label.
   */
  const gridFlow = (
    <Flow title="Drops" cols={3} rows={1}>
      <Node id="store" title="Store" kind="database" icon="none" col={1} row={1} />
      <Node id="api" title="API" icon="none" col={2} row={1} />
      <Node id="shop" title="Shop" icon="none" col={3} row={1} />
      <Edge from="api" to="store" label="every 90 s" />
    </Flow>
  );

  it('places an edge label that only the drawing has, with no resize report', () => {
    const box = mount(gridFlow);
    const label = box.querySelector<HTMLElement>('[data-edge="api->store"].kit-flow-label');
    expect(label?.style.left).not.toBe('');
    expect(label?.style.top).not.toBe('');
  });

  it('draws nodes as tall as one re-measure of the drawing gives, with no resize report', () => {
    const box = mount(gridFlow);
    const firstDrawn = drawnReads.find((read) => read.id === 'store')?.nodeHeight ?? 0;
    const afterFirst = BODY_PX + cylinderInset(firstDrawn);
    const expected = BODY_PX + cylinderInset(afterFirst);
    expect(expected).toBeGreaterThan(BODY_PX);
    expect(expected).not.toBeCloseTo(firstDrawn, 1);
    for (const node of drawnNodes(box)) {
      expect(Number.parseFloat(node.style.height)).toBeCloseTo(expected, 1);
    }
  });

  it('releases its ready hold for good', () => {
    mount(gridFlow);
    expect(releasedForGood()).toBe(true);
  });
});

describe('a <Flow> without cells', () => {
  /**
   * Nodes that all measure the same drawn and hidden, with an edge.
   */
  const cardFlow = (
    <Flow title="Drops">
      {autoNode('a')}
      {autoNode('b')}
      {autoNode('c')}
      <Edge from="a" to="b" />
    </Flow>
  );

  /**
   * The same with a `client`, whose window bar makes its drawn body taller.
   */
  const clientFlow = (
    <Flow title="Drops">
      {autoNode('a', 'client')}
      {autoNode('b')}
      {autoNode('c')}
      <Edge from="a" to="b" />
    </Flow>
  );

  it('runs ELK once and releases its hold for good when no node changes height', async () => {
    mount(cardFlow);
    await settle();
    expect(events.elkCalls).toBe(1);
    expect(releasedForGood()).toBe(true);
  });

  it('runs ELK twice, before it releases its hold, when the drawing is taller than the hidden copy', async () => {
    mount(clientFlow);
    await settle();
    expect(events.elkCalls).toBe(2);
    expect(events.log.lastIndexOf('elk')).toBeLessThan(events.log.indexOf('hold:false'));
    expect(releasedForGood()).toBe(true);
  });

  describe('with an observer that reports like a browser', () => {
    beforeEach(() => {
      vi.stubGlobal('ResizeObserver', ReportingObserver);
    });

    it('runs ELK as many times and holds the same way, with a diamond too', async () => {
      const box = mount(
        <Flow title="Drops">
          {autoNode('a', 'client')}
          {autoNode('b', 'decision')}
          {autoNode('c')}
          <Edge from="a" to="b" />
        </Flow>,
      );
      await settle();
      const heights = drawnNodes(box).map((node) => node.style.height);
      expect(new Set(heights).size).toBe(1);
      expect(events.elkCalls).toBe(2);
      expect(releasedForGood()).toBe(true);
      expect(events.log.lastIndexOf('elk')).toBeLessThan(events.log.indexOf('hold:false'));
    });

    it('measures again once for a late resize and then stops', async () => {
      const box = mount(clientFlow);
      await settle();
      const before = drawnNodes(box).map((node) => Number.parseFloat(node.style.height));
      const elkBefore = events.elkCalls;
      extraBodyHeight = 20;
      await act(async () => {
        resizeEverything();
        await Promise.resolve();
      });
      await settle();
      const after = drawnNodes(box).map((node) => Number.parseFloat(node.style.height));
      expect(after[0]).toBeCloseTo((before[0] ?? 0) + 20, 1);
      const rendered = events.log.length;
      await act(async () => {
        resizeEverything();
        await Promise.resolve();
      });
      await settle();
      expect(events.log.length).toBe(rendered);
      expect(events.elkCalls).toBe(elkBefore + 1);
      expect(holds().at(-1)).toBe('hold:false');
    });
  });
});
