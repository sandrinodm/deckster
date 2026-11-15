import { describe, expect, it } from 'vite-plus/test';

import { paint, readChartSvg } from '#pptx/chart-svg.ts';

/**
 * Where the test SVG sits on the slide.
 */
const RECT = { x: 100, y: 50, width: 200, height: 100 };

describe('readChartSvg', () => {
  it('reads marks, lines and text in canvas pixels with their paint and font', () => {
    const svg = readChartSvg(
      '<svg width="200" height="100" viewBox="0 0 200 100"><g style="opacity: 0.5">' +
        '<path class="kit-chart-mark" d="M0,0L10,10" pathLength="1" stroke-dasharray="1 1" style="fill: none; stroke: rgb(255, 0, 0); stroke-width: 3px;"></path>' +
        '<line x1="0" y1="90" x2="200" y2="90" stroke="#272b34" stroke-width="1" stroke-dasharray="8 6"></line></g>' +
        '<text class="kit-chart-text kit-type-small" x="20" y="30" text-anchor="end" style="fill: rgb(244, 245, 248); font-size: 26px; font-family: &quot;Inter Variable&quot;, sans-serif; font-weight: 650;">−$900K &amp; more</text>' +
        '</svg>',
      RECT,
    );
    const [mark, line, text] = svg.items;
    expect(mark).toMatchObject({ tag: 'path', mark: true, stroke: '#ff000080', dash: null });
    expect(mark?.commands[1]?.points[0]).toEqual({ x: 110, y: 60 });
    expect(line).toMatchObject({ tag: 'line', fill: null, stroke: '#272b3480', dash: [8, 6] });
    expect(text?.text).toMatchObject({
      lines: ['−$900K & more'],
      x: 120,
      y: 80,
      anchor: 'end',
      size: 26,
      family: 'Inter Variable',
      weight: 650,
      color: '#f4f5f8',
      step: 'small',
    });
  });

  it('reads multi-line text from its tspans and scales a view box', () => {
    const svg = readChartSvg(
      '<svg viewBox="0 0 100 50"><text x="10" y="10" style="font-size: 10px;"><tspan x="10" dy="0">Back to</tspan><tspan x="10" dy="12">school</tspan></text></svg>',
      RECT,
    );
    expect(svg.items[0]?.text).toMatchObject({
      lines: ['Back to', 'school'],
      size: 20,
      lineHeight: 24,
    });
    expect(svg.view).toEqual({ x: 0, y: 0, scale: 2 });
  });
});

describe('paint', () => {
  it('writes colors as hex with alpha and drops transparent ones', () => {
    expect(paint('rgba(255, 255, 255, 0.24)', 1)).toBe('#ffffff3d');
    expect(paint('#2f4de4', 0.5)).toBe('#2f4de480');
    expect(paint('none', 1)).toBeNull();
    expect(paint('rgba(0, 0, 0, 0)', 1)).toBeNull();
  });
});
