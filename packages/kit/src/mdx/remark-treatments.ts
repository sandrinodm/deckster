import { PLAIN_TREATMENT } from '@deckster/brand';

import { warn, type KitFile } from '#mdx/kit-file.ts';
import { attributeValue, JSX_TYPES, walk, type MdastNode } from '#mdx/mdast.ts';
import { nearestNames } from '#mdx/nearest-names.ts';

/**
 * The parts of a vfile the plugin uses: the slide's frontmatter, which the build sets on
 * `file.data`, and warnings.
 */
export type TreatmentFile = Pick<KitFile, 'message'> & {
  /**
   * Data the build attaches to the file; `frontmatter` on a slide.
   */
  data?: { frontmatter?: unknown };
};

/**
 * Options of {@link remarkKitTreatments}.
 */
export type TreatmentOptions = {
  /**
   * The brand's name, for the message.
   */
  brand: string;

  /**
   * The names of the brand's image treatments, `plain` among them.
   */
  treatments: readonly string[];
};

/**
 * The frontmatter key that names a treatment, at the top of a slide (`treatment: plain`) or on one
 * picture of a list (a bento tile's).
 */
const TREATMENT_KEY = 'treatment';

/**
 * The components whose `treatment` prop names one of the brand's treatments.
 */
const TREATED_COMPONENTS = new Set(['Image']);

/**
 * How many close names a warning suggests.
 */
const SUGGESTIONS = 1;

/**
 * A treatment name the slide writes, with where it is for the message.
 */
type Named = {
  /**
   * The name as the slide writes it: `tiles[2].treatment: sepia` or `<Image treatment="sepia">`.
   */
  written: string;

  /**
   * The name.
   */
  name: string;

  /**
   * The JSX node the warning points at; none for the frontmatter.
   */
  node?: MdastNode;
};

/**
 * A remark plugin that warns (`treatment-unknown`) when a slide names an image treatment the deck's
 * brand does not have, in its frontmatter (`treatment:` on the slide or on a picture in a list) or
 * on an `<Image treatment>`. Such a picture is drawn as it is, which is rarely what the author
 * meant, and treatment names differ between brands, so the fix lists the brand's own and points to
 * `plain`, which every brand has. It is a warning, not a build error, so a deck written for one
 * brand still builds in another; `deck lint` reports it.
 *
 * @param options - The brand's name and treatments.
 */
export function remarkKitTreatments(
  options: TreatmentOptions,
): (tree: MdastNode, file: TreatmentFile) => void {
  return (tree, file) => {
    const named = [...frontmatterNames(file.data?.frontmatter, ''), ...componentNames(tree)];
    for (const { written, name, node } of named) {
      if (options.treatments.includes(name)) {
        continue;
      }

      warn(
        file,
        {
          rule: 'treatment-unknown',
          problem:
            `\`${written}\`: the ${options.brand} brand has no "${name}" image treatment, so ` +
            'the picture is drawn as it is.',
          fix: unknownTreatmentFix(name, options),
        },
        node,
      );
    }
  };
}

/**
 * The fix for an unknown treatment: the closest name the brand has, and every name it has.
 *
 * @param name - The name the slide wrote.
 * @param options - The brand's name and treatments.
 */
export function unknownTreatmentFix(name: string, options: TreatmentOptions): string {
  const [closest] = nearestNames(name, options.treatments, SUGGESTIONS);
  const lead = closest === undefined ? '' : `Did you mean "${closest}"? `;
  return (
    `${lead}Name one of the ${options.brand} brand's treatments: ` +
    `${options.treatments.join(', ')}. \`${PLAIN_TREATMENT}\` shows a picture as it is in every ` +
    'brand, for a screenshot, a map or a chart whose own colors carry meaning.'
  );
}

/**
 * Every string under a `treatment` key in the frontmatter, at any depth.
 *
 * @param value - The frontmatter, or a part of it.
 * @param at - The path to `value`.
 */
function frontmatterNames(value: unknown, at: string): Named[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => frontmatterNames(item, `${at}[${index}]`));
  }

  if (typeof value !== 'object' || value === null) {
    return [];
  }

  return Object.entries(value).flatMap(([key, item]) => {
    const path = at === '' ? key : `${at}.${key}`;
    if (key === TREATMENT_KEY && typeof item === 'string') {
      return [{ written: `${path}: ${item}`, name: item }];
    }

    return frontmatterNames(item, path);
  });
}

/**
 * The static `treatment` of every component that takes one.
 *
 * @param tree - The slide's markdown tree.
 */
function componentNames(tree: MdastNode): Named[] {
  const named: Named[] = [];
  walk(tree, (node) => {
    if (JSX_TYPES.has(node.type) && TREATED_COMPONENTS.has(node.name ?? '')) {
      const name = attributeValue(node, TREATMENT_KEY);
      if (typeof name === 'string') {
        named.push({ written: `<${node.name ?? ''} treatment="${name}">`, name, node });
      }
    }
  });
  return named;
}
