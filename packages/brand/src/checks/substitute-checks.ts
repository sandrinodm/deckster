import type { Brand } from '#schema/brand-schema.ts';
import type { BrandProblem } from '#validate/brand-error.ts';

import { knownCategory, stackCategory } from '#resolve/font-substitutes.ts';
import { FAMILY_ROLES } from '#schema/typography-schema.ts';

/**
 * A common installed family of each kind, for fixes.
 */
const EXAMPLES: Readonly<Record<'sans' | 'serif' | 'mono', string>> = {
  /**
   * Sans.
   */
  sans: 'Arial',

  /**
   * Serif.
   */
  serif: 'Georgia',

  /**
   * Mono.
   */
  mono: 'Courier New',
};

/**
 * Warns about a family's `substitute` that would change the look of exported documents where the
 * brand font is missing: a substitute of another kind than the family (a sans for a serif or a
 * monospace family, by its fallback stack and, for the mono role, by its role), and an unknown
 * substitute without `panose`, which leaves apps nothing to match a similar font by.
 *
 * @param brand - The decoded brand.
 * @returns Warnings; never an error.
 */
export function checkSubstitutes(brand: Brand): BrandProblem[] {
  return FAMILY_ROLES.flatMap((role): BrandProblem[] => {
    const family = brand.typography.families[role];
    const substitute = family.substitute;
    if (substitute === undefined) {
      return [];
    }

    const path = `typography.families.${role}.substitute`;
    const expected = role === 'mono' ? 'mono' : stackCategory(family);
    const actual = knownCategory(substitute.family);
    if (actual === undefined) {
      if (substitute.panose !== undefined) {
        return [];
      }

      return [
        {
          path: `${path}.panose`,
          message: `"${substitute.family}" is not a family the export knows, and it has no PANOSE.`,
          fix:
            'Add `panose` (the 20 hex digits of its OS/2 PANOSE) or use a common family such as ' +
            'Arial, Georgia or Courier New.',
        },
      ];
    }

    if (actual === expected) {
      return [];
    }

    return [
      {
        path: `${path}.family`,
        message:
          `"${substitute.family}" is a ${actual} family, but ${family.family} reads as ` +
          `${expected}.`,
        fix: `Pick a ${expected} substitute, such as ${EXAMPLES[expected]}.`,
      },
    ];
  });
}
