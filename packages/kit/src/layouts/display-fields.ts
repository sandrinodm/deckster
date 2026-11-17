import { Effect, Schema } from 'effect';

/**
 * Where the display layouts (title, section, statement) set their text: from the left edge of the
 * grid, as every slide does by default, or centred on the slide.
 */
export const DISPLAY_ALIGNS = ['left', 'center'] as const;

/**
 * One of {@link DISPLAY_ALIGNS}.
 */
export type DisplayAlign = (typeof DISPLAY_ALIGNS)[number];

/**
 * The `align` field of the display layouts; `left` when it is left out.
 */
export const AlignField = Schema.Literals(DISPLAY_ALIGNS).pipe(
  Schema.withDecodingDefaultKey(Effect.succeed<DisplayAlign>('left')),
);

/**
 * The fix shown when `align` is invalid.
 *
 * @param what - What centring sets, for the hint: `the title and subtitle`.
 */
export function alignHint(what: string): string {
  return (
    `Write \`align: center\` to centre ${what} on the slide, or leave it out to set them from ` +
    'the left.'
  );
}
