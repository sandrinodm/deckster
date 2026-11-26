import { NodeFileSystem } from '@effect/platform-node';
import { expect, layer } from '@effect/vitest';
import { Effect } from 'effect';
import { rmSync } from 'node:fs';

import { readSkippedCodeLayouts } from '#layouts/brand-source.ts';
import { scratchRoot, writeFiles } from '#layouts/layout-workspace.fixture.ts';

layer(NodeFileSystem.layer)('readSkippedCodeLayouts', (it) => {
  it.effect('reads the source and the skipped code layouts, ignoring other keys', () =>
    Effect.gen(function* () {
      const root = scratchRoot();
      writeFiles(root, {
        '.deckster-source.json': JSON.stringify({
          source: 'github.com/acme/brand',
          commit: null,
          codeLayoutsSkipped: ['kpi-wall'],
          allowCode: false,
        }),
      });
      expect(yield* readSkippedCodeLayouts(root)).toEqual({
        source: 'github.com/acme/brand',
        names: ['kpi-wall'],
      });
      rmSync(root, { recursive: true, force: true });
    }),
  );

  it.effect('answers undefined for a brand without the file, or with one it cannot read', () =>
    Effect.gen(function* () {
      const root = scratchRoot();
      expect(yield* readSkippedCodeLayouts(root)).toBeUndefined();
      writeFiles(root, { '.deckster-source.json': '{ "source": 1 }' });
      expect(yield* readSkippedCodeLayouts(root)).toBeUndefined();
      rmSync(root, { recursive: true, force: true });
    }),
  );
});
