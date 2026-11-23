import kitMdx from '@deckster/kit/mdx';
import { Effect } from 'effect';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vite-plus/test';

import { compileMdx, type MdxWarning } from '#slides/compile-mdx.ts';

/**
 * A remark plugin that fails like the kit's diagram checks: with source `deck` and its own fix as
 * the message's note.
 */
function failingPlugin(): (tree: unknown, file: { fail: (...args: unknown[]) => never }) => void {
  return (_tree, file) => {
    try {
      file.fail('<Edge route="zigzag"> is not a route.', { ruleId: 'diagram', source: 'deck' });
    } catch (error) {
      Object.assign(error as object, { note: 'Use one of: orthogonal, straight, curved.' });
      throw error;
    }
  };
}

describe('compileMdx', () => {
  it("reports a deck plugin's error with the plugin's fix, not the JSX syntax fix", async () => {
    const error = await Effect.runPromise(
      compileMdx(
        'Text',
        { file: '/workspace/decks/demo/slides/a.mdx', displayPath: 'decks/demo/slides/a.mdx' },
        { development: false, extensions: { remarkPlugins: [failingPlugin] } },
      ),
    ).catch((caught: unknown) => caught);
    expect(String(error)).toContain('<Edge route="zigzag"> is not a route.');
    expect(String(error)).toContain('Fix: Use one of: orthogonal, straight, curved.');
    expect(String(error)).not.toContain('Close every JSX tag');
  });
});

describe('compileMdx with the kit extension', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'deck-compile-'));
  const deckDir = path.join(root, 'decks', 'demo');
  fs.mkdirSync(path.join(deckDir, 'slides'), { recursive: true });
  fs.mkdirSync(path.join(deckDir, 'assets'));
  fs.writeFileSync(
    path.join(deckDir, 'assets', 'dana.svg'),
    '<svg xmlns="http://www.w3.org/2000/svg"/>',
  );
  afterAll(() => fs.rmSync(root, { recursive: true, force: true }));
  const ref = {
    file: path.join(deckDir, 'slides', 'a.mdx'),
    displayPath: 'decks/demo/slides/a.mdx',
  };
  const extensions = kitMdx.plugins({
    workspaceRoot: root,
    deckDir,
    brand: {
      name: 'default',
      icons: { set: 'lucide', strokeWidth: 2 },
      treatments: ['rounded', 'plain'],
    },
  });
  /**
   * Compiles a slide with the kit's plugins and gives its code, or the error as text.
   *
   * @param body - The MDX.
   * @param frontmatter - The slide's frontmatter.
   * @param warnings - Where warnings are collected.
   */
  const compileSlide = (
    body: string,
    frontmatter: Record<string, unknown>,
    warnings: MdxWarning[] = [],
  ): Promise<string> =>
    Effect.runPromise(
      compileMdx(body, ref, {
        development: false,
        frontmatter,
        extensions,
        onWarning: (_text, warning) => warnings.push(warning),
      }),
    ).then(
      (compiled) => compiled.code,
      (caught: unknown) => String(caught),
    );

  it("reports an unknown icon with the set's closest names as the fix", async () => {
    const frontmatter = await compileSlide('Text', { cards: [{ icon: 'rockt' }] });
    expect(frontmatter).toContain('`cards[0].icon: rockt` is not an icon of the lucide set.');
    expect(frontmatter).toContain('Fix: Closest names in the lucide set: rocket');
    expect(frontmatter).not.toContain('Close every JSX tag');
    const element = await compileSlide('<Icon name="rockt" />', {});
    expect(element).toContain('<Icon name="rockt"> is not an icon of the lucide set.');
    expect(element).toContain('Fix: Closest names in the lucide set: rocket');
    expect(element).not.toContain('Close every JSX tag');
  });

  it('resolves an <Icon> written in a prop, and reports an unknown one there too', async () => {
    const code = await compileSlide(
      '<LinkCard href="https://example.com" title="Docs" icon={<Icon name="book" />} />',
      {},
    );
    expect(code).toContain('"~icons/lucide/book"');
    expect(code).toMatch(/icon: kitIcon0\b/);
    const unknown = await compileSlide(
      '<LinkCard href="https://example.com" title="Docs" icon={<Icon name="bok" />} />',
      {},
    );
    expect(unknown).toContain('<Icon name="bok"> is not an icon of the lucide set.');
    expect(unknown).toContain('Fix: Closest names in the lucide set: book');
  });

  it('imports a bare frontmatter path from the deck folder, and reports a missing one for deckster lint', async () => {
    const code = await compileSlide('Text', { members: [{ photo: 'assets/dana.svg' }] });
    expect(code).toContain('"../assets/dana.svg"');
    expect(code).toContain('"asset:assets/dana.svg"');
    const warnings: MdxWarning[] = [];
    await compileSlide('Text', { members: [{ photo: 'assets/nobody.jpg' }] }, warnings);
    expect(warnings).toEqual([
      expect.objectContaining({
        ruleId: 'media-missing',
        reason: expect.stringContaining('`members[0].photo: assets/nobody.jpg` does not exist'),
      }),
    ]);
  });

  it('fails a frontmatter path out of the deck with its own fix', async () => {
    const error = await compileSlide('Text', { members: [{ photo: '../../../secret.png' }] });
    expect(error).toContain('`members[0].photo: ../../../secret.png` resolves to');
    expect(error).toContain(
      "Fix: A slide can only use files inside its deck. Copy the file into the deck's assets/",
    );
  });
});
