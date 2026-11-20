// @vitest-environment happy-dom
import { SlideFrontmatter } from '@deckster/engine/frontmatter';
import { Schema } from 'effect';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import { choosePathLayoutContract } from '#layouts/choose-path-layout.contract.ts';
import { choosePathLayout } from '#layouts/choose-path-layout.tsx';
import { productCutawayLayoutContract } from '#layouts/product-cutaway-layout.contract.ts';
import { productCutawayLayout } from '#layouts/product-cutaway-layout.tsx';
import { serviceBlueprintLayoutContract } from '#layouts/service-blueprint-layout.contract.ts';
import { serviceBlueprintLayout } from '#layouts/service-blueprint-layout.tsx';

/**
 * Engine state shared by the layout renders.
 */
const view = vi.hoisted(() => ({ step: 0, isStatic: false, isActive: true }));

vi.mock('@deckster/engine', async (original) => ({
  ...(await original<typeof import('@deckster/engine')>()),
  useStatic: () => view.isStatic,
  useStepAt: (at: number | undefined) => {
    if (at === undefined) {
      return 'past';
    }

    return view.step < at ? 'hidden' : 'current';
  },
  useSlide: () => ({ file: 'slides/example.mdx', isActive: view.isActive, state: 'current' }),
  useReadyHold: () => undefined,
}));

vi.mock('#foundation/backdrop.tsx', () => ({ Backdrop: () => null }));

/**
 * Where each test mounts its layout.
 */
let container: HTMLDivElement;
/**
 * The React root, so the same layout instance can be stepped or re-entered.
 */
let root: Root;

beforeEach(() => {
  Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
  view.step = 0;
  view.isStatic = false;
  view.isActive = true;
  container = document.body.appendChild(document.createElement('div'));
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
});

describe('the product cutaway', () => {
  it('separates a three-layer stack in two reversible steps and keeps the finished static view', () => {
    renderCutaway();
    expect(visibleLayers()).toHaveLength(1);

    view.step = 1;
    renderCutaway();
    expect(visibleLayers()).toHaveLength(2);
    expect(container.querySelector('.kit-cutaway-takeaway')?.getAttribute('aria-hidden')).toBe(
      'true',
    );

    view.step = 2;
    renderCutaway();
    expect(visibleLayers()).toHaveLength(3);
    expect(container.querySelector('.kit-cutaway-takeaway')?.getAttribute('aria-hidden')).toBe(
      'false',
    );

    view.step = 1;
    renderCutaway();
    expect(visibleLayers()).toHaveLength(2);

    view.step = 0;
    renderCutaway();
    expect(visibleLayers()).toHaveLength(1);

    view.step = 2;
    view.isStatic = true;
    renderCutaway();
    expect(visibleLayers()).toHaveLength(3);
  });
});

describe('the service blueprint', () => {
  it('reveals backstage work first, then owners and the highlighted handoff', () => {
    const Component = serviceBlueprintLayout.component;
    const contract = serviceBlueprintLayoutContract;
    const frontmatter = Schema.decodeUnknownSync(
      Schema.Struct({
        ...SlideFrontmatter.fields,
        ...contract.schema.fields,
      }),
    )({ layout: contract.name, ...contract.example.frontmatter });
    const blueprint = <Component slideId="blueprint" frontmatter={frontmatter} slots={{}} />;
    render(blueprint);
    expect(container.querySelectorAll('th[scope="row"]')).toHaveLength(5);
    expect(laneSteps('backstage', 'hidden')).toHaveLength(3);
    expect(laneSteps('owner', 'hidden')).toHaveLength(3);
    expect(container.querySelector('[data-handoff]')).toBeNull();

    view.step = 1;
    render(<Component slideId="blueprint" frontmatter={frontmatter} slots={{}} />);
    expect(laneSteps('backstage', 'current')).toHaveLength(3);
    expect(laneSteps('owner', 'hidden')).toHaveLength(3);
    expect(container.querySelector('[data-handoff]')).toBeNull();

    view.step = 2;
    render(<Component slideId="blueprint" frontmatter={frontmatter} slots={{}} />);
    expect(laneSteps('owner', 'current')).toHaveLength(3);
    expect(container.querySelector('[data-lane="owner"] [data-handoff]')?.textContent).toBe(
      'Repair lead',
    );
    expect(
      container.querySelector('.kit-blueprint-visibility [data-handoff]')?.textContent,
    ).toContain('Confirmed job');
    expect(
      contract.checks?.({ ...frontmatter, handoff: { stage: 3, label: 'Confirmed job' } }),
    ).toMatchObject([{ path: 'handoff.stage' }]);
  });
});

describe('the choose-your-path demo', () => {
  it('runs both authored branches and restores focus to their own choices', () => {
    renderDemo();
    const sprinkler = 'A broken sprinkler';
    const tree = 'A new street tree';
    click(sprinkler);
    expect(document.activeElement?.textContent).toBe('Match the postcode to a city-owned asset.');
    click('Check the location');
    click('Send an urgent crew');
    expect(document.activeElement?.textContent).toBe('The duty crew accepts an urgent repair job.');
    click('Back to choices');
    expect(document.activeElement?.getAttribute('aria-label')).toBe(sprinkler);

    click(tree);
    click('Check the planting list');
    click('Book a survey');
    expect(document.activeElement?.textContent).toBe(
      'The resident gets a date for a pavement survey.',
    );
    click('Back to choices');
    expect(document.activeElement?.getAttribute('aria-label')).toBe(tree);
  });

  it('exports both outcomes without controls and starts fresh after leaving the slide', () => {
    renderDemo();
    click('A broken sprinkler');
    expect(container.querySelector('.kit-choose-workflow')).not.toBeNull();

    view.isActive = false;
    renderDemo();
    expect(container.querySelectorAll('button')).toHaveLength(0);

    view.isActive = true;
    renderDemo();
    expect(container.querySelectorAll('button')).toHaveLength(2);
    expect(container.querySelector('.kit-choose-workflow')).toBeNull();

    view.isStatic = true;
    renderDemo();
    expect(container.querySelectorAll('button')).toHaveLength(0);
    expect(container.querySelectorAll('.kit-choose-outcome')).toHaveLength(2);
    expect(container.querySelectorAll('.kit-choose-actions li')).toHaveLength(4);
  });
});

/**
 * Renders the requested tree and commits React before the test reads it.
 */
function render(slide: ReactNode): void {
  act(() => root.render(slide));
}

/**
 * Returns the exposed layers in reading order.
 */
function visibleLayers(): NodeListOf<HTMLLIElement> {
  return container.querySelectorAll('.kit-cutaway-layer[aria-hidden="false"]');
}

/**
 * Reads all cells in a blueprint lane that have the given reveal state.
 */
function laneSteps(lane: string, state: string): NodeListOf<HTMLElement> {
  return container.querySelectorAll(`[data-lane="${lane}"] [data-step-state="${state}"]`);
}

/**
 * Renders the catalog cutaway with a third illustration to exercise both reveal steps.
 */
function renderCutaway(): void {
  const Component = productCutawayLayout.component;
  const contract = productCutawayLayoutContract;
  const decode = Schema.decodeUnknownSync(
    Schema.Struct({
      ...SlideFrontmatter.fields,
      ...contract.schema.fields,
    }),
  );
  const example = decode({ layout: contract.name, ...contract.example.frontmatter });
  const third = { ...example.layers[0], label: 'Battery pack' };
  const frontmatter = decode({ ...example, layers: [...example.layers, third] });
  render(<Component slideId="cutaway" frontmatter={frontmatter} slots={{}} />);
}

/**
 * Mounts the catalog demo under the current engine view.
 */
function renderDemo(): void {
  const Component = choosePathLayout.component;
  const contract = choosePathLayoutContract;
  const frontmatter = Schema.decodeUnknownSync(
    Schema.Struct({
      ...SlideFrontmatter.fields,
      ...contract.schema.fields,
    }),
  )({ layout: contract.name, ...contract.example.frontmatter });
  render(<Component slideId="branch-demo" frontmatter={frontmatter} slots={{}} />);
}

/**
 * Clicks the button named for its action or branch.
 */
function click(name: string): void {
  const buttons = Array.from(container.querySelectorAll('button'));
  const button = buttons.find(
    (item) => (item.getAttribute('aria-label') ?? item.textContent) === name,
  );
  expect(button, name).toBeDefined();
  act(() => button?.click());
}
