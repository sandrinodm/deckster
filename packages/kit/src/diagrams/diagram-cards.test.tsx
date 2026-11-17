// @vitest-environment happy-dom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import { Cycle } from '#diagrams/cycle.tsx';
import { FALLBACK, readDiagramTokens } from '#diagrams/diagram-tokens.ts';
import { NodeBody, NodeShadow, NodeShape } from '#diagrams/flow-node-view.tsx';
import { Node } from '#diagrams/flow-parts.tsx';
import { Flow } from '#diagrams/flow.tsx';
import { Actor, Item, Layer, Message } from '#diagrams/form-parts.tsx';
import { Layers } from '#diagrams/layers.tsx';
import { resolveCard } from '#diagrams/node-cards.ts';
import { nodeGeometry } from '#diagrams/node-shapes.ts';
import { SequenceDiagram } from '#diagrams/sequence.tsx';
import { Tree } from '#diagrams/tree.tsx';

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
 * A brand's card variables: `default`, `solid` and its own `spotlight` (a shadow, a left stripe and
 * its own title type), with databases mapped to `solid`.
 */
const CARDS: Readonly<Record<string, string>> = {
  '--brand-diagram-cards': 'default solid spotlight',
  '--brand-diagram-card-default-shadow': 'none',
  '--brand-diagram-card-solid-shadow': 'none',
  '--brand-diagram-card-spotlight-shadow': 'drop-shadow(6px 6px 0 black)',
  '--brand-diagram-card-spotlight-accent-side': 'left',
  '--brand-diagram-card-spotlight-accent-width': '8px',
  '--brand-diagram-card-spotlight-radius': '0px',
  '--brand-diagram-card-spotlight-title-own': 'true',
  '--brand-diagram-kind-database': 'solid',
};

/**
 * The mounted tree, cleaned up even when an assertion fails.
 */
let root: Root | undefined;

/**
 * Where the tree is mounted.
 */
let container: HTMLDivElement | undefined;

beforeEach(() => {
  Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  container?.remove();
  container = undefined;
  document.head.replaceChildren();
});

/**
 * Renders an element inside a box carrying the given custom properties, and returns the box.
 *
 * @param element - What to render.
 * @param variables - The custom properties, such as a brand's card variables.
 */
function mount(element: ReactNode, variables: Readonly<Record<string, string>> = {}): HTMLElement {
  container = document.createElement('div');
  // The diagram reads the variables from its own element; a rule puts them on every element.
  const sheet = document.createElement('style');
  sheet.textContent = `* { ${Object.entries(variables)
    .map(([name, value]) => `${name}: ${value};`)
    .join(' ')} }`;
  document.head.append(sheet);
  document.body.append(container);
  const mounted = createRoot(container);
  root = mounted;
  act(() => mounted.render(element));
  return container;
}

/**
 * The `data-card` of every node body by node id.
 *
 * @param box - The rendered diagram.
 */
function cardsByNode(box: HTMLElement): Record<string, string | null> {
  return Object.fromEntries(
    Array.from(box.querySelectorAll('.kit-flow-node')).map((node) => [
      node.getAttribute('data-node'),
      node.getAttribute('data-card'),
    ]),
  );
}

describe('a node drawn with a card', () => {
  /**
   * The tokens the card variables give.
   */
  const tokens = (): ReturnType<typeof readDiagramTokens> => {
    const element = document.createElement('div');
    for (const [name, value] of Object.entries(CARDS)) {
      element.style.setProperty(name, value);
    }

    document.body.append(element);
    return readDiagramTokens(element);
  };
  const node = { id: 'api', kind: 'service', title: 'API', state: 'default' } as const;
  const rect = { x: 0, y: 0, width: 200, height: 80 };

  it('casts its shadow from a masked copy of its outline that follows its visibility and dimming', () => {
    const card = resolveCard(tokens().cards, { own: 'spotlight' });
    const geometry = nodeGeometry('card', card.tokens, rect);
    const box = mount(
      <svg>
        <NodeShadow
          node={node}
          card={card}
          rect={rect}
          geometry={geometry}
          frame={{ visible: false, state: 'muted', arrival: false }}
          dimmed
        />
      </svg>,
    );
    const shadow = box.querySelector('[data-diagram-part="node-shadow"]');
    expect(shadow?.getAttribute('data-card')).toBe('spotlight');
    expect(shadow?.getAttribute('data-visible')).toBe('false');
    expect(shadow?.getAttribute('data-dimmed')).toBe('true');
    expect(shadow?.getAttribute('mask')).toMatch(/^url\(#kit-/);
    expect(shadow?.querySelector('mask')?.getAttribute('maskUnits')).toBe('userSpaceOnUse');
    expect(shadow?.querySelector('.kit-flow-shadow-room')).not.toBeNull();
  });

  it('draws no shadow for a card without one', () => {
    const card = resolveCard(tokens().cards, { own: 'solid' });
    const box = mount(
      <svg>
        <NodeShadow
          node={node}
          card={card}
          rect={rect}
          geometry={nodeGeometry('card', card.tokens, rect)}
          frame={{ visible: true, state: 'default', arrival: false }}
          dimmed={false}
        />
      </svg>,
    );
    expect(box.querySelector('[data-diagram-part="node-shadow"]')).toBeNull();
  });

  it('draws its stripe on its side, between the outline fill and the outline stroke', () => {
    const card = resolveCard(tokens().cards, { own: 'spotlight' });
    const box = mount(
      <svg>
        <NodeShape
          node={node}
          card={card}
          rect={rect}
          geometry={nodeGeometry('card', card.tokens, rect)}
          frame={{ visible: true, state: 'highlighted', arrival: false }}
          dimmed={false}
          arrivalDelay={0}
        />
      </svg>,
    );
    const shape = box.querySelector('.kit-flow-shape');
    expect(shape?.getAttribute('data-card')).toBe('spotlight');
    const order = Array.from(shape?.children ?? []).map(
      (child) => child.getAttribute('class') ?? child.tagName.toLowerCase(),
    );
    expect(order).toEqual([
      'kit-flow-halo',
      'kit-flow-outline kit-flow-outline-fill',
      'clippath',
      'kit-flow-accent',
      'kit-flow-outline kit-flow-outline-stroke',
      'kit-flow-pulse',
    ]);
    const stripe = shape?.querySelector('.kit-flow-accent');
    expect(stripe?.getAttribute('data-side')).toBe('left');
    expect(stripe?.getAttribute('width')).toBe('8');
  });

  it("is today's markup with a stylesheet that has no card variables", () => {
    const card = resolveCard(FALLBACK.cards, { kind: 'service' });
    const box = mount(
      <>
        <svg>
          <NodeShape
            node={node}
            card={card}
            rect={rect}
            geometry={nodeGeometry('card', card.tokens, rect)}
            frame={{ visible: true, state: 'default', arrival: false }}
            dimmed={false}
            arrivalDelay={0}
          />
        </svg>
        <NodeBody
          node={node}
          card={card}
          extras={undefined}
          rect={rect}
          inset={{ top: 0, right: 0, bottom: 0, left: 0 }}
          frame={{ visible: true, state: 'default', arrival: false }}
          dimmed={false}
          arrivalDelay={0}
        />
      </>,
    );
    const shape = box.querySelector<SVGGElement>('.kit-flow-shape');
    const body = box.querySelector<HTMLElement>('.kit-flow-node');
    expect(shape?.getAttribute('style')).not.toContain('--kit-card');
    expect(body?.getAttribute('style')).not.toContain('--kit-card');
    expect(shape?.hasAttribute('data-card-fill')).toBe(false);
    expect(body?.hasAttribute('data-icon')).toBe(false);
    expect(Array.from(shape?.children ?? []).map((child) => child.getAttribute('class'))).toEqual([
      'kit-flow-halo',
      'kit-flow-outline',
      'kit-flow-pulse',
    ]);
  });
});

describe('the card prop of each diagram', () => {
  it('sets the card of every node of a <Flow>, a <Tree> and a <Cycle> that names none', () => {
    const flow = mount(
      <Flow title="Flow" card="spotlight">
        <Node id="a" title="A" icon="none" col={1} row={1} />
        <Node id="b" title="B" icon="none" card="solid" col={2} row={1} />
        <Node id="c" title="C" icon="none" card="glow" col={3} row={1} />
      </Flow>,
      CARDS,
    );
    expect(cardsByNode(flow)).toMatchObject({ a: 'spotlight', b: 'solid', c: 'spotlight' });
    expect(
      flow.querySelector('.kit-flow-node[data-node="c"]')?.getAttribute('data-card-missing'),
    ).toBe('glow');
    act(() => root?.unmount());

    const tree = mount(
      <Tree title="Tree" card="solid">
        <Node id="root" title="Root" icon="none">
          <Node id="leaf" title="Leaf" icon="none" card="spotlight" />
        </Node>
      </Tree>,
      CARDS,
    );
    expect(cardsByNode(tree)).toMatchObject({ root: 'solid', leaf: 'spotlight' });
    act(() => root?.unmount());

    const cycle = mount(
      <Cycle title="Cycle" card="spotlight">
        <Node id="one" title="One" icon="none" />
        <Node id="two" title="Two" kind="database" icon="none" card="nope" />
        <Node id="three" title="Three" icon="none" />
      </Cycle>,
      CARDS,
    );
    expect(cardsByNode(cycle)).toMatchObject({
      one: 'spotlight',
      two: 'spotlight',
      three: 'spotlight',
    });
  });

  it("falls back to the brand's card for the kind, then default", () => {
    const flow = mount(
      <Flow title="Flow">
        <Node id="db" kind="database" title="DB" icon="none" col={1} row={1} />
        <Node id="api" title="API" icon="none" col={2} row={1} />
      </Flow>,
      CARDS,
    );
    expect(cardsByNode(flow)).toMatchObject({ db: 'solid', api: 'default' });
  });

  it('sets the card of every actor of a <SequenceDiagram>', () => {
    const box = mount(
      <SequenceDiagram title="Calls" card="solid">
        <Actor id="web" title="Web" icon="none" />
        <Actor id="api" title="API" icon="none" card="spotlight" />
        <Message from="web" to="api" label="GET" />
      </SequenceDiagram>,
      CARDS,
    );
    expect(cardsByNode(box)).toMatchObject({ web: 'solid', api: 'spotlight' });
  });
});

describe('cards on <Layers>', () => {
  /**
   * A stack: a band that names a card and one that does not, with chips.
   */
  const stack = (
    <Layers title="Stack" card="solid">
      <Layer title="Edge" card="spotlight">
        <Item title="CDN" />
        <Item title="Gateway" card="spotlight" />
      </Layer>
      <Layer title="Data">
        <Item title="Postgres" card="default" />
      </Layer>
    </Layers>
  );

  it('gives a band a card only when its <Layer> names one', () => {
    const box = mount(stack, CARDS);
    const [named, plain] = Array.from(box.querySelectorAll<HTMLElement>('.kit-layer'));
    expect(named?.getAttribute('data-card')).toBe('spotlight');
    expect(named?.getAttribute('data-accent')).toBe('left');
    expect(named?.style.getPropertyValue('--kit-card-box-shadow')).toBe(
      'var(--brand-diagram-card-spotlight-box-shadow)',
    );
    expect(plain?.hasAttribute('data-card')).toBe(false);
  });

  it("sets the title type of a band and a chip whose card's title the brand wrote", () => {
    const box = mount(stack, CARDS);
    const [named, plain] = Array.from(box.querySelectorAll('.kit-layer'));
    expect(named?.getAttribute('data-card-title')).toBe('own');
    expect(plain?.hasAttribute('data-card-title')).toBe(false);
    const chips = Array.from(box.querySelectorAll<HTMLElement>('.kit-layer-item'));
    expect(chips.map((chip) => chip.getAttribute('data-card'))).toEqual([
      'solid',
      'spotlight',
      'default',
    ]);
    expect(chips.map((chip) => chip.getAttribute('data-card-title'))).toEqual([null, 'own', null]);
  });

  it("rounds a chip with its card's radius only when a card was named for it", () => {
    const box = mount(
      <Layers title="Stack">
        <Layer title="Data">
          <Item title="Postgres" />
          <Item title="Redis" card="spotlight" />
        </Layer>
      </Layers>,
      CARDS,
    );
    const [plain, named] = Array.from(box.querySelectorAll<HTMLElement>('.kit-layer-item'));
    expect(plain?.getAttribute('data-card')).toBe('default');
    expect(plain?.style.getPropertyValue('--kit-chip-radius')).toBe('');
    expect(named?.style.getPropertyValue('--kit-chip-radius')).toBe('0px');
  });
});
