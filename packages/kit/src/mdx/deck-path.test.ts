import fs from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vite-plus/test';

import { deckFolder } from '#mdx/deck-folder.fixture.ts';
import { resolveDeckPath, type DeckPath, type FileKind } from '#mdx/deck-path.ts';
import { runKitEffect } from '#mdx/node-runtime.ts';

describe('resolveDeckPath', () => {
  const folder = deckFolder();
  afterAll(folder.cleanup);
  /**
   * Resolves a path written in the fixture's slide.
   *
   * @param source - The path as written.
   * @param kind - The kind of file.
   */
  const resolve = (source: string, kind: FileKind = 'image'): Promise<DeckPath> =>
    runKitEffect(resolveDeckPath({ source, slideFile: folder.slide, deckDir: folder.deck, kind }));
  const real = (file: string): string => fs.realpathSync(path.join(folder.deck, file));

  it('resolves a bare path from the deck folder, importing it from the slide', async () => {
    expect(await resolve('assets/dana.svg')).toEqual({
      type: 'local',
      file: real('assets/dana.svg'),
      specifier: '../assets/dana.svg',
    });
  });

  it('resolves ./ and ../ from the slide file, as written', async () => {
    expect(await resolve('../assets/dana.svg')).toMatchObject({
      type: 'local',
      specifier: '../assets/dana.svg',
    });
    expect(await resolve('./dana.svg')).toEqual({
      type: 'missing',
      looked: path.join(folder.deck, 'slides', 'dana.svg'),
      base: 'slide',
    });
  });

  it("resolves a / path in the deck's public folder", async () => {
    expect(await resolve('/logo.svg')).toEqual({ type: 'public', file: real('public/logo.svg') });
    expect(await resolve('/Users/someone/photo.jpg')).toMatchObject({
      type: 'missing',
      base: 'public',
    });
  });

  it('rejects a path that leaves the deck, naming where it goes', async () => {
    const escape = await resolve('../../secret.png');
    expect(escape).toMatchObject({ type: 'rejected' });
    expect(escape.type === 'rejected' && escape.reason).toContain(
      `resolves to ${folder.outside}, outside the deck folder`,
    );
    expect(await resolve('assets/../../secret.png')).toMatchObject({ type: 'rejected' });
    expect(await resolve('/../deck.config.ts')).toMatchObject({ type: 'rejected' });
  });

  it('rejects a link inside the deck to a file outside it', async () => {
    const linked = await resolve('assets/linked.png');
    expect(linked.type === 'rejected' && linked.reason).toBe(
      `is a link to ${fs.realpathSync(folder.outside)}, outside the deck folder.`,
    );
  });

  it('rejects a file of the wrong kind, and a folder', async () => {
    const pdf = await resolve('assets/notes.pdf');
    expect(pdf.type === 'rejected' && pdf.reason).toBe(
      'is not an image (.pdf); an image is one of .svg, .png, .jpg, .jpeg, .webp, .avif, .gif.',
    );
    expect(await resolve('assets/clip.webm', 'video')).toMatchObject({ type: 'local' });
    expect(await resolve('assets/clip.webm')).toMatchObject({ type: 'rejected' });
    fs.mkdirSync(path.join(folder.deck, 'assets', 'folder.png'));
    expect(await resolve('assets/folder.png')).toMatchObject({ type: 'rejected' });
  });

  it('returns URLs as such', async () => {
    expect(await resolve('https://example.com/a.png')).toEqual({ type: 'url', scheme: 'https' });
    expect(await resolve('//example.com/a.png')).toEqual({ type: 'url', scheme: '' });
    expect(await resolve('data:image/png;base64,AAAA')).toEqual({ type: 'url', scheme: 'data' });
  });
});
