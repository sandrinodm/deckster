import { defineConfig } from 'vite-plus';

/**
 * The package's test settings: unit tests sit beside the code they test. Every load of code layouts
 * starts a contract check process, which a busy CI machine can make take seconds, so a test gets 30
 * seconds instead of Vitest's 5.
 */
export default defineConfig({
  test: { include: ['src/**/*.test.{ts,tsx}'], testTimeout: 30_000 },
});
