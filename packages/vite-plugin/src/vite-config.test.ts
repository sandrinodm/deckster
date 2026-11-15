import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vite-plus/test';

import { deckViteConfig } from '#vite-config.ts';

/**
 * The framework's root folder, derived from this file so the test runs from any directory.
 */
const WORKSPACE_ROOT = path.resolve(import.meta.dirname, '../../..');

describe('deckViteConfig', () => {
  it('warms up only files that exist under the root, so a moved entry fails here', () => {
    const config = deckViteConfig(
      { workspaceRoot: WORKSPACE_ROOT, deck: 'hello' },
      { warmup: true },
    );
    const entries = config.server?.warmup?.clientFiles ?? [];
    expect(entries).toEqual(['./main.tsx', './start-errors.ts']);
    for (const entry of entries) {
      expect(existsSync(path.resolve(config.root ?? '', entry)), entry).toBe(true);
    }
  });

  it('does not warm up unless asked to', () => {
    const config = deckViteConfig({ workspaceRoot: WORKSPACE_ROOT, deck: 'hello' });
    expect(config.server).not.toHaveProperty('warmup');
  });
});
