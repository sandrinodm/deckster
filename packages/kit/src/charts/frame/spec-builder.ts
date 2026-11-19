import type { ChartKind, ChartSpec, ChartSpecFormat } from '#charts/chart-spec.ts';
import type { ResolvedFormat } from '#charts/format/number-format.ts';
import type { ChartTheme } from '#charts/frame/chart-theme.ts';

import { CHART_SPEC_VERSION } from '#charts/chart-spec.ts';
import { excelFormat } from '#charts/format/number-format.ts';
import { specColors } from '#charts/frame/chart-theme.ts';
import { NO_HIGHLIGHT } from '#charts/insight/highlight.ts';

/**
 * A spec's own fields; the rest default to an empty chart.
 */
type SpecFields = Partial<ChartSpec> & Pick<ChartSpec, 'kind' | 'name' | 'summary'>;

/**
 * A chart spec with the shared fields filled in: version, colors, format and empty defaults for
 * whatever the chart does not set.
 *
 * @param fields - The chart's own fields.
 * @param context - The theme and the format, with the largest magnitude shown.
 */
export function buildSpec(
  fields: SpecFields,
  context: {
    theme: ChartTheme;
    format: ResolvedFormat;
    largest: number;
    caption?: string | undefined;
    source?: string | undefined;
  },
): ChartSpec {
  return {
    version: CHART_SPEC_VERSION,
    native: nativeFor(fields.kind),
    orientation: 'vertical',
    stacked: false,
    caption: context.caption ?? null,
    source: context.source ?? null,
    categories: [],
    series: [],
    format: specFormat(context.format, context.largest),
    axis: null,
    highlight: NO_HIGHLIGHT.spec,
    annotations: [],
    legend: false,
    figures: [],
    table: null,
    colors: specColors(context.theme),
    ...fields,
  };
}

/**
 * A resolved format as a spec writes it.
 *
 * @param format - The resolved format.
 * @param largest - The largest magnitude the chart shows.
 */
export function specFormat(format: ResolvedFormat, largest: number): ChartSpecFormat {
  return {
    locale: format.locale,
    style: format.style,
    notation: format.notation,
    currency: format.currency,
    maximumFractionDigits: format.digits,
    suffix: format.suffix,
    excel: excelFormat(format, largest),
  };
}

/**
 * The native PowerPoint object a kind maps to by default.
 *
 * @param kind - The chart kind.
 */
function nativeFor(kind: ChartKind): ChartSpec['native'] {
  switch (kind) {
    case 'bar':
    case 'waterfall':
    case 'funnel': {
      return 'bar';
    }

    case 'line':
    case 'slope':
    case 'sparkline': {
      return 'line';
    }

    case 'area': {
      return 'area';
    }

    case 'donut': {
      return 'doughnut';
    }

    case 'scatter': {
      return 'scatter';
    }

    case 'table': {
      return 'table';
    }

    case 'heatmap':
    case 'retention-cohorts':
    case 'profit-pool':
    case 'market-movement':
    case 'big-number':
    case 'stat-row':
    case 'comparison':
    case 'progress':
    case 'pictogram': {
      return null;
    }
  }
}

/**
 * A list of names in prose: `a`, `a and b`, `a, b and c`.
 *
 * @param names - The names.
 */
export function listNames(names: readonly string[]): string {
  if (names.length <= 1) {
    return names[0] ?? '';
  }

  return `${names.slice(0, -1).join(', ')} and ${names.at(-1) ?? ''}`;
}
