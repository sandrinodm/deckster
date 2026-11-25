// @vitest-environment happy-dom
import type { DeckManifest, SlideEntry } from '@deckster/engine/manifest';

import { Deck, definePlugin, lazyLayout, type LayoutProps } from '@deckster/engine';
import { SLOTS_ELEMENT } from '@deckster/engine/slots';
import { act, Fragment, isValidElement, type ComponentType, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import { dashboardCharts, dashboardLayout } from '#layouts/dashboard-layout.tsx';

vi.mock('@deckster/brand/runtime', () => ({
  useBrand: () => ({ surface: { name: 'default' } }),
}));

vi.mock('#foundation/backdrop.tsx', () => ({ Backdrop: () => null }));

Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);

// happy-dom has no FontFaceSet; the deck's readiness and the fit hooks read its status and listen.
if (!('fonts' in document)) {
  Object.defineProperty(document, 'fonts', {
    value: {
      status: 'loaded',
      ready: Promise.resolve(),
      addEventListener: () => {},
      removeEventListener: () => {},
    },
  });
}

/**
 * A number panel, as a chart component a slide puts in the dashboard's body.
 */
function Figure({ value }: { value: number }): ReactNode {
  return <b className="test-figure">{value}</b>;
}

/**
 * A chart component that breaks while rendering, as one given bad data does.
 */
function Broken(): ReactNode {
  throw new Error('chart data is missing');
}

/**
 * Two panel headings, for slides with two body components.
 */
const PANELS = [{ title: 'Volume' }, { title: 'Cost' }];

/**
 * An MDX slide on the dashboard whose body is what `render` returns.
 *
 * @param render - The slide's top-level content.
 * @param panels - The panel headings.
 */
function dashboardSlide(render: () => ReactNode, panels = PANELS): SlideEntry {
  /**
   * The compiled MDX content: the body inside the `<DeckSlots>` element the build adds.
   */
  const Content = ({ components = {} }: { components?: Record<string, unknown> }): ReactNode => {
    const Slots = components[SLOTS_ELEMENT] as ComponentType<{ children?: ReactNode }>;
    return <Slots>{render()}</Slots>;
  };
  return {
    id: 'board',
    file: 'slides/board.mdx',
    kind: 'mdx',
    module: {
      default: Content,
      slideMeta: {
        frontmatter: {
          layout: 'dashboard',
          title: 'Board',
          panels,
          reveal: false,
          chrome: true,
        } as never,
        title: 'Board',
        notes: '',
        slots: [],
      },
    },
  };
}

/**
 * The deck under test's root and container, removed after each test.
 */
let mounted: { root: Root; container: HTMLElement } | undefined;

/**
 * Renders a one-slide deck with the dashboard registered as `layout`, in static mode.
 *
 * @param slide - The slide.
 * @param layout - The dashboard as the kit registers it, or as a code layout.
 */
async function renderDeck(slide: SlideEntry, layout = dashboardLayout): Promise<void> {
  const manifest: DeckManifest = { id: 'test', title: 'Test', brand: 'default', slides: [slide] };
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  mounted = { root, container };
  const plugins = [definePlugin({ name: 'layouts', layouts: [layout] })];
  await act(async () => {
    root.render(<Deck manifest={manifest} plugins={plugins} isStatic />);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/**
 * The dashboard as an ejected code layout: loaded lazily, inside the engine's layout boundary.
 */
function codeDashboard(): typeof dashboardLayout {
  return lazyLayout('dashboard', async () => ({ default: dashboardLayout }));
}

/**
 * The problem the slide shows, if any.
 */
function problem(): { kind: string | null; text: string } | undefined {
  const element = document.querySelector('[data-slide-error]');
  return element === null
    ? undefined
    : { kind: element.getAttribute('data-deck-problem'), text: element.textContent ?? '' };
}

beforeEach(() => {
  window.history.replaceState(null, '', '#');
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  if (mounted !== undefined) {
    const { root, container } = mounted;
    act(() => root.unmount());
    container.remove();
    mounted = undefined;
  }

  vi.restoreAllMocks();
});

describe('the dashboard with guarded slot content', () => {
  it('pairs each body component, one in a fragment, with its heading inside the body slot', async () => {
    await renderDeck(
      dashboardSlide(() => [
        <Figure key="a" value={182} />,
        '\n',
        <Fragment key="b">
          <Figure value={64} />
        </Fragment>,
      ]),
    );
    expect(problem()).toBeUndefined();
    const slot = document.querySelector('.deck-slot[data-slot="body"]');
    expect(slot?.querySelector('.kit-dashboard-grid')).not.toBeNull();
    expect(
      [...document.querySelectorAll('.kit-dashboard-plot')].map((plot) => plot.innerHTML),
    ).toEqual(['<b class="test-figure">182</b>', '<b class="test-figure">64</b>']);
  });

  it('reads each component’s own props for its fit key', async () => {
    let body: ReactNode;
    const Component = dashboardLayout.component;
    const spy = {
      ...dashboardLayout,
      component: (props: LayoutProps) => {
        body = props.slots.body;
        return <Component {...props} />;
      },
    };
    await renderDeck(
      dashboardSlide(() => [<Figure key="a" value={182} />, <Figure key="b" value={64} />]),
      spy,
    );
    const props = dashboardCharts(body).map((chart) =>
      isValidElement(chart) ? chart.props : chart,
    );
    expect(props).toEqual([{ value: 182 }, { value: 64 }]);
  });

  it('shows a body component that throws as the slide’s error when it is a code layout', async () => {
    await renderDeck(
      dashboardSlide(() => [<Figure key="a" value={182} />, <Broken key="b" />]),
      codeDashboard(),
    );
    expect(problem()?.kind).toBeNull();
    expect(problem()?.text).toContain('chart data is missing');
    expect(problem()?.text).not.toContain('Layout `dashboard`');
  });

  it('keeps its own count check a layout error when it is a code layout', async () => {
    await renderDeck(
      dashboardSlide(() => [<Figure key="a" value={182} />]),
      codeDashboard(),
    );
    expect(problem()?.kind).toBe('layout-load-failed');
    expect(problem()?.text).toContain(
      'Layout `dashboard` failed to render: Dashboard has 2 panel headings but 1 body components.',
    );
  });
});
