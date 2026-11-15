import { Effect } from 'effect';

import type { AgentError } from '#errors.ts';
import type { DeckToolsApi } from '#mcp/deck-tools.ts';
import type { ScreenshotRef } from '#providers/provider-types.ts';

/**
 * The largest base64 screenshot a prompt carries, in characters (about 300 KB of PNG).
 */
export const MAX_SCREENSHOT_BASE64 = 400_000;

/**
 * The widths tried in order until the image fits.
 */
const SCREENSHOT_WIDTHS = [1024, 768, 512] as const;

/**
 * The slide on screen as a PNG for the prompt, through the deck tools' screenshot (the same
 * headless browser and dev server `deck_screenshot` uses). It asks for a narrower image until the
 * base64 is under {@link MAX_SCREENSHOT_BASE64}, so a busy slide does not cost a megabyte of input;
 * the narrowest is used when none fits.
 *
 * @param tools - The deck tools.
 * @param slide - The slide id.
 * @param step - The step, from 0.
 */
export const slideScreenshot = Effect.fn('slideScreenshot')(function* (
  tools: DeckToolsApi,
  slide: string,
  step: number,
): Effect.fn.Return<ScreenshotRef, AgentError> {
  let shot: ScreenshotRef | undefined;
  for (const width of SCREENSHOT_WIDTHS) {
    const taken = yield* tools.deckScreenshot({ slide, step, width });
    shot = { path: taken.path, base64: taken.data };
    if (taken.data.length <= MAX_SCREENSHOT_BASE64) {
      return shot;
    }
  }

  return shot ?? { path: '', base64: '' };
});
