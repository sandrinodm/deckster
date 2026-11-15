import fs from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vite-plus/test';

import type { MdastNode } from '#mdx/mdast.ts';

import { remarkKitSvg } from '#diagrams/remark-svg.ts';
import { deckFolder } from '#mdx/deck-folder.fixture.ts';
import { attributeValue, jsxElement } from '#mdx/mdast.ts';

/**
 * What one run of the plugin did.
 */
type SvgRun = {
  /**
   * The `<Svg>` element after the run.
   */
  node: MdastNode;

  /**
   * The tree after the run.
   */
  root: MdastNode;

  /**
   * The build failure, if any.
   */
  failure: string | undefined;

  /**
   * The failure's fix, if any.
   */
  fix: string | undefined;

  /**
   * The warnings, with their rule ids.
   */
  warnings: { reason: string; origin: string | undefined }[];
};

describe('remarkKitSvg', () => {
  const folder = deckFolder();
  afterAll(folder.cleanup);

  /**
   * Runs the plugin on one `<Svg>` in the fixture deck's slide.
   *
   * @param src - The `src` as written.
   * @param attributes - The `<Svg>`'s other attributes.
   */
  async function inline(src: string, attributes: MdastNode['attributes'] = []): Promise<SvgRun> {
    const node = jsxElement('Svg', [
      { type: 'mdxJsxAttribute', name: 'src', value: src },
      ...(attributes ?? []),
    ]);
    const root: MdastNode = { type: 'root', children: [node] };
    const warnings: SvgRun['warnings'] = [];
    let failure: string | undefined;
    let fix: string | undefined;
    try {
      await remarkKitSvg({ deckDir: folder.deck })(root, {
        path: folder.slide,
        message: (reason, _place, origin) => {
          warnings.push({ reason, origin });
          return {};
        },
        fail: (reason) => {
          failure = reason;
          throw new Error(reason);
        },
      });
    } catch (error) {
      fix = (error as { note?: string }).note;
    }

    return { node, root, failure, fix, warnings };
  }

  /**
   * Writes a drawing into the fixture deck's assets.
   *
   * @param name - The file name.
   * @param markup - The drawing.
   */
  function drawing(name: string, markup: string): string {
    fs.writeFileSync(path.join(folder.deck, 'assets', name), markup);
    return `../assets/${name}`;
  }

  it('inlines the sanitised drawing and warns about each thing it removed', async () => {
    const src = drawing(
      'floor.svg',
      '<svg width="40" height="20"><script>alert(1)</script><rect onload="x()" fill="#e4572e"/></svg>',
    );
    const { node, root, warnings } = await inline(src);
    expect(attributeValue(node, 'src')).toBe(
      '<svg viewBox="0 0 40 20"><rect fill="#e4572e" /></svg>',
    );
    expect(root.children?.[0]?.value).toBe('import kitSvg0 from "../assets/floor.svg?raw"');
    expect(warnings.map((warning) => warning.reason)).toEqual([
      `<Svg src="${src}"> had a <script> element; it was removed, because an inline drawing must not run code or load other files. Remove it from the file to silence this warning.`,
      `<Svg src="${src}"> had the onload attribute on <rect>; it was removed, because an inline drawing must not run code or load other files. Remove it from the file to silence this warning.`,
    ]);
  });

  it('fails the build on an unknown role or step id written as literals', async () => {
    const src = drawing(
      'dock.svg',
      '<svg viewBox="0 0 1 1"><g id="dock"><rect fill="#e4572e"/></g></svg>',
    );
    const { failure, fix } = await inline(src, [
      literal('recolor', '{ "#e4572e": "purple" }', { '#e4572e': 'purple' }),
      literal('steps', '{ docks: 1 }', { docks: 1 }),
    ]);
    expect(failure).toContain('maps "#e4572e" to "purple", which is not a color role. Use one of:');
    expect(failure).toContain(
      'reveals "docks" in `steps`, which is not an id in the drawing. Ids it has: dock.',
    );
    expect(fix).toBe('Use the values the message lists.');
  });

  it('inlines a bare path from the deck folder and a file of the public folder', async () => {
    const bare = await inline('assets/drawing.svg');
    expect(String(attributeValue(bare.node, 'src'))).toMatch(/^<svg/u);
    expect(bare.root.children?.[0]?.value).toBe('import kitSvg0 from "../assets/drawing.svg?raw"');
    const shared = await inline('/logo.svg');
    expect(String(attributeValue(shared.node, 'src'))).toMatch(/^<svg/u);
    expect(shared.root.children).toHaveLength(1);
  });

  it('fails the build for a path out of the deck, a link out of it and a file that is not SVG', async () => {
    expect((await inline('../../secret.png')).failure).toBe(
      `<Svg src="../../secret.png"> resolves to ${folder.outside}, outside the deck folder ` +
        `(${folder.deck}).`,
    );
    expect((await inline('assets/linked.png')).failure).toContain('is not an SVG drawing (.png)');
    fs.symlinkSync(folder.outside, path.join(folder.deck, 'assets', 'linked.svg'));
    expect((await inline('assets/linked.svg')).failure).toContain(
      '<Svg src="assets/linked.svg"> is a link to',
    );
  });

  it('fails the build for a URL, and warns media-missing for a missing file', async () => {
    const web = await inline('https://example.com/a.svg');
    expect(web.failure).toBe(
      '<Svg src="https://example.com/a.svg"> is a URL; <Svg> inlines a drawing from the deck at build time.',
    );
    expect(web.fix).toContain("Download the drawing into the deck's assets/ folder");
    const missing = await inline('assets/none.svg');
    expect(missing.failure).toBeUndefined();
    expect(missing.warnings).toEqual([
      {
        reason: `<Svg src="assets/none.svg"> does not exist (looked for ${path.join(folder.deck, 'assets', 'none.svg')}).`,
        origin: 'deck:media-missing',
      },
    ]);
  });

  it('leaves markup as it is', async () => {
    const { node, root } = await inline('<svg viewBox="0 0 1 1"></svg>');
    expect(attributeValue(node, 'src')).toBe('<svg viewBox="0 0 1 1"></svg>');
    expect(root.children).toHaveLength(1);
  });
});

/**
 * An attribute with a literal object expression, as the MDX parser leaves it.
 *
 * @param name - The attribute name.
 * @param source - The expression's source.
 * @param value - The object it stands for.
 */
function literal(
  name: string,
  source: string,
  value: Record<string, string | number>,
): NonNullable<MdastNode['attributes']>[number] {
  return {
    type: 'mdxJsxAttribute',
    name,
    value: {
      type: 'mdxJsxAttributeValueExpression',
      value: source,
      data: {
        estree: {
          type: 'Program',
          sourceType: 'module',
          comments: [],
          body: [
            {
              type: 'ExpressionStatement',
              expression: {
                type: 'ObjectExpression',
                properties: Object.entries(value).map(([key, item]) => ({
                  type: 'Property',
                  kind: 'init',
                  key: { type: 'Literal', value: key },
                  value: { type: 'Literal', value: item },
                })),
              },
            },
          ],
        },
      },
    },
  };
}
