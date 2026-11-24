import { use, type ReactNode } from 'react';

import { isComponent } from '#deck/is-component.ts';
import { announceLayoutLoad } from '#layouts/layout-loads.ts';
import { LayoutProblem } from '#layouts/layout-problem.tsx';
import { LayoutRenderBoundary } from '#layouts/layout-render-boundary.tsx';
import {
  type BleedInput,
  type BleedSide,
  type LayoutDefinition,
  type LayoutProps,
} from '#layouts/layout.ts';

/**
 * The module a lazy layout's loader resolves to: a layout file whose default export is the layout's
 * `defineLayout` result. The default export is checked when the layout loads.
 */
export type LayoutModule = {
  /**
   * The module's default export.
   */
  readonly default: unknown;
};

/**
 * How loading a lazy layout ended: the layout, or why not.
 */
type LayoutLoad =
  | {
      /**
       * The module loaded and its default export is the layout.
       */
      status: 'loaded';

      /**
       * The layout the module defines.
       */
      layout: LayoutDefinition;
    }
  | {
      /**
       * The module failed to import, or its default export is not the layout.
       */
      status: 'failed';

      /**
       * Why, in a sentence that says how to fix it.
       */
      reason: string;
    };

/**
 * Registers a layout whose component loads the first time a slide uses it, for layouts that live in
 * a deck or brand folder and are compiled by Vite:
 *
 * ```ts
 * lazyLayout('kpi-wall', () => import('/abs/path/layouts/kpi-wall/layout.tsx'));
 * ```
 *
 * The layout file's default export must be a `defineLayout` result with the same `name`. A layout
 * that fails to import, exports something else or throws while rendering shows as a problem on the
 * slides that use it ("Layout `kpi-wall` failed to load: ..."); every other slide keeps working.
 * The slide is not ready (`window.__deck.ready()`) until the layout has loaded. The layout's
 * `bleed` is read once it has loaded: until then it names no edges, and anything that reads it
 * through `useLayouts()` renders again when the load finishes.
 *
 * @param name - The layout's name, which its default export must carry too.
 * @param load - Imports the layout's module; it is called at most once.
 * @returns The layout, for a plugin's `layouts` list.
 */
export function lazyLayout(name: string, load: () => Promise<LayoutModule>): LayoutDefinition {
  let loading: Promise<LayoutLoad> | undefined;
  let loaded: LayoutDefinition | undefined;

  /**
   * Starts loading on the first call and returns the same promise afterwards.
   */
  const start = (): Promise<LayoutLoad> => {
    loading ??= settle(name, load).then((result) => {
      if (result.status === 'loaded') {
        loaded = result.layout;
      }

      announceLayoutLoad();
      return result;
    });
    return loading;
  };

  /**
   * Suspends the slide until the layout has loaded, then renders the loaded layout's component or
   * the problem.
   */
  function LazyLayout(props: LayoutProps): ReactNode {
    const result = use(start());
    if (result.status === 'failed') {
      return <LayoutProblem layout={name} stage="load" reason={result.reason} />;
    }

    const Layout = result.layout.component;
    return (
      <LayoutRenderBoundary layout={name} resetKey={props.frontmatter}>
        <Layout {...props} />
      </LayoutRenderBoundary>
    );
  }

  return {
    name,
    component: LazyLayout,
    bleed: (input: BleedInput): readonly BleedSide[] => {
      if (loaded === undefined) {
        void start();
        return [];
      }

      return loaded.bleed?.(input) ?? [];
    },
  };
}

/**
 * Imports a layout's module and checks its default export, turning every failure into a result.
 *
 * @param name - The layout's name.
 * @param load - Imports the layout's module.
 */
async function settle(name: string, load: () => Promise<LayoutModule>): Promise<LayoutLoad> {
  try {
    const module = await load();
    return checkLayout(name, module.default);
  } catch (error) {
    return { status: 'failed', reason: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Checks that a module's default export is a `defineLayout` result named `name`.
 *
 * @param name - The name the layout is registered under.
 * @param exported - The module's default export.
 */
function checkLayout(name: string, exported: unknown): LayoutLoad {
  if (!isLayoutDefinition(exported)) {
    return {
      status: 'failed',
      reason:
        `its default export is not a layout. ` +
        `Export \`defineLayout({ name: '${name}', component })\` as the default export.`,
    };
  }

  if (exported.name !== name) {
    return {
      status: 'failed',
      reason:
        `it is registered as \`${name}\` but its default export is named \`${exported.name}\`. ` +
        `Set \`name: '${name}'\` in defineLayout, or rename the layout's folder.`,
    };
  }

  return { status: 'loaded', layout: exported };
}

/**
 * Whether a value has the shape `defineLayout` returns: a name and a component.
 *
 * @param value - The module's default export.
 */
function isLayoutDefinition(value: unknown): value is LayoutDefinition {
  return (
    typeof value === 'object' &&
    value !== null &&
    'name' in value &&
    typeof value.name === 'string' &&
    'component' in value &&
    isComponent(value.component)
  );
}
