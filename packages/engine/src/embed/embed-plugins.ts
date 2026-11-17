import type { DeckPlugin } from '#plugins/deck-plugin.ts';

/**
 * The plugins an embedded deck runs: each plugin keeps what draws slides (its layouts, MDX
 * components and in-canvas chrome) and loses what wraps or covers the stage or handles input (its
 * stage wrapper, overlay, key handler and click handler). That leaves out the presenter tools, the
 * comment overlay and the agent panel without the engine naming any of them.
 *
 * @param plugins - The deck's plugins, in order.
 * @returns The same plugins in the same order, reduced to their slide parts.
 */
export function embedPlugins(plugins: readonly DeckPlugin[]): readonly DeckPlugin[] {
  return plugins.map(slideParts);
}

/**
 * A plugin with only its name, layouts, components and chrome. The parts are copied by name, so a
 * member added to `DeckPlugin` later stays out of embedded decks until it is listed here.
 *
 * @param plugin - The plugin to reduce.
 */
function slideParts(plugin: DeckPlugin): DeckPlugin {
  const parts: DeckPlugin = { name: plugin.name };
  if (plugin.layouts !== undefined) {
    parts.layouts = plugin.layouts;
  }

  if (plugin.components !== undefined) {
    parts.components = plugin.components;
  }

  if (plugin.chrome !== undefined) {
    parts.chrome = plugin.chrome;
  }

  return parts;
}
