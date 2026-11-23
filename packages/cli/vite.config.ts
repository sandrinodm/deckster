import { defineConfig } from 'vite-plus';

/**
 * The package's test settings: unit tests sit beside the code they test, and may select the fake
 * agent provider (`--agent fake`), which the real CLI refuses without `DECK_TEST_FAKE_AGENT`.
 *
 * Its pack settings build the three small JavaScript files the published package starts from
 * (`dist/deckster.js`, `dist/hooks.js`, `dist/shell-main.js`). They import only `node:` modules, so
 * they run before anything of the framework can be resolved; the framework itself ships as staged
 * TypeScript source in `dist/framework` (see `scripts/stage-framework.ts`), not as a bundle,
 * because it finds its own files, scripts and assets relative to its source.
 */
export default defineConfig({
  test: { include: ['src/**/*.test.{ts,tsx}'], env: { DECK_TEST_FAKE_AGENT: '1' } },
  pack: {
    entry: ['src/bootstrap/deckster.ts', 'src/bootstrap/hooks.ts', 'src/bootstrap/shell-main.ts'],
    format: 'esm',
    platform: 'node',
    target: 'node26',
    outDir: 'dist',
    clean: true,
    dts: false,
    fixedExtension: false,
  },
});
