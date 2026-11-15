import { loadBrand, type LoadedBrand } from '@deckster/brand/node';
import { NodeFileSystem } from '@effect/platform-node';
import { describe, expect, it, layer } from '@effect/vitest';
import { Effect } from 'effect';
import { create, type Font } from 'fontkit';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { FontUse } from '#fonts/font-uses.ts';

import { fntdata, readEotHeader, EOT_MAGIC } from '#fonts/eot.ts';
import { readFontFile } from '#fonts/font-file.ts';
import { familyName, instanceFonts, MAX_FAMILY_NAME } from '#fonts/font-plan.ts';
import { fontFacts, OS2 } from '#fonts/instance-tables.ts';
import { NAME_ID, readNames } from '#fonts/name-table.ts';
import { readSfnt, sfntTable, view, withTable, writeSfnt } from '#fonts/sfnt.ts';

/**
 * The repository root, where the brands live.
 */
const WORKSPACE_ROOT = path.resolve(import.meta.dirname, '../../../..');

/**
 * Text set in the deck's headline and body.
 */
const TEXT = 'Shade is infrastructure, AVATAR Tower 0123456789';

/**
 * The default brand's headline step and body text in two weights, as runs report them.
 */
const USES: FontUse[] = [
  {
    family: 'Bricolage Grotesque',
    weight: 620,
    italic: false,
    axes: { wght: 620, opsz: 72, wdth: 94 },
    size: 80,
    text: TEXT,
  },
  { family: 'Inter', weight: 400, italic: false, axes: { wght: 400 }, size: 36, text: TEXT },
  { family: 'Inter', weight: 600, italic: false, axes: { wght: 600 }, size: 36, text: 'Bold' },
];

/**
 * A font of an instance, parsed.
 *
 * @param data - The TrueType bytes.
 */
function parse(data: Uint8Array): Font {
  return create(Buffer.from(data)) as Font;
}

layer(NodeFileSystem.layer)('instanceFonts', (it) => {
  /**
   * The default brand, loaded once.
   */
  const brand = (): Effect.Effect<LoadedBrand, unknown, never> =>
    loadBrand(WORKSPACE_ROOT, 'default').pipe(Effect.provide(NodeFileSystem.layer));

  it.effect(
    'cuts static instances at the exact axes, named and paired as regular and bold',
    () =>
      Effect.gen(function* () {
        const loaded = yield* brand();
        const plan = yield* instanceFonts(USES, loaded.fontFaces, loaded.tokens);
        const names = plan.families.map((family) => family.typeface);
        expect(names).toEqual(['Bricolage Deck Headline', 'Inter Deck Body']);
        const inter = plan.families.find((family) => family.typeface === 'Inter Deck Body');
        expect(inter?.slots.regular?.weight).toBe(400);
        expect(inter?.slots.bold?.weight).toBe(600);
        for (const instance of plan.instances) {
          expect(instance.familyName.length).toBeLessThanOrEqual(MAX_FAMILY_NAME);
          const font = parse(instance.data);
          expect(Object.keys(font.variationAxes)).toEqual([]);
          const sfnt = readSfnt(instance.data);
          expect(typeof sfnt).not.toBe('string');
          if (typeof sfnt === 'string') {
            return;
          }

          const records = readNames(sfntTable(sfnt, 'name') ?? new Uint8Array());
          const family = records.find((record) => record.nameId === NAME_ID.family)?.value;
          expect(family).toBe(instance.familyName);
          const os2 = view(sfntTable(sfnt, 'OS/2') ?? new Uint8Array(64));
          const bold = instance.slot === 'bold';
          expect(os2.getUint16(OS2.weightClass)).toBe(bold ? 700 : 400);
          expect(os2.getUint16(OS2.fsSelection) & 0x61).toBe(bold ? 0x20 : 0x40);
        }
      }),
    60_000,
  );

  it.effect(
    'keeps the advances the browser lays out with at those axes',
    () =>
      Effect.gen(function* () {
        const loaded = yield* brand();
        const plan = yield* instanceFonts(USES.slice(0, 1), loaded.fontFaces, loaded.tokens);
        const instance = plan.instances[0];
        const face = loaded.fontFaces.find((candidate) => candidate.url === instance?.source);
        const source = parse(yield* readFontFile(face?.url ?? '')).getVariation({
          wght: 620,
          opsz: 72,
          wdth: 94,
        });
        const cut = parse(instance?.data ?? new Uint8Array());
        for (const character of 'HAWamo1 ') {
          const codePoint = character.codePointAt(0) ?? 0;
          expect(cut.glyphForCodePoint(codePoint).advanceWidth).toBeCloseTo(
            source.glyphForCodePoint(codePoint).advanceWidth,
            -0.5,
          );
        }

        expect(cut.layout('AVATAR Tower').advanceWidth).toBeCloseTo(
          source.layout('AVATAR Tower').advanceWidth,
          -1,
        );
      }),
    60_000,
  );

  it.effect(
    'resolves runs to the embedded typeface and leaves other families to their substitute',
    () =>
      Effect.gen(function* () {
        const loaded = yield* brand();
        const plan = yield* instanceFonts(USES, loaded.fontFaces, loaded.tokens);
        const bold = plan.resolve({ ...USES[2], family: 'Inter' } as FontUse, 'Bold');
        expect(bold).toMatchObject({ typeface: 'Inter Deck Body', bold: true, italic: false });
        expect(bold?.panose).toMatch(/^[0-9A-F]{20}$/);
        expect(bold?.pitchFamily).toBe(34);
        expect(plan.resolve({ ...USES[1], family: 'Helvetica' } as FontUse)).toBeNull();
        expect(plan.resolve(USES[1] as FontUse, '漢字')).toBeNull();
        expect(plan.substituteFor('Inter')?.family).toBe('Arial');
        expect(plan.substituteFor('JetBrains Mono')?.pitchFamily).toBe(49);
      }),
    60_000,
  );

  it.effect(
    'wraps an instance in an EOT header PowerPoint reads',
    () =>
      Effect.gen(function* () {
        const loaded = yield* brand();
        const plan = yield* instanceFonts(USES.slice(1, 2), loaded.fontFaces, loaded.tokens);
        const instance = plan.instances[0];
        const eot = fntdata(instance?.data ?? new Uint8Array());
        const header = readEotHeader(eot);
        expect(typeof header).not.toBe('string');
        if (typeof header === 'string') {
          return;
        }

        expect(header.magic).toBe(EOT_MAGIC);
        expect(header.version).toBe(0x00_02_00_02);
        expect(header.flags).toBe(1);
        expect(header.eotSize).toBe(eot.length);
        expect(header.fontDataSize).toBe(instance?.data.length);
        expect(header.fontDataOffset + header.fontDataSize).toBe(eot.length);
        expect(header.familyName).toBe('Inter Deck Body');
        expect(header.styleName).toBe('Regular');
        expect(header.fullName).toBe('Inter Deck Body');
        expect(header.weight).toBe(400);
        const own = readSfnt(instance?.data ?? new Uint8Array());
        expect(header.panose).toBe(typeof own === 'string' ? own : fontFacts(own).panose);
        expect(eot.slice(header.fontDataOffset)).toEqual(instance?.data);
      }),
    60_000,
  );

  it.effect(
    'refuses a font whose license restricts embedding',
    () =>
      Effect.gen(function* () {
        const loaded = yield* brand();
        const face = loaded.fontFaces.find((candidate) => candidate.family === 'Inter');
        const sfnt = readSfnt(yield* readFontFile(face?.url ?? ''));
        expect(typeof sfnt).not.toBe('string');
        if (typeof sfnt === 'string') {
          return;
        }

        const os2 = (sfntTable(sfnt, 'OS/2') ?? new Uint8Array()).slice();
        view(os2).setUint16(OS2.fsType, 0x0002);
        const file = path.join(mkdtempSync(path.join(os.tmpdir(), 'deck-font-')), 'inter.ttf');
        writeFileSync(file, writeSfnt(withTable(sfnt, 'OS/2', os2)));
        expect(fontFacts(readSfnt(writeSfnt(withTable(sfnt, 'OS/2', os2))) as never).fsType).toBe(
          2,
        );
        const error = yield* Effect.flip(
          instanceFonts(
            USES.slice(1, 2),
            [
              {
                family: 'Inter',
                url: file,
                weight: [100, 900],
                style: 'normal',
                unicodeRange: undefined,
              },
            ],
            loaded.tokens,
          ),
        );
        expect(error.message).toContain('does not allow embedding');
        expect(error.message).toContain('--no-embed-fonts');
      }),
    60_000,
  );
});

describe('familyName', () => {
  it('shortens a long family to its first word and stays within 31 characters', () => {
    expect(familyName('Inter', 'Body')).toBe('Inter Deck Body');
    expect(familyName('Bricolage Grotesque', 'Headline')).toBe('Bricolage Deck Headline');
    expect(familyName('Extraordinarily Long Family', 'W450 O24 S90').length).toBeLessThanOrEqual(
      MAX_FAMILY_NAME,
    );
  });
});
