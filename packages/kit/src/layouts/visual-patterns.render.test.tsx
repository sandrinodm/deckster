// @vitest-environment happy-dom
import { SlideFrontmatter } from '@deckster/engine/frontmatter';
import { Schema } from 'effect';
import { act, cloneElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import { roadmapHillLayoutContract } from '#layouts/roadmap-hill-layout.contract.ts';
import { roadmapHillLayout } from '#layouts/roadmap-hill-layout.tsx';
import { roadmapTransitLayoutContract } from '#layouts/roadmap-transit-layout.contract.ts';
import { roadmapTransitLayout } from '#layouts/roadmap-transit-layout.tsx';
import { strategyCanvasLayoutContract } from '#layouts/strategy-canvas-layout.contract.ts';
import { strategyCanvasLayout } from '#layouts/strategy-canvas-layout.tsx';

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
  useSlide: () => ({ file: 'slides/example.mdx', isActive: true, state: 'current' }),
  useReadyHold: () => undefined,
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

describe('uncertainty hill', () => {
  it('updates authored placement and accessible phase together, and restores both on reverse', () => {
    const Component = roadmapHillLayout.component;
    const contract = roadmapHillLayoutContract;
    const schema = Schema.Struct({ ...SlideFrontmatter.fields, ...contract.schema.fields });
    const frontmatter = Schema.decodeUnknownSync(schema)({
      layout: contract.name,
      ...contract.example.frontmatter,
    });
    const slide = <Component slideId="hill" frontmatter={frontmatter} slots={{}} />;
    mount(slide);
    const scope = container.querySelector<HTMLElement>('.kit-hill-scope:nth-child(2)');
    expect(scope?.style.getPropertyValue('--kit-hill-progress')).toBe('0.43');
    expect(scope?.textContent).toContain('3 March: discovering the approach.');

    view.step = 1;
    mount(slide);
    expect(scope?.style.getPropertyValue('--kit-hill-progress')).toBe('0.61');
    expect(scope?.textContent).toContain('17 March: carrying out the approach. Moved forward');

    view.step = 0;
    mount(slide);
    expect(scope?.style.getPropertyValue('--kit-hill-progress')).toBe('0.43');
    expect(scope?.textContent).not.toContain('17 March');
  });
});

describe('transit roadmap', () => {
  it('connects the same two tracks at the authored period and preserves the static milestone', () => {
    const Component = roadmapTransitLayout.component;
    const contract = roadmapTransitLayoutContract;
    const schema = Schema.Struct({ ...SlideFrontmatter.fields, ...contract.schema.fields });
    const frontmatter = Schema.decodeUnknownSync(schema)({
      layout: contract.name,
      ...contract.example.frontmatter,
    });
    const slide = <Component slideId="transit" frontmatter={frontmatter} slots={{}} />;
    mount(slide);
    const connector = container.querySelector('path.kit-transit-transfer');
    expect(connector?.getAttribute('data-pattern-draw')).toBe('false');

    view.step = 1;
    mount(slide);
    expect(connector?.getAttribute('data-pattern-draw')).toBe('true');
    expect(connector?.getAttribute('pathLength')).toBe('1');
    expect(container.querySelector('.kit-transit-connection')?.textContent).toContain(
      'May, transfer from Software to Operations',
    );
    expect(container.querySelector('.kit-transit-milestone')?.getAttribute('aria-hidden')).toBe(
      'true',
    );

    view.step = 2;
    view.isStatic = true;
    mount(slide);
    expect(container.querySelector('.kit-transit-milestone')?.getAttribute('aria-hidden')).toBe(
      'false',
    );
  });
});

describe('strategy canvas', () => {
  it('makes the scores of only the currently shown profiles available in a table', () => {
    const Component = strategyCanvasLayout.component;
    const contract = strategyCanvasLayoutContract;
    const schema = Schema.Struct({ ...SlideFrontmatter.fields, ...contract.schema.fields });
    const frontmatter = Schema.decodeUnknownSync(schema)({
      layout: contract.name,
      ...contract.example.frontmatter,
    });
    const slide = <Component slideId="strategy" frontmatter={frontmatter} slots={{}} />;
    mount(slide);
    expect(container.querySelectorAll('tbody tr')).toHaveLength(2);

    view.step = 1;
    mount(slide);
    const offer = container.querySelector('tbody tr:last-child');
    expect(offer?.querySelector('th')?.textContent).toBe('Local lamp shop');
    expect([...(offer?.querySelectorAll('td') ?? [])].map((cell) => cell.textContent)).toEqual([
      '5',
      '5',
      '2',
      '1',
      '5',
      '2',
    ]);
  });
});

/**
 * Renders the requested slide with the current mocked engine step.
 */
function mount(slide: ReactElement): void {
  act(() => root.render(cloneElement(slide)));
}
