import type { ChartTheme } from '#charts/frame/chart-theme.ts';
import type { Measure, TextStyle } from '#charts/layout/text-measure.ts';

import { estimateWidth } from '#charts/layout/text-measure.ts';

/**
 * A text style for tests: Inter-like metrics at a size.
 *
 * @param step - The type step name.
 * @param size - The size in pixels.
 */
function style(step: string, size: number): TextStyle {
  return { step, family: 'Inter', size, weight: 400, tracking: 0, upper: false, lineHeight: 1.3 };
}

/**
 * A chart theme like the default brand's default surface, for planner tests without a browser.
 */
export const TEST_THEME: ChartTheme = {
  surface: 'default',
  scheme: 'light',
  categorical: ['#2d4ae0', '#b86e00', '#0b8a7c', '#6a3ff0', '#d6335a', '#707786'],
  sequential: ['#eef2ff', '#bccbff', '#8fa8ff', '#6283ff', '#3f62f5', '#2439b8', '#1b286b'],
  context: '#c2c7d1',
  plate: '#fcfcfd',
  plateVisible: false,
  colors: {
    grid: '#d9dce4',
    axis: '#555c6a',
    label: '#555c6a',
    value: '#161920',
    stat: '#161920',
    heading: '#161920',
    accent: '#2d4ae0',
    positive: '#0a7a8a',
    negative: '#d23c28',
    accentText: '#2d4ae0',
    positiveText: '#0a7a8a',
    negativeText: '#d23c28',
    emphasis: '#d7e2fc',
    emphasisFg: '#161920',
  },
  text: {
    axis: style('caption', 24),
    value: style('small', 26),
    legend: style('caption', 24),
    annotation: style('caption', 24),
    stat: style('stat', 184),
    statLabel: style('caption', 24),
    heading: style('title', 48),
    body: style('body', 36),
  },
  numbers: {
    locale: 'en-US',
    notation: 'compact',
    currency: 'USD',
    maximumFractionDigits: 1,
    signDisplay: 'exceptZero',
  },
  grid: { show: true, width: 1, dash: undefined },
  axis: { show: true, width: 1 },
  barRadius: 4,
  lineWidth: 3,
  space: { xs: 8, sm: 12, md: 20, lg: 32, xl: 48 },
  table: { emphasis: 'fill', body: 'small' },
};

/**
 * A measurer for tests: about half an em per character, the same everywhere.
 */
export const testMeasure: Measure = (text, textStyle): number => estimateWidth(text, textStyle);
