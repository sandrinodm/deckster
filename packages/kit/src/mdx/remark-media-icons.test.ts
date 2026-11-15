import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vite-plus/test';

import type { MdastNode } from '#mdx/mdast.ts';

import { deckFolder } from '#mdx/deck-folder.fixture.ts';
import { attributeValue, jsxElement } from '#mdx/mdast.ts';
import { remarkKitIcons } from '#mdx/remark-icons.ts';
import { remarkKitMedia, type MediaFile } from '#mdx/remark-media.ts';

/**
 * A tree of flow elements with string attributes.
 *
 * @param name - The element name.
 * @param attributes - String attributes.
 */
function tree(name: string, attributes: Record<string, string>): MdastNode {
  const element = jsxElement(
    name,
    Object.entries(attributes).map(([key, value]) => ({
      type: 'mdxJsxAttribute',
      name: key,
      value,
    })),
  );
  return { type: 'root', children: [element] };
}

/**
 * A warning a fake vfile recorded: the reason, its origin and the fix the plugin set.
 */
type Recorded = { reason: string; origin: string | undefined; note?: string };

/**
 * A vfile for one slide that records warnings.
 *
 * @param slide - The slide's path.
 * @param warnings - Where warnings are collected.
 */
function mediaFile(slide: string, warnings: Recorded[]): MediaFile {
  return {
    path: slide,
    message: (reason, _place, origin) => {
      const recorded: Recorded = { reason, origin };
      warnings.push(recorded);
      return recorded;
    },
    fail: (reason) => {
      throw new Error(reason);
    },
  };
}

/**
 * The build failure a run ends with: its message and the fix the plugin attached.
 *
 * @param running - The plugin's run.
 */
async function failureOf(
  running: Promise<unknown> | (() => unknown),
): Promise<{ message: string; fix: string | undefined }> {
  try {
    await (typeof running === 'function' ? running() : running);
  } catch (error) {
    return {
      message: error instanceof Error ? error.message : String(error),
      fix: (error as { note?: string }).note,
    };
  }

  throw new Error('The plugin did not fail.');
}

describe('remarkKitMedia', () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-media-'));
  fs.writeFileSync(path.join(folder, 'a.jpg'), 'x');
  const slide = path.join(folder, 'slide.mdx');

  it('turns an existing relative path into an import', async () => {
    const root = tree('Image', { src: './a.jpg', alt: 'A' });
    const warnings: Recorded[] = [];
    await remarkKitMedia({ deckDir: folder })(root, mediaFile(slide, warnings));
    expect(root.children?.[0]?.type).toBe('mdxjsEsm');
    expect(root.children?.[0]?.value).toBe('import kitMedia0 from "./a.jpg"');
    expect(warnings).toEqual([]);
  });

  it('warns media-missing with the path it looked for and the fix, and keeps the string', async () => {
    const root = tree('Image', { src: './nope.jpg', alt: 'A' });
    const warnings: Recorded[] = [];
    await remarkKitMedia({ deckDir: folder })(root, mediaFile(slide, warnings));
    expect(warnings[0]?.reason).toContain('does not exist');
    expect(warnings[0]?.reason).toContain(path.join(folder, 'nope.jpg'));
    expect(warnings[0]?.origin).toBe('deck:media-missing');
    expect(warnings[0]?.note).toContain('relative to the slide file');
    const element = root.children?.[0];
    expect(element === undefined ? '' : attributeValue(element, 'src')).toBe('./nope.jpg');
  });

  it('warns media-gif for a GIF it cannot convert, and recommends video', async () => {
    const root = tree('Image', { src: 'https://example.com/a.gif', alt: 'A' });
    const warnings: Recorded[] = [];
    await remarkKitMedia({ deckDir: folder, workspaceRoot: folder })(
      root,
      mediaFile(slide, warnings),
    );
    expect(warnings[0]?.origin).toBe('deck:media-gif');
    expect(warnings[0]?.note).toContain('<Video loop');
  });

  it('keeps a local GIF as an image, with a warning, when conversion is off', async () => {
    fs.writeFileSync(path.join(folder, 'spin.gif'), 'GIF89a');
    const root = tree('Image', { src: './spin.gif', alt: 'A spinner' });
    const warnings: Recorded[] = [];
    await remarkKitMedia({ deckDir: folder, workspaceRoot: folder, convertGifs: false })(
      root,
      mediaFile(slide, warnings),
    );
    expect(warnings.map((warning) => warning.origin)).toEqual(['deck:media-gif']);
    expect(root.children?.[0]?.value).toBe('import kitMedia0 from "./spin.gif"');
    expect(root.children?.[1]?.name).toBe('Image');
  });

  it('imports a Lottie file as a URL', async () => {
    fs.writeFileSync(path.join(folder, 'a.json'), '{}');
    const root = tree('Lottie', { src: './a.json', alt: 'A' });
    await remarkKitMedia({ deckDir: folder })(root, mediaFile(slide, []));
    expect(root.children?.[0]?.value).toBe('import kitMedia0 from "./a.json?url"');
  });

  it('imports both the source and the poster of a video, and every poster of a cued one', async () => {
    fs.writeFileSync(path.join(folder, 'v.webm'), 'x');
    const root = tree('Video', { src: './v.webm', poster: './a.jpg', alt: 'A' });
    const element = root.children?.[0];
    element?.attributes?.push({
      type: 'mdxJsxAttribute',
      name: 'posters',
      value: {
        type: 'mdxJsxAttributeValueExpression',
        value: "['./a.jpg', './a.jpg']",
        data: {
          estree: {
            type: 'Program',
            body: [
              {
                type: 'ExpressionStatement',
                expression: {
                  type: 'ArrayExpression',
                  elements: [
                    { type: 'Literal', value: './a.jpg' },
                    { type: 'Literal', value: './a.jpg' },
                  ],
                },
              },
            ],
          },
        },
      },
    });
    await remarkKitMedia({ deckDir: folder })(root, mediaFile(slide, []));
    expect(root.children?.filter((node) => node.type === 'mdxjsEsm')).toHaveLength(4);
    const posters = root.children
      ?.find((node) => node.name === 'Video')
      ?.attributes?.find((attribute) => attribute.name === 'posters');
    expect(posters?.value).toMatchObject({ value: '[kitMedia2, kitMedia3]' });
  });

  it('turns a markdown image alone in its paragraph into a kit Image with an import', async () => {
    const image: MdastNode = { type: 'image', url: './a.jpg', alt: 'A street' };
    const root: MdastNode = { type: 'root', children: [{ type: 'paragraph', children: [image] }] };
    await remarkKitMedia({ deckDir: folder })(root, mediaFile(slide, []));
    expect(root.children?.[0]?.value).toBe('import kitMedia0 from "./a.jpg"');
    const element = root.children?.[1];
    expect(element?.type).toBe('mdxJsxFlowElement');
    expect(element?.name).toBe('Image');
    expect(element === undefined ? '' : attributeValue(element, 'alt')).toBe('A street');
  });

  it('resolves a markdown image inside running text as an inline img', async () => {
    const image: MdastNode = { type: 'image', url: './a.jpg', alt: 'icon' };
    const paragraph: MdastNode = {
      type: 'paragraph',
      children: [{ type: 'text', value: 'See ' }, image],
    };
    const root: MdastNode = { type: 'root', children: [paragraph] };
    await remarkKitMedia({ deckDir: folder })(root, mediaFile(slide, []));
    expect(paragraph.children?.[1]?.name).toBe('img');
    expect(paragraph.children?.[1]?.type).toBe('mdxJsxTextElement');
  });
});

describe('remarkKitMedia paths', () => {
  const folder = deckFolder();
  afterAll(folder.cleanup);
  /**
   * Runs the plugin on one element in the fixture deck's slide.
   *
   * @param name - The element.
   * @param attributes - Its string attributes.
   * @param warnings - Where warnings are collected.
   */
  const media = async (
    name: string,
    attributes: Record<string, string>,
    warnings: Recorded[] = [],
  ): Promise<MdastNode> => {
    const root = tree(name, attributes);
    await remarkKitMedia({ deckDir: folder.deck })(root, mediaFile(folder.slide, warnings));
    return root;
  };

  it('imports a bare path from the deck folder', async () => {
    const root = await media('Image', { src: 'assets/dana.svg', alt: 'Dana' });
    expect(root.children?.[0]?.value).toBe('import kitMedia0 from "../assets/dana.svg"');
  });

  it('imports an app frame poster and keeps a public path as it is', async () => {
    const warnings: Recorded[] = [];
    const root = await media('AppFrame', { app: 'demo', poster: '/logo.svg' }, warnings);
    expect(root.children?.[0]?.name).toBe('AppFrame');
    expect(warnings).toEqual([]);
    const missing = await media('AppFrame', { app: 'demo', poster: '/none.png' }, warnings);
    expect(missing.children?.[0]?.name).toBe('AppFrame');
    expect(warnings[0]?.origin).toBe('deck:media-missing');
    expect(warnings[0]?.note).toContain("in the deck's public/ folder");
  });

  it('fails the build for a path that leaves the deck, naming the attribute', async () => {
    const failure = await failureOf(media('Image', { src: '../../secret.png', alt: 'A' }));
    expect(failure.message).toBe(
      `<Image> src="../../secret.png" resolves to ${folder.outside}, outside the deck folder ` +
        `(${folder.deck}).`,
    );
    expect(failure.fix).toContain("Copy the file into the deck's assets/ folder");
  });

  it('fails the build for a link out of the deck', async () => {
    const failure = await failureOf(
      media('Video', { src: 'assets/clip.webm', poster: 'assets/linked.png' }),
    );
    expect(failure.message).toContain('<Video> poster="assets/linked.png" is a link to');
  });

  it('fails the build for a file of the wrong kind', async () => {
    expect((await failureOf(media('Video', { src: 'assets/dana.svg' }))).message).toContain(
      '<Video> src="assets/dana.svg" is not a video (.svg)',
    );
    expect((await failureOf(media('Lottie', { src: 'assets/notes.pdf' }))).message).toContain(
      'is not a Lottie animation (.pdf)',
    );
    expect(
      (
        await failureOf(
          media('AppFrame', { app: 'demo', poster: 'x.png', fallback: 'assets/dana.svg' }),
        )
      ).message,
    ).toContain('<AppFrame> fallback="assets/dana.svg" is not a video');
  });

  it('leaves a web address alone', async () => {
    const warnings: Recorded[] = [];
    const root = await media('Image', { src: 'https://example.com/a.png', alt: 'A' }, warnings);
    expect(root.children?.[0]?.name).toBe('Image');
    expect(warnings).toEqual([]);
  });
});

describe('remarkKitIcons', () => {
  const file = {
    fail: (reason: string): never => {
      throw new Error(reason);
    },
  };

  it('resolves a bare name in the brand set to an import, once per icon', () => {
    const root: MdastNode = {
      type: 'root',
      children: [
        jsxElement('Icon', [{ type: 'mdxJsxAttribute', name: 'name', value: 'rocket' }]),
        jsxElement('Icon', [{ type: 'mdxJsxAttribute', name: 'name', value: 'rocket' }]),
      ],
    };
    remarkKitIcons({ set: 'lucide' })(root, file);
    const imports = root.children?.filter((node) => node.type === 'mdxjsEsm') ?? [];
    expect(imports.map((node) => node.value)).toEqual([
      'import kitIcon0 from "~icons/lucide/rocket"',
    ]);
  });

  it('takes the set from set:name', () => {
    const root: MdastNode = {
      type: 'root',
      children: [
        jsxElement('Icon', [{ type: 'mdxJsxAttribute', name: 'name', value: 'tabler:rocket' }]),
      ],
    };
    remarkKitIcons({ set: 'lucide' })(root, file);
    expect(root.children?.[0]?.value).toBe('import kitIcon0 from "~icons/tabler/rocket"');
  });

  it("fails for an unknown icon with the set's closest names as the fix", async () => {
    const unknown: MdastNode = {
      type: 'root',
      children: [jsxElement('Icon', [{ type: 'mdxJsxAttribute', name: 'name', value: 'rocke' }])],
    };
    const failure = await failureOf(() => remarkKitIcons({ set: 'lucide' })(unknown, file));
    expect(failure.message).toBe('<Icon name="rocke"> is not an icon of the lucide set.');
    expect(failure.fix).toMatch(/^Closest names in the lucide set: rocket\b/u);
    expect(failure.fix).toContain('https://icon-sets.iconify.design/lucide/');
    const far: MdastNode = {
      type: 'root',
      children: [
        jsxElement('Icon', [{ type: 'mdxJsxAttribute', name: 'name', value: 'zzqxjv-wvb' }]),
      ],
    };
    expect((await failureOf(() => remarkKitIcons({ set: 'lucide' })(far, file))).fix).toContain(
      'No name in the lucide set is close to "zzqxjv-wvb".',
    );
  });

  it('fails for a set that is not installed, with how to add it', async () => {
    const missing: MdastNode = {
      type: 'root',
      children: [
        jsxElement('Icon', [{ type: 'mdxJsxAttribute', name: 'name', value: 'nope:rocket' }]),
      ],
    };
    const failure = await failureOf(() => remarkKitIcons({ set: 'lucide' })(missing, file));
    expect(failure.message).toContain('not installed');
    expect(failure.fix).toContain('`@iconify-json/nope`');
  });
});
