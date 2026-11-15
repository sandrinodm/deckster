/**
 * The most digits the go-to prompt takes, enough for any deck.
 */
const MAX_DIGITS = 4;

/**
 * What a key press does to the go-to prompt.
 */
export type GotoStep =
  | { type: 'edit'; buffer: string }
  | { type: 'go'; slide: number }
  | { type: 'invalid'; buffer: string }
  | { type: 'cancel' };

/**
 * Applies a key to the digits typed after `g`. Digits are appended, Backspace removes one, Enter
 * goes to the slide (typed 1-based, returned zero-based) when it exists, Escape cancels, and every
 * other key leaves the prompt as it is, so stray keys never move the deck while it is open.
 *
 * @param buffer - The digits typed so far.
 * @param key - The `KeyboardEvent.key`.
 * @param slideCount - How many slides the deck has.
 */
export function stepGoto(buffer: string, key: string, slideCount: number): GotoStep {
  if (key === 'Escape') {
    return { type: 'cancel' };
  }

  if (key === 'Backspace') {
    return { type: 'edit', buffer: buffer.slice(0, -1) };
  }

  if (key === 'Enter') {
    const slide = Number(buffer);
    const isSlide = buffer !== '' && slide >= 1 && slide <= slideCount;
    return isSlide ? { type: 'go', slide: slide - 1 } : { type: 'invalid', buffer };
  }

  const isDigit = key.length === 1 && key >= '0' && key <= '9';
  if (isDigit && buffer.length < MAX_DIGITS) {
    return { type: 'edit', buffer: `${buffer}${key}` };
  }

  return { type: 'edit', buffer };
}
