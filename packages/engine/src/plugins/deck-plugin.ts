import type { MDXComponents } from 'mdx/types';
import type { ComponentType, ReactNode } from 'react';

import type { DeckControls } from '#deck/deck-context.ts';
import type { LayoutDefinition } from '#layouts/layout.ts';

/**
 * Extends the engine without changing it. The kit registers layouts and slide components, a brand
 * adds chrome, and presenter tools add overlays and shortcuts. Every member is optional because a
 * plugin contributes only what it needs; later plugins override earlier ones on name clashes.
 */
export type DeckPlugin = {
  /**
   * A unique name, used in error messages.
   */
  name: string;

  /**
   * Layout components, made with `defineLayout`. Each needs a contract of the same name in a
   * Node-safe catalog the build loads (`layoutCatalogs` of `@deckster/vite-plugin`), or slides that
   * name it fail to build.
   */
  layouts?: readonly LayoutDefinition[];

  /**
   * Components MDX slides can use without importing them. A `Step` here also replaces the `Step`
   * TSX slides import from `@deckster/engine`.
   */
  components?: MDXComponents;

  /**
   * Rendered inside the 1920x1080 canvas above the slides: page numbers, logo, progress.
   */
  chrome?: ComponentType;

  /**
   * Wraps the main stage, the scaled canvas with the slides and the chrome. The wrapper fills the
   * stage and may shrink it (a docked sidebar) or render no children at all (a presenter window
   * that draws its own panes). Wrappers nest in plugin order, the first plugin outermost. Clicks
   * inside it still reach the stage's mouse navigation, so render the canvas, not a copy.
   */
  stage?: ComponentType<{ children: ReactNode }>;

  /**
   * Rendered over the whole viewport, outside the canvas: sidebar, help, comments.
   */
  overlay?: ComponentType;

  /**
   * Sees each key press before the built-in navigation keys. Return `true` to claim the key; the
   * engine then calls `preventDefault()` and does not navigate.
   */
  onKeyDown?: (event: KeyboardEvent, deck: DeckControls) => boolean;

  /**
   * Sees each click on the main stage that would navigate (a left `click` or a right
   * `contextmenu`), before the deck moves. Return `true` to claim it; the engine then calls
   * `preventDefault()` and does not navigate. Clicks on interactive content never reach it.
   */
  onPointer?: (event: MouseEvent, deck: DeckControls) => boolean;
};

/**
 * Declares a deck plugin; it returns its argument unchanged and exists for type inference.
 *
 * @param plugin - What the plugin contributes.
 */
export function definePlugin(plugin: DeckPlugin): DeckPlugin {
  return plugin;
}
