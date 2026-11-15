import { defineConfig } from 'vite-plus';

/**
 * The package's test settings: unit tests sit beside the code they test, and may select the fake
 * agent provider (`--agent fake`), which the real CLI refuses without `DECK_TEST_FAKE_AGENT`.
 */
export default defineConfig({
  test: { include: ['src/**/*.test.{ts,tsx}'], env: { DECK_TEST_FAKE_AGENT: '1' } },
});
