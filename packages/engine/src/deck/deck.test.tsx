// @vitest-environment happy-dom
import { act, lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';

import type { LayoutProps } from '#layouts/layout.ts';

import {
  manifestOf,
  mdxSlide,
  press,
  renderDeck,
  slot,
  tsxSlide,
  wait,
  type MountedDeck,
} from '#deck/deck.fixture.tsx';
import { defineLayout } from '#layouts/layout.ts';
import { definePlugin } from '#plugins/deck-plugin.ts';
import { useReadyHold } from '#readiness/use-ready-hold.ts';
import { Step, useStep, type StepProps } from '#steps/step.tsx';

/**
 * How long the late slide waits before it registers its steps, in milliseconds.
 */
const LATE_STEPS_MS = 200;

/**
 * How often the readiness tests let React commit while they wait, in milliseconds.
 */
const COMMIT_INTERVAL_MS = 10;

/**
 * A slide with one step per `at`.
 */
function stepsSlide(id: string, ats: readonly number[]) {
  return mdxSlide(id, () =>
    ats.map((at) => (
      <Step key={at} at={at}>
        <p>{`${id} ${at}`}</p>
      </Step>
    )),
  );
}

/**
 * The hello deck's shape: one step, four steps, two steps, one step.
 */
const HELLO_LIKE = manifestOf(
  stepsSlide('title', []),
  stepsSlide('steps', [1, 2, 3]),
  stepsSlide('live', [1]),
  stepsSlide('closing', []),
);

/**
 * Registers a step at 1 at once and steps at 2 to 4 only after a timer, holding the slide's
 * readiness until then.
 */
function LateSteps(): ReactNode {
  const [loaded, setLoaded] = useState(false);
  useReadyHold(!loaded);
  useEffect(() => {
    const timer = setTimeout(() => setLoaded(true), LATE_STEPS_MS);
    return () => clearTimeout(timer);
  }, []);
  return (
    <>
      <Step at={1}>first</Step>
      {loaded ? [2, 3, 4].map((at) => <Step key={at} at={at}>{`late ${at}`}</Step>) : null}
    </>
  );
}

/**
 * Three steps that arrive in a lazily loaded chunk, the way the kit loads diagrams and Magic Move.
 */
const LazyChunkSteps = lazy(
  () =>
    new Promise<{ default: () => ReactNode }>((resolve) => {
      setTimeout(
        () =>
          resolve({
            default: () =>
              [1, 2, 3].map((at) => (
                <Step key={at} at={at}>
                  {`chunk ${at}`}
                </Step>
              )),
          }),
        LATE_STEPS_MS,
      );
    }),
);

/**
 * A fallback that holds the slide's readiness while the chunk loads, as the kit's do.
 */
function HeldFallback(): null {
  useReadyHold(true);
  return null;
}

/**
 * A slide part whose steps load in a lazy chunk behind its own Suspense boundary.
 */
function LazyPart(): ReactNode {
  return (
    <Suspense fallback={<HeldFallback />}>
      <LazyChunkSteps />
    </Suspense>
  );
}

/**
 * The reveal state of the step at `at` on the slide on screen.
 *
 * @param at - The step's `at`.
 */
function stepState(at: number): string | null | undefined {
  return document
    .querySelector(`[data-slide-active="true"] [data-step="${at}"]`)
    ?.getAttribute('data-step-state');
}

/**
 * Waits for a `ready()` promise while letting React commit the updates it waits for, and returns
 * the step counts `window.__deck` reported the moment it resolved. `act()` defers commits to its
 * end, so the promise is awaited outside it.
 *
 * @param ready - The promise `window.__deck.ready()` returned.
 */
async function stepCountsWhenReady(ready: Promise<void>): Promise<(number | undefined)[]> {
  let counts: (number | undefined)[] | undefined;
  void ready.then(() => {
    counts = window.__deck?.slides.map((slide) => slide.stepCount);
  });
  while (counts === undefined) {
    await wait(COMMIT_INTERVAL_MS);
  }

  return counts;
}

/**
 * Each stage slide's id and the transition it names in `data-transition`.
 */
function stageTransitions(): (string | null)[][] {
  return [...document.querySelectorAll('section[data-slide-state]')].map((section) => [
    section.getAttribute('data-slide-id'),
    section.getAttribute('data-transition'),
  ]);
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

describe('Deck navigation', () => {
  it('moves through steps and slides with the keyboard and keeps the hash in step', () => {
    mounted = renderDeck(HELLO_LIKE);
    expect(window.location.hash).toBe('#/1/0');
    press('ArrowRight');
    press('ArrowRight');
    expect(window.location.hash).toBe('#/2/1');
    expect(window.__deck?.position).toEqual({ slide: 1, step: 1 });
  });

  it('holds a move until a slide it reaches reports its steps, so none are skipped', () => {
    mounted = renderDeck(HELLO_LIKE);
    act(() => {
      for (let press = 0; press < 6; press += 1) {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
      }
    });
    expect(window.location.hash).toBe('#/3/1');
  });

  it('leaves Space on a focused button to the button', () => {
    mounted = renderDeck(HELLO_LIKE);
    const button = document.createElement('button');
    document.body.append(button);
    const event = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
    act(() => {
      button.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(false);
    expect(window.location.hash).toBe('#/1/0');
    button.remove();

    press(' ');
    expect(window.location.hash).toBe('#/2/0');
  });

  it('replaces a hash that names no slide with the position on screen', async () => {
    mounted = renderDeck(HELLO_LIKE);
    press('ArrowRight');
    for (const hash of ['#/99', '#/2/x', '']) {
      window.history.replaceState(null, '', hash === '' ? '#' : hash);
      act(() => {
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      });
      await wait(0);
      expect(window.location.hash, hash).toBe('#/2/0');
    }
  });

  it('marks each stage slide past, current or future, and the direction of the last move', () => {
    mounted = renderDeck(HELLO_LIKE);
    press('ArrowRight');
    const states = [...document.querySelectorAll('section[data-slide-active]')].map((section) => [
      section.getAttribute('data-slide-id'),
      section.getAttribute('data-slide-state'),
      section.getAttribute('data-direction'),
    ]);
    expect(states).toEqual([
      ['title', 'past', 'forward'],
      ['steps', 'current', 'forward'],
      ['live', 'future', 'forward'],
    ]);
    press('ArrowLeft');
    expect(document.querySelector('[data-slide-id="title"]')?.getAttribute('data-direction')).toBe(
      'backward',
    );
  });

  it('gives each stage slide the transition of the move that brings it on screen', () => {
    const pushed = mdxSlide('pushed', () => <Step at={1}>pushed 1</Step>, {
      frontmatter: { layout: 'default', transition: 'push' },
    });
    mounted = renderDeck(
      manifestOf(stepsSlide('a', []), pushed, stepsSlide('c', []), stepsSlide('d', [])),
    );
    expect(stageTransitions()).toEqual([
      ['a', null],
      ['pushed', 'push'],
    ]);
    press('ArrowRight');
    expect(stageTransitions()).toEqual([
      ['a', 'push'],
      ['pushed', 'push'],
      ['c', null],
    ]);
    press('ArrowRight');
    expect(stageTransitions(), 'a step keeps the move between slides').toEqual([
      ['a', 'push'],
      ['pushed', 'push'],
      ['c', null],
    ]);
    press('ArrowRight');
    press('ArrowLeft');
    expect(stageTransitions(), 'back from c plays the pair pushed and c').toEqual([
      ['a', 'push'],
      ['pushed', null],
      ['c', null],
    ]);
    press('End');
    expect(stageTransitions(), 'a jump cuts').toEqual([
      ['c', null],
      ['d', 'none'],
    ]);
  });

  it('names no transition in static mode', () => {
    const pushed = mdxSlide('pushed', () => null, {
      frontmatter: { layout: 'default', transition: 'push' },
    });
    mounted = renderDeck(manifestOf(stepsSlide('a', []), pushed), { isStatic: true });
    expect(stageTransitions()).toEqual([
      ['a', null],
      ['pushed', null],
    ]);
  });

  it('lists each slide budget in seconds', () => {
    const timed = mdxSlide('timed', () => null, {
      frontmatter: { layout: 'default', budget: '1m30s' },
    });
    mounted = renderDeck(manifestOf(timed, stepsSlide('untimed', [])));
    expect(window.__deck?.slides.map((slide) => slide.budget)).toEqual([90, undefined]);
  });
});

/**
 * Clicks an element inside `act()` with the given mouse button, the way a browser sends it: a
 * `click` for the left button, a `contextmenu` for the right.
 *
 * @returns The event, to check whether the deck prevented its default.
 */
function clickOn(target: Element, button: 0 | 2, init: MouseEventInit = {}): MouseEvent {
  const type = button === 0 ? 'click' : 'contextmenu';
  const event = new MouseEvent(type, { button, bubbles: true, cancelable: true, ...init });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
}

/**
 * The section of the slide on screen.
 */
function activeSection(): Element {
  return document.querySelector('[data-slide-active="true"]')!;
}

describe('Deck mouse navigation', () => {
  it('moves forward on a left click and back on a right click, suppressing only that menu', () => {
    mounted = renderDeck(HELLO_LIKE);
    clickOn(activeSection(), 0);
    expect(window.location.hash).toBe('#/2/0');
    const back = clickOn(activeSection(), 2);
    expect(back.defaultPrevented).toBe(true);
    expect(window.location.hash).toBe('#/1/0');

    const inspect = clickOn(activeSection(), 2, { ctrlKey: true });
    expect(inspect.defaultPrevented).toBe(false);
  });

  it('leaves clicks on interactive content alone, menu included', () => {
    const withButton = mdxSlide('button', () => <button type="button">Press</button>);
    mounted = renderDeck(manifestOf(withButton, stepsSlide('next', [])));
    const menu = clickOn(document.querySelector('button')!, 2);
    clickOn(document.querySelector('button')!, 0);
    expect(menu.defaultPrevented).toBe(false);
    expect(window.location.hash).toBe('#/1/0');
  });

  it('lets a plugin claim a click, and turns off with mouseNavigation: false', () => {
    const claimed: string[] = [];
    const plugin = definePlugin({
      name: 'claim',
      onPointer: (event) => {
        claimed.push(event.type);
        return true;
      },
    });
    mounted = renderDeck(HELLO_LIKE, { plugins: [plugin] });
    clickOn(activeSection(), 0);
    expect(claimed).toEqual(['click']);
    expect(window.location.hash).toBe('#/1/0');
    mounted.unmount();

    mounted = renderDeck({ ...HELLO_LIKE, mouseNavigation: false });
    clickOn(activeSection(), 0);
    expect(window.location.hash).toBe('#/1/0');
  });
});

describe('Deck double-click', () => {
  beforeEach(() => {
    window.getSelection()?.removeAllRanges();
  });

  it('undoes the advance of the first click when the second selects a word on the slide', () => {
    window.history.replaceState(null, '', '#/2/0');
    mounted = renderDeck(HELLO_LIKE);
    const word = activeSection().querySelector('p')!;
    clickOn(word, 0, { detail: 1 });
    expect(window.location.hash).toBe('#/2/1');
    selectText(word);
    clickOn(word, 0, { detail: 2 });
    expect(window.location.hash).toBe('#/2/0');
    expect(window.getSelection()?.toString()).toBe('steps 1');
  });

  it('goes back and drops the selection when the first click had left the slide', () => {
    window.history.replaceState(null, '', '#/1/0');
    mounted = renderDeck(HELLO_LIKE);
    clickOn(activeSection(), 0, { detail: 1 });
    expect(window.location.hash).toBe('#/2/0');
    selectText(activeSection().querySelector('p')!);
    clickOn(activeSection(), 0, { detail: 2 });
    expect(window.location.hash).toBe('#/1/0');
    expect(window.getSelection()?.toString()).toBe('');
  });

  it('advances twice on a double-click that selects nothing', () => {
    window.history.replaceState(null, '', '#/2/0');
    mounted = renderDeck(HELLO_LIKE);
    clickOn(activeSection(), 0, { detail: 1 });
    clickOn(activeSection(), 0, { detail: 2 });
    expect(window.location.hash).toBe('#/2/2');
  });
});

/**
 * Selects an element's text, as a double-click on a word does.
 *
 * @param element - The element whose text to select.
 */
function selectText(element: Element): void {
  const range = document.createRange();
  range.selectNodeContents(element);
  const selection = window.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
}

describe('Deck readiness', () => {
  it('waits in ready() for steps a slide registers late', async () => {
    mounted = renderDeck(manifestOf(mdxSlide('late', () => <LateSteps />)));
    expect(window.__deck?.slides[0]?.stepCount).toBe(2);
    expect(await stepCountsWhenReady(window.__deck!.ready())).toEqual([5]);
  });

  it('waits for every slide in static mode', async () => {
    const manifest = manifestOf(
      stepsSlide('first', []),
      mdxSlide('late', () => <LateSteps />),
    );
    mounted = renderDeck(manifest, { isStatic: true });
    expect(await stepCountsWhenReady(window.__deck!.ready())).toEqual([1, 5]);
  });
});

describe('Deck steps that register late', () => {
  it('lands a goto on a step a lazy chunk registers later, before ready() resolves', async () => {
    mounted = renderDeck(manifestOf(mdxSlide('lazy', () => <LazyPart />)), { isStatic: true });
    act(() => window.__deck!.goto(0, 3));
    expect(window.__deck?.position).toEqual({ slide: 0, step: 3 });
    expect(await stepCountsWhenReady(window.__deck!.ready())).toEqual([4]);
    expect(window.__deck?.position).toEqual({ slide: 0, step: 3 });
    expect(stepState(3)).toBe('current');
  });

  it('lands a goto made before a held slide registers its steps, reporting it meanwhile', async () => {
    mounted = renderDeck(manifestOf(mdxSlide('late', () => <LateSteps />)));
    act(() => window.__deck!.goto(0, 3));
    expect(window.__deck?.position).toEqual({ slide: 0, step: 3 });
    expect(window.location.hash).toBe('#/1/3');
    await stepCountsWhenReady(window.__deck!.ready());
    expect(window.__deck?.position).toEqual({ slide: 0, step: 3 });
    expect(stepState(3)).toBe('current');
  });

  it('keeps the step a hash names on first load instead of rewriting it to step 0', async () => {
    window.history.replaceState(null, '', '#/1/4');
    mounted = renderDeck(manifestOf(mdxSlide('late', () => <LateSteps />)));
    expect(window.location.hash).toBe('#/1/4');
    expect(window.__deck?.position).toEqual({ slide: 0, step: 4 });
    await stepCountsWhenReady(window.__deck!.ready());
    expect(window.__deck?.position).toEqual({ slide: 0, step: 4 });
    expect(stepState(4)).toBe('current');
  });

  it('clamps a pending step to the count the slide settles on', async () => {
    window.history.replaceState(null, '', '#/1/9');
    mounted = renderDeck(manifestOf(mdxSlide('late', () => <LateSteps />)));
    await stepCountsWhenReady(window.__deck!.ready());
    expect(window.__deck?.position).toEqual({ slide: 0, step: 4 });
    expect(window.location.hash).toBe('#/1/4');
  });

  it('gives up a pending step for a move the presenter makes while the slide loads', async () => {
    mounted = renderDeck(
      manifestOf(
        mdxSlide('late', () => <LateSteps />),
        stepsSlide('next', []),
      ),
    );
    act(() => window.__deck!.goto(0, 4));
    press('ArrowLeft');
    expect(window.__deck?.position).toEqual({ slide: 0, step: 0 });
    await wait(LATE_STEPS_MS + COMMIT_INTERVAL_MS * 5);
    expect(window.__deck?.slides[0]?.stepCount).toBe(5);
    expect(window.__deck?.position).toEqual({ slide: 0, step: 0 });

    act(() => window.__deck!.goto(1, 0));
    expect(window.__deck?.position).toEqual({ slide: 1, step: 0 });
  });
});

/**
 * A two-column test layout's contract type.
 */
type ColumnsContract = {
  name: 'columns';
  description: string;
  schema: import('effect').Schema.Struct<{}>;
  slots: {
    left: { description: string; accepts: readonly ['text'] };
    right: { description: string; accepts: readonly ['text'] };
  };
  budget: {};
  example: { frontmatter: {}; body: string };
};

/**
 * A layout that puts `body` above two columns.
 */
function Columns({ slots }: LayoutProps<ColumnsContract>): ReactNode {
  return (
    <div data-layout="columns">
      <header>{slots.body}</header>
      <div data-column="left">{slots.left}</div>
      <div data-column="right">{slots.right ?? 'empty'}</div>
    </div>
  );
}

/**
 * A plugin that registers the columns layout.
 */
const COLUMNS_PLUGIN = definePlugin({
  name: 'columns',
  layouts: [defineLayout<ColumnsContract>({ name: 'columns', component: Columns })],
});

describe('Deck layouts', () => {
  it('sorts an MDX slide into its layout slots, with the rest in body', () => {
    const slide = mdxSlide(
      'mdx',
      (components) => [
        <h2 key="h">Heading</h2>,
        slot(components, 'left', <p>Left text</p>),
        slot(components, 'right', <p>Right text</p>),
      ],
      { frontmatter: { layout: 'columns' }, slots: ['left', 'right'] },
    );
    mounted = renderDeck(manifestOf(slide), { plugins: [COLUMNS_PLUGIN] });
    const layout = document.querySelector('[data-layout="columns"]');
    expect(layout?.querySelector('header [data-slot="body"] h2')?.textContent).toBe('Heading');
    expect(layout?.querySelector('[data-column="left"] [data-slot="left"]')?.textContent).toBe(
      'Left text',
    );
    expect(layout?.querySelector('[data-column="right"]')?.textContent).toBe('Right text');
  });

  it('fills a TSX slide slots from its exports, the default export in body', () => {
    const slide = tsxSlide(
      'tsx',
      () => <h2>From default</h2>,
      { frontmatter: { layout: 'columns' }, slots: ['left'] },
      { Left: () => <p>From Left</p> },
    );
    mounted = renderDeck(manifestOf(slide), { plugins: [COLUMNS_PLUGIN] });
    expect(document.querySelector('header')?.textContent).toBe('From default');
    expect(document.querySelector('[data-column="left"]')?.textContent).toBe('From Left');
    expect(document.querySelector('[data-column="right"]')?.textContent).toBe('empty');
  });

  it('shows the fix in place of a slide whose layout is not registered', () => {
    const slide = mdxSlide('lost', () => null, { frontmatter: { layout: 'splitt' } });
    mounted = renderDeck(manifestOf(slide));
    expect(document.querySelector('[role="alert"]')?.textContent).toContain(
      'Unknown layout "splitt". Set layout to one of: default.',
    );
  });

  it('renders a plugin Step from the Step a TSX slide imports', () => {
    /**
     * A plugin step that marks its output.
     */
    const FancyStep = ({ at, children }: StepProps) => <em data-fancy={at}>{children}</em>;
    const slide = tsxSlide('fancy', () => <Step at={1}>shown fancy</Step>);
    mounted = renderDeck(manifestOf(slide), {
      plugins: [definePlugin({ name: 'fancy', components: { Step: FancyStep } })],
    });
    expect(document.querySelector('[data-fancy="1"]')?.textContent).toBe('shown fancy');
  });

  it('gives slide code the at value of the latest revealed step', () => {
    /**
     * Prints the step slide code sees.
     */
    const Reader = () => {
      const step = useStep();
      return (
        <>
          <Step at={1}>one</Step>
          <Step at={3}>three</Step>
          <p data-testid="value">{step}</p>
        </>
      );
    };
    mounted = renderDeck(manifestOf(tsxSlide('gaps', Reader)));
    press('ArrowRight');
    press('ArrowRight');
    expect(window.__deck?.position).toEqual({ slide: 0, step: 2 });
    expect(window.__deck?.slides[0]?.stepCount).toBe(3);
    expect(document.querySelector('[data-testid="value"]')?.textContent).toBe('3');
  });
});
