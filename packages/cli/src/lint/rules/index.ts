import type { LintRule } from '#lint/types.ts';

import { appExternalSrcRule } from '#lint/rules/app-external-src.ts';
import { appMissingPosterRule } from '#lint/rules/app-missing-poster.ts';
import { appMissingRule } from '#lint/rules/app-missing.ts';
import { brokenImageRule } from '#lint/rules/broken-image.ts';
import { canvasOverflowRule } from '#lint/rules/canvas-overflow.ts';
import { chartEmptyRule } from '#lint/rules/chart-empty.ts';
import { chartFunnelGrowsRule } from '#lint/rules/chart-funnel-grows.ts';
import { chartLegendAvoidableRule } from '#lint/rules/chart-legend-avoidable.ts';
import { chartMissingUnitRule } from '#lint/rules/chart-missing-unit.ts';
import { chartNoHighlightRule } from '#lint/rules/chart-no-highlight.ts';
import { chartPieSlicesRule } from '#lint/rules/chart-pie-slices.ts';
import { chartTooManyCategoriesRule } from '#lint/rules/chart-too-many-categories.ts';
import { chartTooManySeriesRule } from '#lint/rules/chart-too-many-series.ts';
import { chartTopicTitleRule } from '#lint/rules/chart-topic-title.ts';
import { chartTruncatedAxisRule } from '#lint/rules/chart-truncated-axis.ts';
import { containerOverflowRule } from '#lint/rules/container-overflow.ts';
import { contentBudgetRule } from '#lint/rules/content-budget.ts';
import { contrastRule } from '#lint/rules/contrast.ts';
import { diagramBadgeOverlapRule } from '#lint/rules/diagram-badge-overlap.ts';
import { diagramEdgeOverlapRule } from '#lint/rules/diagram-edge-overlap.ts';
import { diagramLabelOverlapRule } from '#lint/rules/diagram-label-overlap.ts';
import { diagramLongWordRule } from '#lint/rules/diagram-long-word.ts';
import { diagramOverlapRule } from '#lint/rules/diagram-overlap.ts';
import { diagramSmallTextRule } from '#lint/rules/diagram-small-text.ts';
import { diagramTooDenseRule } from '#lint/rules/diagram-too-dense.ts';
import { diagramUnlabeledEdgeRule } from '#lint/rules/diagram-unlabeled-edge.ts';
import { exportMissingPosterRule } from '#lint/rules/export-missing-poster.ts';
import { fewBuildsRule } from '#lint/rules/few-builds.ts';
import { layoutRepetitionRule } from '#lint/rules/layout-repetition.ts';
import { lowResImageRule } from '#lint/rules/low-res-image.ts';
import { minFontSizeRule } from '#lint/rules/min-font-size.ts';
import { missingNotesRule } from '#lint/rules/missing-notes.ts';
import { offBrandRule } from '#lint/rules/off-brand.ts';
import { openCommentsRule } from '#lint/rules/open-comments.ts';
import { loadErrorRule, renderErrorRule } from '#lint/rules/render-error.ts';
import { slotContentRule } from '#lint/rules/slot-content.ts';
import { tableTooDenseRule } from '#lint/rules/table-too-dense.ts';
import { textOverlapRule } from '#lint/rules/text-overlap.ts';
import { textTruncatedRule } from '#lint/rules/text-truncated.ts';
import { timeBudgetRule } from '#lint/rules/time-budget.ts';
import { videoCuePostersRule } from '#lint/rules/video-cue-posters.ts';

/**
 * Every rendered rule. Slide rules run in this order on each slide (`step` rules on every step,
 * `slide` rules once on the last), then deck rules run once on the whole deck.
 */
export const LINT_RULES: readonly LintRule[] = [
  renderErrorRule,
  canvasOverflowRule,
  containerOverflowRule,
  textTruncatedRule,
  textOverlapRule,
  minFontSizeRule,
  contrastRule,
  offBrandRule,
  lowResImageRule,
  tableTooDenseRule,
  appMissingPosterRule,
  appMissingRule,
  appExternalSrcRule,
  videoCuePostersRule,
  exportMissingPosterRule,
  chartEmptyRule,
  chartTruncatedAxisRule,
  chartTooManySeriesRule,
  chartTooManyCategoriesRule,
  chartPieSlicesRule,
  chartNoHighlightRule,
  chartTopicTitleRule,
  chartMissingUnitRule,
  chartLegendAvoidableRule,
  chartFunnelGrowsRule,
  brokenImageRule,
  diagramTooDenseRule,
  diagramLabelOverlapRule,
  diagramUnlabeledEdgeRule,
  diagramSmallTextRule,
  diagramOverlapRule,
  diagramEdgeOverlapRule,
  diagramBadgeOverlapRule,
  diagramLongWordRule,
  contentBudgetRule,
  slotContentRule,
  missingNotesRule,
  loadErrorRule,
  layoutRepetitionRule,
  fewBuildsRule,
  timeBudgetRule,
  openCommentsRule,
];
