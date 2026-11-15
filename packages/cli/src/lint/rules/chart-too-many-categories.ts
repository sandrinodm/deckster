import { CHART_LIMITS } from '@deckster/kit/chart-catalog';

import type { SlideRule } from '#lint/types.ts';

import { chartsOn, chartTag } from '#lint/rules/chart-facts.ts';

/**
 * The most categories each kind reads well with on a slide, from the kit's chart limits (which
 * `deck charts --json` prints); kinds left out have no limit (a line's points in time, a heatmap's
 * cells).
 */
const LIMITS: ReadonlyMap<string, number> = new Map(
  Object.entries(CHART_LIMITS.categories).filter(
    (entry): entry is [string, number] => entry[1] !== undefined,
  ),
);

/**
 * A chart with more categories than a slide can show readably: bars too thin to label, a table to
 * read rather than see.
 */
export const chartTooManyCategoriesRule: SlideRule = {
  /**
   * The rule id shown in findings.
   */
  id: 'chart-too-many-categories',

  /**
   * A slide rule.
   */
  kind: 'slide',

  /**
   * Checked once, on the last step.
   */
  scope: 'slide',

  /**
   * The chart still renders; it is hard to read.
   */
  severity: 'warning',

  /**
   * The sentence `deck lint --help` lists for the rule.
   */
  description: 'A chart draws more bars, stages, rows or items than reads at a glance on a slide.',

  /**
   * Reports each chart over its kind's limit.
   */
  check: ({ snapshot, slide }) =>
    chartsOn(snapshot).flatMap((chart) => {
      const limit = LIMITS.get(chart.kind);
      if (limit === undefined || chart.categories <= limit) {
        return [];
      }

      return [
        {
          message:
            `${chartTag(chart.kind)} draws ${chart.categories} categories; ` +
            `about ${limit} read at a glance.`,
          fix:
            `Show only the categories the point needs in ${slide.file}: ` +
            'the top ones and "Other", or move the full list to an appendix table.',
          selector: chart.element.selector,
        },
      ];
    }),
};
