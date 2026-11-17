import type { DeckConfig } from '@deckster/engine/config';

import { DEFAULT_BRAND } from '@deckster/brand';

/**
 * The brand a deck renders with: the override when one is given (`--brand`), else the deck config's
 * `brand`, else the default brand.
 *
 * @param config - The deck's validated config.
 * @param override - A brand that replaces the config's, or `undefined` for none.
 * @returns The brand folder name under `brands/`.
 */
export function deckBrandName(config: Pick<DeckConfig, 'brand'>, override?: string): string {
  return override ?? config.brand ?? DEFAULT_BRAND;
}
