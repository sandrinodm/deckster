import { loadBrand } from '@deckster/brand/node';
import { NodeFileSystem } from '@effect/platform-node';
import { layer } from '@effect/vitest';
import { Effect } from 'effect';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { deflateSync } from 'node:zlib';
import { describe, expect, it as plainIt } from 'vite-plus/test';

import { readFontFile } from '#fonts/font-file.ts';
import { fontContainer, readSfnt, view, woffToSfnt } from '#fonts/sfnt.ts';

/**
 * The repository root, where the brands live.
 */
const WORKSPACE_ROOT = path.resolve(import.meta.dirname, '../../../..');

/**
 * How many corrupted variants each fuzz run tries.
 */
const FUZZ_ROUNDS = 400;

/**
 * Packs an sfnt font into a WOFF 1.0 file, compressing every table that gets smaller.
 *
 * @param sfnt - The font bytes.
 */
function toWoff(sfnt: Uint8Array): Uint8Array {
  const font = readSfnt(sfnt);
  if (typeof font === 'string') {
    throw new Error(font);
  }

  const entries = font.tables.map((table) => {
    const packed = new Uint8Array(deflateSync(table.data));
    return {
      tag: table.tag,
      original: table.data.length,
      data: packed.length < table.data.length ? packed : table.data,
    };
  });
  let offset = 44 + entries.length * 20;
  const placed = entries.map((entry) => {
    const start = offset;
    offset += Math.ceil(entry.data.length / 4) * 4;
    return { ...entry, start };
  });
  const bytes = new Uint8Array(offset);
  const data = view(bytes);
  data.setUint32(0, 0x77_4f_46_46);
  data.setUint32(4, font.version);
  data.setUint32(8, offset);
  data.setUint16(12, entries.length);
  for (const [index, entry] of placed.entries()) {
    const record = 44 + index * 20;
    for (let character = 0; character < 4; character += 1) {
      data.setUint8(record + character, entry.tag.charCodeAt(character));
    }

    data.setUint32(record + 4, entry.start);
    data.setUint32(record + 8, entry.data.length);
    data.setUint32(record + 12, entry.original);
    bytes.set(entry.data, entry.start);
  }

  return bytes;
}

/**
 * A deterministic pseudo-random generator.
 *
 * @param seed - The start value.
 */
function random(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296;
    return state / 4_294_967_296;
  };
}

layer(NodeFileSystem.layer)('woffToSfnt', (it) => {
  /**
   * A real brand font as a sfnt and as WOFF 1.0.
   */
  const realFont = Effect.gen(function* () {
    const brand = yield* loadBrand(WORKSPACE_ROOT, 'default');
    const face = brand.fontFaces[0];
    const sfnt = yield* readFontFile(face?.url ?? '');
    return { sfnt, woff: toWoff(sfnt) };
  });

  it.effect('round-trips a real font through WOFF 1.0', () =>
    Effect.gen(function* () {
      const { sfnt, woff } = yield* realFont;
      const back = woffToSfnt(woff);
      expect(typeof back).not.toBe('string');
      const original = readSfnt(sfnt);
      const restored = typeof back === 'string' ? back : readSfnt(back);
      expect(typeof original === 'string' || typeof restored === 'string').toBe(false);
      if (typeof original !== 'string' && typeof restored !== 'string') {
        expect(restored.tables.map((table) => table.tag).sort()).toEqual(
          original.tables.map((table) => table.tag).sort(),
        );
      }
    }),
  );

  it.effect(
    'returns a sentence or a font for truncated and bit-flipped WOFF files, never a throw',
    () =>
      Effect.gen(function* () {
        const { woff } = yield* realFont;
        const next = random(11);
        for (let round = 0; round < FUZZ_ROUNDS; round += 1) {
          const copy = woff.slice(
            0,
            round % 2 === 0 ? Math.floor(next() * woff.length) : woff.length,
          );
          const flips = 1 + Math.floor(next() * 8);
          for (let flip = 0; flip < flips && copy.length > 0; flip += 1) {
            // Aim half of the flips at the header and table directory, where the lengths live.
            const limit = flip % 2 === 0 ? Math.min(copy.length, 44 + 20 * 40) : copy.length;
            const at = Math.floor(next() * limit);
            copy[at] = (copy[at] ?? 0) ^ (1 << Math.floor(next() * 8));
          }

          const result = woffToSfnt(copy);
          expect(typeof result === 'string' || result instanceof Uint8Array).toBe(true);
        }
      }),
    60_000,
  );

  it.effect(
    'fails with an error naming the file for a corrupt WOFF, a stub and a bad WOFF 2.0',
    () =>
      Effect.gen(function* () {
        const { woff } = yield* realFont;
        const folder = mkdtempSync(path.join(os.tmpdir(), 'deck-fonts-'));
        const files: Record<string, Uint8Array> = {
          'cut.woff': woff.slice(0, 100),
          'stub.woff': new Uint8Array([0x77, 0x4f, 0x46, 0x46, 0, 0]),
          'bad.woff2': new Uint8Array([0x77, 0x4f, 0x46, 0x32, 1, 2, 3, 4, 5, 6, 7, 8]),
        };
        for (const [name, data] of Object.entries(files)) {
          const file = path.join(folder, name);
          writeFileSync(file, data);
          const error = yield* Effect.flip(readFontFile(file));
          expect(error._tag).toBe('ExportError');
          expect(error.message).toContain(name);
        }
      }),
  );
});

describe('woffToSfnt bounds', () => {
  plainIt(
    'refuses a table that claims to inflate to more than the cap, without inflating it',
    () => {
      const bytes = new Uint8Array(44 + 20 + 8);
      const data = view(bytes);
      data.setUint32(0, 0x77_4f_46_46);
      data.setUint32(4, 0x00_01_00_00);
      data.setUint16(12, 1);
      data.setUint32(44 + 4, 64);
      data.setUint32(44 + 8, 8);
      data.setUint32(44 + 12, 0xff_ff_ff_f0);
      expect(woffToSfnt(bytes)).toMatch(/too large|larger/);
    },
  );

  plainIt('refuses a table whose data lies outside the file', () => {
    const bytes = new Uint8Array(44 + 20);
    const data = view(bytes);
    data.setUint32(0, 0x77_4f_46_46);
    data.setUint16(12, 1);
    data.setUint32(44 + 4, 1000);
    data.setUint32(44 + 8, 10);
    data.setUint32(44 + 12, 10);
    expect(woffToSfnt(bytes)).toMatch(/past the end/);
  });

  plainIt('does not throw on a file shorter than a signature', () => {
    expect(fontContainer(new Uint8Array([1, 2]))).toBe('sfnt');
  });
});
