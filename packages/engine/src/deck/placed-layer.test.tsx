// @vitest-environment happy-dom
import { act, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';

import type { LayoutProps } from '#layouts/layout.ts';

import { PLACED_SLOT, SLOT_NAME_PATTERN } from '#contract/slots.ts';
import {
  manifestOf,
  mdxSlide,
  renderDeck,
  slot,
  tsxSlide,
  type MountedDeck,
} from '#deck/deck.fixture.tsx';
import { useInsidePlacedLayer, usePlacedLayer } from '#deck/placed-layer.tsx';
import { defineLayout } from '#layouts/layout.ts';
import { definePlugin } from '#plugins/deck-plugin.ts';

/**
 * Contract type for a test layout that records which slot keys it receives.
 */
type SpyLayoutContract = {
  /**
   * The layout name.
   */
  name: 'spy';

  /**
   * A short description.
   */
  description: string;

  /**
   * Empty frontmatter schema.
   */
  schema: import('effect').Schema.Struct<{}>;

  /**
   * No named slots.
   */
  slots: {};

  /**
   * Empty content budget.
   */
  budget: {};

  /**
   * Minimal example.
   */
  example: { frontmatter: {}; body: string };
};

/**
 * The deck under test, unmounted after each test.
 */
let mounted: MountedDeck | undefined;

beforeEach(() => {
  window.history.replaceState(null, '', '#');
});

afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
});

/**
 * Reports whether it renders inside `.deck-placed` and whether the layer DOM node is available.
 */
function LayerProbe({ label }: { label: string }): ReactNode {
  const layer = usePlacedLayer();
  const inside = useInsidePlacedLayer();
  return (
    <div
      data-probe={label}
      data-inside={String(inside)}
      data-has-layer={String(layer !== null && layer.classList.contains('deck-placed'))}>
      {label}
    </div>
  );
}

/**
 * Portals its children into the slide's `.deck-placed` layer when rendered outside it, as placed
 * kit components do in TSX slides.
 */
function PortalBadge({ children }: { children: ReactNode }): ReactNode {
  const layer = usePlacedLayer();
  const inside = useInsidePlacedLayer();
  const content = <div data-badge="true">{children}</div>;
  if (inside) {
    return content;
  }

  return layer === null ? null : createPortal(content, layer);
}

/**
 * Layout that exposes the keys of the slots map it received on `data-slot-keys`.
 */
function SpyLayout({ slots }: LayoutProps<SpyLayoutContract>): ReactNode {
  return (
    <div data-layout="spy" data-slot-keys={Object.keys(slots).join(',')}>
      {slots.body}
    </div>
  );
}

/**
 * Plugin that registers {@link SpyLayout}.
 */
const SPY_PLUGIN = definePlugin({
  name: 'spy',
  layouts: [defineLayout<SpyLayoutContract>({ name: 'spy', component: SpyLayout })],
});

describe('Placed layer', () => {
  it('uses a reserved slot name that cannot match user slot names', () => {
    expect(PLACED_SLOT).toBe('__placed');
    expect(SLOT_NAME_PATTERN.test(PLACED_SLOT)).toBe(false);
  });

  it('extracts MDX placed slot children into div.deck-placed after the layout and out of slots', () => {
    const slide = mdxSlide(
      'placed-mdx',
      (components) => [
        <LayerProbe key="body" label="in-body" />,
        slot(
          components,
          PLACED_SLOT,
          <>
            <LayerProbe label="in-placed" />
            <span data-placed-item="second">Badge</span>
          </>,
        ),
      ],
      { frontmatter: { layout: 'spy' } },
    );

    mounted = renderDeck(manifestOf(slide), { plugins: [SPY_PLUGIN] });

    const section = document.querySelector('section.deck-slide[data-slide-id="placed-mdx"]')!;
    const children = [...section.children];
    expect(children).toHaveLength(2);
    expect(children[0]?.getAttribute('data-layout')).toBe('spy');
    expect(children[1]?.classList.contains('deck-placed')).toBe(true);

    const layout = children[0]!;
    const placedLayer = children[1]!;

    expect(layout.getAttribute('data-slot-keys')).toBe('body');
    expect(layout.querySelector('[data-probe="in-placed"]')).toBeNull();
    expect(layout.querySelector('[data-placed-item="second"]')).toBeNull();

    const bodyProbe = layout.querySelector('[data-probe="in-body"]')!;
    expect(bodyProbe.getAttribute('data-inside')).toBe('false');
    expect(bodyProbe.getAttribute('data-has-layer')).toBe('true');

    const placedProbe = placedLayer.querySelector('[data-probe="in-placed"]')!;
    expect(placedProbe.getAttribute('data-inside')).toBe('true');
    expect(placedProbe.getAttribute('data-has-layer')).toBe('true');
    expect(placedLayer.querySelector('[data-placed-item="second"]')?.textContent).toBe('Badge');
  });

  it('omits body slot when an MDX slide has only placed elements', () => {
    const slide = mdxSlide(
      'only-placed',
      (components) => [slot(components, PLACED_SLOT, <div data-only="true">Only placed</div>)],
      { frontmatter: { layout: 'spy' } },
    );

    mounted = renderDeck(manifestOf(slide), { plugins: [SPY_PLUGIN] });

    const layout = document.querySelector('[data-layout="spy"]')!;
    expect(layout.getAttribute('data-slot-keys')).toBe('');
    const placedLayer = document.querySelector('section.deck-slide > .deck-placed')!;
    expect(placedLayer.querySelector('[data-only="true"]')?.textContent).toBe('Only placed');
  });

  it('provides div.deck-placed via usePlacedLayer in TSX slides so components can portal into it', () => {
    /**
     * TSX slide that reads the placed layer hooks and portals a badge into div.deck-placed.
     */
    const TsxWithPlaced = (): ReactNode => (
      <>
        <LayerProbe label="tsx-body" />
        <PortalBadge>Portaled</PortalBadge>
      </>
    );

    mounted = renderDeck(manifestOf(tsxSlide('placed-tsx', TsxWithPlaced)));

    const section = document.querySelector('section.deck-slide[data-slide-id="placed-tsx"]')!;
    const children = [...section.children];
    expect(children).toHaveLength(2);
    expect(children[0]?.classList.contains('deck-layout-default')).toBe(true);
    expect(children[1]?.classList.contains('deck-placed')).toBe(true);

    const layout = children[0]!;
    const placedLayer = children[1]!;

    const bodyProbe = layout.querySelector('[data-probe="tsx-body"]')!;
    expect(bodyProbe.getAttribute('data-inside')).toBe('false');
    expect(bodyProbe.getAttribute('data-has-layer')).toBe('true');

    expect(layout.querySelector('[data-badge="true"]')).toBeNull();
    expect(placedLayer.querySelector('[data-badge="true"]')?.textContent).toBe('Portaled');
  });

  it('returns null and false from placed layer hooks outside a slide', () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    act(() => {
      root.render(<LayerProbe label="outside" />);
    });

    const probe = container.querySelector('[data-probe="outside"]')!;
    expect(probe.getAttribute('data-inside')).toBe('false');
    expect(probe.getAttribute('data-has-layer')).toBe('false');

    act(() => root.unmount());
    container.remove();
  });
});
