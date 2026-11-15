import { defineLayoutCatalog } from '#contract/layout-contract.ts';
import { engineDefaultContract } from '#layouts/default-layout.contract.ts';

/**
 * The layouts the engine always provides, loaded by the build before any plugin's catalog. A plugin
 * catalog with a layout of the same name replaces it, as its component does at run time.
 */
export default defineLayoutCatalog({
  source: '@deckster/engine',
  layouts: [engineDefaultContract],
});
