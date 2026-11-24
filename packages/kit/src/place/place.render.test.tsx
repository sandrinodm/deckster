// @vitest-environment happy-dom
import type { SpacingTokens } from '@deckster/brand';
import type { ReactNode } from 'react';

import { PlacedLayerContext } from '@deckster/engine';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import { Place } from '#place/place.tsx';
import { SHAPE_GEOMETRIES, shapeExportKind } from '#place/resolve-place.ts';
import { Shape } from '#place/shape.tsx';
import { Text } from '#place/text.tsx';

const TEST_SPACING: SpacingTokens = {
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

const stepState = vi.hoisted(() => ({ current: 0 }));

vi.mock('@deckster/engine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@deckster/engine')>();
  return {
    ...actual,
    useReadyHold: () => undefined,
    useStatic: () => false,
    useSlide: () => ({
      isActive: true,
      state: 'current',
      direction: 'forward',
      step: stepState.current,
    }),
    useStep: () => stepState.current,
    useStepAt: (at: number) => {
      if (stepState.current < at) {
        return 'hidden';
      }

      return stepState.current === at ? 'active' : 'past';
    },
  };
});

vi.mock('@deckster/brand/runtime', () => ({
  useBrand: () => ({ brand: { spacing: TEST_SPACING } }),
}));

let root: Root | undefined;
let container: HTMLDivElement | undefined;

beforeEach(() => {
  Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
  stepState.current = 0;
});

afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  container?.remove();
  container = undefined;
  vi.restoreAllMocks();
  Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
});

/**
 * Mounts JSX into an attached DOM container inside React `act`.
 */
function render(node: ReactNode): HTMLDivElement {
  container = document.body.appendChild(document.createElement('div'));
  root = createRoot(container);
  act(() => {
    root?.render(node);
  });
  return container;
}

describe('<Place>', () => {
  it('renders placed attributes, styles and arbitrary Markdown lists', () => {
    const host = render(
      <Place cols="9-12" rows="2-4" name="Takeaways">
        <ul>
          <li>First takeaway</li>
          <li>Second takeaway</li>
        </ul>
      </Place>,
    );
    const box = host.querySelector<HTMLElement>('[data-placed="place"]');
    expect(box).not.toBeNull();
    expect(box?.dataset['placedZone']).toBe('safe');
    expect(box?.dataset['placedMode']).toBe('grid');
    expect(box?.dataset['placedSpec']).toBe('cols=9-12 rows=2-4');
    expect(box?.dataset['placedName']).toBe('Takeaways');
    expect(box?.dataset['placedRect']).toMatch(/^\d+,\d+,\d+,\d+$/u);
    expect(box?.dataset['kitEnter']).toBe('3');
    expect(box?.querySelectorAll('li').length).toBe(2);
  });

  it('throws when rendered without any placement prop', () => {
    expect(() => render(<Place>Orphan</Place>)).toThrow(/needs a placement/u);
  });
});

describe('<Shape>', () => {
  it('renders every geometry with matching data-shape and data-export-shape attributes', () => {
    const host = render(
      <div>
        {SHAPE_GEOMETRIES.map((geometry) => (
          <Shape
            key={geometry}
            shape={geometry}
            place="top-left"
            width={2}
            surface="accent"
            radius="md"
            align="center"
            anchor="center">
            {geometry}
          </Shape>
        ))}
      </div>,
    );
    const shapes = host.querySelectorAll<HTMLElement>('[data-placed="shape"]');
    expect(shapes.length).toBe(SHAPE_GEOMETRIES.length);
    for (const [index, geometry] of SHAPE_GEOMETRIES.entries()) {
      const el = shapes[index];
      expect(el?.dataset['shape']).toBe(geometry);
      expect(el?.dataset['exportShape']).toBe(shapeExportKind(geometry, 'md'));
      expect(el?.dataset['surface']).toBe('accent');
      expect(el?.dataset['align']).toBe('center');
      expect(el?.dataset['anchor']).toBe('center');
    }

    const squareEl = host.querySelector<HTMLElement>('[data-shape="square"]');
    const circleEl = host.querySelector<HTMLElement>('[data-shape="circle"]');
    expect(squareEl?.style.width).toBe(squareEl?.style.height);
    expect(circleEl?.style.width).toBe(circleEl?.style.height);
  });

  it('renders inline without data-placed when placement props are omitted', () => {
    const host = render(
      <Shape fill="surface" border="accent" stroke="bold" radius="lg" shadow="md">
        <ul>
          <li>Bullet one</li>
          <li>Bullet two</li>
        </ul>
      </Shape>,
    );
    expect(host.querySelector('[data-placed]')).toBeNull();
    const shape = host.querySelector<HTMLElement>('.kit-shape');
    expect(shape).not.toBeNull();
    expect(shape?.dataset['shape']).toBe('rect');
    expect(shape?.dataset['exportShape']).toBe('roundRect');
    expect(shape?.style.background).toBe('var(--brand-color-surface)');
    expect(shape?.style.borderColor).toBe('var(--brand-color-accent)');
    expect(shape?.style.borderWidth).toBe('var(--brand-stroke-bold)');
    expect(shape?.style.boxShadow).toBe('var(--brand-shadow-md)');
    expect(shape?.querySelectorAll('li').length).toBe(2);
  });

  it('wraps placed elements in <Step> when `at` is set', () => {
    stepState.current = 0;
    const host = render(
      <Shape place="top-right" width={3} surface="inverse" at={2} effect="fade">
        Step two callout
      </Shape>,
    );
    const step = host.querySelector<HTMLElement>('.kit-step');
    expect(step?.dataset['step']).toBe('2');
    expect(step?.dataset['effect']).toBe('fade');
    expect(step?.dataset['stepState']).toBe('hidden');
    const placed = step?.querySelector<HTMLElement>('[data-placed="shape"]');
    expect(placed).not.toBeNull();
    expect(placed?.dataset['kitEnter']).toBeUndefined();
  });
});

describe('<Text>', () => {
  it('renders placed unboxed text with data-export-text and role color', () => {
    const host = render(
      <Text
        place="bottom-right"
        zone="footer"
        type="caption"
        color="muted"
        align="end"
        name="Source">
        Source: Q3 survey
      </Text>,
    );
    const text = host.querySelector<HTMLElement>('[data-placed="text"]');
    expect(text).not.toBeNull();
    expect(text?.dataset['exportText']).toBe('true');
    expect(text?.dataset['placedZone']).toBe('footer');
    expect(text?.dataset['placedName']).toBe('Source');
    expect(text?.dataset['align']).toBe('end');
    expect(text?.dataset['colored']).toBe('');
    expect(text?.style.getPropertyValue('--kit-place-color')).toBe('var(--brand-color-muted)');
    expect(text?.querySelector('.kit-type-caption')?.textContent).toBe('Source: Q3 survey');
  });

  it('renders inline without data-placed when placement props are omitted', () => {
    const host = render(
      <Text type="label" color="accent">
        Inline tag
      </Text>,
    );
    expect(host.querySelector('[data-placed]')).toBeNull();
    const text = host.querySelector<HTMLElement>('.kit-text');
    expect(text?.dataset['exportText']).toBe('true');
    expect(text?.textContent).toBe('Inline tag');
  });
});

describe('TSX portaling into div.deck-placed', () => {
  it('portals placed elements rendered outside the placed layer into div.deck-placed', () => {
    const placedLayer = document.body.appendChild(document.createElement('div'));
    placedLayer.className = 'deck-placed';
    try {
      const host = render(
        <PlacedLayerContext value={placedLayer}>
          <div className="slide-body">
            <Shape place="top-right" width={3} surface="accent">
              Portaled badge
            </Shape>
            <Text place="bottom-left" zone="footer" type="caption">
              Portaled note
            </Text>
            <Place place="center">
              <span>Portaled content</span>
            </Place>
          </div>
        </PlacedLayerContext>,
      );

      // Slide body has none of the placed elements; they were portaled into div.deck-placed.
      expect(host.querySelectorAll('[data-placed]').length).toBe(0);
      expect(placedLayer.querySelectorAll('[data-placed]').length).toBe(3);
      expect(placedLayer.querySelector('[data-placed="shape"]')?.textContent).toBe(
        'Portaled badge',
      );
      expect(placedLayer.querySelector('[data-placed="text"]')?.textContent).toBe('Portaled note');
      expect(placedLayer.querySelector('[data-placed="place"]')?.textContent).toBe(
        'Portaled content',
      );
    } finally {
      placedLayer.remove();
    }
  });
});
