import type { FieldProblem } from '@deckster/engine/layout';

import { deckCommand } from '@deckster/engine/command';
import { Effect, Schema } from 'effect';

import { isSafeHref } from '#links/link-target.ts';

/**
 * The longest eyebrow, in characters: a short kicker such as "Budget committee · 2027" fits on one
 * line above any title in both brands.
 */
export const EYEBROW_MAX_CHARS = 40;

/**
 * The eyebrow (kicker) field every kit layout takes: a few words above the title, in the brand's
 * label style and accent color, naming the section, the audience or the kind of slide.
 */
export const EyebrowField = Schema.optionalKey(
  Schema.NonEmptyString.check(
    Schema.isMaxLength(EYEBROW_MAX_CHARS, {
      message: `Expected an eyebrow of at most ${EYEBROW_MAX_CHARS} characters`,
    }),
  ),
);

/**
 * The fix shown when an eyebrow is invalid.
 */
export const EYEBROW_HINT =
  `Write a few words of at most ${EYEBROW_MAX_CHARS} characters, ` +
  'for example `eyebrow: Budget committee`, or leave it out.';

/**
 * The `chrome` field: whether the brand's page number, footer, logo and progress bar show on the
 * slide. Each layout sets its own default (title and section slides hide it), which the build
 * writes into the slide's frontmatter.
 *
 * @param shown - The layout's default.
 * @returns A boolean field that defaults to `shown`.
 */
export function chromeField(shown: boolean): Schema.withDecodingDefaultKey<Schema.Boolean> {
  return Schema.Boolean.pipe(Schema.withDecodingDefaultKey(Effect.succeed(shown)));
}

/**
 * The fix shown when `chrome` is not a boolean.
 */
export const CHROME_HINT =
  'Write `chrome: false` to hide the page number, logo and progress bar on this slide, or ' +
  '`chrome: true` to show them.';

/**
 * The `treatment` field of layouts with a photo: the name of one of the brand's image treatments
 * (`deck brand --json` lists them under `imagery.treatments`), such as `plain`, which every brand
 * has, for a screenshot, map or chart whose own colors carry meaning. The brand's default treatment
 * applies when it is left out; a name the brand does not have draws the photo as it is, and the
 * build warns (`treatment-unknown`) with the names the brand has.
 */
export const TreatmentField = Schema.optionalKey(
  Schema.NonEmptyString.check(
    Schema.isPattern(/^[a-z][a-z0-9-]*$/u, {
      message: 'Expected a treatment name such as "plain" or "duotone"',
    }),
  ),
);

/**
 * The fix shown when a treatment is invalid.
 */
export const TREATMENT_HINT =
  "Name one of the brand's image treatments, for example `treatment: plain` (every brand has it) " +
  'to show a screenshot, map or chart in its own colors; `' +
  deckCommand() +
  ' brand --json` lists them under imagery.treatments.';

/**
 * The `treatment` prop of a photo's frame: the treatment the slide names, or no prop at all when it
 * names none, so the brand's default applies.
 *
 * @param treatment - The slide's `treatment:`, if it sets one.
 */
export function treatmentProps(treatment: string | undefined): { treatment?: string } {
  return treatment === undefined ? {} : { treatment };
}

/**
 * A required line of text of at most `maxChars` characters, such as a card's title.
 *
 * @param maxChars - The longest it may be.
 * @param what - What it is, for the message: `a title`.
 */
export function textField(maxChars: number, what: string): Schema.NonEmptyString {
  return Schema.NonEmptyString.check(
    Schema.isMaxLength(maxChars, { message: `Expected ${what} of at most ${maxChars} characters` }),
  );
}

/**
 * Where a cropped photo keeps its subject: a CSS position such as `top`, `center 30%` or `40% 20%`.
 */
export const FocalField = Schema.optionalKey(
  Schema.NonEmptyString.check(
    Schema.isPattern(/^(?:(?:left|center|right|top|bottom|\d{1,3}%)(?:\s+|$)){1,2}$/u, {
      message: 'Expected a focal point such as "top", "center 30%" or "40% 20%"',
    }),
  ),
);

/**
 * The fix shown when a focal point is invalid.
 */
export const FOCAL_HINT =
  'Name the part of the photo to keep when it is cropped, as a CSS position: `focal: top`, ' +
  '`focal: center 30%` (a face in the upper third) or `focal: 40% 20%`.';

/**
 * The `reveal` field of layouts with a row of items: `true` shows the items one per step, in order.
 */
export const RevealField = Schema.Boolean.pipe(
  Schema.withDecodingDefaultKey(Effect.succeed(false)),
);

/**
 * The fix shown when `reveal` is not a boolean.
 */
export const REVEAL_HINT =
  'Write `reveal: true` to show the items one per step, in order, or leave it out to show them ' +
  'all at once.';

/**
 * The longest contact label, in characters: `Email`, `Slides`, `Book a walk`.
 */
export const CONTACT_LABEL_MAX_CHARS = 16;

/**
 * The longest contact, in characters: an address or URL as people should read it.
 */
export const CONTACT_TEXT_MAX_CHARS = 40;

/**
 * A link destination a slide may open: `http:`, `https:`, `mailto:` and `tel:` URLs, paths and
 * `#fragments`; `javascript:`, `data:` and every other scheme are refused, as the kit's link
 * components refuse them.
 */
export const SafeHrefField = Schema.NonEmptyString.check(
  Schema.makeFilter((href: string) => isSafeHref(href), {
    message: 'Expected an http:, https:, mailto: or tel: link, a path or a #fragment',
  }),
);

/**
 * A way to reach someone or follow up: what it is, what to type, and the link it opens.
 */
export const ContactItem = Schema.Struct({
  label: textField(CONTACT_LABEL_MAX_CHARS, 'a contact label'),
  text: textField(CONTACT_TEXT_MAX_CHARS, 'a contact'),
  href: Schema.optionalKey(SafeHrefField),
});

/**
 * One contact as a slide's frontmatter writes it, decoded.
 */
export type ContactEntry = typeof ContactItem.Type;

/**
 * The fix shown when a list of contacts is invalid.
 *
 * @param most - How many the layout takes.
 */
export function contactsHint(most: number): string {
  return (
    `List up to ${most} contacts, each with \`label\` (up to ${CONTACT_LABEL_MAX_CHARS} ` +
    `characters: Email, Slides), \`text\` (up to ${CONTACT_TEXT_MAX_CHARS}, as people should ` +
    'type it: dana@larkfield.example) and optionally `href` (mailto:, tel:, https: or a path; ' +
    'other schemes such as javascript: are refused), which makes it a link.'
  );
}

/**
 * The most words of the line of context some layouts set under the title, over a row of items: one
 * line across ten columns, so the items keep their room.
 */
export const CONTEXT_MAX_WORDS = 14;

/**
 * The problem with a `current:` that names an item past the end of its list, such as `current: 5`
 * on three steps, or none when it is left out or in range.
 *
 * @param frontmatter - The decoded frontmatter.
 * @param list - The list field `current` counts in: `steps`, `items`, `milestones`.
 * @param what - What one item is called, for the message: `step`.
 * @returns The problem, or nothing.
 */
export function currentProblems(
  frontmatter: { readonly current?: number | undefined },
  list: readonly unknown[],
  what: string,
): FieldProblem[] {
  const current = frontmatter.current;
  if (current === undefined || current <= list.length) {
    return [];
  }

  return [
    {
      path: 'current',
      message: `${current} names ${what} ${current}, but there are ${list.length} ${what}s.`,
      fix:
        `Write the number of one of the ${list.length} ${what}s (1 to ${list.length}), or leave ` +
        '`current` out.',
    },
  ];
}
