import { defineConfig } from 'vite-plus';

/**
 * The package's test settings: unit tests sit beside the code they test.
 */
export default defineConfig({
  test: { include: ['src/**/*.test.ts'] },
});
