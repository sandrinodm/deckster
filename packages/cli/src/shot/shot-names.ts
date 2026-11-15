/**
 * Files this tool writes match this pattern, so a full run can remove its own stale output.
 */
export const SHOT_FILE_PATTERN = /^\d{2,}-[a-z0-9]+(?:-[a-z0-9]+)*(?:\.step\d+)?\.png$/;

/**
 * The smallest number of digits in the slide number prefix, so names sort in slide order.
 */
const MIN_NUMBER_DIGITS = 2;

/**
 * The stable file name of one screenshot: `03-request-flow.png` for a slide, and
 * `03-request-flow.step2.png` for one of its steps.
 *
 * @param index - The zero-based slide index.
 * @param id - The slide id.
 * @param step - The step, or `null` for the slide's finished state.
 * @param slideCount - How many slides the deck has, to size the number prefix.
 */
export function shotFileName(
  index: number,
  id: string,
  step: number | null,
  slideCount: number,
): string {
  const digits = Math.max(MIN_NUMBER_DIGITS, String(slideCount).length);
  const number = String(index + 1).padStart(digits, '0');
  const suffix = step === null ? '' : `.step${step}`;
  return `${number}-${id}${suffix}.png`;
}
