// @vitest-environment happy-dom
import {
  act,
  Children,
  cloneElement,
  Fragment,
  isValidElement,
  lazy,
  memo,
  type ReactNode,
} from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import type { BleedSide, LayoutDefinition, LayoutProps } from '#layouts/layout.ts';

import {
  manifestOf,
  mdxSlide,
  renderDeck,
  tsxSlide,
  wait,
  type MountedDeck,
} from '#deck/deck.fixture.tsx';
import { SlotGuard } from '#deck/slot-guard.tsx';
import { defineLayout } from '#layouts/layout.ts';
import { lazyLayout, type LayoutModule } from '#layouts/lazy-layout.tsx';
import { useLayouts } from '#layouts/use-layouts.ts';
import { definePlugin } from '#plugins/deck-plugin.ts';

/**
 * How often the readiness test lets React commit while it waits, in milliseconds.
 */
const COMMIT_INTERVAL_MS = 10;

/**
 * A promise that a test settles by hand.
 */
type Deferred<Value> = {
  /**
   * What the code under test awaits.
   */
  promise: Promise<Value>;

  /**
   * Settles it with a value.
   */
  resolve: (value: Value) => void;

  /**
   * Settles it with a failure.
   */
  reject: (reason: unknown) => void;
};

/**
 * Creates a promise a test settles by hand.
 */
function deferred<Value>(): Deferred<Value> {
  let resolve: Deferred<Value>['resolve'] = () => {};
  let reject: Deferred<Value>['reject'] = () => {};
  const promise = new Promise<Value>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

/**
 * The layout a `kpi-wall` module defines: the slide's body in a div that names the layout.
 *
 * @param bleed - The edges its media runs to.
 */
function wallModule(bleed: readonly BleedSide[] = []): LayoutModule {
  /**
   * Draws the body in a marked div.
   */
  const Wall = ({ slots }: LayoutProps): ReactNode => (
    <div data-testid="wall" data-layout="kpi-wall">
      {slots.body}
    </div>
  );
  return { default: defineLayout({ name: 'kpi-wall', component: Wall, bleed: () => bleed }) };
}

/**
 * A deck with a slide on the lazy `kpi-wall` layout between two default ones.
 */
const DECK = manifestOf(
  mdxSlide('before', () => <p>Before</p>),
  mdxSlide('wall', () => <p>On the wall</p>, { frontmatter: { layout: 'kpi-wall' } }),
  mdxSlide('after', () => <p>After</p>),
);

/**
 * Renders the deck with a plugin that registers the layout, in static mode so every slide mounts.
 *
 * @param layout - The lazy layout.
 * @param extra - More plugins.
 */
function renderWith(layout: LayoutDefinition, ...extra: Parameters<typeof renderDeck>[1][]): void {
  mounted = renderDeck(DECK, {
    isStatic: true,
    plugins: [
      definePlugin({ name: 'local-layouts', layouts: [layout] }),
      ...extra.flatMap((options) => options?.plugins ?? []),
    ],
  });
}

/**
 * The problems the deck shows, with the slide each is on.
 */
function problems(): { slide: string | null; problem: string | null; text: string }[] {
  return [...document.querySelectorAll('[data-slide-error]')].map((element) => ({
    slide: element.closest('section')?.getAttribute('data-slide-id') ?? null,
    problem: element.getAttribute('data-deck-problem'),
    text: element.textContent ?? '',
  }));
}

/**
 * The text of the slide with this id.
 *
 * @param id - The slide id.
 */
function slideText(id: string): string | undefined {
  return document.querySelector(`section[data-slide-id="${id}"]`)?.textContent ?? undefined;
}

/**
 * The deck under test, unmounted after each test.
 */
let mounted: MountedDeck | undefined;

beforeEach(() => {
  window.history.replaceState(null, '', '#');
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
  vi.restoreAllMocks();
});

describe('lazyLayout', () => {
  it('names the layout and loads nothing until a slide uses it or something reads its bleed', () => {
    const load = vi.fn(async () => wallModule());
    const layout = lazyLayout('kpi-wall', load);
    expect(layout.name).toBe('kpi-wall');
    expect(load).not.toHaveBeenCalled();
  });

  it('renders the loaded layout on the slides that use it, and calls the loader once', async () => {
    const load = vi.fn(async () => wallModule());
    renderWith(lazyLayout('kpi-wall', load));
    await wait(0);
    expect(document.querySelector('[data-testid="wall"] p')?.textContent).toBe('On the wall');
    expect(slideText('before')).toBe('Before');
    expect(slideText('after')).toBe('After');
    expect(problems()).toEqual([]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('renders a TSX slide with its slots in the loaded layout', async () => {
    const slide = tsxSlide('tsx-wall', () => <p>From default</p>, {
      frontmatter: { layout: 'kpi-wall' },
    });
    mounted = renderDeck(manifestOf(slide), {
      isStatic: true,
      plugins: [
        definePlugin({
          name: 'local-layouts',
          layouts: [lazyLayout('kpi-wall', async () => wallModule())],
        }),
      ],
    });
    await wait(0);
    expect(document.querySelector('[data-testid="wall"] p')?.textContent).toBe('From default');
  });

  it('shows a problem on the slide when the default export carries another name', async () => {
    const other = defineLayout({ name: 'other-wall', component: () => null });
    renderWith(lazyLayout('kpi-wall', async () => ({ default: other })));
    await wait(0);
    const [problem, ...rest] = problems();
    expect(rest).toEqual([]);
    expect(problem?.slide).toBe('wall');
    expect(problem?.problem).toBe('layout-load-failed');
    expect(problem?.text).toContain('Layout `kpi-wall` failed to load:');
    expect(problem?.text).toContain('`kpi-wall`');
    expect(problem?.text).toContain('`other-wall`');
    expect(slideText('before')).toBe('Before');
    expect(slideText('after')).toBe('After');
  });

  it('shows a problem when the default export is not a layout', async () => {
    renderWith(lazyLayout('kpi-wall', async () => ({ default: 'not a layout' })));
    await wait(0);
    expect(problems()[0]?.text).toContain('Layout `kpi-wall` failed to load: its default export');
  });

  it('shows the import error on the slide and keeps the other slides rendering', async () => {
    renderWith(lazyLayout('kpi-wall', () => Promise.reject(new Error('Unexpected token <'))));
    await wait(0);
    const [problem, ...rest] = problems();
    expect(rest).toEqual([]);
    expect(problem).toMatchObject({ slide: 'wall', problem: 'layout-load-failed' });
    expect(problem?.text).toContain('Layout `kpi-wall` failed to load: Unexpected token <');
    expect(
      document.querySelector('[data-slide-error]')?.getAttribute('data-deck-problem-layout'),
    ).toBe('kpi-wall');
    expect(document.querySelector('[data-slide-error] .deck-problem-file')?.textContent).toBe(
      'slides/wall.mdx',
    );
    expect(slideText('before')).toBe('Before');
    expect(slideText('after')).toBe('After');
  });

  it('shows a loader that throws synchronously as a problem too', async () => {
    renderWith(
      lazyLayout('kpi-wall', () => {
        throw new Error('no such file');
      }),
    );
    await wait(0);
    expect(problems()[0]?.text).toContain('Layout `kpi-wall` failed to load: no such file');
  });

  it('shows a component that throws while rendering as that layout problem', async () => {
    const Broken = (): ReactNode => {
      throw new Error('kpi is not defined');
    };
    const broken = defineLayout({ name: 'kpi-wall', component: Broken });
    renderWith(lazyLayout('kpi-wall', async () => ({ default: broken })));
    await wait(0);
    const [problem, ...rest] = problems();
    expect(rest).toEqual([]);
    expect(problem).toMatchObject({ slide: 'wall', problem: 'layout-load-failed' });
    expect(problem?.text).toContain('Layout `kpi-wall` failed to render: kpi is not defined');
    expect(slideText('after')).toBe('After');
  });

  it('leaves an error in the slide own content to the slide, not the layout', async () => {
    const Boom = (): ReactNode => {
      throw new Error('slide component broke');
    };
    const deck = manifestOf(
      mdxSlide('wall', () => <Boom />, { frontmatter: { layout: 'kpi-wall' } }),
      mdxSlide('after', () => <p>After</p>),
    );
    mounted = renderDeck(deck, {
      isStatic: true,
      plugins: [
        definePlugin({
          name: 'local-layouts',
          layouts: [lazyLayout('kpi-wall', async () => wallModule())],
        }),
      ],
    });
    await wait(0);
    const [problem, ...rest] = problems();
    expect(rest).toEqual([]);
    expect(problem?.problem).toBeNull();
    expect(problem?.text).toContain('slide component broke');
    expect(problem?.text).not.toContain('Layout `kpi-wall`');
    expect(slideText('after')).toBe('After');
  });

  it('holds ready() until the layout has loaded', async () => {
    const module = deferred<LayoutModule>();
    mounted = renderDeck(DECK, {
      plugins: [
        definePlugin({
          name: 'local-layouts',
          layouts: [lazyLayout('kpi-wall', () => module.promise)],
        }),
      ],
    });
    act(() => window.__deck!.goto(1, 0));
    let ready = false;
    void window.__deck!.ready().then(() => {
      ready = true;
    });
    await wait(COMMIT_INTERVAL_MS * 5);
    expect(ready).toBe(false);
    expect(document.querySelector('[data-testid="wall"]')).toBeNull();

    await act(async () => {
      module.resolve(wallModule());
      await module.promise;
    });
    await wait(COMMIT_INTERVAL_MS * 5);
    expect(ready).toBe(true);
    expect(document.querySelector('[data-testid="wall"] p')?.textContent).toBe('On the wall');
  });

  it('is ready once a failed layout shows its problem', async () => {
    mounted = renderDeck(DECK, {
      plugins: [
        definePlugin({
          name: 'local-layouts',
          layouts: [lazyLayout('kpi-wall', () => Promise.reject(new Error('gone')))],
        }),
      ],
    });
    act(() => window.__deck!.goto(1, 0));
    let ready = false;
    void window.__deck!.ready().then(() => {
      ready = true;
    });
    while (!ready) {
      await wait(COMMIT_INTERVAL_MS);
    }

    expect(problems()[0]?.text).toContain('gone');
  });
});

describe('lazyLayout bleed', () => {
  it('names no edges before the layout loads and starts loading it', async () => {
    const module = deferred<LayoutModule>();
    const load = vi.fn(() => module.promise);
    const layout = lazyLayout('kpi-wall', load);
    expect(layout.bleed?.({ frontmatter: { layout: 'kpi-wall' }, slots: [] })).toEqual([]);
    expect(load).toHaveBeenCalledTimes(1);
    module.resolve(wallModule(['left']));
    await module.promise;
    await wait(0);
    expect(layout.bleed?.({ frontmatter: { layout: 'kpi-wall' }, slots: [] })).toEqual(['left']);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('names no edges for a layout that failed to load', async () => {
    const layout = lazyLayout('kpi-wall', () => Promise.reject(new Error('gone')));
    layout.bleed?.({ frontmatter: { layout: 'kpi-wall' }, slots: [] });
    await wait(0);
    expect(layout.bleed?.({ frontmatter: { layout: 'kpi-wall' }, slots: [] })).toEqual([]);
  });

  it('renders chrome again with the loaded layout bleed when the load finishes', async () => {
    const module = deferred<LayoutModule>();
    /**
     * Chrome that reads the bleed of the `kpi-wall` layout, as the kit's does for the slide on
     * screen. It is memoized and reads nothing from the deck, so only `useLayouts()` can render it
     * again.
     */
    const BleedChrome = memo((): ReactNode => {
      const bleed =
        useLayouts()
          .get('kpi-wall')
          ?.bleed?.({ frontmatter: { layout: 'kpi-wall' }, slots: [] }) ?? [];
      return <i data-testid="chrome-bleed">{bleed.join(',')}</i>;
    });
    mounted = renderDeck(DECK, {
      plugins: [
        definePlugin({
          name: 'local-layouts',
          layouts: [lazyLayout('kpi-wall', () => module.promise)],
          chrome: BleedChrome,
        }),
      ],
    });
    act(() => window.__deck!.goto(1, 0));
    expect(document.querySelector('[data-testid="chrome-bleed"]')?.textContent).toBe('');
    await act(async () => {
      module.resolve(wallModule(['left']));
      await module.promise;
    });
    await wait(COMMIT_INTERVAL_MS * 3);
    expect(document.querySelector('[data-testid="chrome-bleed"]')?.textContent).toBe('left');
  });

  it('keeps the deck up when bleed throws and shows the error on the slide', async () => {
    const Wall = ({ slots }: LayoutProps): ReactNode => <div data-testid="wall">{slots.body}</div>;
    const throwing = defineLayout({
      name: 'kpi-wall',
      component: Wall,
      bleed: () => {
        throw new Error('no media');
      },
    });
    /**
     * Chrome that reads the bleed of the `kpi-wall` layout, as the kit's does.
     */
    const BleedChrome = (): ReactNode => {
      const bleed =
        useLayouts()
          .get('kpi-wall')
          ?.bleed?.({ frontmatter: { layout: 'kpi-wall' }, slots: [] }) ?? [];
      return <i data-testid="chrome-bleed">{bleed.join(',')}</i>;
    };
    mounted = renderDeck(DECK, {
      plugins: [
        definePlugin({
          name: 'local-layouts',
          layouts: [lazyLayout('kpi-wall', async () => ({ default: throwing }))],
          chrome: BleedChrome,
        }),
      ],
    });
    await act(async () => {
      window.__deck!.goto(1, 0);
      await wait(0);
    });
    await wait(COMMIT_INTERVAL_MS * 3);
    expect(document.querySelector('[data-testid="chrome-bleed"]')?.textContent).toBe('');
    const [problem, ...rest] = problems();
    expect(rest).toEqual([]);
    expect(problem).toMatchObject({ slide: 'wall', problem: 'layout-load-failed' });
    expect(problem?.text).toContain('Layout `kpi-wall` failed to render: no media');
  });
});

describe('slot content under a lazy layout', () => {
  /**
   * Throws as a broken slide component does.
   */
  const Boom = (): ReactNode => {
    throw new Error('slide component broke');
  };

  /**
   * Renders a deck whose only slide puts broken content in the body of a lazy layout.
   *
   * @param component - The layout's component.
   * @param render - The slide's broken content.
   */
  async function renderBroken(
    component: (props: LayoutProps) => ReactNode,
    render: () => ReactNode = () => <Boom />,
  ): Promise<void> {
    const layout = defineLayout({ name: 'kpi-wall', component });
    mounted = renderDeck(
      manifestOf(mdxSlide('wall', render, { frontmatter: { layout: 'kpi-wall' } })),
      {
        isStatic: true,
        plugins: [
          definePlugin({
            name: 'local-layouts',
            layouts: [lazyLayout('kpi-wall', async () => ({ default: layout }))],
          }),
        ],
      },
    );
    await wait(0);
  }

  it('gives the layout a SlotGuard element with only data-slot and children', async () => {
    let body: ReactNode;
    const Spy = ({ slots }: LayoutProps): ReactNode => {
      body = slots.body;
      return null;
    };
    renderWith(
      lazyLayout('kpi-wall', async () => ({
        default: defineLayout({ name: 'kpi-wall', component: Spy }),
      })),
    );
    await wait(0);
    expect(isValidElement(body) && body.type).toBe(SlotGuard);
    expect(isValidElement<object>(body) && Object.keys(body.props).toSorted()).toEqual([
      'children',
      'data-slot',
    ]);
  });

  it('keeps a content error the slide’s when the layout replaces the children with cloneElement', async () => {
    await renderBroken(({ slots }) => {
      const body = slots.body;
      return isValidElement<{ children?: ReactNode }>(body) ? (
        <div>{cloneElement(body, {}, <section>{body.props.children}</section>)}</div>
      ) : null;
    });
    const [problem, ...rest] = problems();
    expect(rest).toEqual([]);
    expect(problem?.problem).toBeNull();
    expect(problem?.text).toContain('slide component broke');
  });

  it('reports a component supplied by the layout inside a cloned slot as a layout problem', async () => {
    /**
     * Fails while rendering the layout's own panel inside the original slot wrapper.
     */
    const Panel = (): ReactNode => {
      throw new Error('layout panel broke');
    };
    renderWith(
      lazyLayout('kpi-wall', async () => ({
        default: defineLayout({
          name: 'kpi-wall',
          component: ({ slots }) => {
            const body = slots.body;
            return isValidElement<{ children?: ReactNode }>(body)
              ? cloneElement(
                  body,
                  {},
                  <section>
                    {body.props.children}
                    <Panel />
                  </section>,
                )
              : null;
          },
        }),
      })),
    );
    await wait(0);
    const [problem, ...rest] = problems();
    expect(rest).toEqual([]);
    expect(problem).toMatchObject({ slide: 'wall', problem: 'layout-load-failed' });
    expect(problem?.text).toContain('Layout `kpi-wall` failed to render: layout panel broke');
  });

  it('keeps a content error the slide’s when the layout renders the children outside the slot', async () => {
    await renderBroken(({ slots }) => {
      const body = slots.body;
      return isValidElement<{ children?: ReactNode }>(body) ? (
        <div>{body.props.children}</div>
      ) : null;
    });
    const [problem, ...rest] = problems();
    expect(rest).toEqual([]);
    expect(problem?.problem).toBeNull();
    expect(problem?.text).toContain('slide component broke');
    expect(problem?.text).not.toContain('Layout `kpi-wall`');
  });

  it('keeps a content error the slide’s when the layout maps each child into its own element', async () => {
    await renderBroken(({ slots }) => {
      const body = slots.body;
      const items = isValidElement<{ children?: ReactNode }>(body)
        ? Children.map(body.props.children, (item) => <article>{item}</article>)
        : null;
      return <div>{items}</div>;
    });
    const [problem, ...rest] = problems();
    expect(rest).toEqual([]);
    expect(problem?.problem).toBeNull();
    expect(problem?.text).toContain('slide component broke');
  });

  it('keeps an error of a component inside an HTML element the slide’s outside the slot', async () => {
    const deck = manifestOf(
      mdxSlide(
        'wall',
        () => (
          <div>
            <p>Lead</p>
            <Boom />
          </div>
        ),
        { frontmatter: { layout: 'kpi-wall' } },
      ),
    );
    const Unwrap = ({ slots }: LayoutProps): ReactNode => {
      const body = slots.body;
      return isValidElement<{ children?: ReactNode }>(body) ? (
        <main>{body.props.children}</main>
      ) : null;
    };
    mounted = renderDeck(deck, {
      isStatic: true,
      plugins: [
        definePlugin({
          name: 'local-layouts',
          layouts: [
            lazyLayout('kpi-wall', async () => ({
              default: defineLayout({ name: 'kpi-wall', component: Unwrap }),
            })),
          ],
        }),
      ],
    });
    await wait(0);
    const [problem, ...rest] = problems();
    expect(rest).toEqual([]);
    expect(problem?.problem).toBeNull();
    expect(problem?.text).toContain('slide component broke');
  });

  it.each([
    ['a Set in a host element', () => <div>{new Set([<Boom key="broken" />])}</div>],
    [
      'an iterable in a fragment',
      () => {
        /**
         * Yields a broken component inside the slide's fragment.
         */
        function* figures(): Generator<ReactNode> {
          yield <Boom key="broken" />;
        }

        return <Fragment>{figures()}</Fragment>;
      },
    ],
    [
      'a rejected promise in a host element',
      () => {
        const content = Promise.reject(new Error('slide component broke'));
        // The layout's own load can suspend before React reads the rejected promise.
        void content.catch(() => {});
        return <div>{content}</div>;
      },
    ],
    [
      'a lazy component that fails to load',
      () => {
        /**
         * Rejects when React loads the slide's lazy component.
         */
        const Broken = lazy(async () => {
          throw new Error('slide component broke');
        });
        return <Broken />;
      },
    ],
  ])('attributes a content error from %s to the slide outside the slot', async (_label, render) => {
    const content = render();
    await renderBroken(
      ({ slots }) => {
        const body = slots.body;
        return isValidElement<{ children?: ReactNode }>(body) ? (
          <main>{body.props.children}</main>
        ) : null;
      },
      () => content,
    );
    const [problem, ...rest] = problems();
    expect(rest).toEqual([]);
    expect(problem?.problem).toBeNull();
    expect(problem?.text).toContain('slide component broke');
  });

  it('keeps a thrown non-Error value from content outside the slot the slide’s', async () => {
    const Odd = (): ReactNode => {
      // oxlint-disable-next-line no-throw-literal
      throw 'not an error object';
    };
    const deck = manifestOf(
      mdxSlide('wall', () => <Odd />, { frontmatter: { layout: 'kpi-wall' } }),
    );
    const Unwrap = ({ slots }: LayoutProps): ReactNode => {
      const body = slots.body;
      return isValidElement<{ children?: ReactNode }>(body) ? (
        <div>{body.props.children}</div>
      ) : null;
    };
    mounted = renderDeck(deck, {
      isStatic: true,
      plugins: [
        definePlugin({
          name: 'local-layouts',
          layouts: [
            lazyLayout('kpi-wall', async () => ({
              default: defineLayout({ name: 'kpi-wall', component: Unwrap }),
            })),
          ],
        }),
      ],
    });
    await wait(0);
    const [problem] = problems();
    expect(problem?.problem).toBeNull();
    expect(problem?.text).toContain('not an error object');
    expect(problem?.text).not.toContain('Layout `kpi-wall`');
  });

  it('still reports a layout’s own component that throws beside the content as the layout’s', async () => {
    const Badge = (): ReactNode => {
      throw new Error('badge is not defined');
    };
    const deck = manifestOf(
      mdxSlide('wall', () => <p>Fine</p>, { frontmatter: { layout: 'kpi-wall' } }),
    );
    const Unwrap = ({ slots }: LayoutProps): ReactNode => {
      const body = slots.body;
      return isValidElement<{ children?: ReactNode }>(body) ? (
        <div>
          {body.props.children}
          <Badge />
        </div>
      ) : null;
    };
    mounted = renderDeck(deck, {
      isStatic: true,
      plugins: [
        definePlugin({
          name: 'local-layouts',
          layouts: [
            lazyLayout('kpi-wall', async () => ({
              default: defineLayout({ name: 'kpi-wall', component: Unwrap }),
            })),
          ],
        }),
      ],
    });
    await wait(0);
    const [problem, ...rest] = problems();
    expect(rest).toEqual([]);
    expect(problem?.problem).toBe('layout-load-failed');
    expect(problem?.text).toContain('Layout `kpi-wall` failed to render: badge is not defined');
  });

  it('hands the layout the content’s own props, keys and children, and draws the same DOM', async () => {
    /**
     * A content component with a prop a layout may read.
     */
    const Figure = ({ label }: { label: string }): ReactNode => <b>{label}</b>;
    let children: ReactNode;
    const deck = manifestOf(
      mdxSlide(
        'wall',
        () => [
          <Figure key="a" label="First" />,
          <p key="b">
            Text <Figure label="Inline" />
          </p>,
        ],
        { frontmatter: { layout: 'kpi-wall' } },
      ),
    );
    /**
     * Captures the children exactly as the engine hands them to the layout.
     */
    const Spy = ({ slots }: LayoutProps): ReactNode => {
      const body = slots.body;
      children = isValidElement<{ children?: ReactNode }>(body) ? body.props.children : undefined;
      return <div data-testid="wall">{slots.body}</div>;
    };
    mounted = renderDeck(deck, {
      isStatic: true,
      plugins: [
        definePlugin({
          name: 'local-layouts',
          layouts: [
            lazyLayout('kpi-wall', async () => ({
              default: defineLayout({ name: 'kpi-wall', component: Spy }),
            })),
          ],
        }),
      ],
    });
    await wait(0);
    expect(children).toEqual([
      expect.objectContaining({ key: '.$a', props: { label: 'First' } }),
      expect.objectContaining({ key: '.$b', type: 'p' }),
    ]);
    expect(document.querySelector('[data-testid="wall"]')?.innerHTML).toBe(
      '<span class="deck-slot" data-slot="body"><b>First</b><p>Text <b>Inline</b></p></span>',
    );
    // No key or other React warnings from the guarded elements.
    expect(console.error).not.toHaveBeenCalled();
  });
});
