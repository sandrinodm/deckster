import { DECKSTER_SOURCE_FILE } from '@deckster/brand/node';
import { readSkippedCodeLayouts } from '@deckster/vite-plugin';
import * as NodeServices from '@effect/platform-node/NodeServices';
import { describe, expect, it, layer } from '@effect/vitest';
import { Effect } from 'effect';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { SkippedFile } from '#brand-add/brand-files.ts';

import {
  codeLayoutNames,
  encodeDecksterSource,
  withoutCredentials,
  writeDecksterSource,
} from '#brand-add/deckster-source.ts';

/**
 * Marks a path as skipped for the reason `code`.
 *
 * @param paths - The paths inside the brand folder.
 */
function skippedCode(...paths: string[]): SkippedFile[] {
  return paths.map((file) => ({ path: file, reason: 'code' }));
}

describe('codeLayoutNames', () => {
  it('names the folders that have a contract.ts or layout.tsx, sorted, once each', () => {
    const skipped = skippedCode(
      'layouts/zebra/layout.tsx',
      'layouts/alpha/contract.ts',
      'layouts/alpha/layout.tsx',
      'layouts/alpha/layout.css',
      'layouts/mid-1/contract.ts',
    );
    expect(codeLayoutNames(skipped)).toEqual(['alpha', 'mid-1', 'zebra']);
  });

  it('leaves out _shared, hidden folders, unsafe names, helpers and deeper files', () => {
    const skipped = skippedCode(
      'layouts/_shared/contract.ts',
      'layouts/.hidden/contract.ts',
      'layouts/Bad_Name/contract.ts',
      'layouts/has space/layout.tsx',
      'layouts/notes/helper.ts',
      'layouts/deep/inner/layout.tsx',
      'layouts/contract.ts',
      'other/kpi-wall/contract.ts',
      'helper.ts',
    );
    expect(codeLayoutNames(skipped)).toEqual([]);
  });

  it('ignores files that were skipped for another reason', () => {
    const skipped: SkippedFile[] = [
      { path: 'layouts/linked/layout.tsx', reason: 'symlink' },
      { path: 'layouts/hidden-parent/layout.tsx', reason: 'hidden' },
    ];
    expect(codeLayoutNames(skipped)).toEqual([]);
  });
});

describe('withoutCredentials', () => {
  it.each([
    [
      'https://user:token@github.com/acme/kit.git//brands/acme#v2',
      'https://github.com/acme/kit.git//brands/acme#v2',
    ],
    ['https://token@github.com/acme/kit.git', 'https://github.com/acme/kit.git'],
    ['ssh://git:secret@git.example.com/acme/kit.git', 'ssh://git@git.example.com/acme/kit.git'],
    ['ssh://git@git.example.com/acme/kit.git', 'ssh://git@git.example.com/acme/kit.git'],
    ['git@github.com:acme/kit.git//brands/acme', 'git@github.com:acme/kit.git//brands/acme'],
    ['gh:acme/kit/brands/acme#v2', 'gh:acme/kit/brands/acme#v2'],
    ['https://github.com/acme/kit.git//brands/a@b', 'https://github.com/acme/kit.git//brands/a@b'],
  ])('turns %s into %s', (input, expected) => {
    expect(withoutCredentials(input)).toBe(expected);
  });
});

describe('encodeDecksterSource', () => {
  it('writes indented JSON with a trailing newline and null for an unknown commit', () => {
    const text = encodeDecksterSource({
      source: 'gh:acme/kit/brands/acme',
      commit: null,
      codeLayoutsSkipped: ['kpi-wall'],
    });
    expect(text).toBe(
      [
        '{',
        '  "source": "gh:acme/kit/brands/acme",',
        '  "commit": null,',
        '  "codeLayoutsSkipped": [',
        '    "kpi-wall"',
        '  ]',
        '}',
        '',
      ].join('\n'),
    );
  });
});

layer(NodeServices.layer)('writeDecksterSource', (it) => {
  it.effect('writes the file without credentials and replaces an earlier one', () =>
    Effect.gen(function* () {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deck-source-file-'));
      try {
        const file = path.join(dir, DECKSTER_SOURCE_FILE);
        fs.writeFileSync(file, 'old');
        const written = yield* writeDecksterSource(dir, {
          source: 'https://user:token@example.test/acme/kit.git//brands/acme',
          commit: 'a'.repeat(40),
          codeLayoutsSkipped: [],
        });
        expect(written).toBe(file);
        const text = fs.readFileSync(file, 'utf8');
        expect(text).not.toContain('token');
        expect(JSON.parse(text)).toEqual({
          source: 'https://example.test/acme/kit.git//brands/acme',
          commit: 'a'.repeat(40),
          codeLayoutsSkipped: [],
        });
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }),
  );

  it.effect('writes what the build reads back as the skipped code layouts', () =>
    Effect.gen(function* () {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deck-source-roundtrip-'));
      try {
        yield* writeDecksterSource(dir, {
          source: 'gh:acme/kit/brands/acme',
          commit: null,
          codeLayoutsSkipped: ['alpha', 'zebra'],
        });
        const read = yield* readSkippedCodeLayouts(dir);
        expect(read).toEqual({ source: 'gh:acme/kit/brands/acme', names: ['alpha', 'zebra'] });
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }),
  );
});
