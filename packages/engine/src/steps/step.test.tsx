// @vitest-environment happy-dom
import type { ReactNode } from 'react';

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';

import { manifestOf, press, renderDeck, tsxSlide, type MountedDeck } from '#deck/deck.fixture.tsx';
import { Step, useStepAt, type StepProps } from '#steps/step.tsx';

/**
 * Prints what `useStepAt` returns for an optional `at`.
 */
function StateOf({ at }: { at?: number }): ReactNode {
  return <p data-testid={`state-${at ?? 'none'}`}>{useStepAt(at)}</p>;
}

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
 * The text of an element found by test id.
 */
function text(testId: string): string | null | undefined {
  return document.querySelector(`[data-testid="${testId}"]`)?.textContent;
}

describe('Step', () => {
  it('hides its children until its step, keeping their space, then marks them current and past', () => {
    const slide = tsxSlide('s', () => (
      <>
        <Step at={1}>one</Step>
        <Step at={2}>two</Step>
      </>
    ));
    mounted = renderDeck(manifestOf(slide));
    const states = () =>
      [...document.querySelectorAll('.deck-step')].map((step) =>
        step.getAttribute('data-step-state'),
      );
    expect(states()).toEqual(['hidden', 'hidden']);
    press('ArrowRight');
    expect(states()).toEqual(['current', 'hidden']);
    press('ArrowRight');
    expect(states()).toEqual(['past', 'current']);
  });

  it('compacts gaps, so steps at 1 and 3 take two presses', () => {
    const slide = tsxSlide('s', () => (
      <>
        <Step at={1}>one</Step>
        <Step at={3}>three</Step>
      </>
    ));
    mounted = renderDeck(manifestOf(slide));
    expect(window.__deck?.slides[0]?.stepCount).toBe(3);
    press('ArrowRight');
    press('ArrowRight');
    expect(document.querySelector('[data-step="3"]')?.getAttribute('data-step-state')).toBe(
      'current',
    );
  });

  it('refuses a <Step> without at, which would never hide anything, with the fix', () => {
    const props = { children: 'always' } as unknown as StepProps;
    const slide = tsxSlide('s', () => <Step {...props} />);
    mounted = renderDeck(manifestOf(slide));
    expect(document.querySelector('[role="alert"]')?.textContent).toContain(
      '<Step at={undefined}> is not a valid step. Use an integer of 1 or more',
    );
    expect(window.__deck?.slides[0]?.stepCount).toBe(1);
  });
});

describe('useStepAt', () => {
  it('counts content without an at as revealed and registers no step', () => {
    mounted = renderDeck(manifestOf(tsxSlide('s', () => <StateOf />)));
    expect(text('state-none')).toBe('past');
    expect(window.__deck?.slides[0]?.stepCount).toBe(1);
  });

  it('works without an at outside a slide, and names the fix with one', () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    act(() => root.render(<StateOf />));
    expect(container.textContent).toBe('past');
    expect(() => act(() => root.render(<StateOf at={1} />))).toThrow(
      'useStepAt() was used outside a slide',
    );
    act(() => root.unmount());
  });

  it('rejects an at that is not an integer of 1 or more', () => {
    const slide = tsxSlide('s', () => <StateOf at={0} />);
    mounted = renderDeck(manifestOf(slide));
    expect(document.querySelector('[role="alert"]')?.textContent).toContain(
      'Use an integer of 1 or more',
    );
  });
});
