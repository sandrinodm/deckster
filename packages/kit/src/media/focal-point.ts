/**
 * Where the subject of an image is, so cropping keeps it in view: a CSS position such as `'top
 * left'` or `'50% 20%'`, or `[x, y]` percentages from the top left.
 */
export type FocalPoint = string | readonly [x: number, y: number];

/**
 * The largest focal point percentage.
 */
const MAX_PERCENT = 100;

/**
 * The `object-position` for a focal point.
 *
 * @param focal - The focal point; `undefined` centers the image.
 * @throws RangeError when a percentage is outside 0 to 100.
 */
export function objectPosition(focal: FocalPoint | undefined): string {
  if (focal === undefined) {
    return '50% 50%';
  }

  if (typeof focal === 'string') {
    return focal;
  }

  const [x, y] = focal;
  for (const value of focal) {
    if (!Number.isFinite(value) || value < 0 || value > MAX_PERCENT) {
      throw new RangeError(
        `A focal point of [${x}, ${y}] is not valid. Use percentages from 0 to 100, for example ` +
          '`focal={[30, 20]}`, or a position such as `focal="top left"`.',
      );
    }
  }

  return `${x}% ${y}%`;
}

/**
 * The inline `object-position` for a picture's own focal point, or none at all when it has none, so
 * the position its stylesheet gives it applies: the centre, or the slide's `focal` where a layout
 * crops it (the image layout's photo).
 *
 * @param focal - The picture's focal point, if it has one.
 * @throws RangeError when a percentage is outside 0 to 100.
 */
export function focalStyle(focal: FocalPoint | undefined): { objectPosition?: string } {
  return focal === undefined ? {} : { objectPosition: objectPosition(focal) };
}
