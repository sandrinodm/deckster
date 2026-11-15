import { describe, expect, it } from 'vite-plus/test';

import type { ChartFrameContext } from '#pptx/chart-frame.ts';

import { createPackage } from '#ooxml/opc-package.ts';
import { writeChart } from '#pptx/chart-frame.ts';
import { barMarkup, chartScene, chartSpec } from '#pptx/chart.fixture.ts';
import { idAllocator } from '#pptx/shape-xml.ts';
import { surfaceThemeFixture } from '#pptx/theme.fixture.ts';

/**
 * A writer context for the fixture's slide.
 *
 * @param fallback - The fallback picture writer, or `null`.
 */
function context(fallback: ChartFrameContext['fallback']): ChartFrameContext {
  const { scene } = chartScene(chartSpec(), barMarkup());
  return {
    pkg: createPackage(),
    path: 'ppt/slides/slide1.xml',
    scene,
    theme: surfaceThemeFixture(),
    mode: 'hybrid',
    nextId: idAllocator(),
    fallback,
  };
}

describe('writeChart', () => {
  it('groups the native chart with its overlays as alternate content over a picture of the plot', () => {
    const { node } = chartScene(chartSpec(), barMarkup());
    const written = writeChart(
      context(
        (plotId, id, name) => `<p:pic data-plot="${plotId}" data-id="${id}" data-name="${name}"/>`,
      ),
      node,
    );
    expect(written.xml).toMatch(
      /^<mc:AlternateContent xmlns:mc="[^"]+"><mc:Choice xmlns:a14="http:\/\/schemas.microsoft.com\/office\/drawing\/2010\/main" Requires="a14"><p:grpSp>/,
    );
    expect(written.xml).toContain(
      `<p:pic data-plot="2" data-id="${written.shapeId}" data-name="Chart: Tickets by reason"/>`,
    );
    expect(written.xml).toContain(
      `<p:cNvPr id="${written.shapeId}" name="Chart: Tickets by reason"/>`,
    );
    expect(written.xml).toContain('descr="3 reasons. Billing is highest at 30%."');
    expect(written.xml).toContain('name="Chart label: Billing"');
    expect(written.xml.indexOf('Chart label: Access')).toBeLessThan(
      written.xml.indexOf('<p:graphicFrame>'),
    );
  });

  it('writes the chart without alternate content when there is no fallback', () => {
    const { node } = chartScene(chartSpec(), barMarkup());
    const ctx = context(null);
    const written = writeChart(ctx, node);
    expect(written.xml.startsWith('<p:grpSp>')).toBe(true);
    expect(ctx.pkg.has('ppt/charts/chart1.xml')).toBe(true);
    expect(ctx.pkg.has('ppt/embeddings/Microsoft_Excel_Worksheet1.xlsx')).toBe(true);
  });

  it('writes nothing for a chart that is a picture', () => {
    const { node } = chartScene(chartSpec({ kind: 'heatmap' }), barMarkup());
    expect(writeChart(context(null), node)).toEqual({ xml: '', shapeId: null });
  });
});
