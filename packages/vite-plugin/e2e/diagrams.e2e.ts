import type { Browser } from '@e2e-dev/web';

import { describe } from '@e2e-dev/web';
import { expect } from 'e2e';

import type { Brand } from './support/brands.ts';
import type { PageProblems } from './support/page-problems.ts';

import { diagramsUrl, useDiagramsServers } from './support/diagrams-servers.ts';
import { test } from './support/page-problems.ts';

/**
 * The part of `window.__deck` these tests use.
 */
type DeckWindow = Window & {
  /**
   * The deck's automation API, once the deck has mounted.
   */
  __deck?: {
    /**
     * Resolves once the slide on screen (or every slide, in static mode) is ready to capture.
     */
    ready: () => Promise<void>;
  };
};

/**
 * The one-based slide numbers of the diagrams deck.
 */
const SLIDE = {
  /**
   * The stepped request journey.
   */
  journey: 2,

  /**
   * The fan-out of order events.
   */
  events: 3,

  /**
   * The agent loop.
   */
  agent: 4,

  /**
   * The failure and retry.
   */
  retry: 5,

  /**
   * The automatic service map.
   */
  serviceMap: 6,

  /**
   * The migration timeline.
   */
  timeline: 8,

  /**
   * The TSX deploy gates, an automatic layout.
   */
  deployGates: 13,
} as const;

/**
 * The slides with a diagram, by one-based number, with the step each is checked at.
 */
const DIAGRAM_SLIDES: readonly (readonly [number, number])[] = [
  [2, 4],
  [3, 3],
  [4, 2],
  [5, 2],
  [6, 0],
  [7, 5],
  [8, 4],
  [9, 5],
  [10, 4],
  [11, 3],
  [12, 3],
  [13, 2],
];

/**
 * Room for every module a dev server sends.
 */
const MAX_RESOURCES = 5000;

/**
 * The selector of the slide on screen.
 */
const ACTIVE = '[data-slide-active="true"]';

useDiagramsServers();

/**
 * Opens a slide of the diagrams deck at a step and waits until it is ready.
 *
 * @param fixtures - The test's `browser` and `problems` fixtures.
 * @param target - The brand, slide and step, and a query string such as `?static`.
 */
async function open(
  fixtures: { browser: Browser; problems: PageProblems },
  target: { brand?: Brand; slide: number; step: number; query?: string },
): Promise<void> {
  const { browser, problems } = fixtures;
  const url = `${diagramsUrl(target.brand ?? 'default')}${target.query ?? ''}#/${target.slide}/${target.step}`;
  await problems.navigate(() => browser.goto(url));
  await expect
    .poll(() => browser.evaluate(() => (window as DeckWindow).__deck !== undefined))
    .toBe(true);
  await browser.evaluate(() => (window as DeckWindow).__deck!.ready().then(() => null));
}

/**
 * Moves the open deck to a slide and step through the URL hash and waits until it is ready.
 *
 * @param browser - The browser fixture.
 * @param slide - The one-based slide number.
 * @param step - The deck step.
 */
async function goTo(browser: Browser, slide: number, step: number): Promise<void> {
  await browser.evaluate((hash: string) => {
    location.hash = hash;
    return null;
  }, `#/${slide}/${step}`);
  await browser.evaluate(() => (window as DeckWindow).__deck!.ready().then(() => null));
}

/**
 * The state of each node and the tone of each edge of the diagram on screen.
 *
 * @param browser - The browser fixture.
 */
function diagramState(
  browser: Browser,
): Promise<{ nodes: Record<string, string>; edges: Record<string, string> }> {
  return browser.evaluate((active: string) => {
    /**
     * An attribute of each element, keyed by another.
     */
    const read = (selector: string, key: string, value: string) =>
      Object.fromEntries(
        [...document.querySelectorAll(`${active} ${selector}`)].map((element) => [
          element.getAttribute(key) ?? '',
          element.getAttribute(value) ?? '',
        ]),
      );
    return {
      nodes: read('.kit-flow-node', 'data-node', 'data-state'),
      edges: read('.kit-flow-edge', 'data-edge', 'data-tone'),
    };
  }, ACTIVE);
}

describe('a stepped request journey', () => {
  test('moves one hop per step, lighting the node it reaches and the path behind it', async (fixtures) => {
    const { browser } = fixtures;
    await open(fixtures, { slide: SLIDE.journey, step: 0 });
    expect((await diagramState(browser)).edges['browser->cdn']).toBe('default');

    await goTo(browser, SLIDE.journey, 1);
    await expect
      .poll(async () => (await diagramState(browser)).edges['browser->cdn'])
      .toBe('active');
    expect((await diagramState(browser)).nodes['cdn']).toBe('highlighted');

    await goTo(browser, SLIDE.journey, 3);
    const third = await diagramState(browser);
    expect(third.edges).toMatchObject({
      'browser->cdn': 'trail',
      'cdn->gateway': 'trail',
      'gateway->orders': 'active',
    });
    expect(third.nodes['orders']).toBe('highlighted');
    expect(
      await browser.evaluate(
        (active: string) =>
          document
            .querySelector(`${active} .kit-flow-node[data-node="cache"]`)
            ?.getAttribute('data-dimmed') ?? null,
        ACTIVE,
      ),
    ).toBe('true');

    await goTo(browser, SLIDE.journey, 8);
    expect((await diagramState(browser)).nodes['browser']).toBe('highlighted');
  });

  test('animates its packet while the slide is on screen and pauses it off screen', async (fixtures) => {
    const { browser } = fixtures;
    await open(fixtures, { slide: SLIDE.journey, step: 3 });
    const positions = new Set<string>();
    for (let sample = 0; sample < 12; sample += 1) {
      positions.add(
        await browser.evaluate(
          (active: string) =>
            getComputedStyle(document.querySelector(`${active} [data-diagram-part="packet"]`)!)
              .transform,
          ACTIVE,
        ),
      );
      await browser.evaluate(
        () => new Promise<null>((resolve) => setTimeout(() => resolve(null), 90)),
      );
    }

    expect(positions.size).toBeGreaterThan(2);
    /**
     * The running animations of each slide.
     */
    const running = () =>
      browser.evaluate(() =>
        [...document.querySelectorAll('.deck-slide')].map((slide) => ({
          state: slide.getAttribute('data-slide-state'),
          playing: slide
            .getAnimations({ subtree: true })
            .filter(
              (animation) =>
                animation.constructor.name === 'Animation' && animation.playState === 'running',
            ).length,
        })),
      );
    expect((await running()).find((slide) => slide.state === 'current')?.playing).toBeGreaterThan(
      0,
    );

    await goTo(browser, SLIDE.events, 0);
    await expect
      .poll(async () => (await running()).find((slide) => slide.state === 'past')?.playing)
      .toBe(0);
  });

  test('freezes the packet partway along with its tail in static mode, and describes it', async (fixtures) => {
    const { browser } = fixtures;
    await open(fixtures, { slide: SLIDE.journey, step: 3, query: '?static' });
    const still = await browser.evaluate(() => {
      const figure = document.querySelector(
        '.deck-slide[data-slide-state="current"] [data-diagram="flow"]',
      );
      const packet = figure?.querySelector('[data-diagram-part="packet"]');
      return {
        transform: packet?.getAttribute('transform') ?? null,
        tail: figure?.querySelectorAll('[data-diagram-part="packet-tail"]').length ?? 0,
        description: JSON.parse(figure?.getAttribute('data-diagram-description') ?? 'null'),
      };
    });
    expect(still.transform).toMatch(/^translate\(/);
    expect(still.tail).toBe(3);
    expect(still.description).toMatchObject({ version: 1, kind: 'flow', step: 3 });
    expect(still.description.packets).toHaveLength(1);
    expect(
      still.description.nodes.find((node: { id: string }) => node.id === 'orders'),
    ).toMatchObject({
      shape: 'roundRect',
      state: 'highlighted',
      paint: { stroke: expect.stringMatching(/^#[0-9a-f]{6}$/) },
    });
    expect(
      still.description.edges.find((edge: { id: string }) => edge.id === 'gateway->orders')?.points
        .length,
    ).toBeGreaterThanOrEqual(2);
  });
});

describe('automatic layout', () => {
  test('never loads ELK for an MDX slide, whose layout the build computed, and places its nodes', async (fixtures) => {
    const { browser } = fixtures;
    await browser.addInitScript(
      (size: number) => performance.setResourceTimingBufferSize(size),
      MAX_RESOURCES,
    );
    await open(fixtures, { slide: SLIDE.journey, step: 0 });
    await goTo(browser, SLIDE.serviceMap, 0);
    const layout = await browser.evaluate((active: string) => {
      const figure = document.querySelector(`${active} [data-diagram="flow"]`);
      const boxes = [...(figure?.querySelectorAll('.kit-flow-node') ?? [])].map((node) =>
        node.getBoundingClientRect(),
      );
      const overlapping = boxes.some((a, index) =>
        boxes
          .slice(index + 1)
          .some(
            (b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom,
          ),
      );
      return {
        ready: figure?.getAttribute('data-diagram-layout') ?? null,
        shown: figure?.getAttribute('data-ready') ?? null,
        overlap: figure?.getAttribute('data-diagram-overlap') ?? null,
        nodes: boxes.length,
        overlapping,
      };
    }, ACTIVE);
    expect(layout).toEqual({
      ready: 'layered',
      shown: 'true',
      overlap: null,
      nodes: 9,
      overlapping: false,
    });
    expect(await elkLoads(browser)).toBe(0);
  });

  test('loads ELK only for a TSX diagram without cells and holds ready until it is placed', async (fixtures) => {
    const { browser } = fixtures;
    await browser.addInitScript(
      (size: number) => performance.setResourceTimingBufferSize(size),
      MAX_RESOURCES,
    );
    await open(fixtures, { slide: SLIDE.journey, step: 0 });
    expect(await elkLoads(browser)).toBe(0);
    await goTo(browser, SLIDE.deployGates, 0);
    const placed = await browser.evaluate((active: string) => {
      const figure = document.querySelector(`${active} [data-diagram="flow"]`);
      return {
        shown: figure?.getAttribute('data-ready') ?? null,
        nodes: figure?.querySelectorAll('.kit-flow-node').length ?? 0,
        icons: figure?.querySelectorAll('.kit-flow-node .kit-flow-node-icon svg').length ?? 0,
      };
    }, ACTIVE);
    expect(placed).toEqual({ shown: 'true', nodes: 5, icons: 5 });
    expect(await elkLoads(browser)).toBeGreaterThan(0);
  });
});

/**
 * How many ELK chunks the page has loaded.
 *
 * @param browser - The browser fixture.
 */
function elkLoads(browser: Browser): Promise<number> {
  return browser.evaluate(
    () =>
      performance.getEntriesByType('resource').filter((entry) => /elk/i.test(entry.name)).length,
  );
}

describe('descriptions', () => {
  test('match the drawing for every diagram kind, live and in static mode', async (fixtures) => {
    const { browser } = fixtures;
    for (const query of ['', '?static']) {
      for (const [slide, step] of DIAGRAM_SLIDES) {
        await open(fixtures, { slide, step, query });
        await browser.evaluate(
          () => new Promise<null>((resolve) => setTimeout(() => resolve(null), 700)),
        );
        const report = await browser.evaluate((active: string) => {
          const figure = document.querySelector<HTMLElement>(`${active} [data-diagram]`);
          if (figure === null) {
            return { problems: ['no diagram'], kind: '' };
          }

          const description = JSON.parse(figure.getAttribute('data-diagram-description') ?? 'null');
          const problems: string[] = [];
          if (description === null) {
            return {
              problems: ['no description'],
              kind: figure.getAttribute('data-diagram') ?? '',
            };
          }

          const slide = figure.closest<HTMLElement>('.deck-slide');
          const scale = (slide?.getBoundingClientRect().width ?? 1920) / 1920;
          const base = slide?.getBoundingClientRect() ?? { x: 0, y: 0 };
          /**
           * An element's box on the canvas.
           */
          const onCanvas = (element: Element) => {
            const rect = element.getBoundingClientRect();
            return {
              x: (rect.x - base.x) / scale,
              y: (rect.y - base.y) / scale,
              width: rect.width / scale,
              height: rect.height / scale,
            };
          };
          /**
           * Whether two coordinates agree within a few pixels.
           */
          const near = (a: number, b: number) => Math.abs(a - b) <= 3;
          for (const node of description.nodes) {
            if (
              description.kind === 'flow' ||
              description.kind === 'tree' ||
              description.kind === 'cycle' ||
              description.kind === 'sequence'
            ) {
              const drawn = figure.querySelector(
                `.kit-flow-node[data-node="${CSS.escape(node.id)}"]`,
              );
              if (drawn === null) {
                problems.push(`node ${node.id} is not drawn`);
                continue;
              }

              const box = onCanvas(drawn);
              if (
                !near(box.x, node.box.x) ||
                !near(box.y, node.box.y) ||
                !near(box.width, node.box.width)
              ) {
                problems.push(
                  `node ${node.id} is described at ${JSON.stringify(node.box)}, drawn at ${JSON.stringify(box)}`,
                );
              }

              const title = (drawn.querySelector('.kit-flow-node-title')?.textContent ?? '')
                .replace(/\u00ad/g, '')
                .trim();
              if (title !== '' && node.texts[0]?.text !== title) {
                problems.push(`node ${node.id} title "${node.texts[0]?.text}" is not "${title}"`);
              }

              const badge = figure.querySelector(
                `.kit-flow-badge[data-node="${CSS.escape(node.id)}"]:not([data-visible="false"])`,
              );
              if (
                badge !== null &&
                !node.texts.some(
                  (text: { text: string }) =>
                    text.text.toUpperCase() === (badge.textContent ?? '').trim().toUpperCase(),
                )
              ) {
                problems.push(`node ${node.id} badge "${badge.textContent}" is not described`);
              }
            }

            if (node.texts.length === 0 && description.kind !== 'svg') {
              problems.push(`node ${node.id} has no text`);
            }
          }

          for (const edge of description.edges) {
            const label = figure.querySelector(
              `.kit-flow-label[data-edge="${CSS.escape(edge.id)}"]`,
            );
            if (
              label !== null &&
              label.getAttribute('data-visible') !== 'false' &&
              edge.label === null
            ) {
              problems.push(`edge ${edge.id} label is not described`);
            }
          }

          if (description.kind === 'sequence' && (description.lines ?? []).length === 0) {
            problems.push('lifelines are not described');
          }

          if (description.kind === 'timeline' && (description.lines ?? []).length !== 2) {
            problems.push('the axis is not described');
          }

          if (
            (description.kind === 'timeline' || description.kind === 'layers') &&
            description.nodes.length === 0
          ) {
            problems.push(`${description.kind} has no nodes`);
          }

          if (description.kind === 'svg' && !(description.svg ?? '').startsWith('<svg')) {
            problems.push('the drawing is not described');
          }

          return { problems, kind: description.kind };
        }, ACTIVE);
        expect(report.problems, `slide ${slide} (${report.kind}) ${query}`).toEqual([]);
      }
    }
  });

  test('describe the packets of the step in a live deck too', async (fixtures) => {
    const { browser } = fixtures;
    await open(fixtures, { slide: SLIDE.journey, step: 3 });
    const packets = await browser.evaluate((active: string) => {
      const figure = document.querySelector(`${active} [data-diagram="flow"]`);
      return JSON.parse(figure?.getAttribute('data-diagram-description') ?? 'null')?.packets
        ?.length;
    }, ACTIVE);
    expect(packets).toBe(1);
  });
});

describe('timeline', () => {
  test('keeps an explicit current milestone current once later ones appear', async (fixtures) => {
    const { browser } = fixtures;
    await open(fixtures, { slide: SLIDE.timeline, step: 4 });
    const states = await browser.evaluate(
      (active: string) =>
        [...document.querySelectorAll(`${active} .kit-timeline-item`)].map(
          (item) => item.getAttribute('data-state') ?? '',
        ),
      ACTIVE,
    );
    expect(states).toEqual(['success', 'success', 'current', 'future']);
  });
});

describe('brands', () => {
  test('redraw the same diagram in each brand’s diagram colors with no slide edits', async (fixtures) => {
    const { browser } = fixtures;
    /**
     * The orders node's outline color, the brand's highlight and the title font in a brand.
     */
    const highlight = async (brand: Brand) => {
      await open(fixtures, { brand, slide: SLIDE.journey, step: 3, query: '?static' });
      return browser.evaluate(() => {
        const figure = document.querySelector(
          '.deck-slide[data-slide-state="current"] [data-diagram="flow"]',
        )!;
        const outline = figure.querySelector(
          '.kit-flow-shape[data-node="orders"] .kit-flow-outline',
        )!;
        return {
          stroke: getComputedStyle(outline).stroke,
          token: getComputedStyle(figure).getPropertyValue('--brand-diagram-highlight').trim(),
          family: getComputedStyle(figure.querySelector('.kit-flow-node-title')!).fontFamily,
        };
      });
    };
    const light = await highlight('default');
    const night = await highlight('nocturne');
    expect(light.stroke).not.toBe(night.stroke);
    expect(light.family).not.toBe(night.family);
    expect(light.token).not.toBe(night.token);
  });
});
