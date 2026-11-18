import type { FieldProblem } from '@deckster/engine/layout';

import { defineLayoutContract } from '@deckster/engine/layout';
import { Schema } from 'effect';

import {
  CHROME_HINT,
  chromeField,
  EYEBROW_HINT,
  EyebrowField,
  IconNameField,
  FOCAL_HINT,
  FocalField,
  REVEAL_HINT,
  RevealField,
  textField,
  TreatmentField,
} from '#layouts/layout-fields.ts';

/**
 * The fewest tiles a bento slide shows: the lead and two beside it.
 */
export const MIN_TILES = 3;

/**
 * The most tiles a bento slide shows; more facets are a table or two slides.
 */
export const MAX_TILES = 5;

/**
 * The longest tile figure, in characters: `$262B`, `−92%` or `1 in 4`.
 */
export const TILE_VALUE_MAX_CHARS = 8;

/**
 * The longest line under a tile's figure, in characters: two lines in a five-column tile.
 */
export const TILE_LABEL_MAX_CHARS = 48;

/**
 * The longest tile heading, in characters: one line in a five-column tile.
 */
export const TILE_TITLE_MAX_CHARS = 28;

/**
 * The longest tile text, in characters: two lines in a five-column tile.
 */
export const TILE_TEXT_MAX_CHARS = 64;

/**
 * The longest line under a figure when four or five tiles share the slide, in characters: two lines
 * in the three-column tile under the lead.
 */
export const TILE_LABEL_MAX_CHARS_CROWDED = 32;

/**
 * The longest tile heading when four or five tiles share the slide, in characters.
 */
export const TILE_TITLE_MAX_CHARS_CROWDED = 22;

/**
 * The longest tile text when four or five tiles share the slide, in characters.
 */
export const TILE_TEXT_MAX_CHARS_CROWDED = 44;

/**
 * The longest description of a tile's picture, in characters.
 */
export const TILE_ALT_MAX_CHARS = 120;

/**
 * The longest bento title, in characters: three lines in the five-column title cell at the smallest
 * fit step, as beside a split's media.
 */
export const BENTO_TITLE_MAX_CHARS = 40;

/**
 * The most words of the line under the title, in the title cell.
 */
export const BENTO_CONTEXT_MAX_WORDS = 12;

/**
 * The most words of the source or caveat on the bottom line, under the grid.
 */
const BENTO_FOOTNOTE_MAX_WORDS = 24;

/**
 * One tile: a figure with a label, a heading with a line of text and an optional icon, or a
 * picture. Which kind a tile is follows from the fields it sets; {@link bentoProblems} holds each
 * tile to one kind.
 */
const Tile = Schema.Struct({
  value: Schema.optionalKey(
    Schema.Union([Schema.Finite, textField(TILE_VALUE_MAX_CHARS, 'a tile value')]),
  ),
  label: Schema.optionalKey(textField(TILE_LABEL_MAX_CHARS, 'a tile label')),
  title: Schema.optionalKey(textField(TILE_TITLE_MAX_CHARS, 'a tile title')),
  text: Schema.optionalKey(textField(TILE_TEXT_MAX_CHARS, 'a tile text')),
  icon: Schema.optionalKey(IconNameField),
  src: Schema.optionalKey(Schema.NonEmptyString),
  alt: Schema.optionalKey(textField(TILE_ALT_MAX_CHARS, 'a picture description')),
  focal: FocalField,
  treatment: TreatmentField,
});

/**
 * One tile as a slide's frontmatter writes it, decoded.
 */
export type BentoTile = typeof Tile.Type;

/**
 * What a tile shows, from the fields it sets.
 */
export type BentoTileKind = 'figure' | 'text' | 'picture';

/**
 * The fields each kind of tile shows.
 */
const KIND_FIELDS: Readonly<Record<BentoTileKind, readonly (keyof BentoTile)[]>> = {
  /**
   * A figure and what it counts.
   */
  figure: ['value', 'label'],

  /**
   * A heading, a line of text and an icon.
   */
  text: ['title', 'text', 'icon'],

  /**
   * A file, its description, the part of it to keep in view and the brand treatment it is drawn in.
   */
  picture: ['src', 'alt', 'focal', 'treatment'],
};

/**
 * The kind of a tile: a picture when it names a file, a figure when it has a value, else text.
 *
 * @param tile - The decoded tile.
 */
export function tileKind(tile: BentoTile): BentoTileKind {
  if (tile.src !== undefined) {
    return 'picture';
  }

  return tile.value === undefined ? 'text' : 'figure';
}

/**
 * The problems with a list of tiles: each one must be exactly one kind, with the fields that kind
 * needs (a figure its `label`, a picture its `alt`, a text tile its `title`) and none of
 * another's.
 *
 * @param tiles - The decoded tiles.
 * @returns One problem per tile that is wrong, naming the tile.
 */
export function bentoProblems(tiles: readonly BentoTile[]): FieldProblem[] {
  return tiles.flatMap((tile, index) => tileProblems(tile, `tiles[${index}]`));
}

/**
 * The contract of the `bento` layout: three to five facets of one subject on tiles of unequal
 * weight, the title in the first cell.
 */
export const bentoLayoutContract = defineLayoutContract({
  name: 'bento',
  description:
    'Three to five facets of one subject on tiles of unequal weight, with the title in the ' +
    'top-left cell of the grid rather than above it. The first tile is the lead: it takes the ' +
    'large cell at the top right, on the accent surface, so put the facet the point rests on ' +
    'first; the second stands under the title and the rest under the lead. ' +
    'Each tile, from `tiles:`, is a figure (`value` and `label`), a heading with a line of text ' +
    'and an optional `icon`, or a picture (`src` and `alt`), and kinds may mix. Use it for one ' +
    'thing seen from several sides (a product, a result, a place) when one facet matters most; ' +
    'use cards when the ideas are equal peers, stats when every facet is a number of equal ' +
    'weight, and gallery when every tile is a picture.',
  schema: Schema.Struct({
    eyebrow: EyebrowField,
    tiles: Schema.Array(Tile).check(
      Schema.isMinLength(MIN_TILES, { message: `Expected at least ${MIN_TILES} tiles` }),
      Schema.isMaxLength(MAX_TILES, { message: `Expected at most ${MAX_TILES} tiles` }),
    ),
    reveal: RevealField,
    chrome: chromeField(true),
  }),
  hints: {
    eyebrow: EYEBROW_HINT,
    tiles:
      `List ${MIN_TILES} to ${MAX_TILES} tiles, the lead first. A figure tile has \`value\` ` +
      `(as shown, such as "38%", up to ${TILE_VALUE_MAX_CHARS} characters) and \`label\` (up ` +
      `to ${TILE_LABEL_MAX_CHARS}, ${TILE_LABEL_MAX_CHARS_CROWDED} with four or more tiles); a ` +
      `text tile has \`title\` (up to ${TILE_TITLE_MAX_CHARS}, ` +
      `${TILE_TITLE_MAX_CHARS_CROWDED} with four or more) and optionally \`text\` (up to ` +
      `${TILE_TEXT_MAX_CHARS}, ${TILE_TEXT_MAX_CHARS_CROWDED} with four or more) and \`icon\` ` +
      '(a name in the brand icon set, such as leaf); a picture tile has `src` (a file in the ' +
      `deck folder, such as assets/street.jpg), \`alt\` (up to ${TILE_ALT_MAX_CHARS} ` +
      `characters) and optionally \`focal\` and \`treatment\` (\`plain\` draws a screenshot ` +
      `as it is). ${FOCAL_HINT}`,
    reveal: REVEAL_HINT,
    chrome: CHROME_HINT,
  },
  title: { required: true, maxChars: BENTO_TITLE_MAX_CHARS },
  slots: {
    body: {
      description:
        'One short sentence under the title, in the title cell. Put the facets in `tiles:`, ' +
        'not here.',
      accepts: ['text'],
    },
    footnote: {
      description: 'A source or caveat on the bottom line, under the grid.',
      accepts: ['text'],
    },
  },
  budget: {
    body: { maxWords: BENTO_CONTEXT_MAX_WORDS },
    footnote: { maxWords: BENTO_FOOTNOTE_MAX_WORDS },
  },
  variants: [
    {
      name: 'four or five tiles',
      when: { counts: { tiles: { min: MIN_TILES + 1 } } },
      budget: {},
      // Two tiles share the cell under the lead, so the smallest tile is three columns wide.
      fields: {
        'tiles[].label': { maxChars: TILE_LABEL_MAX_CHARS_CROWDED },
        'tiles[].title': { maxChars: TILE_TITLE_MAX_CHARS_CROWDED },
        'tiles[].text': { maxChars: TILE_TEXT_MAX_CHARS_CROWDED },
      },
    },
  ],
  checks: (frontmatter) => bentoProblems(frontmatter.tiles),
  pptx: {
    type: 'title-only',
    placeholders: [
      { kind: 'title', from: { selector: '.kit-title' } },
      { kind: 'body', from: { slot: 'body' } },
    ],
  },
  example: {
    frontmatter: {
      title: "Eastgate's pilot paid off on every front",
      eyebrow: 'Three summers in',
      tiles: [
        { value: '−2.8 °C', label: 'cooler at 3 p.m. on pilot blocks' },
        { icon: 'trees', title: '1,240 trees', text: 'Planted on 38 blocks, 96% still alive.' },
        { value: '−31%', label: 'heat-related emergency visits' },
        { icon: 'users', title: 'Residents asked', text: '412 requests for a tree in 2026.' },
      ],
    },
    body: [
      'Pilot blocks against matched control blocks.',
      '',
      '<Footnote>Larkfield heat survey, June to August 2026.</Footnote>',
      '',
      '<Notes>',
      'Start with the temperature: it is the number the committee asked about. Then the rest.',
      '</Notes>',
      '',
    ].join('\n'),
  },
});

/**
 * The problems with one tile.
 *
 * @param tile - The decoded tile.
 * @param path - Where it is, for the problems: `tiles[2]`.
 */
function tileProblems(tile: BentoTile, path: string): FieldProblem[] {
  const kinds = [tile.value, tile.title, tile.src].filter((field) => field !== undefined).length;
  if (kinds !== 1) {
    return [
      {
        path,
        message: `The tile sets ${kinds === 0 ? 'none' : 'more than one'} of value, title and src.`,
        fix:
          'Give the tile exactly one of `value` (a figure, with `label`), `title` (a heading, ' +
          'with optional `text` and `icon`) or `src` (a picture, with `alt`).',
      },
    ];
  }

  return missingField(tile, path);
}

/**
 * The problem with a tile that lacks the field its kind needs, or sets one of another kind's.
 *
 * @param tile - The decoded tile, of one kind.
 * @param path - Where it is, for the problem.
 */
function missingField(tile: BentoTile, path: string): FieldProblem[] {
  const kind = tileKind(tile);
  if (kind === 'figure' && tile.label === undefined) {
    return [problem(`${path}.label`, 'A figure tile needs a `label`: what the figure counts.')];
  }

  if (kind === 'picture' && tile.alt === undefined) {
    return [problem(`${path}.alt`, 'A picture tile needs `alt`: what the picture shows.')];
  }

  const foreign = foreignFields(tile, kind);
  if (foreign.length > 0) {
    return [
      problem(
        `${path}.${foreign[0] ?? ''}`,
        `A ${kind} tile does not show ${foreign.map((field) => `\`${field}\``).join(', ')}.`,
      ),
    ];
  }

  return [];
}

/**
 * The fields a tile sets that its kind does not show.
 *
 * @param tile - The decoded tile.
 * @param kind - Its kind.
 */
function foreignFields(tile: BentoTile, kind: BentoTileKind): string[] {
  const own = new Set<string>(KIND_FIELDS[kind]);
  return Object.keys(tile).filter((field) => !own.has(field));
}

/**
 * A problem with a tile field, with the fix that names the tile kinds.
 *
 * @param path - The field's path.
 * @param message - What is wrong.
 */
function problem(path: string, message: string): FieldProblem {
  return {
    path,
    message,
    fix:
      'A figure tile takes `value` and `label`; a text tile `title`, `text` and `icon`; a ' +
      'picture tile `src`, `alt`, `focal` and `treatment`.',
  };
}
