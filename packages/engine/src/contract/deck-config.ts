import { Schema } from 'effect';

import { KebabName } from '#contract/kebab-name.ts';
import { BUDGET_PATTERN } from '#contract/slide-defaults.ts';

/**
 * The shape of `decks/<deck>/deck.config.ts`. `slides` lists slide ids in presentation order; each
 * id names `slides/<id>.mdx` or `slides/<id>.tsx`. `brand` names a folder under `brands/`; without
 * it the deck uses `brands/default`. `mouseNavigation: false` turns off moving the deck with left
 * and right clicks, which is on by default. `duration` is the length of the talk (`20m`, `1m30s`),
 * which the presenter view paces against and `deckster lint` checks the slide budgets against.
 */
export const DeckConfig = Schema.Struct({
  title: Schema.NonEmptyString,
  slides: Schema.NonEmptyArray(KebabName('slide id')),
  brand: Schema.optionalKey(KebabName('brand name')),
  mouseNavigation: Schema.optionalKey(Schema.Boolean),
  duration: Schema.optionalKey(
    Schema.String.check(
      Schema.isPattern(BUDGET_PATTERN, {
        message: 'Expected a duration such as "90s", "20m" or "1m30s"',
      }),
    ),
  ),
});

/**
 * A decoded deck configuration.
 */
export type DeckConfig = typeof DeckConfig.Type;

/**
 * A deck configuration as written in `deck.config.ts`.
 */
export type DeckConfigInput = typeof DeckConfig.Encoded;

/**
 * How to fix each deck config field, appended to build errors that name the field.
 */
export const DECK_CONFIG_HINTS = {
  /**
   * Fix for a missing or empty title.
   */
  title: 'Give the deck a title, for example `title: "Q4 launch"`.',

  /**
   * Fix for a slide list that is missing, empty or has ids that are not kebab-case.
   */
  slides:
    'List slide file names without their extension, in order, for example ' +
    '`slides: ["title", "request-flow"]`.',

  /**
   * Fix for a brand name that is not kebab-case.
   */
  brand: 'Name a brand folder under brands/ in kebab-case, for example `brand: "default"`.',

  /**
   * Fix for a mouse navigation switch that is not a boolean.
   */
  mouseNavigation:
    'Write `mouseNavigation: false` to stop clicks moving the deck, or leave it out to keep them.',

  /**
   * Fix for a duration that is not minutes and seconds.
   */
  duration: 'Write the talk length as minutes and seconds, for example `duration: 20m` or `90s`.',
} satisfies Record<keyof DeckConfigInput, string>;

/**
 * Declares a deck. It returns its argument unchanged; the build validates it against
 * {@link DeckConfig} and reports problems with the file name and a fix.
 *
 * @param config - The deck title and the ordered slide ids.
 * @returns The same configuration, typed.
 */
export function defineDeck(config: DeckConfigInput): DeckConfigInput {
  return config;
}
