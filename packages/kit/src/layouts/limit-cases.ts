import {
  ACTION_DUE_MAX_CHARS,
  ACTION_HEADING_MAX_CHARS,
  ACTION_OWNER_MAX_CHARS,
  ACTION_BADGE_MAX_CHARS,
  ACTION_TITLE_MAX_CHARS,
  MIN_ACTIONS,
  MAX_ACTIONS,
} from '#layouts/actions-layout.contract.ts';
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
  BEFORE_AFTER_ALT_MAX_CHARS,
  BEFORE_AFTER_CAPTION_MAX_CHARS,
  BEFORE_AFTER_LABEL_MAX_CHARS,
} from '#layouts/before-after-layout.contract.ts';
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
  MAX_MESSAGES,
  MESSAGE_NAME_MAX_CHARS,
  MESSAGE_ROLE_MAX_CHARS,
  MESSAGE_TEXT_MAX_CHARS,
  MIN_MESSAGES,
} from '#layouts/conversation-layout.contract.ts';
import {
  DASHBOARD_PANEL_TITLE_MAX_CHARS,
  DASHBOARD_PANEL_TITLE_MAX_CHARS_DENSE,
} from '#layouts/dashboard-layout.contract.ts';
import {
  DEFINITION_EXAMPLE_LABEL_MAX_CHARS,
  DEFINITION_EXAMPLE_MAX_CHARS,
  DEFINITION_KIND_MAX_CHARS,
  DEFINITION_PRONUNCIATION_MAX_CHARS,
  DEFINITION_TERM_MAX_CHARS,
} from '#layouts/definition-layout.contract.ts';
import {
  DO_DONT_ITEM_MAX_CHARS,
  DO_DONT_LABEL_MAX_CHARS,
  MIN_DO_DONT_ITEMS,
  MAX_DO_DONT_ITEMS,
} from '#layouts/do-dont-layout.contract.ts';
import {
  EQUATION_LABEL_MAX_CHARS,
  EQUATION_RESULT_LABEL_MAX_CHARS,
  EQUATION_VALUE_MAX_CHARS,
  MAX_TERMS,
  MIN_TERMS,
} from '#layouts/equation-layout.contract.ts';
import {
  EXERCISE_DENSE_FROM,
  EXERCISE_DURATION_MAX_CHARS,
  EXERCISE_GROUPS_MAX_CHARS,
  EXERCISE_INSTRUCTION_MAX_CHARS,
  EXERCISE_INSTRUCTION_MAX_CHARS_DENSE,
  EXERCISE_OUTPUT_MAX_CHARS,
} from '#layouts/exercise-layout.contract.ts';
import {
  FAQ_ANSWER_MAX_CHARS,
  FAQ_ANSWER_MAX_CHARS_DENSE,
  FAQ_QUESTION_MAX_CHARS,
  FAQ_QUESTION_MAX_CHARS_DENSE,
  MAX_FAQ_QUESTIONS,
  MIN_FAQ_QUESTIONS,
} from '#layouts/faq-layout.contract.ts';
import {
  FEATURE_DETAIL_MAX_CHARS,
  FEATURE_TITLE_MAX_CHARS,
  FEATURE_TITLE_MAX_CHARS_DENSE,
  FEATURES_DENSE_FROM,
  MAX_FEATURES_WITH_DETAILS,
} from '#layouts/features-layout.contract.ts';
import {
  MAX_PICTURES,
  MIN_PICTURES,
  PICTURE_ALT_MAX_CHARS,
  PICTURE_CAPTION_MAX_CHARS,
  PICTURE_CAPTION_MAX_CHARS_IN_FOUR,
} from '#layouts/gallery-layout.contract.ts';
import { IMAGE_TEXT_PLACES } from '#layouts/image-layout.contract.ts';
import { IMAGE_REVEAL_DOCKS, IMAGE_REVEAL_FITS } from '#layouts/image-reveal-layout.contract.ts';
import {
  CONTACT_LABEL_MAX_CHARS,
  CONTACT_TEXT_MAX_CHARS,
  EYEBROW_MAX_CHARS,
} from '#layouts/layout-fields.ts';
import { LOGO_NAME_MAX_CHARS, LOGO_NAME_MAX_CHARS_DENSE } from '#layouts/logos-layout.contract.ts';
import {
  MARKET_LABEL_MAX_CHARS,
  MARKET_NOTE_MAX_CHARS,
  MIN_MARKET_SIZES,
  MAX_MARKET_SIZES,
} from '#layouts/market-layout.contract.ts';
import {
  MATRIX_AXIS_MAX_CHARS,
  MATRIX_CROWDED_ITEMS,
  MATRIX_ITEM_MAX_CHARS,
  MATRIX_ITEM_MAX_CHARS_CROWDED,
  MATRIX_QUADRANT_MAX_CHARS,
  MAX_MATRIX_ITEMS,
} from '#layouts/matrix-layout.contract.ts';
import {
  MIN_PERSONA_ITEMS,
  MAX_PERSONA_ITEMS,
  PERSONA_ITEM_MAX_CHARS,
  PERSONA_LABEL_MAX_CHARS,
  PERSONA_NAME_MAX_CHARS,
  PERSONA_ROLE_MAX_CHARS,
} from '#layouts/persona-layout.contract.ts';
import {
  MAX_PLAN_FEATURES,
  MAX_PLANS,
  MIN_PLAN_FEATURES,
  MIN_PLANS,
  PLAN_BADGE_MAX_CHARS,
  PLAN_BADGE_MAX_CHARS_IN_FOUR,
  PLAN_DESCRIPTION_MAX_CHARS,
  PLAN_DESCRIPTION_MAX_CHARS_IN_FOUR,
  PLAN_FEATURE_MAX_CHARS,
  PLAN_FEATURE_MAX_CHARS_IN_FOUR,
  PLAN_NAME_MAX_CHARS,
  PLAN_NAME_MAX_CHARS_IN_FOUR,
  PLAN_PERIOD_MAX_CHARS,
  PLAN_PRICE_MAX_CHARS,
} from '#layouts/pricing-layout.contract.ts';
import {
  MAX_PROOF_METRICS,
  PROOF_CUSTOMER_MAX_CHARS,
  PROOF_LABEL_MAX_CHARS,
  PROOF_NAME_MAX_CHARS,
  PROOF_ROLE_MAX_CHARS,
  PROOF_TIMEFRAME_MAX_CHARS,
  PROOF_VALUE_MAX_CHARS,
} from '#layouts/proof-layout.contract.ts';
import {
  MAX_QUADRANT_ITEMS,
  MIN_QUADRANT_ITEMS,
  QUADRANTS_HIGHLIGHT_LABEL_MAX_CHARS,
  QUADRANT_COUNT,
  QUADRANT_ITEM_MAX_CHARS,
  QUADRANT_TITLE_MAX_CHARS,
} from '#layouts/quadrants-layout.contract.ts';
import {
  MIN_QUIZ_OPTIONS,
  MAX_QUIZ_OPTIONS,
  QUIZ_OPTION_MAX_CHARS,
  QUIZ_TILE_MAX_CHARS,
  QUIZ_EXPLANATION_MAX_CHARS,
  QUIZ_LABEL_MAX_CHARS,
} from '#layouts/quiz-layout.contract.ts';
import { QUOTE_NAME_MAX_CHARS, QUOTE_ROLE_MAX_CHARS } from '#layouts/quote-layout.contract.ts';
import {
  MIN_RECAP_POINTS,
  MAX_RECAP_POINTS,
  RECAP_POINT_MAX_CHARS,
  RECAP_POINT_MAX_CHARS_IN_FOUR,
  RECAP_POINT_MAX_CHARS_IN_THREE,
  RECAP_DETAIL_MAX_CHARS,
  RECAP_DETAIL_MAX_CHARS_IN_FOUR,
} from '#layouts/recap-layout.contract.ts';
import {
  MAX_RISKS,
  MIN_RISKS,
  RISK_NAME_MAX_CHARS,
  RISK_MITIGATION_MAX_CHARS,
  RISKS_HIGHLIGHT_LABEL_MAX_CHARS,
  RISKS_LABEL_MAX_CHARS,
  RISKS_LEVEL_LABEL_MAX_CHARS,
} from '#layouts/risks-layout.contract.ts';
import {
  SCHEDULE_MIN_PERIODS,
  SCHEDULE_MAX_PERIODS,
  SCHEDULE_MIN_LANES,
  SCHEDULE_MAX_LANES,
  SCHEDULE_MAX_BARS,
  SCHEDULE_MAX_BAR_CONTENT,
  SCHEDULE_PERIOD_MAX_CHARS,
  SCHEDULE_PERIOD_MAX_CHARS_DENSE,
  SCHEDULE_LANE_MAX_CHARS,
  SCHEDULE_BAR_MAX_CHARS,
  SCHEDULE_NOW_LABEL_MAX_CHARS,
  SCHEDULE_SPOKEN_LABEL_MAX_CHARS,
} from '#layouts/schedule-layout.contract.ts';
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
import {
  MIN_SOURCES,
  MAX_SOURCES,
  SOURCES_TWO_COLUMNS,
  SOURCE_TITLE_MAX_CHARS,
  SOURCE_TITLE_MAX_CHARS_DENSE,
  SOURCE_CREDIT_MAX_CHARS_DENSE,
  SOURCE_AUTHOR_MAX_CHARS,
  SOURCE_PUBLISHER_MAX_CHARS,
  SOURCE_YEAR_MAX_CHARS,
  SOURCE_URL_MAX_CHARS,
} from '#layouts/sources-layout.contract.ts';
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
  MIN_STATUS_ITEMS,
  MAX_STATUS_ITEMS,
  STATUS_NAME_MAX_CHARS,
  STATUS_LABEL_MAX_CHARS,
  STATUS_OWNER_MAX_CHARS,
  STATUS_NOTE_MAX_CHARS,
  STATUS_STATES,
} from '#layouts/status-layout.contract.ts';
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
import {
  MAX_VOICES,
  MIN_VOICES,
  VOICE_NAME_MAX_CHARS,
  VOICE_NAME_MAX_CHARS_IN_THREE,
  VOICE_QUOTE_MAX_CHARS,
  VOICE_QUOTE_MAX_CHARS_IN_THREE,
  VOICE_ROLE_MAX_CHARS,
} from '#layouts/voices-layout.contract.ts';

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
 * Long words with few short breaks stress a paragraph even when authored newlines are collapsed.
 */
const CONVERSATION_FILLER =
  'Westminster woodland maintenance overseen Wolverhampton Northumberland programme surveyors ';

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
 * `count` plans with the widest prices and the longest names, periods, descriptions and features
 * their count allows.
 *
 * @param count - The number of plans.
 * @param shape - How many features each plan lists, and whether the second plan is recommended.
 */
function pricingPlans(
  count: number,
  shape: { features: number; recommended: boolean },
): Record<string, unknown>[] {
  const four = count === MAX_PLANS;
  return items(count, (index) => ({
    name: fill(four ? PLAN_NAME_MAX_CHARS_IN_FOUR : PLAN_NAME_MAX_CHARS),
    price: (WIDE_VALUES[index % WIDE_VALUES.length] ?? '').slice(0, PLAN_PRICE_MAX_CHARS),
    period: fill(PLAN_PERIOD_MAX_CHARS),
    description: fill(four ? PLAN_DESCRIPTION_MAX_CHARS_IN_FOUR : PLAN_DESCRIPTION_MAX_CHARS),
    features: items(shape.features, () =>
      fill(four ? PLAN_FEATURE_MAX_CHARS_IN_FOUR : PLAN_FEATURE_MAX_CHARS),
    ),
    ...(shape.recommended && index === 1 ? { recommended: true } : {}),
  }));
}

/**
 * Real small charts and figures, kept at the panel density described in the dashboard contract.
 *
 * @param count - Two, three or four panels.
 */
function dashboardBody(count: number): string {
  const categories = count === 2 ? 4 : 3;
  const data = items(categories, (index) => ({
    district: fillName(count === 2 ? 10 : 6) + index,
    trees: 94 - index * 12,
  }));
  const bars = [
    '<BarChart',
    `data={${JSON.stringify(data)}}`,
    'x="district" y="trees" orientation="vertical"',
    'highlight="max" unit="trees" caption="Trees kept, 2026" />',
  ].join(' ');
  const trend = data.map((_row, index) => ({
    month: String(2023 + index),
    trees: 40 + index * 18,
  }));
  const caption = count === 2 ? ` caption=${JSON.stringify(fill(32))}` : '';
  const line = [
    '<LineChart',
    `data={${JSON.stringify(trend)}}`,
    'x="month" y="trees" unit="trees" zero',
    `highlight={{ series: "trees" }}${caption} />`,
  ].join(' ');
  const number = `<BigNumber value=${JSON.stringify(WIDE_VALUES[0])} label=${JSON.stringify(fill(18))} />`;
  const progress = '<Progress value={86} target={90} unit="%" label="blocks covered" />';
  return [bars.replace(' caption="Trees kept, 2026"', caption), line, number, progress]
    .slice(0, count)
    .join('\n\n');
}

/**
 * Dense chart geometry beyond the recommended two plots, including legends and value axes.
 */
function dashboardFourCharts(): string {
  const slices = items(3, (index) => ({ status: fillName(6) + index, share: 70 - index * 20 }));
  const trend = items(3, (index) => ({ month: String(2024 + index), trees: 500 + index * 500 }));
  return [
    dashboardBody(4).split('\n\n').slice(0, 2).join('\n\n'),
    `<Donut data={${JSON.stringify(slices)}}`,
    'x="status" y="share" unit="%" highlight="max" center="none" />',
    '',
    `<AreaChart data={${JSON.stringify(trend)}}`,
    'x="month" y="trees" unit="trees" highlight={{ series: "trees" }} />',
  ].join('\n');
}

/**
 * A four-row, three-column table beside a plotted chart, with the longest published labels.
 */
function dashboardTable(): string {
  const data = items(4, (index) => ({
    district: fillName(10) + index,
    alive: 94 - index * 3,
    planted: 1240 + index * 100,
  }));
  const columns = [
    { key: 'district', label: fillName(11) },
    { key: 'alive', label: fillName(11), unit: '%' },
    { key: 'planted', label: fillName(11), unit: 'trees' },
  ];
  return [
    `<Table data={${JSON.stringify(data)}} columns={${JSON.stringify(columns)}}`,
    `highlight={{ row: ${JSON.stringify(fillName(10) + '0')} }} />`,
    '',
    dashboardBody(2).split('\n\n')[0],
  ].join('\n');
}

/**
 * Four boxes with the longest labels and bullets, optionally with an icon in every heading.
 *
 * @param count - The bullets per box, at a count boundary.
 * @param icons - Whether every box names a brand icon.
 */
function quadrantBoxes(count: number, icons: boolean): Record<string, unknown>[] {
  return items(QUADRANT_COUNT, () => ({
    title: fill(QUADRANT_TITLE_MAX_CHARS),
    items: items(count, () => fill(QUADRANT_ITEM_MAX_CHARS)),
    ...(icons ? { icon: 'leaf' } : {}),
  }));
}

/**
 * Workstreams filled to their character limits, cycling through every labelled state.
 *
 * @param count - How many workstreams to generate.
 */
function statusItems(count: number): Record<string, unknown>[] {
  return items(count, (at) => ({
    name: fillName(STATUS_NAME_MAX_CHARS),
    status: STATUS_STATES[at % STATUS_STATES.length],
    owner: fillName(STATUS_OWNER_MAX_CHARS),
    note: fill(STATUS_NOTE_MAX_CHARS),
  }));
}

/**
 * A register of `count` risks with maximum names and one-line mitigations, both levels medium (the
 * widest word) and the second row highlighted.
 *
 * @param count - The number of risks.
 */
function riskRows(count: number): Record<string, unknown>[] {
  return items(count, (row) => ({
    name: fill(RISK_NAME_MAX_CHARS),
    likelihood: 'medium',
    impact: 'medium',
    mitigation: fill(RISK_MITIGATION_MAX_CHARS),
    ...(row === 1 ? { highlight: true } : {}),
  }));
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

  /**
   * Chart or component content to exercise instead of generated prose; budgets still fill the named
   * text slots. This keeps measured chart regions under test at their actual panel size.
   */
  bodyMdx?: string;
};

/**
 * Every variant of the kit's layouts with every field and slot filled to its limit: the worst cases
 * the budget stress test (`packages/cli/src/lint/budget-limits.test.ts`) renders in each brand and
 * lints, so every budget in a contract is proven where it binds. A new layout adds its cases here.
 */
export const LIMIT_CASES: Readonly<Record<string, readonly LimitCase[]>> = {
  /**
   * Every message count at its longest text and attribution, with context and footnote and bare.
   * Distinct speakers exercise every optional role; accent cases exercise the inverse replies.
   * Short titles keep the header at full size, leaving less height than a fitted long title.
   */
  conversation: [
    ...Array.from({ length: MAX_MESSAGES - MIN_MESSAGES + 1 }, (_, index) => {
      const count = MIN_MESSAGES + index;
      const frontmatter = {
        messages: items(count, (message) => ({
          name: `${fillName(MESSAGE_NAME_MAX_CHARS - 1)}${message + 1}`,
          role: fill(MESSAGE_ROLE_MAX_CHARS),
          side: message % 2 === 0 ? 'left' : 'right',
          text: fill(MESSAGE_TEXT_MAX_CHARS),
        })),
        reveal: true,
      };
      return [
        { name: `${count}-messages`, frontmatter, filled: ['footnote'] },
        { name: `${count}-messages-bare`, frontmatter, filled: [], body: false },
        {
          name: `${count}-messages-accent`,
          frontmatter: { ...frontmatter, surface: 'accent' },
          filled: ['footnote'],
        },
        {
          name: `${count}-messages-short-title`,
          frontmatter: {
            ...frontmatter,
            title: 'A reply makes the next step clear',
            surface: 'inverse',
            messages: frontmatter.messages.map((message) => ({
              ...message,
              text: cut(CONVERSATION_FILLER, MESSAGE_TEXT_MAX_CHARS),
            })),
          },
          filled: ['footnote'],
        },
      ];
    }).flat(),
    {
      name: 'gradient',
      frontmatter: {
        surface: 'gradient',
        messages: [
          { name: 'Maya', side: 'left', text: 'Will a survey confirm the space?' },
          { name: 'Dana', side: 'right', text: 'Yes. We will survey the pavement.' },
        ],
      },
      filled: ['footnote'],
    },
    {
      name: 'short-bare',
      frontmatter: {
        messages: [
          { name: 'Maya', side: 'left', text: 'Can we plant here?' },
          { name: 'Dana', side: 'right', text: 'Yes. Let us survey the site.' },
        ],
      },
      filled: [],
      body: false,
    },
  ],

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
   * One full dictionary entry with every optional field and a footnote, each metadata field alone,
   * a wide unbroken term, and the bare entry without metadata, example or footnote. The body
   * remains filled in the bare case because a definition always needs its meaning.
   */
  definition: [
    {
      name: 'full',
      frontmatter: {
        term: fill(DEFINITION_TERM_MAX_CHARS),
        pronunciation: fill(DEFINITION_PRONUNCIATION_MAX_CHARS),
        kind: fill(DEFINITION_KIND_MAX_CHARS),
        example: fill(DEFINITION_EXAMPLE_MAX_CHARS),
        labels: { example: fill(DEFINITION_EXAMPLE_LABEL_MAX_CHARS) },
      },
      filled: ['footnote'],
    },
    {
      name: 'long-word',
      frontmatter: {
        term: 'W'.repeat(DEFINITION_TERM_MAX_CHARS),
        pronunciation: fill(DEFINITION_PRONUNCIATION_MAX_CHARS),
        kind: fill(DEFINITION_KIND_MAX_CHARS),
        example: fill(DEFINITION_EXAMPLE_MAX_CHARS),
        labels: { example: fill(DEFINITION_EXAMPLE_LABEL_MAX_CHARS) },
      },
      filled: ['footnote'],
    },
    {
      name: 'pronunciation',
      frontmatter: {
        surface: 'default',
        term: fill(DEFINITION_TERM_MAX_CHARS),
        pronunciation: fill(DEFINITION_PRONUNCIATION_MAX_CHARS),
      },
      filled: ['footnote'],
    },
    {
      name: 'kind',
      frontmatter: {
        surface: 'accent',
        term: fill(DEFINITION_TERM_MAX_CHARS),
        kind: fill(DEFINITION_KIND_MAX_CHARS),
      },
      filled: ['footnote'],
    },
    {
      name: 'bare',
      frontmatter: { term: fill(DEFINITION_TERM_MAX_CHARS) },
      filled: [],
    },
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
   * Two and three voices with the longest quotes, names and roles, both with context and a footnote
   * and bare, so the largest quote scales are exercised too.
   */
  voices: [MIN_VOICES, MAX_VOICES].flatMap((count) => {
    const frontmatter = {
      voices: items(count, () => ({
        quote: fill(count === MAX_VOICES ? VOICE_QUOTE_MAX_CHARS_IN_THREE : VOICE_QUOTE_MAX_CHARS),
        name: fillName(count === MAX_VOICES ? VOICE_NAME_MAX_CHARS_IN_THREE : VOICE_NAME_MAX_CHARS),
        role: fill(VOICE_ROLE_MAX_CHARS),
      })),
    };
    return [
      { name: `${count}-voices`, frontmatter, filled: ['footnote'] },
      { name: `${count}-voices-bare`, frontmatter, filled: [], body: false },
    ];
  }),

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
   * Every count boundary in both research lists, with the longest identity and findings, a
   * portrait, quotation and footnote; bare initials forms without a quotation or footnote; and a
   * medium name that could otherwise stay at a taller, unfitted size than the longest name.
   */
  persona: [
    ...[MIN_PERSONA_ITEMS, MAX_PERSONA_ITEMS].flatMap((goals) =>
      [MIN_PERSONA_ITEMS, MAX_PERSONA_ITEMS].flatMap((frustrations) => {
        const frontmatter = {
          name: fillName(PERSONA_NAME_MAX_CHARS),
          role: fill(PERSONA_ROLE_MAX_CHARS),
          goals: items(goals, () => fill(PERSONA_ITEM_MAX_CHARS)),
          frustrations: items(frustrations, () => fill(PERSONA_ITEM_MAX_CHARS)),
        };
        return [
          {
            name: `${goals}-goals-${frustrations}-frustrations`,
            frontmatter: { ...frontmatter, photo: PORTRAIT, focal: 'center 30%' },
            filled: ['footnote'],
          },
          {
            name: `${goals}-goals-${frustrations}-frustrations-bare`,
            frontmatter,
            filled: [],
            body: false,
          },
        ];
      }),
    ),
    {
      name: 'medium-name',
      frontmatter: {
        name: fillName(PERSONA_NAME_MAX_CHARS / 2),
        role: fill(PERSONA_ROLE_MAX_CHARS),
        photo: PORTRAIT,
        goals: items(MAX_PERSONA_ITEMS, () => fill(PERSONA_ITEM_MAX_CHARS)),
        frustrations: items(MAX_PERSONA_ITEMS, () => fill(PERSONA_ITEM_MAX_CHARS)),
      },
      filled: ['footnote'],
    },
    {
      name: 'custom-labels',
      frontmatter: {
        name: fillName(PERSONA_NAME_MAX_CHARS),
        role: fill(PERSONA_ROLE_MAX_CHARS),
        photo: PORTRAIT,
        labels: {
          goals: fill(PERSONA_LABEL_MAX_CHARS),
          frustrations: fill(PERSONA_LABEL_MAX_CHARS),
        },
        goals: items(MAX_PERSONA_ITEMS, () => fill(PERSONA_ITEM_MAX_CHARS)),
        frustrations: items(MAX_PERSONA_ITEMS, () => fill(PERSONA_ITEM_MAX_CHARS)),
      },
      filled: ['footnote'],
    },
  ],

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
   * Two, three and four takeaways at their longest, with context and a footnote; the same bare to
   * exercise larger fit levels, and sentences alone to exercise the lightest form.
   */
  recap: Array.from({ length: MAX_RECAP_POINTS - MIN_RECAP_POINTS + 1 }, (_, index) => {
    const count = MIN_RECAP_POINTS + index;
    const four = count === MAX_RECAP_POINTS;
    const titleLimit = [
      RECAP_POINT_MAX_CHARS,
      RECAP_POINT_MAX_CHARS_IN_THREE,
      RECAP_POINT_MAX_CHARS_IN_FOUR,
    ][index]!;
    const points = items(count, () => ({
      title: fill(titleLimit),
      detail: fill(four ? RECAP_DETAIL_MAX_CHARS_IN_FOUR : RECAP_DETAIL_MAX_CHARS),
    }));
    return [
      { name: `${count}-points`, frontmatter: { points, reveal: true }, filled: ['footnote'] },
      { name: `${count}-points-bare`, frontmatter: { points }, filled: [], body: false },
      {
        name: `${count}-sentences-bare`,
        frontmatter: { points: points.map(({ title }) => ({ title })) },
        filled: [],
        body: false,
      },
    ];
  }).flat(),

  /**
   * References at each column boundary, all bibliographic fields and full URLs at their limits,
   * with context and footnote, without slots, and with titles alone for the larger citation
   * levels.
   */
  sources: [MIN_SOURCES, SOURCES_TWO_COLUMNS - 1, SOURCES_TWO_COLUMNS, MAX_SOURCES].flatMap(
    (count) => {
      const prefix = 'https://woodland.example/';
      const frontmatter = {
        sources: items(count, () => ({
          title: fill(
            count >= SOURCES_TWO_COLUMNS ? SOURCE_TITLE_MAX_CHARS_DENSE : SOURCE_TITLE_MAX_CHARS,
          ),
          author: fillName(
            count >= SOURCES_TWO_COLUMNS ? SOURCE_CREDIT_MAX_CHARS_DENSE : SOURCE_AUTHOR_MAX_CHARS,
          ),
          publisher: fillName(
            count >= SOURCES_TWO_COLUMNS
              ? SOURCE_CREDIT_MAX_CHARS_DENSE
              : SOURCE_PUBLISHER_MAX_CHARS,
          ),
          year: fill(SOURCE_YEAR_MAX_CHARS),
          url:
            prefix +
            'canopy-study/'
              .repeat(SOURCE_URL_MAX_CHARS)
              .slice(0, SOURCE_URL_MAX_CHARS - prefix.length),
        })),
      };
      return [
        { name: `${count}-sources`, frontmatter, filled: ['footnote'] },
        { name: `${count}-sources-bare`, frontmatter, filled: [], body: false },
        {
          name: `${count}-sources-titles`,
          frontmatter: {
            sources: frontmatter.sources.map(({ title }) => ({ title })),
          },
          filled: [],
          body: false,
        },
      ];
    },
  ),

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
   * Features at the minimum, column switch, second-row boundary, third-row boundary and maximum.
   * Full, bare and titles-only cases exercise text limits and the stretched fit levels.
   */
  features: [6, 7, 8, 9, 10, 11, 12].flatMap((count) => {
    const dense = count >= FEATURES_DENSE_FROM;
    const frontmatter = {
      features: items(count, () => ({
        icon: 'leaf',
        title: fill(dense ? FEATURE_TITLE_MAX_CHARS_DENSE : FEATURE_TITLE_MAX_CHARS),
        ...(count <= MAX_FEATURES_WITH_DETAILS ? { detail: fill(FEATURE_DETAIL_MAX_CHARS) } : {}),
      })),
    };
    return [
      { name: `${count}-features`, frontmatter, filled: ['footnote'] },
      { name: `${count}-features-bare`, frontmatter, filled: [], body: false },
      {
        name: `${count}-features-titles`,
        frontmatter: {
          features: frontmatter.features.map(({ icon, title }) => ({ icon, title })),
        },
        filled: [],
        body: false,
      },
    ];
  }),

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
   * Boards of two, three and four columns, each with the most items, the longest labels, tags and
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
   * Every action count with all columns at their limits and one current row; with context and
   * footnote, and bare to exercise the generous fit levels.
   */
  actions: Array.from({ length: MAX_ACTIONS - MIN_ACTIONS + 1 }, (_, index) => {
    const count = MIN_ACTIONS + index;
    const frontmatter = {
      current: 2,
      badge: fill(ACTION_BADGE_MAX_CHARS),
      labels: {
        action: fill(ACTION_HEADING_MAX_CHARS),
        owner: fill(ACTION_HEADING_MAX_CHARS),
        due: fill(ACTION_HEADING_MAX_CHARS),
      },
      actions: items(count, () => ({
        title: fill(ACTION_TITLE_MAX_CHARS),
        owner: fillName(ACTION_OWNER_MAX_CHARS),
        due: fill(ACTION_DUE_MAX_CHARS),
      })),
    };
    return [
      { name: `${count}-actions`, frontmatter, filled: ['footnote'] },
      { name: `${count}-actions-bare`, frontmatter, filled: [], body: false },
    ];
  }).flat(),

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
   * Two through five instructions at their limits, the widest duration, grouping and output, with
   * context and footnote, then bare to exercise the stretched levels; and a minimal brief.
   */
  exercise: [
    ...[2, 3, 4, 5].flatMap((count) => {
      const frontmatter = {
        duration: (WIDE_VALUES[0] ?? '').slice(0, EXERCISE_DURATION_MAX_CHARS),
        groups: fill(EXERCISE_GROUPS_MAX_CHARS),
        output: fill(EXERCISE_OUTPUT_MAX_CHARS),
        instructions: items(count, () =>
          fill(
            count >= EXERCISE_DENSE_FROM
              ? EXERCISE_INSTRUCTION_MAX_CHARS_DENSE
              : EXERCISE_INSTRUCTION_MAX_CHARS,
          ),
        ),
      };
      return [
        { name: `${count}-instructions`, frontmatter, filled: ['footnote'] },
        { name: `${count}-instructions-bare`, frontmatter, filled: [], body: false },
      ];
    }),
    {
      name: 'minimal-bare',
      frontmatter: {
        duration: '5 min',
        instructions: ['Choose a block.', 'Mark a tree.'],
        output: 'One marked map',
      },
      filled: [],
      body: false,
    },
  ],

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
   * Two, three and four pairs with the longest questions and answers, with context and a footnote;
   * and the same pairs bare, to stress the roomy ladder with the most room available.
   */
  faq: Array.from({ length: MAX_FAQ_QUESTIONS - MIN_FAQ_QUESTIONS + 1 }, (_, index) => {
    const count = MIN_FAQ_QUESTIONS + index;
    const frontmatter = {
      questions: Array.from({ length: count }, () => ({
        q: fill(
          count === MIN_FAQ_QUESTIONS ? FAQ_QUESTION_MAX_CHARS : FAQ_QUESTION_MAX_CHARS_DENSE,
        ),
        a: fill(count === MIN_FAQ_QUESTIONS ? FAQ_ANSWER_MAX_CHARS : FAQ_ANSWER_MAX_CHARS_DENSE),
      })),
    };
    return [
      { name: `${count}-questions`, frontmatter, filled: ['footnote'] },
      { name: `${count}-questions-bare`, frontmatter, filled: [], body: false },
    ];
  }).flat(),

  /**
   * Two and three nested sizes with the widest figures and full labels and notes, with and without
   * context and a footnote, so both roomy and dense levels are exercised. Equal scopes stress the
   * typographic ladder on inverse; tiny scopes stress the minimum visible marker on accent. A short
   * title keeps the largest header metrics above full content on gradient.
   */
  market: [MIN_MARKET_SIZES, MAX_MARKET_SIZES].flatMap((count) => {
    const frontmatter = {
      sizes: items(count, (index) => ({
        label: fillName(MARKET_LABEL_MAX_CHARS),
        value: ['€888.88M', '€88.888M', '€8.8888M'][index],
        note: fill(MARKET_NOTE_MAX_CHARS),
      })),
    };
    return [
      { name: `${count}-sizes`, frontmatter, filled: ['footnote'] },
      { name: `${count}-sizes-bare`, frontmatter, filled: [], body: false },
      {
        name: `${count}-sizes-close`,
        frontmatter: {
          surface: 'inverse',
          sizes: frontmatter.sizes.map((size) => ({ ...size, value: '€888.88M' })),
        },
        filled: ['footnote'],
      },
      {
        name: `${count}-sizes-tiny`,
        frontmatter: {
          surface: 'accent',
          sizes: frontmatter.sizes.map((size, index) => ({
            ...size,
            value: index === count - 1 ? '€0.0001M' : size.value,
          })),
        },
        filled: ['footnote'],
      },
      {
        name: `${count}-sizes-short-title`,
        frontmatter: { ...frontmatter, title: 'Our market', surface: 'gradient' },
        filled: ['footnote'],
      },
    ];
  }),

  /**
   * Two, three and four plans, the second recommended under the longest badge, each with the most
   * features, the widest prices and every text at its longest, with a line of context and a
   * footnote; and the same plans bare, without context or footnote, where the most room is and the
   * stretched levels are tried with the longest strings; and two plans with the fewest features and
   * no recommended plan.
   */
  pricing: [
    ...Array.from({ length: MAX_PLANS - MIN_PLANS + 1 }, (_, index) => {
      const count = MIN_PLANS + index;
      const frontmatter = {
        badge: fill(count === MAX_PLANS ? PLAN_BADGE_MAX_CHARS_IN_FOUR : PLAN_BADGE_MAX_CHARS),
        plans: pricingPlans(count, { features: MAX_PLAN_FEATURES, recommended: true }),
      };
      return [
        { name: `${count}-plans`, frontmatter, filled: ['footnote'] },
        { name: `${count}-plans-bare`, frontmatter, filled: [], body: false },
      ];
    }).flat(),
    {
      name: 'fewest-features',
      frontmatter: {
        plans: pricingPlans(MIN_PLANS, { features: MIN_PLAN_FEATURES, recommended: false }),
      },
      filled: ['footnote'],
    },
  ],

  /**
   * Every panel count, with the longest labels and footnote and real measured charts; and the same
   * grids without a footnote or generated prose, so the charts also exercise the largest room.
   */
  dashboard: [
    ...[2, 3, 4].flatMap((count) => {
      const frontmatter = {
        ...(count === 3 ? { surface: 'inverse' } : {}),
        panels: items(count, () => ({
          title: fill(
            count === 2 ? DASHBOARD_PANEL_TITLE_MAX_CHARS : DASHBOARD_PANEL_TITLE_MAX_CHARS_DENSE,
          ),
        })),
      };
      const bodyMdx = dashboardBody(count);
      return [
        { name: `${count}-panels`, frontmatter, filled: ['footnote'], bodyMdx },
        { name: `${count}-panels-no-footnote`, frontmatter, filled: [], bodyMdx },
        {
          name: `${count}-panels-short-title`,
          frontmatter: { ...frontmatter, title: 'Trees survive with wardens', surface: 'accent' },
          filled: ['footnote'],
          bodyMdx,
        },
      ];
    }),
    {
      // Deliberately exceeds the two-plotted-chart recommendation to guard chart geometry.
      name: '4-panels-charts',
      frontmatter: {
        panels: items(4, () => ({ title: fill(DASHBOARD_PANEL_TITLE_MAX_CHARS_DENSE) })),
      },
      filled: ['footnote'],
      bodyMdx: dashboardFourCharts(),
    },
    {
      name: '3-panels-area',
      frontmatter: {
        panels: items(3, () => ({ title: fill(DASHBOARD_PANEL_TITLE_MAX_CHARS_DENSE) })),
      },
      filled: ['footnote'],
      bodyMdx: [
        `<Donut data={${JSON.stringify(items(3, (index) => ({ status: fillName(6) + index, share: 70 - index * 20 })))}}`,
        'x="status" y="share" unit="%" highlight="max" center="none" />',
        '',
        `<AreaChart data={${JSON.stringify(items(3, (index) => ({ month: String(2024 + index), trees: 400 + index * 200 })))}}`,
        'x="month" y="trees" unit="trees" highlight={{ series: "trees" }} />',
        '',
        dashboardBody(3).split('\n\n')[0],
      ].join('\n'),
    },
    {
      name: '2-panels-donut',
      frontmatter: {
        panels: items(2, () => ({ title: fill(DASHBOARD_PANEL_TITLE_MAX_CHARS) })),
      },
      filled: ['footnote'],
      bodyMdx: [
        `<Donut data={${JSON.stringify(items(4, (index) => ({ status: fillName(10) + index, share: 40 - index * 10 })))}}`,
        `x="status" y="share" unit="%" highlight="max" center="none" caption=${JSON.stringify(fill(32))} />`,
        '',
        `<AreaChart data={${JSON.stringify(items(4, (index) => ({ month: String(2023 + index), trees: 500 + index * 500 })))}}`,
        `x="month" y="trees" unit="trees" highlight={{ series: "trees" }} caption=${JSON.stringify(fill(32))} />`,
      ].join('\n'),
    },
    {
      name: '2-panels-numbers',
      frontmatter: {
        surface: 'inverse',
        panels: items(2, () => ({ title: fill(DASHBOARD_PANEL_TITLE_MAX_CHARS) })),
      },
      filled: ['footnote'],
      bodyMdx: [
        `<BigNumber value=${JSON.stringify(WIDE_VALUES[0])} label=${JSON.stringify(fill(18))} />`,
        '',
        `<Progress value={1240} max={2000} target={2000} unit="trees" label=${JSON.stringify(fill(18))} />`,
      ].join('\n'),
    },
    {
      name: '2-panels-table',
      frontmatter: {
        panels: items(2, () => ({ title: fill(DASHBOARD_PANEL_TITLE_MAX_CHARS) })),
      },
      filled: ['footnote'],
      bodyMdx: dashboardTable(),
    },
  ],

  /**
   * Every count from two to four, at the longest text and labels, both with context and footnote
   * and bare; plus unequal lists in both directions to stress shared row alignment.
   */
  'do-dont': [
    ...Array.from({ length: MAX_DO_DONT_ITEMS - MIN_DO_DONT_ITEMS + 1 }, (_, index) => {
      const count = MIN_DO_DONT_ITEMS + index;
      const frontmatter = {
        do: items(count, () => fill(DO_DONT_ITEM_MAX_CHARS)),
        dont: items(count, () => fill(DO_DONT_ITEM_MAX_CHARS)),
        labels: { do: fill(DO_DONT_LABEL_MAX_CHARS), dont: fill(DO_DONT_LABEL_MAX_CHARS) },
      };
      return [
        { name: `${count}-items`, frontmatter, filled: ['footnote'] },
        { name: `${count}-items-bare`, frontmatter, filled: [], body: false },
      ];
    }).flat(),
    ...[false, true].map((reverse) => ({
      name: reverse ? 'short-do' : 'short-dont',
      frontmatter: {
        do: items(reverse ? MIN_DO_DONT_ITEMS : MAX_DO_DONT_ITEMS, () =>
          fill(DO_DONT_ITEM_MAX_CHARS),
        ),
        dont: items(reverse ? MAX_DO_DONT_ITEMS : MIN_DO_DONT_ITEMS, () =>
          fill(DO_DONT_ITEM_MAX_CHARS),
        ),
        labels: { do: fill(DO_DONT_LABEL_MAX_CHARS), dont: fill(DO_DONT_LABEL_MAX_CHARS) },
      },
      filled: ['footnote'],
    })),
  ],

  /**
   * Four boxes with the fewest and most bullets, the longest labels and items, icons and the second
   * box emphasized, with context and a footnote; and bare boards without icons or highlight at both
   * boundaries to exercise the larger fit levels. Full boards also take inverse and accent surfaces
   * so nested highlight is checked in both directions. An uneven board checks equal row heights
   * when one list is full and the other three have one bullet. Capitals stress the space shared by
   * a heading and its icon. A full board repeats with the highlight prefix at its limit.
   */
  quadrants: [
    ...[MIN_QUADRANT_ITEMS, MAX_QUADRANT_ITEMS].flatMap((count) => [
      {
        name: `${count}-items`,
        frontmatter: {
          quadrants: quadrantBoxes(count, true).map((box, index) => ({
            ...box,
            highlight: index === 1,
          })),
        },
        filled: ['footnote'],
      },
      {
        name: `${count}-items-bare`,
        frontmatter: { quadrants: quadrantBoxes(count, false) },
        filled: [],
        body: false,
      },
    ]),
    {
      name: 'uneven',
      frontmatter: {
        quadrants: quadrantBoxes(MIN_QUADRANT_ITEMS, true).map((box, index) => ({
          ...box,
          highlight: index === 1,
          ...(index === 0
            ? { items: items(MAX_QUADRANT_ITEMS, () => fill(QUADRANT_ITEM_MAX_CHARS)) }
            : {}),
        })),
      },
      filled: ['footnote'],
    },
    {
      name: 'capitals',
      frontmatter: {
        quadrants: quadrantBoxes(MAX_QUADRANT_ITEMS, true).map((box, index) => ({
          ...box,
          highlight: index === QUADRANT_COUNT - 1,
          title: fill(QUADRANT_TITLE_MAX_CHARS).toUpperCase(),
          items: items(MAX_QUADRANT_ITEMS, () => fill(QUADRANT_ITEM_MAX_CHARS).toUpperCase()),
        })),
      },
      filled: ['footnote'],
    },
    ...['inverse', 'accent'].map((surface) => ({
      name: `full-${surface}`,
      frontmatter: {
        surface,
        quadrants: quadrantBoxes(MAX_QUADRANT_ITEMS, true).map((box, index) => ({
          ...box,
          highlight: index === 1,
        })),
      },
      filled: ['footnote'],
    })),
    {
      name: `${MAX_QUADRANT_ITEMS}-items-labels`,
      frontmatter: {
        labels: { highlight: fillName(QUADRANTS_HIGHLIGHT_LABEL_MAX_CHARS) },
        quadrants: quadrantBoxes(MAX_QUADRANT_ITEMS, true).map((box, index) => ({
          ...box,
          highlight: index === 1,
        })),
      },
      filled: ['footnote'],
    },
  ],

  /**
   * Every choice count at the row and tile character boundaries with the longest explanation,
   * context and footnote; the same counts bare to exercise larger type; the smallest question
   * without an explanation; and the largest question with both screen-reader names at their limit.
   */
  quiz: [
    ...Array.from({ length: MAX_QUIZ_OPTIONS - MIN_QUIZ_OPTIONS + 1 }, (_, index) => {
      const count = MIN_QUIZ_OPTIONS + index;
      const frontmatter = {
        options: items(count, () => fill(QUIZ_OPTION_MAX_CHARS)),
        answer: 'B',
        explanation: fill(QUIZ_EXPLANATION_MAX_CHARS),
        reveal: true,
      };
      return [
        { name: `${count}-options`, frontmatter, filled: ['footnote'] },
        { name: `${count}-options-bare`, frontmatter, filled: [], body: false },
        {
          name: `tiles-${count}`,
          frontmatter: { ...frontmatter, options: items(count, () => fill(QUIZ_TILE_MAX_CHARS)) },
          filled: ['footnote'],
        },
        {
          name: `tiles-${count}-bare`,
          frontmatter: { ...frontmatter, options: items(count, () => fill(QUIZ_TILE_MAX_CHARS)) },
          filled: [],
          body: false,
        },
      ];
    }).flat(),
    {
      name: 'minimal',
      frontmatter: { options: ['Yes', 'No'], answer: 'A', reveal: false },
      filled: [],
      body: false,
    },
    {
      name: `${MAX_QUIZ_OPTIONS}-options-labels`,
      frontmatter: {
        options: items(MAX_QUIZ_OPTIONS, () => fill(QUIZ_OPTION_MAX_CHARS)),
        answer: 'B',
        explanation: fill(QUIZ_EXPLANATION_MAX_CHARS),
        labels: {
          choices: fillName(QUIZ_LABEL_MAX_CHARS),
          correct: fillName(QUIZ_LABEL_MAX_CHARS),
        },
        reveal: true,
      },
      filled: ['footnote'],
    },
  ],

  /**
   * Every register count with maximum names and one-line mitigations, both medium labels (the
   * widest level), and one highlighted row; full context and footnote, then the same rows bare. The
   * largest register is repeated with every column head and level word at its limit.
   */
  risks: [
    ...Array.from({ length: MAX_RISKS - MIN_RISKS + 1 }, (_, index) => {
      const count = MIN_RISKS + index;
      const frontmatter = { risks: riskRows(count) };
      return [
        { name: `${count}-risks`, frontmatter, filled: ['footnote'] },
        { name: `${count}-risks-bare`, frontmatter, filled: [], body: false },
      ];
    }).flat(),
    {
      name: `${MAX_RISKS}-risks-labels`,
      frontmatter: {
        risks: riskRows(MAX_RISKS),
        labels: {
          ...Object.fromEntries(
            ['name', 'likelihood', 'impact', 'mitigation'].map((key) => [
              key,
              fillName(RISKS_LABEL_MAX_CHARS),
            ]),
          ),
          ...Object.fromEntries(
            ['low', 'medium', 'high'].map((key) => [key, fillName(RISKS_LEVEL_LABEL_MAX_CHARS)]),
          ),
          highlight: fillName(RISKS_HIGHLIGHT_LABEL_MAX_CHARS),
        },
      },
      filled: ['footnote'],
    },
  ],

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
   * Every lane count with both axis boundaries, two bars per lane and labels up to the combined
   * content limit, the current lane, and a now marker at each axis edge, both filled and bare; plus
   * the minimum unlabelled form. Single-period bars prove labels do not depend on the duration's
   * width. The densest axis repeats with every label at its limit and the now marker at each edge,
   * where the widest marker has the least room.
   */
  schedule: [
    ...Array.from(
      { length: SCHEDULE_MAX_LANES - SCHEDULE_MIN_LANES + 1 },
      (_, index) => SCHEDULE_MIN_LANES + index,
    ).flatMap((count) =>
      [SCHEDULE_MIN_PERIODS, SCHEDULE_MAX_PERIODS].flatMap((periodCount) => {
        const frontmatter = {
          periods: items(periodCount, () =>
            fill(periodCount >= 7 ? SCHEDULE_PERIOD_MAX_CHARS_DENSE : SCHEDULE_PERIOD_MAX_CHARS),
          ),
          current: count,
          now: periodCount === SCHEDULE_MIN_PERIODS ? 1 : periodCount,
          lanes: items(count, (laneIndex) => ({
            name: fillName(SCHEDULE_LANE_MAX_CHARS),
            bars: items(SCHEDULE_MAX_BARS, (barIndex) => ({
              from: periodCount,
              to: periodCount,
              ...(laneIndex * SCHEDULE_MAX_BARS + barIndex <
              SCHEDULE_MAX_BAR_CONTENT - count * SCHEDULE_MAX_BARS
                ? { label: fill(SCHEDULE_BAR_MAX_CHARS) }
                : {}),
            })),
          })),
        };
        return [
          { name: `${count}-lanes-${periodCount}-periods`, frontmatter, filled: ['footnote'] },
          {
            name: `${count}-lanes-${periodCount}-periods-bare`,
            frontmatter,
            filled: [],
            body: false,
          },
        ];
      }),
    ),
    {
      name: 'five-periods-body-axis',
      frontmatter: {
        periods: items(5, () => fill(SCHEDULE_PERIOD_MAX_CHARS)),
        current: 1,
        lanes: items(SCHEDULE_MIN_LANES, () => ({
          name: fillName(SCHEDULE_LANE_MAX_CHARS),
          bars: [{ from: 1, to: 5 }],
        })),
      },
      filled: [],
      body: false,
    },
    {
      name: 'mixed-accent',
      frontmatter: {
        surface: 'accent',
        periods: ['Q1 27', 'Q2 27', 'Q3 27', 'Q4 27', 'Q1 28', 'Q2 28', 'Q3 28', 'Q4 28'],
        current: 2,
        now: 4,
        lanes: [
          { name: 'Saltby depot closure', bars: [{ from: 1, to: 3, label: 'Run down routes' }] },
          {
            name: 'Quayside hub',
            bars: [
              { from: 2, to: 4, label: 'Fit-out' },
              { from: 5, to: 8, label: 'First loops' },
            ],
          },
          { name: 'Ardwen two hubs', bars: [{ from: 3, to: 6 }] },
          {
            name: 'Fallowmere',
            bars: [
              { from: 4, to: 5, label: 'Lease and fit' },
              { from: 6, to: 8 },
            ],
          },
          { name: 'Tarnock two hubs', bars: [{ from: 5, to: 8 }] },
          { name: 'Fleet electrification', bars: [{ from: 1, to: 8 }] },
        ],
      },
      filled: ['footnote'],
    },
    {
      name: 'six-labelled',
      frontmatter: {
        now: SCHEDULE_MAX_PERIODS,
        current: SCHEDULE_MAX_LANES,
        periods: items(SCHEDULE_MAX_PERIODS, () => fill(SCHEDULE_PERIOD_MAX_CHARS_DENSE)),
        lanes: items(SCHEDULE_MAX_LANES, () => ({
          name: fillName(SCHEDULE_LANE_MAX_CHARS),
          bars: [{ from: 1, to: SCHEDULE_MAX_PERIODS, label: fill(SCHEDULE_BAR_MAX_CHARS) }],
        })),
      },
      filled: ['footnote'],
    },
    {
      name: 'far-label',
      frontmatter: {
        periods: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'],
        current: 3,
        now: 7,
        lanes: [
          { name: 'Survey', bars: [{ from: 1, to: 1, label: 'Holloway survey' }] },
          { name: 'Planting', bars: [{ from: 2, to: 4, label: 'Eastgate streets' }] },
          { name: 'Summer readings', bars: [{ from: 7, to: 8, label: 'Heat at 3 p.m.' }] },
        ],
      },
      filled: [],
      body: false,
    },
    {
      name: 'minimum',
      frontmatter: {
        periods: items(SCHEDULE_MIN_PERIODS, () => fill(SCHEDULE_PERIOD_MAX_CHARS)),
        lanes: items(SCHEDULE_MIN_LANES, () => ({
          name: fillName(SCHEDULE_LANE_MAX_CHARS),
          bars: [{ from: 1, to: SCHEDULE_MIN_PERIODS }],
        })),
      },
      filled: [],
      body: false,
    },
    ...[1, SCHEDULE_MAX_PERIODS].map((now) => ({
      name: `labels-now-${now}`,
      frontmatter: {
        now,
        current: 1,
        periods: items(SCHEDULE_MAX_PERIODS, () => fill(SCHEDULE_PERIOD_MAX_CHARS_DENSE)),
        lanes: items(SCHEDULE_MAX_LANES, () => ({
          name: fillName(SCHEDULE_LANE_MAX_CHARS),
          bars: [{ from: 1, to: SCHEDULE_MAX_PERIODS, label: fill(SCHEDULE_BAR_MAX_CHARS) }],
        })),
        labels: {
          now: fillName(SCHEDULE_NOW_LABEL_MAX_CHARS),
          nowPeriod: fillName(SCHEDULE_SPOKEN_LABEL_MAX_CHARS),
          through: fillName(SCHEDULE_SPOKEN_LABEL_MAX_CHARS),
        },
      },
      filled: ['footnote'],
    })),
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
   * Both dock edges and fits at the longest title, eyebrow and subtitle, including centred copy.
   */
  'image-reveal': IMAGE_REVEAL_DOCKS.flatMap((dock) =>
    IMAGE_REVEAL_FITS.map((fit) => ({
      name: `${dock}-${fit}`,
      frontmatter: {
        dock,
        fit,
        align: dock === 'top' ? 'center' : 'left',
        barSurface: dock === 'top' ? 'inverse' : 'default',
      },
      filled: ['media'],
    })),
  ),

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
   * Both fits at the longest labels and one-line captions, with mixed picture proportions, context
   * and a footnote; bare pairs exercise the full-height image wells and default labels.
   */
  'before-after': (['contain', 'cover'] as const).flatMap((fit) => [
    {
      name: fit,
      frontmatter: {
        fit,
        before: {
          src: WIDE_SCREEN,
          alt: fill(BEFORE_AFTER_ALT_MAX_CHARS),
          label: fill(BEFORE_AFTER_LABEL_MAX_CHARS),
          caption: fill(BEFORE_AFTER_CAPTION_MAX_CHARS),
        },
        after: {
          src: PHONE_SCREEN,
          alt: fill(BEFORE_AFTER_ALT_MAX_CHARS),
          label: fill(BEFORE_AFTER_LABEL_MAX_CHARS),
          caption: fill(BEFORE_AFTER_CAPTION_MAX_CHARS),
        },
        reveal: true,
      },
      filled: ['footnote'],
    },
    {
      name: `${fit}-bare`,
      frontmatter: {
        fit,
        before: { src: WIDE_SCREEN, alt: fill(BEFORE_AFTER_ALT_MAX_CHARS) },
        after: { src: WIDE_SCREEN, alt: fill(BEFORE_AFTER_ALT_MAX_CHARS) },
        accent: 'none',
      },
      filled: [],
      body: false,
    },
  ]),

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
   * Three, four and five tiles with the longest figures, labels, labels and text, each kind of tile
   * in the lead's cell and the small ones, with a line of context and a footnote.
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
   * Every count boundary with all fields at their limits, with context and footnote and bare; the
   * same states also cover the widest pill. Bare reports retain owners; no-owners reports omit
   * them. Full reports also test inverse and accent surfaces, mixed owners, translated labels and a
   * reveal with a final footnote at maximum count.
   */
  status: [
    ...Array.from({ length: MAX_STATUS_ITEMS - MIN_STATUS_ITEMS + 1 }, (_, index) => {
      const count = MIN_STATUS_ITEMS + index;
      const frontmatter = {
        items: statusItems(count),
      };
      return [
        { name: `${count}-items`, frontmatter, filled: ['footnote'] },
        { name: `${count}-items-bare`, frontmatter, filled: [], body: false },
        {
          name: `${count}-items-no-owners`,
          frontmatter: { items: frontmatter.items.map(({ owner: _owner, ...item }) => item) },
          filled: [],
          body: false,
        },
      ];
    }).flat(),
    {
      name: `${MAX_STATUS_ITEMS}-items-mixed-owners`,
      frontmatter: {
        items: statusItems(MAX_STATUS_ITEMS).map(({ owner, ...item }, index) =>
          index % 2 === 0 ? { ...item, owner } : item,
        ),
      },
      filled: ['footnote'],
    },
    {
      name: `${MAX_STATUS_ITEMS}-items-reveal`,
      frontmatter: { items: statusItems(MAX_STATUS_ITEMS), reveal: true },
      filled: ['footnote'],
    },
    {
      name: `${MAX_STATUS_ITEMS}-items-labels`,
      frontmatter: {
        items: statusItems(MAX_STATUS_ITEMS),
        labels: Object.fromEntries(
          ['name', 'status', 'owner', 'note', ...STATUS_STATES].map((key) => [
            key,
            fillName(STATUS_LABEL_MAX_CHARS),
          ]),
        ),
      },
      filled: ['footnote'],
    },
    ...['inverse', 'accent'].map((surface) => ({
      name: `${MAX_STATUS_ITEMS}-items-${surface}`,
      frontmatter: { surface, items: statusItems(MAX_STATUS_ITEMS) },
      filled: ['footnote'],
    })),
  ],

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
