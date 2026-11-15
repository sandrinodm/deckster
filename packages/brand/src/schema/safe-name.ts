import { KEBAB_CASE_PATTERN } from '@deckster/engine/names';
import { Schema } from 'effect';

/**
 * The longest name a brand, deck, slide or app may have, in characters.
 */
export const MAX_NAME_LENGTH = 64;

/**
 * The rule every name that becomes a folder or file name follows, in words, for messages.
 */
export const SAFE_NAME_RULE =
  'kebab-case: lowercase letters and digits in words joined by single hyphens, ' +
  `at most ${MAX_NAME_LENGTH} characters`;

/**
 * Whether a name is safe to join into a path: kebab-case (`^[a-z0-9]+(?:-[a-z0-9]+)*$`, the rule of
 * `@deckster/engine/names`) and at most {@link MAX_NAME_LENGTH} characters. Such a name has no `/`,
 * `\`, `.`, NUL or drive letter, so it can neither leave the folder it is joined to nor be an
 * absolute path. Every brand, deck, slide and app name a user, a page or an agent supplies is
 * checked with this before it names a path.
 *
 * @param name - The name to check.
 */
export function isSafeName(name: string): boolean {
  return name.length <= MAX_NAME_LENGTH && KEBAB_CASE_PATTERN.test(name);
}

/**
 * Builds a string schema for a name that becomes a folder or file name, checked with
 * {@link isSafeName}.
 *
 * @param kind - What the name identifies, for the message ("brand name", "deck name").
 * @param example - A valid name, for the message ("default").
 */
export function SafeName(kind: string, example: string): Schema.String {
  return Schema.String.check(
    Schema.isPattern(KEBAB_CASE_PATTERN, {
      message: `Expected a ${kind} in ${SAFE_NAME_RULE}, such as "${example}"`,
    }),
    Schema.isMaxLength(MAX_NAME_LENGTH, {
      message: `Expected a ${kind} of at most ${MAX_NAME_LENGTH} characters, such as "${example}"`,
    }),
  );
}
