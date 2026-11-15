import { Effect } from 'effect';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { build, createServer } from 'vite-plus';
import { describe, expect, it } from 'vite-plus/test';

import { deckStateGuardPlugin } from '#deck-state-guard.ts';
import { compileMdx } from '#slides/compile-mdx.ts';

import { remarkKitMedia } from '../../../kit/src/mdx/remark-media.ts';

/**
 * A valid two-pixel GIF whose cache key is independent of ffmpeg availability.
 */
const GIF = Buffer.from('R0lGODlhAgACAPAAAP8AAAAAACH5BAAAAAAALAAAAAACAAIAAAIChFEAOw==', 'base64');

/**
 * A valid one-pixel PNG used as a preconverted poster.
 */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0l8AAAAASUVORK5CYII=',
  'base64',
);

/**
 * A valid two-pixel VP9 WebM, so a cached build exercises real video assets without ffmpeg.
 */
const WEBM = Buffer.from(
  [
    'GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQJChYECGFOAZwEAAAAAAAHyEU2bdLpNu4tTq4QV',
    'SalmU6yBoU27i1OrhBZUrmtTrIHWTbuMU6uEElTDZ1OsggEjTbuMU6uEHFO7a1OsggHc7AEAAAAAAABZ',
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVSalmsCrXsYMPQkBNgIxMYXZmNjIuMy4xMDBXQYxM',
    'YXZmNjIuMy4xMDBEiYhAj0AAAAAAABZUrmvIrgEAAAAAAAA/14EBc8WI2KhLd0m+dmmcgQAitZyDdW5k',
    'iIEAhoVWX1ZQOYOBASPjg4Q7msoA4JCwgQK6gQKagQJVsIRVuYEBElTDZ0B/c3OfY8CAZ8iZRaOHRU5D',
    'T0RFUkSHjExhdmY2Mi4zLjEwMHNz2mPAi2PFiNioS3dJvnZpZ8ilRaOHRU5DT0RFUkSHmExhdmM2Mi4x',
    'MS4xMDAgbGlidnB4LXZwOWfIoUWjiERVUkFUSU9ORIeTMDA6MDA6MDEuMDAwMDAwMDAwAB9DtnWv54EA',
    'o6qBAACAgkmDQgAAEAAWADgkHBhKAAAgIAARv//+Z9P///2Rn////+vlAAAcU7trkbuPs4EAt4r3gQHx',
    'ggGo8IED',
  ].join(''),
  'base64',
);

/**
 * The number of hexadecimal characters used in converted asset names.
 */
const HASH_LENGTH = 16;

/**
 * Enough time for ffmpeg and a Vite build on a busy worker.
 */
const BUILD_TIMEOUT_MS = 60_000;

/**
 * Whether this machine can exercise an uncached conversion as well.
 */
const HAS_FFMPEG = spawnSync('ffmpeg', ['-version']).status === 0;

/**
 * Compiles a real MDX image through the kit media plugin into an entry Vite can bundle.
 *
 * @param root - The scratch workspace and deck root.
 */
async function compileGif(root: string): Promise<string> {
  const entry = path.join(root, 'slide.js');
  const compiled = await Effect.runPromise(
    compileMdx(
      '<Image src="./spin.gif" alt="Spinner" />',
      { file: path.join(root, 'slide.mdx'), displayPath: 'slide.mdx' },
      {
        development: false,
        extensions: { remarkPlugins: [[remarkKitMedia, { deckDir: root, workspaceRoot: root }]] },
      },
    ),
  );
  writeFileSync(entry, compiled.code);
  return entry;
}

/**
 * Confirms Vite can serve generated asset imports and emit both files with the private-state guard.
 *
 * @param root - The scratch workspace.
 * @param entry - The compiled MDX entry.
 */
async function checkAssets(root: string, entry: string): Promise<void> {
  const config = {
    configFile: false as const,
    root,
    logLevel: 'silent' as const,
    plugins: [deckStateGuardPlugin(root)],
  };
  const server = await createServer({ ...config, server: { host: '127.0.0.1', port: 0 } });
  try {
    await server.listen();
    const origin = server.resolvedUrls?.local[0];
    expect(origin).toBeDefined();
    const code = readFileSync(entry, 'utf8');
    const imports = [...code.matchAll(/import kitMedia\d+ from "([^"]+)"/g)];
    expect(imports).toHaveLength(2);
    for (const [, file = ''] of imports) {
      const response = await fetch(`${origin}@fs${file}`);
      expect(response.status).toBe(200);
      expect(Buffer.from(await response.arrayBuffer())).toEqual(readFileSync(file));
    }
  } finally {
    await server.close();
  }

  const result = await build({
    ...config,
    build: {
      write: false,
      assetsInlineLimit: 0,
      rolldownOptions: { input: entry, external: ['react/jsx-runtime'] },
    },
  });
  const builds = Array.isArray(result) ? result : [result];
  const outputs = builds.flatMap((output) => ('output' in output ? output.output : []));
  const assets = outputs.filter((output) => output.type === 'asset');
  expect(assets.map((asset) => path.extname(asset.fileName)).sort()).toEqual(['.png', '.webm']);
  for (const asset of assets) {
    expect(asset.source.length).toBeGreaterThan(0);
  }
}

describe('GIF assets cross the private-state guard', () => {
  it(
    'builds and serves a valid cached PNG and WebM without requiring ffmpeg',
    async () => {
      const root = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'gif-assets-')));
      try {
        writeFileSync(path.join(root, 'spin.gif'), GIF);
        const hash = createHash('sha256').update(GIF).digest('hex').slice(0, HASH_LENGTH);
        const cache = path.join(root, 'node_modules/.cache/deck/gif');
        mkdirSync(cache, { recursive: true });
        writeFileSync(path.join(cache, `${hash}.png`), PNG);
        writeFileSync(path.join(cache, `${hash}.webm`), WEBM);
        const written = statSync(path.join(cache, `${hash}.webm`)).mtimeMs;
        const entry = await compileGif(root);
        expect(readFileSync(entry, 'utf8')).toContain('/node_modules/.cache/deck/gif/');
        await checkAssets(root, entry);
        expect(statSync(path.join(cache, `${hash}.webm`)).mtimeMs).toBe(written);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
    BUILD_TIMEOUT_MS,
  );

  it.skipIf(!HAS_FFMPEG)(
    'serves and builds files from a real ffmpeg conversion',
    async () => {
      const root = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'gif-assets-')));
      try {
        writeFileSync(path.join(root, 'spin.gif'), GIF);
        const entry = await compileGif(root);
        expect(readFileSync(entry, 'utf8')).toContain('/node_modules/.cache/deck/gif/');
        await checkAssets(root, entry);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
    BUILD_TIMEOUT_MS,
  );
});
