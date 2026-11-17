import {
  AGENDA_DETAIL_MAX_CHARS,
  AGENDA_DETAIL_MAX_CHARS_DENSE,
  AGENDA_ITEM_MAX_CHARS,
  AGENDA_ITEM_MAX_CHARS_DENSE,
  AGENDA_TIME_MAX_CHARS,
} from '#layouts/agenda-layout.contract.ts';
import {
  ASK_AMOUNT_MAX_CHARS,
  ASK_DATE_MAX_CHARS,
  ASK_FUND_LABEL_MAX_CHARS,
  ASK_LABEL_MAX_CHARS,
  ASK_MAX_FUNDS,
  ASK_MAX_MILESTONES,
  ASK_MILESTONE_MAX_CHARS,
  ASK_MIN_MILESTONES,
} from '#layouts/ask-layout.contract.ts';
import {
  MAX_TILES,
  MIN_TILES,
  TILE_ALT_MAX_CHARS,
  TILE_LABEL_MAX_CHARS,
  TILE_LABEL_MAX_CHARS_CROWDED,
  TILE_TEXT_MAX_CHARS,
  TILE_TEXT_MAX_CHARS_CROWDED,
  TILE_TITLE_MAX_CHARS,
  TILE_TITLE_MAX_CHARS_CROWDED,
  TILE_VALUE_MAX_CHARS,
} from '#layouts/bento-layout.contract.ts';
import {
  BIO_NAME_MAX_CHARS,
  BIO_ROLE_MAX_CHARS,
  MAX_BIO_CONTACTS,
} from '#layouts/bio-layout.contract.ts';
import {
  CARD_TEXT_MAX_CHARS,
  CARD_TEXT_MAX_CHARS_IN_FOUR,
  CARD_TITLE_MAX_CHARS,
  CARD_TITLE_MAX_CHARS_IN_FOUR,
} from '#layouts/cards-layout.contract.ts';
import {
  CLOSING_CONTACT_MAX_CHARS_IN_THREE,
  MAX_CLOSING_CONTACTS,
  QR_ADDRESS_MAX_CHARS,
  QR_MAX_CHARS,
  QR_SEGMENT_MAX_CHARS,
} from '#layouts/closing-layout.contract.ts';
import {
  COLUMN_ITEM_MAX_CHARS,
  COLUMN_ITEM_MAX_CHARS_IN_FOUR,
  COLUMN_NOTE_MAX_CHARS,
  COLUMN_NOTE_MAX_CHARS_IN_FOUR,
  COLUMN_TITLE_MAX_CHARS,
  COLUMN_TITLE_MAX_CHARS_IN_FOUR,
  MAX_COLUMN_ITEMS,
  MAX_COLUMNS,
  MIN_COLUMNS,
} from '#layouts/columns-layout.contract.ts';
import {
  MAX_ROWS,
  OPTION_NAME_MAX_CHARS,
  OPTION_SUMMARY_MAX_CHARS,
  OPTION_SUMMARY_MAX_CHARS_IN_THREE,
  ROW_LABEL_MAX_CHARS,
  ROW_LABEL_MAX_CHARS_IN_THREE,
  VALUE_MAX_CHARS,
  VALUE_MAX_CHARS_IN_THREE,
} from '#layouts/comparison-layout.contract.ts';
import {
  EQUATION_LABEL_MAX_CHARS,
  EQUATION_RESULT_LABEL_MAX_CHARS,
  EQUATION_VALUE_MAX_CHARS,
  MAX_TERMS,
  MIN_TERMS,
} from '#layouts/equation-layout.contract.ts';
import {
  MAX_PICTURES,
  MIN_PICTURES,
  PICTURE_ALT_MAX_CHARS,
  PICTURE_CAPTION_MAX_CHARS,
  PICTURE_CAPTION_MAX_CHARS_IN_FOUR,
} from '#layouts/gallery-layout.contract.ts';
import { IMAGE_TEXT_PLACES } from '#layouts/image-layout.contract.ts';
import {
  CONTACT_LABEL_MAX_CHARS,
  CONTACT_TEXT_MAX_CHARS,
  EYEBROW_MAX_CHARS,
} from '#layouts/layout-fields.ts';
import { LOGO_NAME_MAX_CHARS, LOGO_NAME_MAX_CHARS_DENSE } from '#layouts/logos-layout.contract.ts';
import {
  MATRIX_AXIS_MAX_CHARS,
  MATRIX_CROWDED_ITEMS,
  MATRIX_ITEM_MAX_CHARS,
  MATRIX_ITEM_MAX_CHARS_CROWDED,
  MATRIX_QUADRANT_MAX_CHARS,
  MAX_MATRIX_ITEMS,
} from '#layouts/matrix-layout.contract.ts';
import {
  MAX_PROOF_METRICS,
  PROOF_CUSTOMER_MAX_CHARS,
  PROOF_LABEL_MAX_CHARS,
  PROOF_NAME_MAX_CHARS,
  PROOF_ROLE_MAX_CHARS,
  PROOF_TIMEFRAME_MAX_CHARS,
  PROOF_VALUE_MAX_CHARS,
} from '#layouts/proof-layout.contract.ts';
import { QUOTE_NAME_MAX_CHARS, QUOTE_ROLE_MAX_CHARS } from '#layouts/quote-layout.contract.ts';
import {
  CALLOUT_LABEL_MAX_CHARS,
  MAX_CALLOUTS,
  SCREEN_ADDRESS_MAX_CHARS,
  SCREEN_ALT_MAX_CHARS,
} from '#layouts/screen-layout.contract.ts';
import { SECTION_NUMBER_MAX_CHARS, SECTION_NUMERALS } from '#layouts/section-layout.contract.ts';
import {
  SHIFT_HEADING_MAX_CHARS,
  SHIFT_LABEL_MAX_CHARS,
  SHIFT_TEXT_MAX_CHARS,
  SHIFT_VALUE_MAX_CHARS,
} from '#layouts/shift-layout.contract.ts';
import { SPLIT_RATIOS, SPLIT_SIDES } from '#layouts/split-layout.contract.ts';
import {
  MAX_STATS,
  MIN_STATS,
  STAT_DELTA_MAX_CHARS,
  STAT_LABEL_MAX_CHARS,
  STAT_LABEL_MAX_CHARS_IN_FOUR,
  STAT_VALUE_MAX_CHARS,
} from '#layouts/stats-layout.contract.ts';
import {
  STEP_TEXT_MAX_CHARS,
  STEP_TEXT_MAX_CHARS_IN_FIVE,
  STEP_TEXT_MAX_CHARS_IN_FOUR,
  STEP_TITLE_MAX_CHARS,
  STEP_TITLE_MAX_CHARS_IN_FIVE,
} from '#layouts/steps-layout.contract.ts';
import {
  MAX_PAST_ORGANISATIONS,
  MEMBER_EDGE_MAX_CHARS,
  MEMBER_NAME_MAX_CHARS,
  MEMBER_NAME_MAX_CHARS_GRID,
  MEMBER_ROLE_MAX_CHARS,
  MEMBER_ROLE_MAX_CHARS_GRID,
  MEMBER_ROLE_MAX_CHARS_ROSTER,
  PAST_ORGANISATION_MAX_CHARS,
} from '#layouts/team-layout.contract.ts';
import {
  MILESTONE_DATE_MAX_CHARS,
  MAX_MILESTONES,
  MILESTONE_DETAIL_MAX_CHARS,
  MILESTONE_DETAIL_MAX_CHARS_DENSE,
  MILESTONE_TITLE_MAX_CHARS,
  MILESTONE_TITLE_MAX_CHARS_DENSE,
} from '#layouts/timeline-layout.contract.ts';
import { BYLINE_MAX_CHARS, DATE_MAX_CHARS } from '#layouts/title-layout.contract.ts';

/**
 * Text that fills a field to a given length, written to wrap as badly as real text can: long words
 * at the lengths real prose has (`Internationalization`, `Wojciechowski-Hammond`), wide capitals
 * and `m` and `w` runs, few short words to break a line on. Budgets are calibrated against it, so a
 * slide of real words at the limits wraps no worse.
 */
const FILLER =
  'Internationalization of the Westminster woodland maintenance work, overseen by Maximilian ' +
  'Wojciechowski-Hammond, made Wolverhampton and Northumberland commit more summer money to ' +
  'watering every new tree; ';

/**
 * Names that set as wide as names get: long given and family names, hyphenated, with wide letters.
 */
const NAME_FILLER =
  'Oluwaseun Adeyemi-Clarke Maximilian Wojciechowski-Hammond Bartholomew Montgomery-Whitworth ';

/**
 * The local part of a contact address at its widest: long and hyphenated.
 */
const ADDRESS_FILLER = 'm.wojciechowski-hammond.westminster-woodland';

/**
 * The parts of a QR address at their widest: each part between slashes and dots as long as one line
 * takes, in wide letters.
 */
const QR_PART_FILLER = 'wolverhampton-woodlands-management-maximum';

/**
 * Wide stat values of the longest length a stat allows, one per column of a row of four.
 */
const WIDE_VALUES = ['$1,234.5', '−12.5 °C', '1,240,00', '99.99 %'];

/**
 * An amount of the longest length an ask allows, in the widest figures.
 */
const ASK_WIDE_AMOUNT = '$8,888,888';

/**
 * The most people a team sets as one row of portraits; the team layout uses the same split.
 */
const TEAM_ROW_MAX_PEOPLE = 4;

/**
 * The most people a team sets as a grid of three columns; more are a roster.
 */
const TEAM_GRID_MAX_PEOPLE = 6;

/**
 * The most steps a process sets with the first, widest step text; four and five steps hold less.
 */
const STEPS_WIDE_TEXT_MAX_COUNT = 3;

/**
 * The number of steps at which the step text takes its four-column limit.
 */
const FOUR_STEPS = 4;

/**
 * The kinds of tile a bento limit case cycles through: a figure, a heading with an icon and text,
 * and a picture.
 */
const TILE_KINDS = 3;

/**
 * The horizontal place of each callout on a screen, in percent from the picture's left edge: the
 * top-left corner, the top-right corner, the centre and the bottom-right corner, in that order.
 */
const CALLOUT_X_PERCENTS = [0, 100, 50, 100];

/**
 * The vertical place of each callout on a screen, in percent from the picture's top edge, in the
 * same order as {@link CALLOUT_X_PERCENTS}.
 */
const CALLOUT_Y_PERCENTS = [0, 0, 50, 100];

/**
 * A trailing dot or hyphen, which a filler cut to a length must not end on.
 */
const TRAILING_DOT_OR_HYPHEN_PATTERN = /[.-]$/u;

/**
 * A trailing hyphen, which a filler cut to a length must not end on.
 */
const TRAILING_HYPHEN_PATTERN = /-$/u;

/**
 * A letter, which a filler cut to a length must end on.
 */
const LETTER_PATTERN = /\p{L}/u;

/**
 * The longest role in a team of `count`: a row, a grid or a roster.
 *
 * @param count - The number of people.
 */
function teamRoleLimit(count: number): number {
  if (count <= TEAM_ROW_MAX_PEOPLE) {
    return MEMBER_ROLE_MAX_CHARS;
  }

  return count <= TEAM_GRID_MAX_PEOPLE ? MEMBER_ROLE_MAX_CHARS_GRID : MEMBER_ROLE_MAX_CHARS_ROSTER;
}

/**
 * The longest step text in a process of `count` steps.
 *
 * @param count - The number of steps.
 */
function stepTextLimit(count: number): number {
  if (count <= STEPS_WIDE_TEXT_MAX_COUNT) {
    return STEP_TEXT_MAX_CHARS;
  }

  return count === FOUR_STEPS ? STEP_TEXT_MAX_CHARS_IN_FOUR : STEP_TEXT_MAX_CHARS_IN_FIVE;
}

/**
 * A logo standing in for an organisation's mark: a solid wordmark-shaped vector image, six times as
 * wide as it is tall, the widest and heaviest a mark gets.
 */
const WIDE_MARK =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='600' height='100'%3E" +
  "%3Crect width='600' height='100' fill='%23333333'/%3E%3C/svg%3E";

/**
 * A portrait standing in for a photo: a vector image, so it loads with no file.
 */
const PORTRAIT =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='800' height='1000'%3E" +
  "%3Crect width='800' height='1000' fill='%23b8c2bd'/%3E%3C/svg%3E";

/**
 * A wide app screen standing in for a screenshot, at 16:10, with its size written out so the screen
 * layout reads its proportions.
 */
const WIDE_SCREEN =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1600' height='1000'%3E" +
  "%3Crect width='1600' height='1000' fill='%23eef1ec'/%3E%3C/svg%3E";

/**
 * A tall phone screen standing in for a screenshot, at 390 by 844.
 */
const PHONE_SCREEN =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='390' height='844'%3E" +
  "%3Crect width='390' height='844' fill='%23eef1ec'/%3E%3C/svg%3E";

/**
 * The longest contacts a layout lists, `count` of them.
 *
 * @param count - How many.
 * @param textChars - The length of each address.
 */
function contacts(
  count: number,
  textChars = CONTACT_TEXT_MAX_CHARS,
): { label: string; text: string; href: string }[] {
  return Array.from({ length: count }, () => ({
    label: fill(CONTACT_LABEL_MAX_CHARS),
    text: fillAddress(textChars),
    href: 'https://example.com/',
  }));
}

/**
 * `count` items made by `make`, each told its index.
 *
 * @param count - How many.
 * @param make - Builds one item.
 */
function items<Item>(count: number, make: (index: number) => Item): Item[] {
  return Array.from({ length: count }, (_, index) => make(index));
}

/**
 * A bento tile at the longest its kind allows on a slide of `count` tiles, of the kind `seed`
 * picks, so each case puts a different kind in the lead's cell.
 *
 * @param seed - Picks the kind: a figure, a heading with text, or a picture, in turn.
 * @param count - The number of tiles on the slide.
 */
function bentoTile(seed: number, count: number): Record<string, string> {
  const crowded = count > MIN_TILES;
  switch (seed % TILE_KINDS) {
    case 0: {
      return {
        value: (WIDE_VALUES[seed % WIDE_VALUES.length] ?? '').slice(0, TILE_VALUE_MAX_CHARS),
        label: fill(crowded ? TILE_LABEL_MAX_CHARS_CROWDED : TILE_LABEL_MAX_CHARS),
      };
    }
    case 1: {
      return {
        icon: 'leaf',
        title: fill(crowded ? TILE_TITLE_MAX_CHARS_CROWDED : TILE_TITLE_MAX_CHARS),
        text: fill(crowded ? TILE_TEXT_MAX_CHARS_CROWDED : TILE_TEXT_MAX_CHARS),
      };
    }
    default: {
      return { src: PORTRAIT, alt: fill(TILE_ALT_MAX_CHARS) };
    }
  }
}

/**
 * Where the items of a matrix limit case stand, the marked item first, spread over the plot as a
 * real map spreads them, one on the vertical axis: with captions clear of the corners they take, as
 * an author leaves them, and without captions into the corners too.
 */
const MATRIX_POSITIONS: Readonly<
  Record<'captions' | 'bare', readonly (readonly [number, number])[]>
> = {
  /**
   * With captions: clear of the corners, as an author leaves them.
   */
  captions: [
    [74, 74],
    [26, 76],
    [88, 48],
    [42, 48],
    [62, 26],
    [20, 28],
    [50, 90],
    [64, 40],
    [84, 26],
    [52, 10],
  ],

  /**
   * Without captions: into the corners too.
   */
  bare: [
    [78, 86],
    [20, 90],
    [50, 72],
    [88, 62],
    [12, 52],
    [38, 44],
    [66, 38],
    [86, 20],
    [24, 16],
    [56, 10],
  ],
};

/**
 * The frontmatter of a matrix limit case: `count` items with the longest names their count allows,
 * the first marked `us`, every axis label at its longest and, with `captions`, every quadrant
 * caption at its longest.
 *
 * @param count - The number of items.
 * @param captions - Whether the quadrants have captions.
 */
function matrixFrontmatter(count: number, captions: boolean): Record<string, unknown> {
  const name =
    count >= MATRIX_CROWDED_ITEMS ? MATRIX_ITEM_MAX_CHARS_CROWDED : MATRIX_ITEM_MAX_CHARS;
  const axis = { low: fill(MATRIX_AXIS_MAX_CHARS), high: fill(MATRIX_AXIS_MAX_CHARS) };
  return {
    x: axis,
    y: axis,
    ...(captions ? { quadrants: items(4, () => fill(MATRIX_QUADRANT_MAX_CHARS)) } : {}),
    items: MATRIX_POSITIONS[captions ? 'captions' : 'bare']
      .slice(0, count)
      .map(([x, y], index) => ({
        name: fill(name),
        x,
        y,
        ...(index === 0 ? { us: true } : {}),
      })),
  };
}

/**
 * A shift state with every text at its longest, with or without its figure.
 *
 * @param figure - Whether the state has a figure.
 */
function shiftState(figure: boolean): Record<string, string> {
  return {
    label: fill(SHIFT_LABEL_MAX_CHARS),
    ...(figure ? { value: (WIDE_VALUES[0] ?? '').slice(0, SHIFT_VALUE_MAX_CHARS) } : {}),
    title: fill(SHIFT_HEADING_MAX_CHARS),
    text: fill(SHIFT_TEXT_MAX_CHARS),
  };
}

/**
 * One slide at the limits of its layout: the frontmatter, and which named slots to fill. Every
 * named slot the case lists is filled to its budget by the stress test, and `body` always is.
 */
export type LimitCase = {
  /**
   * A short name for the case, used in the slide id.
   */
  name: string;

  /**
   * The layout's frontmatter fields, filled to their limits; the stress test adds `layout`, `title`
   * and `eyebrow`.
   */
  frontmatter: Readonly<Record<string, unknown>>;

  /**
   * The named slots to fill besides `body`.
   */
  filled: readonly string[];

  /**
   * Whether `body` is filled too; it is unless the case says `false`.
   */
  body?: boolean;
};

/**
 * Every variant of the kit's layouts with every field and slot filled to its limit: the worst cases
 * the budget stress test (`packages/cli/src/lint/budget-limits.test.ts`) renders in each brand and
 * lints, so every budget in a contract is proven where it binds. A new layout adds its cases here.
 */
export const LIMIT_CASES: Readonly<Record<string, readonly LimitCase[]>> = {
  /**
   * The default layout has no fields.
   */
  default: [{ name: 'column', frontmatter: {}, filled: [] }],

  /**
   * Covers with and without a photo, with the photo across the whole slide, and a centred type-only
   * cover.
   */
  title: [
    ...[false, true].map((media) => ({
      name: media ? 'photo' : 'type',
      frontmatter: { byline: fill(BYLINE_MAX_CHARS), date: fill(DATE_MAX_CHARS) },
      filled: media ? ['media'] : [],
    })),
    {
      name: 'photo-full',
      frontmatter: { byline: fill(BYLINE_MAX_CHARS), date: fill(DATE_MAX_CHARS), picture: 'full' },
      filled: ['media'],
    },
    {
      name: 'centred',
      frontmatter: { byline: fill(BYLINE_MAX_CHARS), date: fill(DATE_MAX_CHARS), align: 'center' },
      filled: [],
    },
  ],

  /**
   * Dividers with the widest number, with and without a summary: set from the left and centred,
   * each with the number on the top line and as the large numeral; and beside a photo, with both
   * numerals.
   */
  section: [
    ...['left', 'center'].flatMap((align) =>
      SECTION_NUMERALS.flatMap((numeral) =>
        [true, false].map((summary) => ({
          name: `${align}-${numeral}-${summary ? 'summary' : 'bare'}`,
          frontmatter: { number: 'W'.repeat(SECTION_NUMBER_MAX_CHARS), numeral, align },
          filled: [],
          body: summary,
        })),
      ),
    ),
    ...SECTION_NUMERALS.map((numeral) => ({
      name: `photo-${numeral}`,
      frontmatter: { number: 'W'.repeat(SECTION_NUMBER_MAX_CHARS), numeral },
      filled: ['media'],
    })),
  ],

  /**
   * A plain statement and a quote, each set from the left and centred with its emphasis marked; and
   * a giant statement set from the left and centred, with its emphasis marked.
   */
  statement: [
    ...[false, true].flatMap((quote) =>
      [false, true].map((centred) => ({
        name: `${quote ? 'quote' : 'plain'}${centred ? '-centred' : ''}`,
        frontmatter: centred ? { align: 'center', emphasis: 'underline' } : {},
        filled: quote ? ['attribution'] : [],
      })),
    ),
    ...['left', 'center'].map((align) => ({
      name: `giant-${align}`,
      frontmatter: { size: 'giant', align, emphasis: 'underline' },
      filled: [],
    })),
  ],

  /**
   * Both widths, with and without the aside, every one with a footnote.
   */
  content: ['text', 'full'].flatMap((width) =>
    [true, false].map((aside) => ({
      name: `${width}${aside ? '-aside' : ''}`,
      frontmatter: { width },
      filled: aside ? ['aside', 'footnote'] : ['footnote'],
    })),
  ),

  /**
   * Every ratio on both sides, framed and bleeding, with a caption and a footnote.
   */
  split: SPLIT_RATIOS.flatMap((ratio) =>
    SPLIT_SIDES.flatMap((side) =>
      [false, true].map((bleed) => ({
        name: `${ratio.replace(':', '-')}-${side}${bleed ? '-bleed' : ''}`,
        frontmatter: { ratio, side, bleed },
        filled: ['media', 'caption', 'footnote'],
      })),
    ),
  ),

  /**
   * A chart across all twelve columns, and beside the aside, both with a footnote; the stress test
   * fills the body with text, which the chart region takes like a chart.
   */
  chart: [true, false].map((aside) => ({
    name: aside ? 'aside' : 'full',
    frontmatter: {},
    filled: aside ? ['aside', 'footnote'] : ['footnote'],
  })),

  /**
   * Code beside the aside and across all twelve columns, both with a footnote; the stress test
   * fills the code region with text, which it takes like a block.
   */
  code: [true, false].map((aside) => ({
    name: aside ? 'aside' : 'full',
    frontmatter: {},
    filled: aside ? ['aside', 'footnote'] : ['footnote'],
  })),

  /**
   * A demo beside the aside and across all twelve columns, both with a footnote.
   */
  demo: [true, false].map((aside) => ({
    name: aside ? 'aside' : 'full',
    frontmatter: {},
    filled: aside ? ['aside', 'footnote'] : ['footnote'],
  })),

  /**
   * Four items with the longest titles and detail, and seven with the dense ones, each with a time
   * and the current part marked.
   */
  agenda: [4, 7].map((count) => ({
    name: `${count}-items`,
    frontmatter: {
      current: 2,
      items: items(count, () => ({
        title: fill(count > 4 ? AGENDA_ITEM_MAX_CHARS_DENSE : AGENDA_ITEM_MAX_CHARS),
        detail: fill(count > 4 ? AGENDA_DETAIL_MAX_CHARS_DENSE : AGENDA_DETAIL_MAX_CHARS),
        time: '00:00 h'.slice(0, AGENDA_TIME_MAX_CHARS),
      })),
    },
    filled: ['footnote'],
  })),

  /**
   * A row of four, a grid of six and a roster of eight, with the longest names and roles, half of
   * them with a photo, with a line of context and a footnote; and two to four founders with an edge
   * and three marks each.
   */
  team: [
    ...[4, 6, 8].map((count) => ({
      name: `${count}-people`,
      frontmatter: {
        members: items(count, (index) => ({
          name: fillName(
            count > TEAM_ROW_MAX_PEOPLE ? MEMBER_NAME_MAX_CHARS_GRID : MEMBER_NAME_MAX_CHARS,
          ),
          role: fill(teamRoleLimit(count)),
          ...(index % 2 === 0 ? { photo: PORTRAIT } : {}),
        })),
      },
      filled: ['footnote'],
    })),
    // Two, three and four founders, each with the longest edge and three of the widest marks.
    ...[2, 3, 4].map((count) => ({
      name: `${count}-founders`,
      frontmatter: {
        members: items(count, (index) => ({
          name: fillName(MEMBER_NAME_MAX_CHARS),
          role: fill(MEMBER_ROLE_MAX_CHARS),
          ...(index % 2 === 0 ? { photo: PORTRAIT } : {}),
          edge: fill(MEMBER_EDGE_MAX_CHARS),
          previously: items(MAX_PAST_ORGANISATIONS, () => ({
            name: fillName(PAST_ORGANISATION_MAX_CHARS),
            src: WIDE_MARK,
          })),
        })),
      },
      filled: ['footnote'],
    })),
  ],

  /**
   * A quote with the longest name and role, beside a portrait and across the slide.
   */
  quote: [true, false].map((portrait) => ({
    name: portrait ? 'portrait' : 'plain',
    frontmatter: {
      name: fillName(QUOTE_NAME_MAX_CHARS),
      role: fill(QUOTE_ROLE_MAX_CHARS),
      ...(portrait ? { photo: PORTRAIT } : {}),
    },
    filled: [],
  })),

  /**
   * A case study at its fullest (three metrics each with a figure before, a timeframe, a portrait,
   * the widest logo and a footnote) and at its sparest (one metric, no portrait, no logo).
   */
  proof: [true, false].map((full) => ({
    name: full ? 'full' : 'sparse',
    frontmatter: {
      name: fillName(PROOF_NAME_MAX_CHARS),
      role: fill(PROOF_ROLE_MAX_CHARS),
      metrics: items(full ? MAX_PROOF_METRICS : 1, (index) => ({
        value: (WIDE_VALUES[index] ?? '').slice(0, PROOF_VALUE_MAX_CHARS),
        label: fill(PROOF_LABEL_MAX_CHARS),
        ...(full ? { from: (WIDE_VALUES[index + 1] ?? '').slice(0, PROOF_VALUE_MAX_CHARS) } : {}),
      })),
      ...(full
        ? {
            photo: PORTRAIT,
            logo: { name: fillName(PROOF_CUSTOMER_MAX_CHARS), src: WIDE_MARK },
            timeframe: fill(PROOF_TIMEFRAME_MAX_CHARS),
          }
        : {}),
    },
    filled: full ? ['footnote'] : [],
  })),

  /**
   * A speaker with the longest name and role and two contacts, with and without a photo.
   */
  bio: [true, false].map((photo) => ({
    name: photo ? 'photo' : 'initials',
    frontmatter: {
      name: fillName(BIO_NAME_MAX_CHARS),
      role: fill(BIO_ROLE_MAX_CHARS),
      contacts: contacts(MAX_BIO_CONTACTS),
      ...(photo ? { photo: PORTRAIT } : {}),
    },
    filled: [],
  })),

  /**
   * The widest amount with its label, four milestones and five allocations at their longest, and
   * two milestones with no allocations, each with a line of context.
   */
  ask: [ASK_MAX_MILESTONES, ASK_MIN_MILESTONES].map((count) => ({
    name: `${count}-milestones`,
    frontmatter: {
      amount: ASK_WIDE_AMOUNT.slice(0, ASK_AMOUNT_MAX_CHARS),
      label: fill(ASK_LABEL_MAX_CHARS),
      milestones: items(count, () => ({
        text: fill(ASK_MILESTONE_MAX_CHARS),
        by: fill(ASK_DATE_MAX_CHARS),
      })),
      ...(count === ASK_MAX_MILESTONES
        ? {
            funds: items(ASK_MAX_FUNDS, () => ({
              label: fill(ASK_FUND_LABEL_MAX_CHARS),
              share: 100 / ASK_MAX_FUNDS,
            })),
          }
        : {}),
    },
    filled: [],
  })),

  /**
   * A closing slide with the longest QR link and three contacts, and one with neither.
   */
  closing: [true, false].map((full) => ({
    name: full ? 'qr' : 'bare',
    frontmatter: full
      ? {
          qr: fillQr(),
          contacts: contacts(MAX_CLOSING_CONTACTS, CLOSING_CONTACT_MAX_CHARS_IN_THREE),
        }
      : {},
    filled: [],
  })),

  /**
   * Two, three and four cards with icons, the longest titles and text, a line of context and a
   * footnote; and the same cards bare, without context or footnote, where the most room is and the
   * roomy levels are tried with the longest strings.
   */
  cards: [2, 3, 4].flatMap((count) => {
    const frontmatter = {
      cards: items(count, () => ({
        icon: 'leaf',
        title: fill(count === 4 ? CARD_TITLE_MAX_CHARS_IN_FOUR : CARD_TITLE_MAX_CHARS),
        text: fill(count === 4 ? CARD_TEXT_MAX_CHARS_IN_FOUR : CARD_TEXT_MAX_CHARS),
      })),
    };
    return [
      { name: `${count}-cards`, frontmatter, filled: ['footnote'] },
      { name: `${count}-cards-bare`, frontmatter, filled: [], body: false },
    ];
  }),

  /**
   * Boards of two, three and four columns, each with the most items, the longest headings, tags and
   * items, the second column current, with a line of context and a footnote.
   */
  columns: Array.from({ length: MAX_COLUMNS - MIN_COLUMNS + 1 }, (_, index) => {
    const count = MIN_COLUMNS + index;
    const four = count === MAX_COLUMNS;
    return {
      name: `${count}-columns`,
      frontmatter: {
        current: 2,
        columns: items(count, () => ({
          title: fill(four ? COLUMN_TITLE_MAX_CHARS_IN_FOUR : COLUMN_TITLE_MAX_CHARS),
          note: fill(four ? COLUMN_NOTE_MAX_CHARS_IN_FOUR : COLUMN_NOTE_MAX_CHARS),
          items: items(MAX_COLUMN_ITEMS, () =>
            fill(four ? COLUMN_ITEM_MAX_CHARS_IN_FOUR : COLUMN_ITEM_MAX_CHARS),
          ),
        })),
      },
      filled: ['footnote'],
    };
  }),

  /**
   * Three, four and five steps with the longest titles and text, a current step, a line of context
   * and a footnote; and the same steps bare, without context or footnote, where the most room is
   * and the roomy levels are tried with the longest strings.
   */
  steps: [3, 4, 5].flatMap((count) => {
    const frontmatter = {
      current: 2,
      steps: items(count, () => ({
        title: fill(count === 5 ? STEP_TITLE_MAX_CHARS_IN_FIVE : STEP_TITLE_MAX_CHARS),
        text: fill(stepTextLimit(count)),
      })),
    };
    return [
      { name: `${count}-steps`, frontmatter, filled: ['footnote'] },
      { name: `${count}-steps-bare`, frontmatter, filled: [], body: false },
    ];
  }),

  /**
   * Two and three options, one recommended, over six rows of the longest labels and values, with a
   * footnote.
   */
  comparison: [2, 3].map((count) => ({
    name: `${count}-options`,
    frontmatter: {
      options: items(count, (index) => ({
        name: fill(OPTION_NAME_MAX_CHARS),
        summary: fill(count === 3 ? OPTION_SUMMARY_MAX_CHARS_IN_THREE : OPTION_SUMMARY_MAX_CHARS),
        ...(index === 1 ? { recommended: true } : {}),
      })),
      rows: items(MAX_ROWS, (index) => ({
        label: fill(count === 3 ? ROW_LABEL_MAX_CHARS_IN_THREE : ROW_LABEL_MAX_CHARS),
        winner: (index % count) + 1,
        values: items(count, () => fill(count === 3 ? VALUE_MAX_CHARS_IN_THREE : VALUE_MAX_CHARS)),
      })),
    },
    filled: ['footnote'],
  })),

  /**
   * A plot of six items with the longest names and of ten with the crowded names, each with the
   * longest axis labels and quadrant captions, a marked item, the note and a footnote; and the ten
   * without captions or note, the plot centred. Items stand where real maps put them: spread over
   * the plot, some in the captions' corners and one on the vertical axis.
   */
  matrix: [
    ...[MATRIX_CROWDED_ITEMS - 1, MAX_MATRIX_ITEMS].map((count) => ({
      name: `${count}-items`,
      frontmatter: matrixFrontmatter(count, true),
      filled: ['footnote'],
    })),
    {
      name: `${MAX_MATRIX_ITEMS}-items-bare`,
      frontmatter: matrixFrontmatter(MAX_MATRIX_ITEMS, false),
      filled: ['footnote'],
      body: false,
    },
  ],

  /**
   * Four milestones with the longest text and five with the dense text, a current milestone, a line
   * of context and a footnote; and the same milestones bare, without context or footnote, where the
   * most room is and the roomy levels are tried with the longest strings.
   */
  timeline: [4, MAX_MILESTONES].flatMap((count) => {
    const frontmatter = {
      current: 2,
      milestones: items(count, () => ({
        date: fill(MILESTONE_DATE_MAX_CHARS),
        title: fill(count > 4 ? MILESTONE_TITLE_MAX_CHARS_DENSE : MILESTONE_TITLE_MAX_CHARS),
        detail: fill(count > 4 ? MILESTONE_DETAIL_MAX_CHARS_DENSE : MILESTONE_DETAIL_MAX_CHARS),
      })),
    };
    return [
      { name: `${count}-milestones`, frontmatter, filled: ['footnote'] },
      { name: `${count}-milestones-bare`, frontmatter, filled: [], body: false },
    ];
  }),

  /**
   * Walls of six and eighteen, every logo set as its name (the widest a mark gets), with a line of
   * context and a footnote.
   */
  logos: [6, 18].map((count) => ({
    name: `${count}-logos`,
    frontmatter: {
      logos: items(count, () => ({
        name: fill(count > 12 ? LOGO_NAME_MAX_CHARS_DENSE : LOGO_NAME_MAX_CHARS),
      })),
    },
    filled: ['footnote'],
  })),

  /**
   * A photo with the text at each place and a caption.
   */
  image: IMAGE_TEXT_PLACES.map((text) => ({
    name: text,
    frontmatter: { text },
    filled: ['media', 'caption'],
  })),

  /**
   * Two, three and four pictures with the longest descriptions and captions, half of them shown
   * whole, with a line of context and a footnote.
   */
  gallery: Array.from({ length: MAX_PICTURES - MIN_PICTURES + 1 }, (_, index) => {
    const count = MIN_PICTURES + index;
    const caption =
      count === MAX_PICTURES ? PICTURE_CAPTION_MAX_CHARS_IN_FOUR : PICTURE_CAPTION_MAX_CHARS;
    return {
      name: `${count}-pictures`,
      frontmatter: {
        pictures: items(count, (picture) => ({
          src: PORTRAIT,
          alt: fill(PICTURE_ALT_MAX_CHARS),
          caption: fill(caption),
          ...(picture % 2 === 1 ? { fit: 'contain' } : {}),
        })),
      },
      filled: ['footnote'],
    };
  }),

  /**
   * A screen in each frame with four callouts at the longest labels, at the picture's corners and
   * centre, with the longest description and address, a sentence beside it and a footnote.
   */
  screen: (['browser', 'phone', 'laptop', 'none'] as const).map((frame) => ({
    name: frame,
    frontmatter: {
      frame,
      src: frame === 'phone' ? PHONE_SCREEN : WIDE_SCREEN,
      alt: fill(SCREEN_ALT_MAX_CHARS),
      ...(frame === 'browser' ? { address: fill(SCREEN_ADDRESS_MAX_CHARS) } : {}),
      callouts: items(MAX_CALLOUTS, (callout) => ({
        x: CALLOUT_X_PERCENTS[callout],
        y: CALLOUT_Y_PERCENTS[callout],
        label: fill(CALLOUT_LABEL_MAX_CHARS),
      })),
      reveal: true,
    },
    filled: ['footnote'],
  })),

  /**
   * Three, four and five tiles with the longest figures, labels, headings and text, each kind of
   * tile in the lead's cell and the small ones, with a line of context and a footnote.
   */
  bento: Array.from({ length: MAX_TILES - MIN_TILES + 1 }, (_, index) => {
    const count = MIN_TILES + index;
    return {
      name: `${count}-tiles`,
      frontmatter: { tiles: items(count, (tile) => bentoTile(tile + index, count)) },
      filled: ['footnote'],
    };
  }),

  /**
   * A shift with a figure on both sides and one without, every text at its longest, with a line of
   * context and a footnote.
   */
  shift: [true, false].map((figures) => ({
    name: figures ? 'figures' : 'plain',
    frontmatter: { from: shiftState(figures), to: shiftState(figures) },
    filled: ['footnote'],
  })),

  /**
   * A table region across the twelve columns and beside the aside, both with a footnote; the stress
   * test fills it with text, which it takes like a table.
   */
  table: [true, false].map((aside) => ({
    name: aside ? 'aside' : 'full',
    frontmatter: {},
    filled: aside ? ['aside', 'footnote'] : ['footnote'],
  })),

  /**
   * Two, three and four stats with the longest values, labels and deltas, and a footnote.
   */
  stats: Array.from({ length: MAX_STATS - MIN_STATS + 1 }, (_, index) => {
    const count = MIN_STATS + index;
    const label = fill(count === MAX_STATS ? STAT_LABEL_MAX_CHARS_IN_FOUR : STAT_LABEL_MAX_CHARS);
    return {
      name: `${count}-up`,
      frontmatter: {
        stats: WIDE_VALUES.slice(0, count).map((value) => ({
          value: value.slice(0, STAT_VALUE_MAX_CHARS),
          label,
          delta: `−${fill(STAT_DELTA_MAX_CHARS - 1)}`,
        })),
      },
      filled: ['footnote'],
    };
  }),

  /**
   * Two, three and four terms and the result with the widest figures and the longest labels, every
   * operator, a line of context and a footnote.
   */
  equation: Array.from({ length: MAX_TERMS - MIN_TERMS + 1 }, (_, index) => {
    const count = MIN_TERMS + index;
    const ops = ['divide', 'times', 'minus'] as const;
    return {
      name: `${count}-terms`,
      frontmatter: {
        terms: WIDE_VALUES.slice(0, count).map((value, term) => ({
          value: value.slice(0, EQUATION_VALUE_MAX_CHARS),
          label: fill(EQUATION_LABEL_MAX_CHARS),
          ...(term === 0 ? {} : { op: ops[term - 1] }),
        })),
        result: {
          value: (WIDE_VALUES[0] ?? '').slice(0, EQUATION_VALUE_MAX_CHARS),
          label: fill(EQUATION_RESULT_LABEL_MAX_CHARS),
        },
      },
      filled: ['footnote'],
    };
  }),
};

/**
 * The longest eyebrow, for every case.
 */
export const LIMIT_EYEBROW = fill(EYEBROW_MAX_CHARS);

/**
 * Filler text of exactly `length` characters, ending on a letter.
 *
 * @param length - The number of characters, 1 or more.
 */
export function fill(length: number): string {
  return cut(FILLER, length);
}

/**
 * A name of exactly `length` characters, as wide as names get.
 *
 * @param length - The number of characters, 1 or more.
 */
export function fillName(length: number): string {
  return cut(NAME_FILLER, length);
}

/**
 * A contact address of exactly `length` characters, a long hyphenated local part at a domain.
 *
 * @param length - The number of characters, 24 or more.
 */
export function fillAddress(length: number): string {
  const domain = '@woodland.example';
  const local = ADDRESS_FILLER.slice(0, length - domain.length);
  return `${local.replace(TRAILING_DOT_OR_HYPHEN_PATTERN, 'm')}${domain}`;
}

/**
 * A QR link at its limits: the longest address the code's caption takes, its host part as long as
 * one line takes, at a domain, and a path filling the rest.
 */
export function fillQr(): string {
  /**
   * A part of the address of `length` wide letters, ending on a letter.
   */
  const part = (length: number): string =>
    QR_PART_FILLER.slice(0, length).replace(TRAILING_HYPHEN_PATTERN, 'm');
  const host = `${part(QR_SEGMENT_MAX_CHARS)}.example`;
  return `https://www.${host}/${part(QR_ADDRESS_MAX_CHARS - host.length - 1)}`.slice(
    0,
    QR_MAX_CHARS,
  );
}

/**
 * A filler cut to exactly `length` characters, capitalised, ending on a letter.
 *
 * @param filler - The text to repeat.
 * @param length - The number of characters, 1 or more.
 */
function cut(filler: string, length: number): string {
  const text = filler.repeat(Math.ceil(length / filler.length) + 1).slice(0, length);
  const last = text.at(-1) ?? 's';
  const ending = LETTER_PATTERN.test(last) ? last : 's';
  return `${text.charAt(0).toUpperCase()}${text.slice(1, -1)}${ending}`;
}
