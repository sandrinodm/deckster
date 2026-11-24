export { VIRTUAL_BRAND_CSS_ID, VIRTUAL_BRAND_ID } from '#brand/brand-modules.ts';
export { deckBrandName } from '#brand/deck-brand-name.ts';
export { DECK_CONFIG_FILE, DECKS_DIR, SLIDES_DIR, type DeckLocation } from '#decks/deck-paths.ts';
export { discoverDecks, findDeck } from '#decks/discover-decks.ts';
export { appendSlideId, reorderSlideIds, slideListProblem } from '#decks/slide-list-edit.ts';
export { loadDeck, type LoadedDeck, type LoadedSlide } from '#decks/load-deck.ts';
export { reorderDeck } from '#decks/reorder-deck.ts';
export { DeckBuildError, type Problem } from '#errors.ts';
export { slideHintsFor, slideSchemaFor } from '#layouts/check-contract.ts';
export {
  DEFAULT_LAYOUT_CATALOGS,
  loadLayoutCatalog,
  type CatalogLayout,
  type LayoutCatalogIndex,
  type LayoutCatalogOptions,
} from '#layouts/load-layout-catalog.ts';
export {
  BRAND_SOURCE_FILE,
  readSkippedCodeLayouts,
  type SkippedCodeLayouts,
} from '#layouts/brand-source.ts';
export { deckCatalog, type DeckCatalog, type DeckCatalogOptions } from '#layouts/deck-catalog.ts';
export {
  importContracts,
  type ContractLoad,
  type ContractProblem,
  type ImportContractsOptions,
} from '#layouts/import-contracts.ts';
export type { LayoutProblem, LayoutProblemCode } from '#layouts/layout-problem.ts';
export {
  BRAND_CODE_SOURCE_PREFIX,
  BRAND_MANIFEST_FILE,
  COMPONENT_FILE,
  CONTRACT_FILE,
  DECK_SOURCE_PREFIX,
  LAYOUTS_DIR,
  localLayouts,
  type LocalCatalog,
  type LocalLayout,
  type LocalLayouts,
  type LocalLayoutsOptions,
} from '#layouts/local-layouts.ts';
export {
  DEFAULT_RUNTIME_PLUGINS,
  DEV_RUNTIME_PLUGINS,
  deckPlugin,
  type DeckPluginApi,
  type DeckPluginOptions,
} from '#plugin.ts';
export { VIRTUAL_DECK_ID, VIRTUAL_LOCAL_LAYOUTS_ID, VIRTUAL_PLUGINS_ID } from '#virtual-modules.ts';
export { deckViteConfig } from '#vite-config.ts';
export { APPS_DIR, APP_ENTRY_FILE, discoverApps, type AppLocation } from '#apps/discover-apps.ts';
export type { MdxWarning } from '#slides/compile-mdx.ts';
export { validateFrontmatter, type ValidFrontmatter } from '#slides/frontmatter.ts';
export { readSlideLayout } from '#slides/read-slide-layout.ts';
export {
  slideMetaReader,
  type SlideMetaOptions,
  type SlideMetaReader,
} from '#slides/slide-meta.ts';
export { refuseStylesheetCode } from '#deck-css-guard.ts';
