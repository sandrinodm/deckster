import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vite-plus/test';

import type { MdastNode } from '#mdx/mdast.ts';

import {
  conversionSteps,
  convertGif,
  GIF_CACHE_DIR,
  isGif,
  temporaryPaths,
} from '#mdx/gif-to-video.ts';
import { attributeValue, jsxElement } from '#mdx/mdast.ts';
import { runKitEffect } from '#mdx/node-runtime.ts';
import { remarkKitMedia } from '#mdx/remark-media.ts';

/**
 * Whether `ffmpeg` is on PATH here; the conversion tests need it.
 */
const HAS_FFMPEG = spawnSync('ffmpeg', ['-version']).status === 0;

/**
 * Converting a short GIF takes a moment.
 */
const CONVERT_TIMEOUT_MS = 60_000;

/**
 * Writes a small animated GIF with ffmpeg and returns the workspace and slide it sits beside.
 */
function gifWorkspace(): { root: string; slide: string; gif: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-gif-'));
  const gif = path.join(root, 'spin.gif');
  spawnSync('ffmpeg', [
    '-loglevel',
    'error',
    '-f',
    'lavfi',
    '-i',
    'testsrc=size=64x48:rate=10:duration=0.5',
    gif,
  ]);
  return { root, slide: path.join(root, 'slide.mdx'), gif };
}

describe.skipIf(!HAS_FFMPEG)('converting a GIF', () => {
  it(
    'writes cached WebM and poster files, and reuses them for the same content',
    async () => {
      const { root, gif } = gifWorkspace();
      const first = await runKitEffect(convertGif(gif, root));
      if (!('video' in first)) {
        throw new Error(first.reason);
      }

      expect(path.dirname(first.video)).toBe(path.join(root, GIF_CACHE_DIR));
      expect(fs.statSync(first.video).size).toBeGreaterThan(0);
      expect(fs.statSync(first.poster).size).toBeGreaterThan(0);
      const written = fs.statSync(first.video).mtimeMs;
      const again = await runKitEffect(convertGif(gif, root));
      expect(again).toEqual(first);
      expect(fs.statSync(first.video).mtimeMs).toBe(written);
    },
    CONVERT_TIMEOUT_MS,
  );

  it(
    'turns an <Image> of a local GIF into a looping <Video> with the poster frame',
    async () => {
      const { root, slide } = gifWorkspace();
      const image = jsxElement('Image', [
        { type: 'mdxJsxAttribute', name: 'src', value: './spin.gif' },
        { type: 'mdxJsxAttribute', name: 'alt', value: 'A spinner' },
      ]);
      const tree: MdastNode = { type: 'root', children: [image] };
      const warnings: string[] = [];
      await remarkKitMedia({ deckDir: root, workspaceRoot: root })(tree, {
        path: slide,
        message: (reason) => {
          warnings.push(reason);
          return {};
        },
        fail: (reason) => {
          throw new Error(reason);
        },
      });
      expect(warnings).toEqual([]);
      expect(image.name).toBe('Video');
      expect(attributeValue(image, 'loop')).toBe(true);
      expect(attributeValue(image, 'alt')).toBe('A spinner');
      const imports = (tree.children ?? []).filter((node) => node.type === 'mdxjsEsm');
      expect(imports.map((node) => node.value)).toEqual([
        expect.stringMatching(/\.webm"$/u),
        expect.stringMatching(/\.png"$/u),
      ]);
    },
    CONVERT_TIMEOUT_MS,
  );
});

describe('what ffmpeg is given', () => {
  it('keeps a .gif that is not a GIF and never runs ffmpeg on it', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-gif-'));
    const fake = path.join(root, 'notes.gif');
    fs.writeFileSync(fake, '#EXTM3U\n#EXTINF:1,\nfile:///etc/passwd\n');
    const result = await runKitEffect(convertGif(fake, root));
    expect(result).toEqual({
      reason: `${fake} is not a GIF (it does not start with GIF87a or GIF89a).`,
    });
    expect(fs.existsSync(path.join(root, GIF_CACHE_DIR))).toBe(false);
  });

  it('recognises a GIF by its magic bytes', () => {
    expect(isGif(new TextEncoder().encode('GIF89a\u0001\u0000'))).toBe(true);
    expect(isGif(new TextEncoder().encode('GIF87a'))).toBe(true);
    expect(isGif(new TextEncoder().encode('#EXTM3U'))).toBe(false);
    expect(isGif(new TextEncoder().encode('GIF8'))).toBe(false);
  });

  it('forces the GIF demuxer and the file protocol for every run', () => {
    const steps = conversionSteps('/deck/a.gif', '/c/v.webm', '/c/p.png');
    expect(steps).toHaveLength(2);
    for (const args of steps) {
      const input = args.indexOf('-i');
      expect(args.slice(input - 4, input + 2)).toEqual([
        '-protocol_whitelist',
        'file',
        '-f',
        'gif',
        '-i',
        'file:/deck/a.gif',
      ]);
    }
  });

  it('names temporary files with a random suffix, not the process id', () => {
    const target = { video: '/c/h.webm', poster: '/c/h.png' };
    const first = temporaryPaths(target);
    const second = temporaryPaths(target);
    expect(first.video).not.toBe(second.video);
    expect(first.video).not.toContain(String(process.pid));
    expect(first.video.startsWith('/c/h.webm.')).toBe(true);
    expect(first.poster.endsWith('.png')).toBe(true);
  });
});
