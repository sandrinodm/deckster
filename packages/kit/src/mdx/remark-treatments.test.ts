import { describe, expect, it } from 'vite-plus/test';

import type { MdastNode } from '#mdx/mdast.ts';

import { remarkKitTreatments, type TreatmentFile } from '#mdx/remark-treatments.ts';

/**
 * A warning a fake vfile recorded.
 */
type Recorded = { reason: string; origin: string | undefined; note?: string };

/**
 * The nocturne brand's treatments, as the build passes them.
 */
const NOCTURNE = { brand: 'nocturne', treatments: ['duotone', 'plain', 'mono'] };

/**
 * Runs the plugin on a slide and returns the warnings it recorded.
 *
 * @param frontmatter - The slide's validated frontmatter.
 * @param children - The slide's markdown tree.
 */
function warningsFor(frontmatter: unknown, children: MdastNode[] = []): Recorded[] {
  const warnings: Recorded[] = [];
  const file: TreatmentFile = {
    data: { frontmatter },
    message: (reason, _place, origin) => {
      const recorded: Recorded = { reason, origin };
      warnings.push(recorded);
      return recorded;
    },
  };
  remarkKitTreatments(NOCTURNE)({ type: 'root', children }, file);
  return warnings;
}

/**
 * An `<Image>` with a static `treatment`.
 *
 * @param treatment - The treatment it names.
 */
function image(treatment: string): MdastNode {
  return {
    type: 'mdxJsxFlowElement',
    name: 'Image',
    attributes: [
      { type: 'mdxJsxAttribute', name: 'src', value: '../assets/a.jpg' },
      { type: 'mdxJsxAttribute', name: 'treatment', value: treatment },
    ],
    children: [],
  };
}

describe('remarkKitTreatments', () => {
  it('passes the names the brand has, plain among them', () => {
    expect(warningsFor({ layout: 'split', treatment: 'plain' }, [image('mono')])).toEqual([]);
  });

  it("warns for a slide's treatment the brand does not have, with the brand's names", () => {
    const [warning, ...rest] = warningsFor({ layout: 'split', treatment: 'rounded' });
    expect(rest).toEqual([]);
    expect(warning?.origin).toBe('deck:treatment-unknown');
    expect(warning?.reason).toBe(
      '`treatment: rounded`: the nocturne brand has no "rounded" image treatment, so the picture ' +
        'is drawn as it is.',
    );
    expect(warning?.note).toContain("Name one of the nocturne brand's treatments: duotone, plain");
  });

  it('finds a treatment on a picture in a list and on an <Image>', () => {
    const warnings = warningsFor(
      {
        layout: 'bento',
        tiles: [
          { value: '38%', label: 'shade' },
          { src: 'a.png', alt: 'A', treatment: 'mon' },
        ],
      },
      [image('sepia')],
    );
    expect(warnings.map((warning) => warning.reason.split(':')[0])).toEqual([
      '`tiles[1].treatment',
      '`<Image treatment="sepia">`',
    ]);
    expect(warnings[0]?.note).toMatch(/^Did you mean "mono"\?/u);
  });
});
