import { defineLayoutContract } from '@deckster/engine/layout';
import { Schema } from 'effect';

import {
  CHROME_HINT,
  chromeField,
  EYEBROW_HINT,
  EyebrowField,
  RevealField,
  textField,
} from '#layout-fields.ts';

/**
 * The fewest distinct parts in a cutaway.
 */
const MIN_LAYERS = 2;

/**
 * The most parts that can separate on one slide.
 */
const MAX_LAYERS = 3;

/**
 * The length of a layer's short name, in characters.
 */
const LABEL_MAX_CHARS = 26;

/**
 * The length of the line explaining what a layer does, in characters.
 */
const DETAIL_MAX_CHARS = 80;

/**
 * The length of the visual description of a layer, in characters.
 */
const ALT_MAX_CHARS = 120;

/**
 * The length of the conclusion under the layers, in characters.
 */
const TAKEAWAY_MAX_CHARS = 110;

/**
 * The longest fitted title, in characters.
 */
const TITLE_MAX_CHARS = 60;

/**
 * One illustrated part, ordered from the top of the stack down.
 */
const Layer = Schema.Struct({
  src: Schema.NonEmptyString,
  alt: textField(ALT_MAX_CHARS, 'a layer image description'),
  label: textField(LABEL_MAX_CHARS, 'a layer label'),
  detail: textField(DETAIL_MAX_CHARS, 'an explanation of the layer'),
});

/**
 * One decoded image and annotation in the product cutaway.
 */
export type ProductCutawayLayer = typeof Layer.Type;

/**
 * The contract for an illustrated product stack that separates to explain each part.
 */
export const productCutawayLayoutContract = defineLayoutContract({
  name: 'product-cutaway',
  description:
    'Show two or three illustrated layers of one product or software screen. Give the layers ' +
    'equally sized local artwork and write them front to back, so the first image is also the ' +
    'face of the assembled view. The first click separates the top two layers. A third layer ' +
    'separates on the next click. Each gets an aligned label and explanation. State what ' +
    'the parts enable together in the takeaway.',
  schema: Schema.Struct({
    eyebrow: EyebrowField,
    layers: Schema.Array(Layer).check(
      Schema.isMinLength(MIN_LAYERS, { message: 'Expected at least two illustrated layers' }),
      Schema.isMaxLength(MAX_LAYERS, { message: 'Expected at most three illustrated layers' }),
    ),
    takeaway: textField(TAKEAWAY_MAX_CHARS, 'a product takeaway'),
    reveal: RevealField,
    chrome: chromeField(true),
  }),
  hints: {
    eyebrow: EYEBROW_HINT,
    layers:
      `List ${MIN_LAYERS} to ${MAX_LAYERS} layers front to back, each with a local image \`src\`, ` +
      `descriptive \`alt\` (up to ${ALT_MAX_CHARS} characters), \`label\` (up to ${LABEL_MAX_CHARS} ` +
      `characters) and \`detail\` (up to ${DETAIL_MAX_CHARS} characters). Use a wide shared ratio, ` +
      'ideally about 4:1, and consistent bounds. Put the assembled face first. Keep important ' +
      'artwork away from the edges.',
    takeaway: `State what the layers do together in one sentence, up to ${TAKEAWAY_MAX_CHARS} characters.`,
    reveal:
      'Use `reveal: true` to begin assembled, expose the second layer on click one and the ' +
      'third, if present, on click two. The finished export shows all labels and the takeaway. ' +
      'Omit it to start with the layers open.',
    chrome: CHROME_HINT,
  },
  title: { required: true, maxChars: TITLE_MAX_CHARS },
  slots: {
    footnote: {
      description: 'An optional source or caveat on the bottom line.',
      accepts: ['text'],
    },
  },
  budget: { footnote: { maxWords: 24 } },
  pptx: {
    type: 'title-only',
    placeholders: [{ kind: 'title', from: { selector: '.kit-title' } }],
  },
  example: {
    frontmatter: {
      title: 'One cabinet protects the battery and the room',
      eyebrow: 'Battery cabinet',
      reveal: true,
      layers: [
        {
          src: exampleLayer('%23d9e4ff', '%23243a9a', 'M58 50h284v54H58z M86 73h40'),
          alt: 'The closed cabinet face with a recessed handle',
          label: 'Safety enclosure',
          detail: 'The lock covers the battery terminals.',
        },
        {
          src: exampleLayer(
            '%23d7eddf',
            '%23306248',
            'M74 77h250 M115 49v56 M199 49v56 M283 49v56',
          ),
          alt: 'Three green thermal fins across the cabinet',
          label: 'Cooling plate',
          detail: 'The fins carry heat away from the cells.',
        },
      ],
      takeaway: 'The cabinet keeps the cells cool and the terminals out of reach.',
    },
    body: '<Notes>Show the cabinet first, then [click] explain the enclosure and cooling plate.</Notes>\n',
  },
});

/**
 * Draws a file-free illustration for the generated example.
 *
 * @param fill - The percent-escaped fill color.
 * @param stroke - The percent-escaped line color.
 * @param path - The preset SVG path for the layer.
 * @returns A local data image that can be rendered offline.
 */
function exampleLayer(fill: string, stroke: string, path: string): string {
  return (
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='150'%3E" +
    `%3Crect width='398' height='148' x='1' y='1' rx='16' fill='${fill}'/%3E` +
    `%3Cpath d='${path}' stroke='${stroke}' stroke-width='5' fill='none'/%3E%3C/svg%3E`
  );
}
