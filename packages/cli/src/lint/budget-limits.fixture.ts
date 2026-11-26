import type { AnyLayoutContract } from '@deckster/engine/layout';

import fs from 'node:fs';
import path from 'node:path';

import { kitLayoutLimits, limitDeckConfig, limitSlides } from '#layouts/limit-deck.ts';
import { scratchWorkspace } from '#lint/scratch-workspace.fixture.ts';

/**
 * The deck the stress test writes, under the scratch workspace's `decks/`.
 */
export const BUDGET_DECK = 'budget-limits';

/**
 * The fixture brand the stress test renders in besides the kit's brands: a wide sans with body text
 * at 30 px (`FIXTURE_BRANDS`).
 */
export const LIMIT_TEST_BRAND = 'wide-sans';

/**
 * Writes a scratch workspace with the stress deck: the framework's brands and packages linked in,
 * and the deck's config and slides, every kit limit case of the given layouts, written out.
 *
 * @param contracts - The layouts' contracts.
 * @param over - Whether to fill each slot one word past its budget.
 * @returns The workspace root, to pass to `Workspace.at`.
 */
export function writeLimitWorkspace(contracts: readonly AnyLayoutContract[], over = false): string {
  const root = scratchWorkspace('deck-budget-limits-', [LIMIT_TEST_BRAND]);
  const deck = path.join(root, 'decks', BUDGET_DECK);
  fs.mkdirSync(path.join(deck, 'slides'), { recursive: true });
  const slides = limitSlides(kitLayoutLimits(contracts), over);
  for (const slide of slides) {
    fs.writeFileSync(path.join(deck, 'slides', `${slide.id}.mdx`), slide.mdx);
  }

  fs.writeFileSync(path.join(deck, 'deck.config.ts'), limitDeckConfig('Budget limits', slides));
  return root;
}
