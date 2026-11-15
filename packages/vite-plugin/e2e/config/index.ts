import type { E2EConfig } from 'e2e';

import { web } from '@e2e-dev/web';

import { brandUrl } from '../support/brands.ts';

/**
 * The plugin's browser suite in Chromium at 1920x1080. The suite starts its own dev servers, one
 * per brand, in `beforeAll` (see `support/brand-servers.ts`), so the target only names the first.
 */
export default {
  tests: ['e2e/*.e2e.ts'],
  workers: 1,
  reporters: ['list', 'junit'],
  output: '.e2e',
  targets: [
    {
      name: 'vite-plugin',
      engine: web({ browser: 'chromium', viewport: { width: 1920, height: 1080 } }),
      app: { url: brandUrl('default') },
    },
  ],
} satisfies E2EConfig;
