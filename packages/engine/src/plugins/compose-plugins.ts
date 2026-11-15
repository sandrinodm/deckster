import type { MDXComponents } from 'mdx/types';
import type { ComponentType, ReactNode } from 'react';

import type { LayoutDefinition, LayoutRegistry } from '#layouts/layout.ts';
import type { DeckPlugin } from '#plugins/deck-plugin.ts';
import type { StepProps } from '#steps/step.tsx';

import { engineDefaultLayout } from '#layouts/default-layout.tsx';
import { Notes } from '#notes/notes.tsx';
import { Step } from '#steps/step.tsx';

/**
 * The merged contributions of the engine's built-ins and every plugin, in plugin order.
 */
export type DeckRuntime = {
  /**
   * Every layout by name; a later plugin's layout replaces an earlier one of the same name.
   */
  layouts: LayoutRegistry;

  /**
   * Every component MDX slides can use without importing them, merged the same way.
   */
  components: MDXComponents;

  /**
   * The `Step` a plugin registered in place of the engine's, which the `Step` TSX slides import
   * renders; `undefined` when no plugin replaces it.
   */
  stepOverride: ComponentType<StepProps> | undefined;

  /**
   * Chrome components rendered inside the canvas, in plugin order.
   */
  chrome: readonly ComponentType[];

  /**
   * Stage wrappers around the canvas, outermost first, in plugin order.
   */
  stages: readonly ComponentType<{ children: ReactNode }>[];

  /**
   * Overlay components rendered over the viewport, in plugin order.
   */
  overlays: readonly ComponentType[];

  /**
   * Key handlers that see each key press before navigation, in plugin order.
   */
  keyHandlers: readonly NonNullable<DeckPlugin['onKeyDown']>[];

  /**
   * Click handlers that see each navigating click before the deck moves, in plugin order.
   */
  pointerHandlers: readonly NonNullable<DeckPlugin['onPointer']>[];
};

/**
 * The layouts the engine provides before any plugin.
 */
const BUILTIN_LAYOUTS: readonly LayoutDefinition[] = [engineDefaultLayout];

/**
 * The components every MDX slide can use before any plugin adds more.
 */
const BUILTIN_COMPONENTS: MDXComponents = {
  /**
   * Reveals its children from a given step.
   */
  Step,

  /**
   * Speaker notes; renders nothing.
   */
  Notes,
};

/**
 * Merges plugins over the engine's built-in layout (`default`) and components (`Step`, `Notes`). A
 * later plugin replaces an earlier layout or component of the same name.
 *
 * @param plugins - Plugins in the order `virtual:deck/plugins` lists them.
 */
export function composePlugins(plugins: readonly DeckPlugin[]): DeckRuntime {
  const layouts = [...BUILTIN_LAYOUTS, ...plugins.flatMap((plugin) => plugin.layouts ?? [])];
  const components: MDXComponents = Object.assign(
    {},
    BUILTIN_COMPONENTS,
    ...plugins.map((plugin) => plugin.components),
  );
  return {
    layouts: new Map(layouts.map((layout) => [layout.name, layout])),
    components,
    stepOverride: readStepOverride(components),
    chrome: plugins.flatMap((plugin) => (plugin.chrome === undefined ? [] : [plugin.chrome])),
    stages: plugins.flatMap((plugin) => (plugin.stage === undefined ? [] : [plugin.stage])),
    overlays: plugins.flatMap((plugin) => (plugin.overlay === undefined ? [] : [plugin.overlay])),
    keyHandlers: plugins.flatMap((plugin) =>
      plugin.onKeyDown === undefined ? [] : [plugin.onKeyDown],
    ),
    pointerHandlers: plugins.flatMap((plugin) =>
      plugin.onPointer === undefined ? [] : [plugin.onPointer],
    ),
  };
}

/**
 * The `Step` a plugin put in the merged components, if it is not the engine's own.
 *
 * @param components - The merged components.
 */
function readStepOverride(components: MDXComponents): ComponentType<StepProps> | undefined {
  const step: unknown = components['Step'];
  if (step === Step || !isRenderable(step)) {
    return undefined;
  }

  // A plugin's `Step` is documented to take the same props as the engine's.
  return step as ComponentType<StepProps>;
}

/**
 * Whether a value can be rendered as a component: a function, or a non-null object, which is how
 * `memo` and `forwardRef` components are represented.
 *
 * @param value - The value to check.
 */
function isRenderable(value: unknown): boolean {
  if (typeof value === 'function') {
    return true;
  }

  return typeof value === 'object' && value !== null;
}
