// @vitest-environment happy-dom
import { SlideFrontmatter } from '@deckster/engine/frontmatter';
import { Schema } from 'effect';
import { act, cloneElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import { imageRevealLayoutContract } from '#layouts/image-reveal-layout.contract.ts';
import { imageRevealLayout } from '#layouts/image-reveal-layout.tsx';

const view = vi.hoisted(() => ({ step: 0, isStatic: false }));

vi.mock('@deckster/engine', async (original) => ({
  ...(await original<typeof import('@deckster/engine')>()),
  useStatic: () => view.isStatic,
  useStepAt: (at: number | undefined) => {
    if (at === undefined) {
      return 'past';
    }

    return view.step < at ? 'hidden' : 'current';
  },
  useSlide: () => ({
    file: 'slides/example.mdx',
    isActive: true,
    state: 'current',
    frontmatter: {},
  }),
  useReadyHold: () => undefined,
}));

vi.mock('@deckster/brand/runtime', () => ({
  useBrand: () => ({
    brand: {
      imagery: {
        default: 'default',
        treatments: {
          default: { type: 'none' },
          plain: { type: 'none' },
        },
      },
    },
    surface: { name: 'gradient' },
  }),
}));

vi.mock('#foundation/backdrop.tsx', () => ({ Backdrop: () => null }));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
  view.step = 0;
  view.isStatic = false;
  container = document.body.appendChild(document.createElement('div'));
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
});

/**
 * Decodes frontmatter for the `image-reveal` layout.
 */
function decodeFrontmatter(fields: Record<string, unknown>) {
  const schema = Schema.Struct({
    ...SlideFrontmatter.fields,
    ...imageRevealLayoutContract.schema.fields,
  });
  return Schema.decodeUnknownSync(schema)({
    layout: imageRevealLayoutContract.name,
    title: 'Shade is infrastructure',
    ...fields,
  });
}

/**
 * Renders a slide element into the test root.
 */
function mount(slide: ReactElement): void {
  act(() => root.render(cloneElement(slide)));
}

describe('image-reveal layout rendering', () => {
  it('opens as a title cover on step 0, docks to a footer bar with image on step 1, and reverses cleanly', () => {
    const Component = imageRevealLayout.component;
    const frontmatter = decodeFrontmatter({
      eyebrow: 'Westgate, July',
      barSurface: 'inverse',
      barBackground: '#102030',
      barBorder: '#38bdf8',
    });
    const slide = (
      <Component
        slideId="reveal"
        frontmatter={frontmatter}
        slots={{
          body: <p>A ten-year canopy plan for the neighbourhoods that heat up first.</p>,
          media: <img src="street.jpg" alt="A tree-lined street" />,
        }}
      />
    );

    mount(slide);
    const frame = container.querySelector('.kit-frame');
    const panel = container.querySelector<HTMLElement>('.kit-image-reveal-panel');
    const stage = container.querySelector<HTMLElement>('.kit-image-reveal-stage');
    const title = container.querySelector('.kit-image-reveal-title');
    const subtitle = container.querySelector('.kit-image-reveal-subtitle');

    expect(frame?.getAttribute('data-revealed')).toBe('false');
    expect(frame?.getAttribute('data-dock')).toBe('bottom');
    expect(frame?.getAttribute('data-motion')).toBe('on');
    expect(panel?.getAttribute('data-surface')).toBeNull();
    expect(panel?.style.getPropertyValue('--kit-image-reveal-bar-bg')).toBe('');
    expect(stage?.getAttribute('aria-hidden')).toBe('true');
    expect(title?.className).toContain('kit-type-display');
    expect(subtitle?.getAttribute('data-text')).toBe('lead');

    view.step = 1;
    mount(slide);
    expect(frame?.getAttribute('data-revealed')).toBe('true');
    expect(panel?.getAttribute('data-surface')).toBe('inverse');
    expect(panel?.style.getPropertyValue('--kit-image-reveal-bar-bg')).toBe('#102030');
    expect(panel?.style.getPropertyValue('--kit-image-reveal-bar-border')).toBe('#38bdf8');
    expect(stage?.getAttribute('aria-hidden')).toBeNull();
    expect(title?.className).toContain('kit-type-title');
    expect(subtitle?.className).toContain('kit-type-small');
    expect(subtitle?.getAttribute('data-text')).toBeNull();

    view.step = 0;
    mount(slide);
    expect(frame?.getAttribute('data-revealed')).toBe('false');
    expect(panel?.getAttribute('data-surface')).toBeNull();
    expect(stage?.getAttribute('aria-hidden')).toBe('true');
    expect(title?.className).toContain('kit-type-display');
  });

  it('places the bar before the image when dock is top and turns motion off in static mode', () => {
    view.step = 1;
    view.isStatic = true;
    const Component = imageRevealLayout.component;
    const frontmatter = decodeFrontmatter({
      dock: 'top',
      align: 'center',
      fit: 'contain',
      barSurface: 'accent',
    });

    mount(
      <Component
        slideId="reveal-top"
        frontmatter={frontmatter}
        slots={{ media: <img src="diagram.png" alt="Network diagram" /> }}
      />,
    );

    const frame = container.querySelector('.kit-frame');
    const safeChildren = Array.from(container.querySelectorAll('.kit-safe > *')).map(
      (element) => element.className,
    );
    expect(frame?.getAttribute('data-dock')).toBe('top');
    expect(frame?.getAttribute('data-align')).toBe('center');
    expect(frame?.getAttribute('data-fit')).toBe('contain');
    expect(frame?.getAttribute('data-motion')).toBe('off');
    expect(safeChildren).toEqual(['kit-image-reveal-panel', 'kit-image-reveal-stage']);
    expect(container.querySelector('.kit-image-reveal-frame')?.getAttribute('data-treatment')).toBe(
      'plain',
    );
  });
});
