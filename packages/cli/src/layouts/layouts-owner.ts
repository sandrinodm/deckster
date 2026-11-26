import { deckCommand } from '@deckster/engine/command';
import { Effect } from 'effect';

import { checkDeckName } from '#choose-deck.ts';
import { usageError, type CliError } from '#cli-error.ts';
import { readBrandName } from '#parse-command-args.ts';

/**
 * Whose code layouts a command works on: a brand's `layouts/` or a deck's.
 */
export type LayoutsOwner = {
  /**
   * A brand or a deck.
   */
  readonly kind: 'brand' | 'deck';

  /**
   * The brand or deck folder name.
   */
  readonly name: string;
};

/**
 * Reads `--brand <brand>` or `--deck <deck>`, exactly one of them, as `deckster layouts new`,
 * `check`, `eject` and `diff` take them.
 *
 * @param subcommand - `new`, `check`, `eject` or `diff`, for the message.
 * @param values - The parsed options.
 * @returns The brand or the deck.
 * @throws CliError in the error channel when neither or both are given, or the name is not a
 *   kebab-case folder name.
 */
export const readLayoutsOwner = Effect.fn('readLayoutsOwner')(function* (
  subcommand: string,
  values: { readonly brand?: string | undefined; readonly deck?: string | undefined },
): Effect.fn.Return<LayoutsOwner, CliError> {
  const brand = yield* readBrandName('layouts', values.brand);
  const deck = values.deck === undefined ? undefined : yield* checkDeckName(values.deck);
  if (brand !== undefined && deck === undefined) {
    return { kind: 'brand', name: brand };
  }

  if (deck !== undefined && brand === undefined) {
    return { kind: 'deck', name: deck };
  }

  const which = brand === undefined ? 'Neither was given' : 'Both were given';
  return yield* usageError(
    `\`${deckCommand()} layouts ${subcommand}\` works on one brand's layouts or one deck's: pass ` +
      `--brand <brand> or --deck <deck>. ${which}.`,
    'layouts',
  );
});
