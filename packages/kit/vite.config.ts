import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite-plus';

/**
 * Stubs for the brand's virtual modules, which only the deck Vite plugin serves; the runtime plugin
 * reaches them through the chrome and the cover logo.
 */
const VIRTUAL_BRAND_STUBS = {
  /**
   * The brand tokens and logo URLs.
   */
  'virtual:deck/brand': fileURLToPath(new URL('src/virtual-brand.fixture.ts', import.meta.url)),

  /**
   * The brand stylesheet.
   */
  'virtual:deck/brand.css': fileURLToPath(
    new URL('src/virtual-brand.fixture.css', import.meta.url),
  ),
};

/**
 * The package's test settings: unit tests sit beside the code they test, and the brand's virtual
 * modules resolve to stubs.
 */
export default defineConfig({
  resolve: { alias: VIRTUAL_BRAND_STUBS },
  test: { include: ['src/**/*.test.{ts,tsx}'] },
});
