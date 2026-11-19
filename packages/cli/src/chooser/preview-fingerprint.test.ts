import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vite-plus/test';

import { previewFingerprint } from '#chooser/preview-fingerprint.ts';

describe('previewFingerprint', () => {
  it('works without a local brands directory and sees a new default brand', async () => {
    const root = await realpath(await mkdtemp(path.join(tmpdir(), 'deck-cover-brand-')));
    const dir = path.join(root, 'decks', 'talk');
    const slidesDir = path.join(dir, 'slides');
    const deck = { id: 'talk', dir, slidesDir, configFile: path.join(dir, 'deck.config.ts') };
    try {
      await mkdir(slidesDir, { recursive: true });
      const builtIn = await previewFingerprint(root, deck, 'default');
      expect(builtIn).toMatch(/^[a-f0-9]{64}$/);

      const local = path.join(root, 'brands', 'default');
      await mkdir(local, { recursive: true });
      await writeFile(path.join(local, 'brand.ts'), 'a local default brand');
      expect(await previewFingerprint(root, deck, 'default')).not.toBe(builtIn);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('fingerprints deck, brand and shared assets within the workspace', async () => {
    const root = await realpath(await mkdtemp(path.join(tmpdir(), 'deck-cover-key-')));
    const workspace = path.join(root, 'workspace');
    const dir = path.join(workspace, 'decks', 'talk');
    const slidesDir = path.join(dir, 'slides');
    const location = { id: 'talk', dir, slidesDir, configFile: path.join(dir, 'deck.config.ts') };
    const brand = path.join(workspace, 'brands', 'example');
    const shared = path.join(workspace, 'decks', 'shared');
    const generated = path.join(dir, 'dist');
    const outside = path.join(root, 'outside');
    const trees = [slidesDir, brand, shared, generated, outside];
    try {
      await Promise.all(trees.map((folder) => mkdir(folder, { recursive: true })));
      await symlink(shared, path.join(dir, 'assets'));
      await symlink(dir, path.join(shared, 'cycle'));
      await symlink(outside, path.join(dir, 'outside'));
      await symlink(generated, path.join(dir, 'generated'));

      const version = () => previewFingerprint(workspace, location, 'example');
      const initial = await version();
      await writeFile(path.join(generated, 'page.html'), 'a build');
      await writeFile(path.join(outside, 'theme.svg'), 'an external file');
      expect(await version()).toBe(initial);

      for (const file of [
        path.join(slidesDir, 'opening.mdx'),
        path.join(shared, 'logo.svg'),
        path.join(brand, 'brand.ts'),
      ]) {
        const previous = await version();
        await writeFile(file, 'updated');
        expect(await version()).not.toBe(previous);
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
