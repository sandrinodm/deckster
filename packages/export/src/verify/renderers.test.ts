import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import path from 'node:path';
import { describe, expect, it } from 'vite-plus/test';

import { bindMount } from '#verify/docker-image.ts';
import {
  libreOfficeLabel,
  libreOfficeRunArgs,
  macFontLabel,
  stagedFontName,
  withoutEmbeddedFonts,
} from '#verify/renderers.ts';

describe('withoutEmbeddedFonts', () => {
  it('removes the embedded font list and keeps everything else', () => {
    const presentation =
      '<p:presentation><p:sldSz cx="1"/><p:embeddedFontLst><p:embeddedFont><p:font typeface="Inter Deck"/></p:embeddedFont></p:embeddedFontLst><p:defaultTextStyle/></p:presentation>';
    const pptx = zipSync({
      'ppt/presentation.xml': strToU8(presentation),
      'ppt/fonts/font1.fntdata': new Uint8Array([1, 2, 3]),
    });
    const files = unzipSync(withoutEmbeddedFonts(pptx));
    expect(strFromU8(files['ppt/presentation.xml'] ?? new Uint8Array())).toBe(
      '<p:presentation><p:sldSz cx="1"/><p:defaultTextStyle/></p:presentation>',
    );
    expect(files['ppt/fonts/font1.fntdata']).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('returns a presentation without embedded fonts unchanged', () => {
    const pptx = zipSync({ 'ppt/presentation.xml': strToU8('<p:presentation/>') });
    expect(withoutEmbeddedFonts(pptx)).toBe(pptx);
  });
});

describe('stagedFontName', () => {
  it('keeps a family name that is a path from leaving the fonts folder', () => {
    const name = stagedFontName('../../../../x', 3, '/fonts/inter.ttf');
    expect(name).not.toMatch(/[/\\]/);
    expect(path.join('/work/fonts', name).startsWith('/work/fonts/')).toBe(true);
    expect(path.dirname(path.join('/work/fonts', name))).toBe('/work/fonts');
  });

  it('keeps the family the renderer installs the font under, and the index and extension', () => {
    expect(stagedFontName('Inter Deck', 0, '/x/inter.woff2')).toBe('Inter Deck__0.woff2');
    expect(stagedFontName('A__B\\C', 1, '/x/a.TTF; rm -rf')).toBe('A_B_C__1.ttf');
    expect(stagedFontName('', 2, '/x/a.otf')).toBe('font__2.otf');
  });
});

describe('bindMount', () => {
  it('writes a mount that a path with a colon or comma cannot break', () => {
    expect(bindMount('/work/deck', '/deck', true)).toBe(
      'type=bind,source=/work/deck,target=/deck,readonly',
    );
    expect(bindMount('/Users/a:b/out', '/work', false)).toBe(
      'type=bind,source=/Users/a:b/out,target=/work',
    );
    expect(bindMount('/Users/a,b/"x"/out', '/work', false)).toBe(
      'type=bind,"source=/Users/a,b/""x""/out",target=/work',
    );
  });
});

describe('libreOfficeRunArgs', () => {
  it('mounts the folders with --mount rather than -v', () => {
    const args = libreOfficeRunArgs(
      'libreoffice',
      {
        workDir: '/o/a:b',
        fontsDir: '/o/a:b/fonts',
        outDir: '/o/a:b/pages',
        deckDir: '/o/a:b/deck',
        deckName: 'x.pptx',
      },
      'img:1',
    );
    expect(args).toContain('--network=none');
    expect(args).not.toContain('-v');
    expect(args.filter((arg) => arg.startsWith('type=bind'))).toHaveLength(3);
    expect(args.slice(-4)).toEqual(['img:1', '/deck/x.pptx', '/work/pages', '144']);
  });
});

describe('renderer labels', () => {
  it('says which fonts each LibreOffice pass had', () => {
    const fonts = [
      { family: 'Inter Deck', file: '/x/inter-400.ttf' },
      { family: 'Inter Deck', file: '/x/inter-600.ttf' },
    ];
    expect(libreOfficeLabel('libreoffice', fonts)).toContain('fonts installed: Inter Deck');
    expect(libreOfficeLabel('libreoffice-nofonts', fonts)).toContain(
      'brand fonts not installed and embedded fonts removed',
    );
  });

  it('says which of the presentation fonts this Mac has', () => {
    expect(
      macFontLabel(['Inter', 'Fraunces'], ['inter-variablefont_opsz,wght.ttf', 'helvetica.ttc']),
    ).toBe('installed on this Mac: Inter; not installed: Fraunces');
    expect(macFontLabel(['Fraunces'], [])).toBe(
      "none of the presentation's fonts installed on this Mac",
    );
  });
});
