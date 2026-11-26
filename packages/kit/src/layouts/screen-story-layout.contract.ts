import type { FieldProblem } from '@deckster/engine/layout';

import { defineLayoutContract } from '@deckster/engine/layout';
import { Effect, Schema } from 'effect';

import {
  CHROME_HINT,
  chromeField,
  EYEBROW_HINT,
  EyebrowField,
  RevealField,
  textField,
} from '#layout-fields.ts';

/**
 * Number of screens required for each presentation treatment.
 */
const FRAME_COUNTS = {
  /**
   * One overview supplies the target and magnification.
   */
  spotlight: 1,

  /**
   * Two aligned captures show the previous and revised version.
   */
  wipe: 2,

  /**
   * One capture comes from the sender and one from the receiver.
   */
  handoff: 2,

  /**
   * Three captures retain an ordered progression.
   */
  filmstrip: 3,
};

/**
 * The maximum hand-authored alternate description length, in characters.
 */
const ALT_CHARS = 140;

/**
 * The maximum action or state name length, in characters.
 */
const LABEL_CHARS = 26;

/**
 * The maximum explanation length under a screen, in characters.
 */
const DETAIL_CHARS = 65;

/**
 * The maximum address-bar text length, in characters.
 */
const ADDRESS_CHARS = 42;

/**
 * The maximum slide title length, in characters.
 */
const TITLE_CHARS = 62;

/**
 * One offline screen image, its accessible description, and its visible label.
 */
const Frame = Schema.Struct({
  src: Schema.NonEmptyString,
  alt: textField(ALT_CHARS, 'a screen description'),
  label: textField(LABEL_CHARS, 'an action or state label'),
  detail: Schema.optionalKey(textField(DETAIL_CHARS, 'one line of context')),
});

/**
 * Coordinates at the left or top of an area, in percentages of the uncropped screen.
 */
const Origin = Schema.Number.check(Schema.isBetween({ minimum: 0, maximum: 100 }));

/**
 * Width or height of an area, in percentages of the uncropped screen.
 */
const Span = Schema.Number.check(Schema.isBetween({ minimum: 5, maximum: 100 }));

/**
 * A decoded screen with its asset, label and alternate description.
 */
export type StoryScreen = typeof Frame.Type;

/**
 * The source rectangle used to draw a spotlight at the same coordinates on the two panels.
 */
const Spotlight = Schema.Struct({ x: Origin, y: Origin, width: Span, height: Span });

/**
 * A decoded spotlight rectangle in screen-relative percentages.
 */
export type StorySpotlight = typeof Spotlight.Type;

/**
 * The contract for a single product moment told with one to three offline screenshots.
 */
export const screenStoryLayoutContract = defineLayoutContract({
  name: 'screen-story',
  description:
    'Present an offline product moment using screenshot artwork. Spotlight links a browser view ' +
    'to a magnified crop of the same image. Wipe animates a registered pair in a fixed viewport ' +
    'and compares both versions in the finished export. Handoff transfers a task from desktop ' +
    'to a phone. Filmstrip keeps three consecutive actions and screenshots visible at the end.',
  schema: Schema.Struct({
    eyebrow: EyebrowField,
    pattern: Schema.Literals(['spotlight', 'wipe', 'handoff', 'filmstrip']),
    screens: Schema.Array(Frame).check(
      Schema.isMinLength(FRAME_COUNTS.spotlight),
      Schema.isMaxLength(FRAME_COUNTS.filmstrip),
    ),
    address: Schema.optionalKey(textField(ADDRESS_CHARS, 'an address-bar label')),
    ratio: Schema.Number.check(Schema.isBetween({ minimum: 0.5, maximum: 3 })).pipe(
      Schema.withDecodingDefaultKey(Effect.succeed(2)),
    ),
    spotlight: Schema.optionalKey(Spotlight),
    reveal: RevealField,
    chrome: chromeField(true),
  }),
  hints: {
    eyebrow: EYEBROW_HINT,
    pattern: 'Choose spotlight, wipe, handoff, or filmstrip.',
    screens:
      'Supply 1 screen for spotlight, 2 for wipe or handoff, and 3 for filmstrip. Each needs a ' +
      `local \`src\`, \`alt\` (up to ${ALT_CHARS} characters), \`label\` (up to ${LABEL_CHARS} characters) ` +
      `and optional \`detail\` (up to ${DETAIL_CHARS} characters). Order them as the workflow happens.`,
    address: `Optional browser address, up to ${ADDRESS_CHARS} characters.`,
    ratio:
      'Write the desktop viewport width divided by its height, from 0.5 to 3, default 2. The ' +
      'images in a wipe must share the ratio and line up at corresponding coordinates.',
    spotlight:
      'Required only for spotlight. Set x, y, width and height as percentages of the complete ' +
      'screen. Keep the rectangle within the screenshot and at least 5% wide and high.',
    reveal:
      'Use reveal: true to build. Spotlight, wipe and handoff take one click. Filmstrip takes ' +
      'two clicks. Omit it to show the finished visual immediately.',
    chrome: CHROME_HINT,
  },
  checks: ({ pattern, screens, spotlight }): FieldProblem[] => {
    const required = FRAME_COUNTS[pattern];
    if (screens.length !== required) {
      return [
        {
          path: 'screens',
          message: `Expected ${required} screens for ${pattern}.`,
          fix: `List exactly ${required} screenshots.`,
        },
      ];
    }

    if (pattern === 'spotlight' && spotlight === undefined) {
      return [
        {
          path: 'spotlight',
          message: 'Spotlight has no source rectangle.',
          fix: 'Give the crop x, y, width and height in percentages of the source image.',
        },
      ];
    }

    if (
      spotlight &&
      (spotlight.x + spotlight.width > 100 || spotlight.y + spotlight.height > 100)
    ) {
      return [
        {
          path: 'spotlight',
          message: 'The crop extends past the screenshot.',
          fix: 'Keep x + width and y + height at or below 100.',
        },
      ];
    }

    return [];
  },
  title: { required: true, maxChars: TITLE_CHARS },
  slots: {
    footnote: { description: 'Optional attribution or an example caveat.', accepts: ['text'] },
  },
  budget: { footnote: { maxWords: 24 } },
  pptx: { type: 'title-only', placeholders: [{ kind: 'title', from: { selector: '.kit-title' } }] },
  example: {
    frontmatter: {
      title: 'Three actions turn a booking into a receipt',
      eyebrow: 'Product filmstrip',
      pattern: 'filmstrip',
      reveal: true,
      screens: [
        {
          src: exampleScreen('Booking open', '#695a46', 'M124 226h112v72H124zm20 24h72m-72 22h50'),
          alt: 'The open booking shown with a document icon',
          label: 'Open booking',
        },
        {
          src: exampleScreen('Priority checked', '#85522b', 'M180 210l57 92H123zm0 31v23m0 16v1'),
          alt: 'The booking priority shown with a warning icon',
          label: 'Check priority',
        },
        {
          src: exampleScreen('Receipt saved', '#225d50', 'M121 260l39 35 78-79'),
          alt: 'The saved booking receipt shown with a tick',
          label: 'Confirm booking',
        },
      ],
    },
    body: '<Notes>Show the booking, then [click] the priority and [click] the receipt.</Notes>\n',
  },
});

/**
 * Draws a local portrait illustration for the scaffolded workflow.
 *
 * @param label - The visible state on the screen.
 * @param accent - The color of its original pictogram.
 * @param path - The pictogram in the common 360 by 480 viewport.
 */
function exampleScreen(label: string, accent: string, path: string): string {
  const lines = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="360" height="480">',
    '<rect width="360" height="480" fill="#f5efe4"/>',
    '<rect width="360" height="62" fill="#1d2a33"/>',
    '<text x="26" y="40" font-family="sans-serif" font-size="24" fill="white">Booking desk</text>',
    '<circle cx="180" cy="258" r="87" fill="white"/>',
    `<path d="${path}" fill="none" stroke="${accent}" stroke-width="8" stroke-linejoin="round" stroke-linecap="round"/>`,
    `<text x="180" y="390" text-anchor="middle" font-family="sans-serif" font-size="26" fill="#1d2a33">${label}</text>`,
    '</svg>',
  ];
  return `data:image/svg+xml,${encodeURIComponent(lines.join(''))}`;
}
