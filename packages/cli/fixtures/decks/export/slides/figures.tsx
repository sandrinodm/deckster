import type { ReactNode } from 'react';

import { Notes, type SlideFrontmatterInput } from '@deckster/engine';
import { Edge, Flow, Node } from '@deckster/kit/diagrams';

/**
 * Read by the build without running the slide, so it must stay a literal.
 */
export const frontmatter = {
  layout: 'content',
  title: 'Figures publish what they show',
} satisfies SlideFrontmatterInput;

/**
 * A chart description in the shape kit charts publish (`data-chart-spec`, version 1).
 */
const CHART = {
  version: 1,
  kind: 'bar',
  native: 'bar',
  orientation: 'vertical',
  stacked: false,
  name: 'Trees planted per year',
  summary: 'Planting rises from 600 to 700 a year.',
  caption: null,
  source: null,
  categories: ['2027', '2028', '2029'],
  series: [
    {
      name: 'Trees',
      values: [600, 650, 700],
      x: null,
      color: '#c2c7d1',
      pointColors: ['#c2c7d1', '#c2c7d1', '#2d4ae0'],
      highlighted: false,
      labels: [null, null, '700'],
    },
  ],
  format: { excel: '#,##0' },
  axis: { min: 0, max: 800, ticks: [0, 400, 800], zeroBased: true, truncated: false },
  highlight: { series: [], categories: ['2029'], points: [], range: null },
  annotations: [],
  legend: false,
  figures: [],
  table: null,
  colors: {
    plate: '#fcfcfd',
    context: '#c2c7d1',
    label: '#555c6a',
    value: '#161920',
    grid: '#d9dce4',
    axis: '#555c6a',
    positive: '#0a7a8a',
    negative: '#d23c28',
  },
};

/**
 * A bar chart drawn as plain SVG carrying its description, its bars marked as kit charts mark them,
 * and a two-node kit flow, which publishes its own (`data-diagram-description`).
 */
export default function Figures(): ReactNode {
  return (
    <>
      <div style={{ display: 'flex', gap: 64 }}>
        <div data-chart-spec={JSON.stringify(CHART)} style={{ width: 600, height: 400 }}>
          <svg width="600" height="400" viewBox="0 0 600 400" role="img" aria-label={CHART.name}>
            <rect
              className="kit-chart-mark"
              x="40"
              y="100"
              width="120"
              height="300"
              fill="#c2c7d1"
            />
            <rect
              className="kit-chart-mark"
              x="240"
              y="75"
              width="120"
              height="325"
              fill="#c2c7d1"
            />
            <rect
              className="kit-chart-mark"
              x="440"
              y="50"
              width="120"
              height="350"
              fill="#2d4ae0"
            />
            <text x="500" y="40" textAnchor="middle" fontSize="24">
              700
            </text>
          </svg>
        </div>
        <div style={{ width: 600, height: 400 }}>
          <Flow title="Plan, then plant">
            <Node id="plan" kind="service" title="Plan" col={1} row={1} />
            <Node id="plant" kind="service" title="Plant" col={2} row={1} />
            <Edge from="plan" to="plant" />
          </Flow>
        </div>
      </div>
      <Notes>
        The chart becomes a native bar chart and the diagram native shapes and a connector.
      </Notes>
    </>
  );
}
