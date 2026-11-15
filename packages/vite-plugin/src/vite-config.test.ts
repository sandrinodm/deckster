import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vite-plus/test';

import { deckFsAllow, deckViteConfig, SECRET_FS_DENY } from '#vite-config.ts';

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

  it('serves the workspace folders decks need, not the workspace root', () => {
    const allow = deckFsAllow('/home/me/talks');

    expect(allow).toContain('/home/me/talks/decks');
    expect(allow).toContain('/home/me/talks/brands');
    expect(allow).toContain('/home/me/talks/node_modules');
    expect(allow).not.toContain('/home/me/talks');
  });

  it('denies credentials and the agent state folder', () => {
    const deny = deckViteConfig({ workspaceRoot: WORKSPACE_ROOT, deck: 'hello' }).server?.fs?.deny;

    expect(deny).toEqual(expect.arrayContaining([...SECRET_FS_DENY, '**/.deck/**']));
    expect(SECRET_FS_DENY).toEqual(
      expect.arrayContaining(['**/.ssh/**', '**/.aws/**', '**/.npmrc', '**/id_rsa*', '**/.netrc']),
    );
  });
});
