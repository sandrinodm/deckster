import type { SlideRule } from '#lint/types.ts';

import { hasChart } from '#lint/rules/chart-facts.ts';

/**
 * Words that make a title a sentence: the verbs and auxiliaries of takeaway titles, in their common
 * forms. Words that are as often nouns ("share", "cost", "rise", "split") are left out, so "Market
 * share by region" still reads as a topic. The list is a heuristic and says so.
 */
const VERBS = new Set([
  'accounts',
  'add',
  'added',
  'adds',
  'am',
  'are',
  "aren't",
  'be',
  'beaten',
  'beats',
  'became',
  'become',
  'becomes',
  'been',
  'being',
  'bleeds',
  'bought',
  'bring',
  'brings',
  'brought',
  'buy',
  'buys',
  'came',
  'can',
  "can't",
  'carries',
  'carry',
  'climbs',
  'comes',
  'costs',
  'could',
  'cuts',
  'declined',
  'declines',
  'decreased',
  'decreases',
  'did',
  "didn't",
  'dipped',
  'dips',
  'do',
  'does',
  "doesn't",
  'dominate',
  'dominates',
  'doubled',
  'doubles',
  'drives',
  'drops',
  'drove',
  'ends',
  'explain',
  'explained',
  'explains',
  'fail',
  'failed',
  'fails',
  'falls',
  'fell',
  'follow',
  'followed',
  'follows',
  'gave',
  'get',
  'gets',
  'give',
  'given',
  'gives',
  'go',
  'goes',
  'got',
  'grew',
  'grow',
  'grows',
  'had',
  'halved',
  'halves',
  'has',
  'have',
  'held',
  'hits',
  'holds',
  'improve',
  'improved',
  'improves',
  'increased',
  'increases',
  'is',
  "isn't",
  'jumped',
  'jumps',
  'keeps',
  'kept',
  'lagged',
  'lags',
  'leads',
  'leave',
  'leaves',
  'led',
  'left',
  'loses',
  'lost',
  'made',
  'make',
  'makes',
  'matters',
  'may',
  'mean',
  'means',
  'meant',
  'might',
  'missed',
  'misses',
  'moved',
  'moves',
  'must',
  'need',
  'needs',
  'outnumber',
  'outnumbered',
  'outnumbers',
  'outpace',
  'outpaced',
  'outpaces',
  'overtake',
  'overtaken',
  'overtakes',
  'overtook',
  'paid',
  'passed',
  'passes',
  'pays',
  'peaked',
  'peaks',
  'pulled',
  'pulls',
  'pushed',
  'pushes',
  'ran',
  'ranks',
  'reached',
  'reaches',
  'recover',
  'recovered',
  'recovers',
  'remains',
  'returned',
  'returns',
  'rises',
  'rose',
  'runs',
  'said',
  'sat',
  'saved',
  'saves',
  'saw',
  'say',
  'says',
  'see',
  'seen',
  'sees',
  'should',
  'showed',
  'shown',
  'shows',
  'shrank',
  'shrinks',
  'sit',
  'sits',
  'slipped',
  'slips',
  'slowed',
  'slows',
  'sped',
  'speeds',
  'spends',
  'spent',
  'spiked',
  'spikes',
  'splits',
  'stalled',
  'stalls',
  'started',
  'starts',
  'stayed',
  'stays',
  'stopped',
  'stops',
  'summed',
  'sums',
  'survive',
  'survived',
  'survives',
  'take',
  'takes',
  'tell',
  'tells',
  'told',
  'took',
  'tops',
  'trailed',
  'trails',
  'tripled',
  'triples',
  'turned',
  'turns',
  'was',
  "wasn't",
  'went',
  'were',
  'will',
  'wins',
  'won',
  "won't",
  'worked',
  'works',
  'would',
]);

/**
 * A word that ends like a past tense or participle ("doubled", "dropped"), of five letters or more.
 */
const PAST_TENSE = /^[a-z]{3,}ed$/u;

/**
 * A title stated as "Label: value", such as "Churn: 4.2%": the value after the colon is the
 * takeaway.
 */
const COLON_FIGURE = /:[^:]*\d/u;

/**
 * What separates the words of a title: anything that is not a letter, a digit, an apostrophe, a
 * period or a percent sign, so "2.5%" and "can't" stay whole.
 */
const WORD_SEPARATOR = /[^\p{L}\p{N}'.%]+/u;

/**
 * The topic shapes a title can take, each with the pattern that finds it and how a finding names
 * it. They count only when the title has no verb: "Tickets fell by 38%" is a takeaway.
 */
const TOPIC_SHAPES: readonly { pattern: RegExp; shape: string }[] = [
  { pattern: /\S\s+by\s+\S/iu, shape: '"X by Y"' },
  { pattern: /\S\s+(?:vs\.?|versus)\s+\S/iu, shape: '"X vs Y"' },
  { pattern: /\boverview\b/iu, shape: '"X overview"' },
  { pattern: /\bbreakdown\b/iu, shape: '"X breakdown"' },
  { pattern: /\bover\s+time\b/iu, shape: '"X over time"' },
];

/**
 * The most words a bare noun phrase has while the rule still calls it a topic: "Support tickets by
 * month" is a label; a longer phrase without a listed verb is usually a sentence whose verb the
 * list misses ("Latency spikes on the first weekend of every month").
 */
const SHORT_PHRASE_WORDS = 4;

/**
 * The topic shape a title has, or `undefined` when it reads as a takeaway. A title is a topic when
 * it has no verb (from a list, or a word that looks like a past tense) and either has a topic shape
 * ("X by Y", "X vs Y", "X overview", "X breakdown", "X over time", whatever its numbers: "Revenue
 * by region 2026") or is a noun phrase of four words or fewer ("Market share"). "Label: value" with
 * a number ("Churn: 4.2%") is a takeaway. A heuristic: it misses verbs it does not list.
 *
 * @param title - The slide title.
 */
export function topicShape(title: string): string | undefined {
  const words = title
    .toLowerCase()
    .split(WORD_SEPARATOR)
    .filter((word) => word !== '');
  if (words.some((word) => VERBS.has(word) || PAST_TENSE.test(word))) {
    return undefined;
  }

  const shaped = TOPIC_SHAPES.find((entry) => entry.pattern.test(title));
  if (shaped !== undefined) {
    return shaped.shape;
  }

  if (COLON_FIGURE.test(title)) {
    return undefined;
  }

  return words.length <= SHORT_PHRASE_WORDS ? 'a short noun phrase' : undefined;
}

/**
 * Whether a title reads as a takeaway rather than a topic: the opposite of {@link topicShape}.
 *
 * @param title - The slide title.
 */
export function isTakeawayTitle(title: string): boolean {
  return topicShape(title) === undefined;
}

/**
 * A chart slide whose title names a topic ("Revenue by region") instead of stating the takeaway.
 * Viewers remember the title of a chart more than anything else on it, and a title that states the
 * message improves recall of that message.
 */
export const chartTopicTitleRule: SlideRule = {
  /**
   * The rule id shown in findings.
   */
  id: 'chart-topic-title',

  /**
   * A slide rule.
   */
  kind: 'slide',

  /**
   * Checked once per slide.
   */
  scope: 'slide',

  /**
   * A heuristic, so a warning.
   */
  severity: 'warning',

  /**
   * The sentence `deck lint --help` lists for the rule.
   */
  description:
    "A chart slide's title looks like a topic " +
    '("X by Y", "X vs Y", a short noun phrase), not a takeaway.',

  /**
   * Reports a chart slide whose title has a topic shape.
   */
  check: ({ snapshot, slide }) => {
    const title = typeof slide.frontmatter['title'] === 'string' ? slide.frontmatter['title'] : '';
    const shape = title === '' || !hasChart(snapshot) ? undefined : topicShape(title);
    if (shape === undefined) {
      return [];
    }

    return [
      {
        message:
          `"${title}" looks like a topic, not a takeaway ` + `(a heuristic: it reads as ${shape}).`,
        fix:
          `State what the chart shows in the title of ${slide.file}, with the number when there ` +
          'is one: "Billing tickets doubled in Q3", not "Tickets by queue". Put the measure and ' +
          "period in the chart's `caption`.",
        selector: null,
      },
    ];
  },
};
