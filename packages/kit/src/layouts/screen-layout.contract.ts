import type { FieldProblem } from '@deckster/engine/layout';

import { defineLayoutContract } from '@deckster/engine/layout';
import { Effect, Schema } from 'effect';

import {
  CHROME_HINT,
  chromeField,
  EYEBROW_HINT,
  EyebrowField,
  REVEAL_HINT,
  RevealField,
  textField,
} from '#layout-fields.ts';

/**
 * The most callouts a screen takes; more points on one picture is a tour, which is several slides.
 */
export const MAX_CALLOUTS = 4;

/**
 * The longest callout label, in characters: two lines in the four-column gutter beside a wide
 * screen, one line beside a phone.
 */
export const CALLOUT_LABEL_MAX_CHARS = 32;

/**
 * The longest screen title, in characters: two lines at the smallest fit step, as on a gallery.
 */
export const SCREEN_TITLE_MAX_CHARS = 60;

/**
 * The longest description of the picture, in characters.
 */
export const SCREEN_ALT_MAX_CHARS = 120;

/**
 * The longest address in the browser bar, in characters: a host and a short path.
 */
export const SCREEN_ADDRESS_MAX_CHARS = 40;

/**
 * The most words of the sentence set in the gutter beside the screen.
 */
export const SCREEN_CONTEXT_MAX_WORDS = 14;

/**
 * The most words of the source or caveat on the bottom line.
 */
const SCREEN_FOOTNOTE_MAX_WORDS = 20;

/**
 * The highest percentage a callout may sit at, measured from the picture's top or left edge.
 */
const MAX_PERCENT = 100;

/**
 * The frames the kit draws around the picture: a browser window, a phone, a laptop, or none.
 */
export const SCREEN_FRAMES = ['browser', 'phone', 'laptop', 'none'] as const;

/**
 * One of {@link SCREEN_FRAMES}.
 */
export type ScreenFrame = (typeof SCREEN_FRAMES)[number];

/**
 * A screen for the example that needs no file: a small web app drawn in a few flat shapes, with its
 * size written out so the layout can read its proportions.
 */
const EXAMPLE_SCREEN =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1600' height='1000' " +
  "viewBox='0 0 160 100'%3E%3Crect width='160' height='100' fill='%23eef1ec'/%3E" +
  "%3Crect width='160' height='8' fill='%23ffffff'/%3E" +
  "%3Crect y='8' width='40' height='92' fill='%23ffffff'/%3E" +
  "%3Crect x='6' y='16' width='28' height='6' rx='2' fill='%23dfe8e1'/%3E" +
  "%3Crect x='6' y='26' width='28' height='6' rx='2' fill='%23dfe8e1'/%3E" +
  "%3Ccircle cx='96' cy='46' r='14' fill='%23c6d6ca'/%3E" +
  "%3Ccircle cx='96' cy='46' r='4' fill='%232c6e4f'/%3E" +
  "%3Crect x='8' y='88' width='24' height='6' rx='3' fill='%231c2420'/%3E%3C/svg%3E";

/**
 * A percentage of the picture's width or height, from its left or top edge.
 */
const Percent = Schema.Finite.check(
  Schema.isBetween(
    { minimum: 0, maximum: MAX_PERCENT },
    { message: `Expected a percentage of the picture, from 0 to ${MAX_PERCENT}` },
  ),
);

/**
 * One callout: a point on the picture, in percent from its top-left corner, and what is there.
 */
const Callout = Schema.Struct({
  x: Percent,
  y: Percent,
  label: textField(CALLOUT_LABEL_MAX_CHARS, 'a callout label'),
});

/**
 * One callout as a slide's frontmatter writes it, decoded.
 */
export type ScreenCallout = typeof Callout.Type;

/**
 * The problems with a screen's fields that one field alone cannot show: an address without a
 * browser bar to show it in, and a reveal with nothing to reveal.
 *
 * @param frontmatter - The decoded fields.
 * @returns One problem per field that is wrong.
 */
export function screenProblems(frontmatter: {
  readonly frame: ScreenFrame;
  readonly address?: string | undefined;
  readonly callouts?: readonly ScreenCallout[] | undefined;
  readonly reveal: boolean;
}): FieldProblem[] {
  const problems: FieldProblem[] = [];
  if (frontmatter.address !== undefined && frontmatter.frame !== 'browser') {
    problems.push({
      path: 'address',
      message:
        "Only the browser frame shows an address; this screen's frame is " +
        `${frontmatter.frame}.`,
      fix: 'Write `frame: browser` to show the address, or leave `address` out.',
    });
  }

  if (frontmatter.reveal && (frontmatter.callouts ?? []).length === 0) {
    problems.push({
      path: 'reveal',
      message: '`reveal` brings in the callouts one per step, and this screen has none.',
      fix: 'Add `callouts:` to point at parts of the screen, or leave `reveal` out.',
    });
  }

  return problems;
}

/**
 * The contract of the `screen` layout: one product screen, uncropped and as large as the slide
 * allows, in a frame the kit draws, with up to four numbered callouts.
 */
export const screenLayoutContract = defineLayoutContract({
  name: 'screen',
  description:
    'One product screen as large as the slide allows, shown whole (never cropped) under the ' +
    'title, in a frame the kit draws from the brand: a browser window (the default, with an ' +
    'optional `address`), a phone, a laptop, or none. The picture is `src` and `alt`; leave its ' +
    'own window or device chrome out of the file, since the frame draws it. Up to four ' +
    '`callouts` point at parts of it: each puts a numbered marker at `x` and `y` (percent of the ' +
    'picture from its top-left corner) and sets its `label` beside the frame under the same ' +
    'number, never over the interface; with `reveal: true` they arrive one per step and earlier ' +
    'ones recede. Defaults to the gradient surface, where a framed screen reads as a product ' +
    'shot. Use it for a product, an app, a dashboard or a page the audience should look at; use ' +
    'split when the text matters as much as the picture, gallery for two to four screens, and ' +
    'image for a photo.',
  schema: Schema.Struct({
    eyebrow: EyebrowField,
    src: Schema.NonEmptyString,
    alt: textField(SCREEN_ALT_MAX_CHARS, 'a picture description'),
    frame: Schema.Literals(SCREEN_FRAMES).pipe(
      Schema.withDecodingDefaultKey(Effect.succeed<ScreenFrame>('browser')),
    ),
    address: Schema.optionalKey(textField(SCREEN_ADDRESS_MAX_CHARS, 'an address')),
    callouts: Schema.optionalKey(
      Schema.Array(Callout).check(
        Schema.isMaxLength(MAX_CALLOUTS, { message: `Expected at most ${MAX_CALLOUTS} callouts` }),
      ),
    ),
    reveal: RevealField,
    chrome: chromeField(true),
  }),
  hints: {
    eyebrow: EYEBROW_HINT,
    src:
      'Name the screenshot or screen recording still, a file in the deck folder such as ' +
      'assets/screens/map.png, cut to the app itself without its browser bar or phone bezel.',
    alt: `Say what the screen shows, up to ${SCREEN_ALT_MAX_CHARS} characters.`,
    frame:
      'Write `frame: browser` for a web app (the default), `phone` for a tall phone screen, ' +
      '`laptop` for a desktop app shown on a device, or `none` for the picture alone.',
    address:
      `Write the address the browser bar shows, up to ${SCREEN_ADDRESS_MAX_CHARS} characters, ` +
      'such as `trees.larkfield.example/map`; only `frame: browser` shows it, and a long one ' +
      'is cut short with an ellipsis when the window is narrow, so keep it to the host and a word.',
    callouts:
      `List up to ${MAX_CALLOUTS} callouts in the order you will talk about them, each with ` +
      '`x` and `y` (where the marker goes, in percent of the picture from its top-left corner: ' +
      '`x: 72, y: 18`) and `label` (what is there, up to ' +
      `${CALLOUT_LABEL_MAX_CHARS} characters). Put the point just beside or at the end of what ` +
      'it names (the right end of a button, the corner of a card), since the marker covers ' +
      'what is under it.',
    reveal: REVEAL_HINT,
    chrome: CHROME_HINT,
  },
  title: { required: true, maxChars: SCREEN_TITLE_MAX_CHARS },
  slots: {
    body: {
      description:
        'One optional sentence beside the screen, above the callout labels: what the audience ' +
        'is looking at, when the title does not say it. Leave it out to give the slide to the ' +
        'picture. Put the points on the screen in `callouts:`, not here.',
      accepts: ['text'],
    },
    footnote: {
      description: 'A source or caveat on the bottom line.',
      accepts: ['text'],
    },
  },
  budget: {
    body: { maxWords: SCREEN_CONTEXT_MAX_WORDS },
    footnote: { maxWords: SCREEN_FOOTNOTE_MAX_WORDS },
  },
  checks: screenProblems,
  surface: 'gradient',
  pptx: {
    type: 'title-only',
    placeholders: [
      { kind: 'title', from: { selector: '.kit-title' } },
      { kind: 'body', from: { slot: 'body' } },
    ],
  },
  example: {
    frontmatter: {
      title: 'Crews plan every planting round from one map',
      eyebrow: 'The request service',
      src: EXAMPLE_SCREEN,
      alt: 'The planting map, with requests listed on the left and a pin on the hottest block',
      address: 'trees.larkfield.example/map',
      callouts: [
        { x: 22, y: 19, label: 'Requests, hottest blocks first' },
        { x: 66, y: 38, label: 'Each pin is a resident request' },
        { x: 21, y: 91, label: 'One button sends the round' },
      ],
      reveal: true,
    },
    body: [
      '<Notes>',
      'Start with the list on the left: it is sorted by heat, not by date. Then the pins, then the',
      'button that hands the round to the crews.',
      '</Notes>',
      '',
    ].join('\n'),
  },
});
