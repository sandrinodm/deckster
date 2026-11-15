import {
  AGENDA_DETAIL_MAX_CHARS,
  AGENDA_DETAIL_MAX_CHARS_DENSE,
  AGENDA_ITEM_MAX_CHARS,
  AGENDA_ITEM_MAX_CHARS_DENSE,
  AGENDA_TIME_MAX_CHARS,
} from '#layouts/agenda-layout.contract.ts';
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
  MAX_ROWS,
  OPTION_NAME_MAX_CHARS,
  OPTION_SUMMARY_MAX_CHARS,
  OPTION_SUMMARY_MAX_CHARS_IN_THREE,
  ROW_LABEL_MAX_CHARS,
  ROW_LABEL_MAX_CHARS_IN_THREE,
  VALUE_MAX_CHARS,
  VALUE_MAX_CHARS_IN_THREE,
} from '#layouts/comparison-layout.contract.ts';
import { IMAGE_TEXT_PLACES } from '#layouts/image-layout.contract.ts';
import {
  CONTACT_LABEL_MAX_CHARS,
  CONTACT_TEXT_MAX_CHARS,
  EYEBROW_MAX_CHARS,
} from '#layouts/layout-fields.ts';
import { LOGO_NAME_MAX_CHARS, LOGO_NAME_MAX_CHARS_DENSE } from '#layouts/logos-layout.contract.ts';
import { QUOTE_NAME_MAX_CHARS, QUOTE_ROLE_MAX_CHARS } from '#layouts/quote-layout.contract.ts';
import { SECTION_NUMBER_MAX_CHARS } from '#layouts/section-layout.contract.ts';
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
  MEMBER_NAME_MAX_CHARS,
  MEMBER_NAME_MAX_CHARS_GRID,
  MEMBER_ROLE_MAX_CHARS,
  MEMBER_ROLE_MAX_CHARS_GRID,
  MEMBER_ROLE_MAX_CHARS_ROSTER,
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
 * A portrait standing in for a photo: a vector image, so it loads with no file.
 */
const PORTRAIT =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='800' height='1000'%3E" +
  "%3Crect width='800' height='1000' fill='%23b8c2bd'/%3E%3C/svg%3E";

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
   * Covers with and without a photo.
   */
  title: [false, true].map((media) => ({
    name: media ? 'photo' : 'type',
    frontmatter: { byline: fill(BYLINE_MAX_CHARS), date: fill(DATE_MAX_CHARS) },
    filled: media ? ['media'] : [],
  })),

  /**
   * A divider with the widest number and a summary, and one without a summary.
   */
  section: [true, false].map((summary) => ({
    name: summary ? 'summary' : 'bare',
    frontmatter: { number: 'W'.repeat(SECTION_NUMBER_MAX_CHARS) },
    filled: [],
    body: summary,
  })),

  /**
   * A plain statement and a quote.
   */
  statement: [false, true].map((quote) => ({
    name: quote ? 'quote' : 'plain',
    frontmatter: {},
    filled: quote ? ['attribution'] : [],
  })),

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
   * them with a photo, with a line of context and a footnote.
   */
  team: [4, 6, 8].map((count) => ({
    name: `${count}-people`,
    frontmatter: {
      members: items(count, (index) => ({
        name: fillName(count > 4 ? MEMBER_NAME_MAX_CHARS_GRID : MEMBER_NAME_MAX_CHARS),
        role: fill(teamRoleLimit(count)),
        ...(index % 2 === 0 ? { photo: PORTRAIT } : {}),
      })),
    },
    filled: ['footnote'],
  })),

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
   * footnote.
   */
  cards: [2, 3, 4].map((count) => ({
    name: `${count}-cards`,
    frontmatter: {
      cards: items(count, () => ({
        icon: 'leaf',
        title: fill(count === 4 ? CARD_TITLE_MAX_CHARS_IN_FOUR : CARD_TITLE_MAX_CHARS),
        text: fill(count === 4 ? CARD_TEXT_MAX_CHARS_IN_FOUR : CARD_TEXT_MAX_CHARS),
      })),
    },
    filled: ['footnote'],
  })),

  /**
   * Three, four and five steps with the longest titles and text, a current step, a line of context
   * and a footnote.
   */
  steps: [3, 4, 5].map((count) => ({
    name: `${count}-steps`,
    frontmatter: {
      current: 2,
      steps: items(count, () => ({
        title: fill(count === 5 ? STEP_TITLE_MAX_CHARS_IN_FIVE : STEP_TITLE_MAX_CHARS),
        text: fill(stepTextLimit(count)),
      })),
    },
    filled: ['footnote'],
  })),

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
   * Four milestones with the longest text and five with the dense text, a current milestone, a line
   * of context and a footnote.
   */
  timeline: [4, MAX_MILESTONES].map((count) => ({
    name: `${count}-milestones`,
    frontmatter: {
      current: 2,
      milestones: items(count, () => ({
        date: fill(MILESTONE_DATE_MAX_CHARS),
        title: fill(count > 4 ? MILESTONE_TITLE_MAX_CHARS_DENSE : MILESTONE_TITLE_MAX_CHARS),
        detail: fill(count > 4 ? MILESTONE_DETAIL_MAX_CHARS_DENSE : MILESTONE_DETAIL_MAX_CHARS),
      })),
    },
    filled: ['footnote'],
  })),

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
