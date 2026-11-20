// @vitest-environment happy-dom
import { SlideFrontmatter } from '@deckster/engine/frontmatter';
import { Schema } from 'effect';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import { CommandDemo } from '#demo/command-demo.tsx';
import { GroundedAnswer } from '#demo/grounded-answer.tsx';
import { ReviewDiff } from '#demo/review-diff.tsx';
import { screenStoryLayoutContract } from '#layouts/screen-story-layout.contract.ts';
import { screenStoryLayout } from '#layouts/screen-story-layout.tsx';

/**
 * Engine phase and mode for the script and static handouts.
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
  useSlide: () => ({ isActive: view.isActive, state: 'current' }),
  useReadyHold: () => undefined,
}));

vi.mock('#foundation/backdrop.tsx', () => ({ Backdrop: () => null }));

/**
 * The mounting element of the current example.
 */
let container: HTMLDivElement;

/**
 * The example's root, kept while changing deck steps.
 */
let root: Root;

beforeEach(() => {
  Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
  view.step = 0;
  view.isActive = true;
  view.isStatic = false;
  container = document.body.appendChild(document.createElement('div'));
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
});

describe('the command palette demo', () => {
  it('uses focus to select and keeps an alternate result on the authored result step', () => {
    view.step = 1;
    renderCommand();
    expect(document.activeElement?.textContent).toContain('List drops');
    press('ArrowDown', document.activeElement ?? window);
    expect(document.activeElement?.textContent).toContain('List loops');
    expect(container.querySelector('[data-selected]')?.textContent).toContain('List loops');

    click('List loops');
    expect(container.textContent).toContain('Two active loops');
    view.step = 2;
    renderCommand();
    expect(container.textContent).toContain('Two active loops');

    view.step = 1;
    renderCommand();
    expect(container.querySelector('.kit-command-palette')).not.toBeNull();
    press('Escape', document.activeElement ?? window);
    expect(container.querySelector('.kit-command-palette')).toBeNull();
    expect(document.activeElement?.textContent).toContain('Commands');
  });
});

describe('the review demo', () => {
  it('carries the human decision into the final live phase and resets on replay and static export', () => {
    view.step = 1;
    renderReview();
    click('Keep original');
    expect(container.querySelector('[aria-live="polite"]')?.textContent).toContain('Deliver soon.');

    view.step = 2;
    renderReview();
    expect(container.querySelector('[aria-live="polite"]')?.textContent).toContain('Original kept');

    view.isStatic = true;
    renderReview();
    expect(container.querySelector('[aria-live="polite"]')?.textContent).toContain(
      'Deliver by 09:35.',
    );
    expect(container.querySelectorAll('button')).toHaveLength(0);

    view.step = 0;
    view.isStatic = false;
    renderReview();
    expect(container.querySelector('.kit-review-decision')).toBeNull();
    view.step = 1;
    renderReview();
    expect(container.querySelectorAll('button')).toHaveLength(2);
  });
});

describe('the source citation', () => {
  it('focuses and highlights the exact source when picked', () => {
    view.step = 1;
    render(
      <GroundedAnswer
        sourceTitle="Guide"
        reference="Guide §3"
        context="Check the parcel."
        evidence="The bike parcel limit is 25 kg."
        question="Will 28 kg fit?"
        answer="No."
      />,
    );
    const line = container.querySelector('.kit-grounded-passage');
    expect(line?.getAttribute('data-cited')).toBe('false');
    click('Guide §3');
    expect(line?.getAttribute('data-cited')).toBe('true');
    expect(document.activeElement).toBe(line);
  });
});

describe('the browser spotlight', () => {
  it('scales both image axes to the same normalized viewport coordinates as the target', () => {
    const source = 'data:image/svg+xml,<svg width="1600" height="900"/>';
    renderScreenStory({
      pattern: 'spotlight',
      screens: [{ src: source, alt: 'Queue overview', label: 'Window' }],
      spotlight: { x: 10, y: 20, width: 25, height: 50 },
    });
    const spotlight = container.querySelector<HTMLElement>('.kit-story-spotlight');
    expect(spotlight?.style.getPropertyValue('--kit-story-ratio')).toBe('2');
    expect(spotlight?.style.getPropertyValue('--kit-story-crop-size')).toBe('400%');
    expect(spotlight?.style.getPropertyValue('--kit-story-crop-image-height')).toBe('200%');
    expect(spotlight?.style.getPropertyValue('--kit-story-crop-x')).toBe('-40%');
    expect(spotlight?.style.getPropertyValue('--kit-story-crop-y')).toBe('-40%');
    expect([...container.querySelectorAll('img')].map((img) => img.getAttribute('src'))).toEqual([
      source,
      source,
    ]);
  });
});

describe('the registered version wipe', () => {
  it('keeps the live range separate from the static pair of completed versions', () => {
    renderWipe();
    expect(container.querySelector('input[type="range"]')?.getAttribute('aria-valuetext')).toBe(
      '0% revised viewport',
    );
    expect(container.querySelector('input[type="range"]')).not.toBeNull();

    view.step = 1;
    renderWipe();
    expect(container.querySelector('input[type="range"]')?.getAttribute('aria-valuetext')).toBe(
      '100% revised viewport',
    );

    view.isStatic = true;
    renderWipe();
    expect(container.querySelector('input[type="range"]')).toBeNull();
    expect(container.querySelectorAll('.kit-story-wipe-pair img')).toHaveLength(2);
  });
});

/**
 * Renders the palette with different outcomes to distinguish the user's choice from the script.
 */
function renderCommand(): void {
  render(
    <CommandDemo
      workspace="Dispatch"
      context="Ready"
      commands={[
        {
          name: 'List drops',
          result: 'One drop waiting',
          rows: [{ label: 'WQ-214', detail: 'Due 09:35' }],
        },
        {
          name: 'List loops',
          result: 'Two active loops',
          rows: [{ label: 'Loop 17', detail: 'Weir Street' }],
        },
      ]}
    />,
  );
}

/**
 * Renders a copy of the proposed edit for every phase.
 */
function renderReview(): void {
  render(
    <ReviewDiff
      document="Draft"
      before="Deliver "
      original="soon"
      suggestion="by 09:35"
      after="."
      rationale="Use the known deadline."
    />,
  );
}

/**
 * Mounts the wipe with two screenshots of the same viewport.
 */
function renderWipe(): void {
  renderScreenStory({
    pattern: 'wipe',
    reveal: true,
    screens: [
      { src: 'data:image/svg+xml,<svg/>', alt: 'Old screen', label: 'Before' },
      { src: 'data:image/svg+xml,<svg/>', alt: 'New screen', label: 'After' },
    ],
  });
}

/**
 * Mounts the registered layout with frontmatter decoded as the build would decode it.
 */
function renderScreenStory(fields: Record<string, unknown>): void {
  const Component = screenStoryLayout.component;
  const contract = screenStoryLayoutContract;
  const schema = Schema.Struct({ ...SlideFrontmatter.fields, ...contract.schema.fields });
  const frontmatter = Schema.decodeUnknownSync(schema)({
    layout: contract.name,
    title: 'One product moment',
    ...fields,
  });
  render(<Component slideId="screen-story" frontmatter={frontmatter} slots={{}} />);
}

/**
 * Flushes React after mounting or changing a slide phase.
 */
function render(content: ReactNode): void {
  act(() => root.render(content));
}

/**
 * Dispatches a key to the focused element with normal bubbling.
 */
function press(key: string, source: EventTarget): void {
  act(() => {
    source.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  });
}

/**
 * Executes an enabled demo control by its full visible text.
 */
function click(label: string): void {
  const button = [...container.querySelectorAll('button')].find((item) =>
    item.textContent?.startsWith(label),
  );
  expect(button, label).toBeDefined();
  act(() => button?.click());
}
