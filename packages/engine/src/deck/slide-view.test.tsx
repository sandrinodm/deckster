// @vitest-environment happy-dom
import { act, lazy, type ComponentType, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';

import { useDeck } from '#deck/deck-context.ts';
import {
  manifestOf,
  mdxSlide,
  press,
  renderDeck,
  tsxSlide,
  wait,
  type MountedDeck,
} from '#deck/deck.fixture.tsx';
import { SlideView, type SlideViewProps } from '#deck/slide-view.tsx';
import { definePlugin } from '#plugins/deck-plugin.ts';
import { useSlide } from '#steps/slide-context.ts';
import { Step } from '#steps/step.tsx';

/**
 * How many thumbnails the sidebar test renders.
 */
const THUMBNAIL_COUNT = 20;

/**
 * Prints whether the slide it is on counts as the one on screen.
 */
function ActiveFlag(): ReactNode {
  return <p data-testid="active">{String(useSlide().isActive)}</p>;
}

/**
 * Four slides; the last one has three steps and is never visited.
 */
const DECK = manifestOf(
  mdxSlide('title', () => <h1>Title</h1>),
  mdxSlide('two', () => <ActiveFlag />),
  mdxSlide('three', () => null),
  mdxSlide('closing', () =>
    [1, 2].map((at) => (
      <Step key={at} at={at}>
        <p>{`point ${at}`}</p>
      </Step>
    )),
  ),
);

/**
 * Renders the deck with an overlay that shows the given views.
 *
 * @param views - The props of each `SlideView`.
 */
function renderWithViews(views: readonly SlideViewProps[]): MountedDeck {
  /**
   * An overlay of slide views, as a sidebar would render them.
   */
  const Overlay = () => (
    <aside>
      {views.map((props, index) => (
        <div key={index} data-testid="thumbnail" style={{ width: 320, height: 180 }}>
          <SlideView {...props} />
        </div>
      ))}
    </aside>
  );
  return renderDeck(DECK, { plugins: [definePlugin({ name: 'views', overlay: Overlay })] });
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

describe('SlideView', () => {
  it('renders a slide that was never visited without changing its step count', () => {
    mounted = renderWithViews([{ slide: 'closing', step: 'last' }]);
    expect(window.__deck?.slides[3]?.stepCount).toBeUndefined();
    const view = document.querySelector('[data-testid="thumbnail"] section');
    expect(view?.getAttribute('data-slide-view')).toBe('true');
    expect(view?.hasAttribute('data-slide-active')).toBe(false);
    expect(view?.querySelectorAll('[data-step-state="hidden"]')).toHaveLength(0);
  });

  it('is inert by default and active on request', () => {
    mounted = renderWithViews([{ slide: 1 }, { slide: 1, inactive: false }]);
    const flags = [...document.querySelectorAll('aside [data-testid="active"]')].map(
      (flag) => flag.textContent,
    );
    expect(flags).toEqual(['false', 'true']);
    const sections = document.querySelectorAll('aside section');
    expect(sections[0]?.hasAttribute('inert')).toBe(true);
    expect(sections[1]?.hasAttribute('inert')).toBe(false);
  });

  it('shows the step it is given, independent of the deck', () => {
    mounted = renderWithViews([{ slide: 'closing', step: 1 }]);
    const states = [...document.querySelectorAll('aside [data-step-state]')].map((step) =>
      step.getAttribute('data-step-state'),
    );
    expect(states).toEqual(['current', 'hidden']);
    expect(window.__deck?.position).toEqual({ slide: 0, step: 0 });
  });

  it('renders a sidebar of twenty views and leaves the stage to the deck tooling', () => {
    const views = Array.from({ length: THUMBNAIL_COUNT }, (_, index) => ({ slide: index % 4 }));
    mounted = renderWithViews(views);
    expect(document.querySelectorAll('aside section[data-slide-view]')).toHaveLength(
      THUMBNAIL_COUNT,
    );
    expect(document.querySelectorAll('section[data-slide-active="true"]')).toHaveLength(1);
    expect(window.__deck?.slides.map((slide) => slide.stepCount)).toEqual([
      1,
      1,
      undefined,
      undefined,
    ]);
  });

  it('reports the step count of its slide when it is not inert', () => {
    mounted = renderWithViews([{ slide: 'closing', inactive: false }]);
    expect(window.__deck?.slides[3]?.stepCount).toBe(3);
  });

  it('does not move the deck when clicked', () => {
    mounted = renderWithViews([{ slide: 2 }]);
    act(() => {
      document
        .querySelector('aside section')
        ?.dispatchEvent(new MouseEvent('click', { button: 0, bubbles: true, cancelable: true }));
    });
    expect(window.__deck?.position).toEqual({ slide: 0, step: 0 });
  });

  it('leaves ids the slide and its copies share resolving to the stage', () => {
    const form = manifestOf(
      mdxSlide('form', () => (
        <>
          <label htmlFor="name">Name</label>
          <input id="name" />
        </>
      )),
    );
    mounted = renderDeck(form, {
      plugins: [definePlugin({ name: 'thumbnail', overlay: () => <SlideView slide={0} /> })],
    });
    const field = document.getElementById('name');
    expect(document.querySelectorAll('#name')).toHaveLength(2);
    expect(field?.closest('[data-slide-active="true"]')).not.toBeNull();
  });

  it('names the valid slides when the slide does not exist', () => {
    expect(() => renderWithViews([{ slide: 'nope' }])).toThrow('No slide with id "nope"');
  });

  it('keeps every step of a slide reachable while a next pane switches slides', () => {
    mounted = renderDeck(STEPPED_DECK, {
      plugins: [definePlugin({ name: 'next-pane', overlay: NextPane })],
    });
    const positions = [];
    for (let count = 0; count < 4; count += 1) {
      press('ArrowRight');
      positions.push(window.__deck?.position);
    }

    expect(positions).toEqual([
      { slide: 0, step: 1 },
      { slide: 0, step: 2 },
      { slide: 0, step: 3 },
      { slide: 1, step: 0 },
    ]);
    expect(window.__deck?.slides[0]?.stepCount).toBe(4);
    press('ArrowLeft');
    expect(window.__deck?.position).toEqual({ slide: 0, step: 3 });
    press('ArrowLeft');
    expect(window.__deck?.position).toEqual({ slide: 0, step: 2 });
  });

  it('never shrinks the count when an inert view shows a slide with fewer steps', () => {
    mounted = renderDeck(POSTER_DECK, {
      plugins: [
        definePlugin({
          name: 'thumbnail',
          overlay: () => <SlideView slide={0} />,
        }),
      ],
    });
    expect(window.__deck?.slides[0]?.stepCount).toBe(3);
    press('ArrowRight');
    press('ArrowRight');
    expect(window.__deck?.position).toEqual({ slide: 0, step: 2 });
  });

  it('reports no step count while the content of a non-inert view is still loading', async () => {
    let resolve: (module: { default: ComponentType }) => void = () => undefined;
    const Late = lazy(
      () =>
        new Promise<{ default: ComponentType }>((done) => {
          resolve = done;
        }),
    );
    const deck = manifestOf(
      mdxSlide('title', () => <h1>Title</h1>),
      tsxSlide('late', () => <Late />),
    );
    mounted = renderDeck(deck, {
      plugins: [
        definePlugin({
          name: 'pane',
          overlay: () => (
            <aside>
              <SlideView slide="late" inactive={false} />
            </aside>
          ),
        }),
      ],
    });
    // Lets the hash change from beforeEach settle, so it does not move the deck mid-test.
    await wait(0);
    expect(window.__deck?.slides[1]?.stepCount).toBeUndefined();
    press('End');
    expect(window.__deck?.position).toEqual({ slide: 1, step: 0 });
    resolve({ default: ThreeSteps });
    await wait(0);
    expect(window.__deck?.slides[1]?.stepCount).toBe(3);
    expect(window.__deck?.position).toEqual({ slide: 1, step: 2 });
  });
});

/**
 * Two steps (three deck steps), as a slide that loads late registers them.
 */
function ThreeSteps(): ReactNode {
  return (
    <>
      <Step at={1}>one</Step>
      <Step at={2}>two</Step>
    </>
  );
}

/**
 * A slide with three steps (four deck steps) followed by a plain one.
 */
const STEPPED_DECK = manifestOf(
  mdxSlide('steps', () =>
    [1, 2, 3].map((at) => (
      <Step key={at} at={at}>
        <p>{`point ${at}`}</p>
      </Step>
    )),
  ),
  mdxSlide('after', () => <p>After</p>),
);

/**
 * What the presenter window's next pane shows: the next step of this slide while it has more, else
 * the next slide. The same view switches between the two.
 */
function NextPane(): ReactNode {
  const deck = useDeck();
  const { slide, step } = deck.position;
  const hasMoreSteps = deck.stepCount !== undefined && step < deck.stepCount - 1;
  const next = hasMoreSteps ? { slide, step: step + 1 } : { slide: slide + 1, step: 0 };
  if (next.slide >= deck.slides.length) {
    return null;
  }

  return (
    <aside>
      <SlideView slide={next.slide} step={next.step} />
    </aside>
  );
}

/**
 * Whether the slide renders inside a `SlideView`, as an app frame shows its poster there.
 */
function PosterOrApp(): ReactNode {
  const { isActive, state } = useSlide();
  const isThumbnail = state === undefined && !isActive;
  return isThumbnail ? <p>poster</p> : <ThreeSteps />;
}

/**
 * A slide whose stage copy has two steps but whose thumbnail shows a poster without steps.
 */
const POSTER_DECK = manifestOf(
  tsxSlide('app', PosterOrApp),
  mdxSlide('after', () => <p>After</p>),
);
