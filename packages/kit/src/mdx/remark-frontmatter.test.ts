import { Predicate } from 'effect';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vite-plus/test';

import type { MdastNode } from '#mdx/mdast.ts';

import {
  frontmatterAsset,
  frontmatterIcon,
  registerFrontmatterAssets,
} from '#foundation/frontmatter-assets.ts';
import { initialsOf } from '#foundation/initials.ts';
import { deckFolder } from '#mdx/deck-folder.fixture.ts';
import { remarkKitFrontmatter, type FrontmatterFile } from '#mdx/remark-frontmatter.ts';

/**
 * A warning a fake vfile recorded.
 */
type Recorded = { reason: string; origin: string | undefined; note?: string };

/**
 * A vfile for one slide with its frontmatter, recording warnings and throwing failures.
 *
 * @param slide - The slide's path.
 * @param frontmatter - The slide's frontmatter.
 * @param warnings - Where warnings are collected.
 */
function slideFile(slide: string, frontmatter: unknown, warnings: Recorded[]): FrontmatterFile {
  return {
    path: slide,
    data: { frontmatter },
    message: (reason, _place, origin) => {
      const recorded: Recorded = { reason, origin };
      warnings.push(recorded);
      return recorded;
    },
    fail: (reason, place) => {
      throw Object.assign(new Error(reason), {
        source: Predicate.isObject(place) ? Reflect.get(place, 'source') : undefined,
      });
    },
  };
}

/**
 * The build failure a run ends with: its message, the fix the plugin attached and its source.
 *
 * @param running - The plugin's run.
 */
async function failureOf(
  running: Promise<unknown>,
): Promise<{ message: string; fix: string | undefined; source: unknown }> {
  try {
    await running;
  } catch (error) {
    return {
      message: error instanceof Error ? error.message : String(error),
      fix: (error as { note?: string }).note,
      source: (error as { source?: unknown }).source,
    };
  }

  throw new Error('The plugin did not fail.');
}

describe('remarkKitFrontmatter', () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-frontmatter-'));
  fs.writeFileSync(path.join(folder, 'dana.svg'), '<svg xmlns="http://www.w3.org/2000/svg" />');
  const slide = path.join(folder, 'slide.mdx');
  const plugin = remarkKitFrontmatter({ set: 'lucide', deckDir: folder });

  it('imports the icons and files layout fields name and registers them for the layout', async () => {
    const root: MdastNode = { type: 'root', children: [] };
    const frontmatter = {
      cards: [{ icon: 'leaf' }, { icon: 'tabler:trees' }],
      members: [{ photo: './dana.svg' }, { photo: 'data:image/svg+xml,%3Csvg%2F%3E' }],
    };
    await plugin(root, slideFile(slide, frontmatter, []));
    const code = (root.children ?? []).map((node) => node.value).join('\n');
    expect(code).toContain('~icons/lucide/leaf');
    expect(code).toContain('~icons/tabler/trees');
    expect(code).toContain('"./dana.svg"');
    expect(code).not.toContain('data:image');
    expect(code).toContain('"icon:lucide/leaf": kitFrontmatter0');
    expect(code).toContain('export const kitFrontmatterAssets');
  });

  it("fails the build for an icon the set does not have, with the set's closest names", async () => {
    const root: MdastNode = { type: 'root', children: [] };
    const failure = await failureOf(
      plugin(root, slideFile(slide, { cards: [{}, { icon: 'rockt' }] }, [])),
    );
    expect(failure.message).toBe('`cards[1].icon: rockt` is not an icon of the lucide set.');
    expect(failure.fix).toMatch(/^Closest names in the lucide set: rocket\b/u);
    expect(failure.source).toBe('deck');
    const far = await failureOf(
      plugin(root, slideFile(slide, { cards: [{ icon: 'nonexistent' }] }, [])),
    );
    expect(far.message).toBe('`cards[0].icon: nonexistent` is not an icon of the lucide set.');
    expect(far.fix).toContain('https://icon-sets.iconify.design/lucide/');
  });

  it('warns about a missing file and adds nothing for it', async () => {
    const root: MdastNode = { type: 'root', children: [] };
    const warnings: Recorded[] = [];
    await plugin(root, slideFile(slide, { members: [{ photo: './nobody.jpg' }] }, warnings));
    expect(warnings).toEqual([
      expect.objectContaining({
        origin: 'deck:media-missing',
        reason: expect.stringContaining('members[0].photo'),
      }),
    ]);
    expect(root.children).toEqual([]);
  });
});

describe('remarkKitFrontmatter paths', () => {
  const deck = deckFolder();
  afterAll(deck.cleanup);
  const plugin = remarkKitFrontmatter({ set: 'lucide', deckDir: deck.deck });
  /**
   * Runs the plugin on one team member's photo and gives the slide module's code.
   *
   * @param photo - The `photo:` value.
   * @param warnings - Where warnings are collected.
   */
  const run = async (photo: string, warnings: Recorded[] = []): Promise<string> => {
    const root: MdastNode = { type: 'root', children: [] };
    const frontmatter = { members: [{ name: 'A' }, { name: 'B' }, { name: 'Dana', photo }] };
    await plugin(root, slideFile(deck.slide, frontmatter, warnings));
    return (root.children ?? []).map((node) => node.value).join('\n');
  };

  it('resolves a bare path from the deck folder and registers it under the value as written', async () => {
    const code = await run('assets/dana.svg');
    expect(code).toContain('import kitFrontmatter0 from "../assets/dana.svg"');
    expect(code).toContain('"asset:assets/dana.svg": kitFrontmatter0');
    registerFrontmatterAssets({ 'asset:assets/dana.svg': '/assets/dana.123.svg' });
    expect(frontmatterAsset('assets/dana.svg')).toBe('/assets/dana.123.svg');
  });

  it('keeps ./ and ../ relative to the slide file', async () => {
    const code = await run('../assets/dana.svg');
    expect(code).toContain('import kitFrontmatter0 from "../assets/dana.svg"');
    expect(code).toContain('"asset:slides/slide.mdx::../assets/dana.svg": kitFrontmatter0');
  });

  it('keeps a file of the public folder as it is', async () => {
    expect(await run('/logo.svg')).toBe('');
  });

  it('fails the build for a path that leaves the deck, naming the field', async () => {
    const failure = await failureOf(run('../../etc/passwd'));
    expect(failure.message).toBe(
      `\`members[2].photo: ../../etc/passwd\` resolves to ${path.join(deck.root, 'etc', 'passwd')}, ` +
        `outside the deck folder (${deck.deck}).`,
    );
    expect(failure.fix).toContain('`assets/passwd`');
    expect(failure.source).toBe('deck');
  });

  it('fails the build for an absolute path', async () => {
    const failure = await failureOf(run('/Users/someone/dana.jpg'));
    expect(failure.message).toContain(
      "`members[2].photo: /Users/someone/dana.jpg` is an absolute path, and the deck's public/ " +
        'folder has no such file',
    );
    expect(failure.fix).toContain('`photo: assets/<file>`');
  });

  it('fails the build for a link inside the deck to a file outside it', async () => {
    const failure = await failureOf(run('assets/linked.png'));
    expect(failure.message).toContain('`members[2].photo: assets/linked.png` is a link to');
    expect(failure.message).toContain('outside the deck folder');
  });

  it('fails the build for a file that is not an image', async () => {
    const failure = await failureOf(run('assets/notes.pdf'));
    expect(failure.message).toBe(
      '`members[2].photo: assets/notes.pdf` is not an image (.pdf); an image is one of .svg, ' +
        '.png, .jpg, .jpeg, .webp, .avif, .gif.',
    );
  });

  it('fails the build for a web address, with the file to download', async () => {
    const failure = await failureOf(run('https://example.com/people/dana.jpg?size=2'));
    expect(failure.message).toBe(
      '`members[2].photo: https://example.com/people/dana.jpg?size=2` is a web address; a ' +
        'layout field takes a file in the deck.',
    );
    expect(failure.fix).toContain('`photo: assets/dana.jpg`');
    expect((await failureOf(run('data:text/html,<p>'))).message).toContain('is a data: URL');
  });

  it('keeps an inline image', async () => {
    const warnings: Recorded[] = [];
    expect(await run('data:image/svg+xml,%3Csvg%2F%3E', warnings)).toBe('');
    expect(warnings).toEqual([]);
  });

  it('warns media-missing for a missing file, with the rule in the fix', async () => {
    const warnings: Recorded[] = [];
    expect(await run('assets/nobody.jpg', warnings)).toBe('');
    expect(warnings).toEqual([
      {
        origin: 'deck:media-missing',
        reason:
          `\`members[2].photo: assets/nobody.jpg\` does not exist (looked for ` +
          `${path.join(deck.deck, 'assets', 'nobody.jpg')}).`,
        note: expect.stringContaining('which is from the deck folder'),
      },
    ]);
  });
});

describe('frontmatter assets at run time', () => {
  it('give the registered import, a web address as it is, and nothing for an unknown path', () => {
    registerFrontmatterAssets({ 'asset:../assets/a.svg': '/assets/a.123.svg' });
    expect(frontmatterAsset('../assets/a.svg')).toBe('/assets/a.123.svg');
    expect(frontmatterAsset('https://example.com/a.png')).toBe('https://example.com/a.png');
    expect(frontmatterAsset('/logos/a.svg')).toBe('/logos/a.svg');
    expect(frontmatterAsset('../assets/missing.svg')).toBeUndefined();
    expect(frontmatterIcon('leaf', 'lucide')).toBeUndefined();
  });

  it('draw initials from the first and last name, without honorifics', () => {
    expect(initialsOf('Dana Okafor')).toBe('DO');
    expect(initialsOf('Dr. Amaka Bello')).toBe('AB');
    expect(initialsOf('Oluwaseun Adeyemi-Clarke')).toBe('OA');
    expect(initialsOf('Priya')).toBe('P');
  });
});
