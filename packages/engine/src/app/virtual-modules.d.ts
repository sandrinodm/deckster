/**
 * The modules `@deckster/vite-plugin` generates. `virtual:deck` is the active deck with its slides
 * in manifest order; `virtual:deck/plugins` lists the runtime plugins to merge into the engine.
 */
declare module 'virtual:deck' {
  const deck: import('#contract/manifest.ts').DeckManifest;
  export default deck;
}

declare module 'virtual:deck/plugins' {
  const plugins: readonly import('#plugins/deck-plugin.ts').DeckPlugin[];
  export default plugins;
}
