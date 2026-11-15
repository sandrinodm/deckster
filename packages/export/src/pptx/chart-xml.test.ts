import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vite-plus/test';

import type { NativeChartModel } from '#pptx/chart-model.ts';

import { basicModel, planChart } from '#plan/chart-policy.ts';
import { chartWorkbook, chartXml } from '#pptx/chart-xml.ts';
import { barMarkup, chartScene, chartSpec } from '#pptx/chart.fixture.ts';
import { surfaceThemeFixture } from '#pptx/theme.fixture.ts';

/**
 * The native chart the planner fits to the fixture's column chart.
 */
function fittedModel(): NativeChartModel {
  const { node, scene } = chartScene(chartSpec(), barMarkup());
  const model = planChart(node, scene, 'hybrid').model;
  if (model === null) {
    throw new Error('expected a native chart');
  }

  return model;
}

describe('chartXml', () => {
  it('lays the plot out where the web drew it, with no legend, frame or axis labels it does not show', () => {
    const xml = chartXml(fittedModel(), 'rId1', { theme: null });
    expect(xml).toContain(
      '<c:layoutTarget val="inner"/><c:xMode val="edge"/><c:yMode val="edge"/>',
    );
    expect(xml).not.toContain('<c:legend>');
    expect(xml).toContain('<c:roundedCorners val="0"/><c:style val="2"/>');
    expect(xml).toMatch(
      /<\/c:plotArea>.*<c:spPr><a:noFill\/><a:ln><a:noFill\/><\/a:ln><\/c:spPr>/s,
    );
    expect(xml).toContain('<c:tickLblPos val="none"/>');
    expect(xml).toContain('<c:max val="30"/><c:min val="0"/>');
    expect(xml).toContain('<c:gapWidth val="150"/>');
    expect(xml).toContain('<c:externalData r:id="rId1">');
  });

  it('writes value labels with the web text and highlighted bars as point colors', () => {
    const xml = chartXml(fittedModel(), 'rId1', { theme: null });
    expect(xml).toContain('<a:t>30%</a:t>');
    expect(xml).toContain('<c:dLblPos val="outEnd"/>');
    expect(xml).toContain('<c:showVal val="1"/>');
    expect(xml).toMatch(
      /<c:dPt><c:idx val="2"\/><c:invertIfNegative val="0"\/><c:bubble3D val="0"\/><c:spPr><a:solidFill><a:srgbClr val="2F4DE4"\/>/,
    );
  });

  it('uses theme colors and fonts where they match the theme', () => {
    const xml = chartXml(fittedModel(), 'rId1', { theme: surfaceThemeFixture() });
    expect(xml).toContain('<a:latin typeface="+mn-lt"/>');
  });

  it('gives each scatter series its own x and y columns', () => {
    const model = basicModel(
      chartSpec({
        kind: 'scatter',
        native: 'scatter',
        categories: [],
        series: [
          {
            ...chartSpec().series[0]!,
            name: 'csat',
            values: [90, 80],
            x: [5, 20],
            labels: [null, null],
          },
          {
            ...chartSpec().series[0]!,
            name: 'csat (highlighted)',
            values: [70],
            x: [30],
            labels: [null],
          },
        ],
      }),
    );
    const xml = chartXml(model, 'rId1', { theme: null });
    expect(xml).toContain('<c:f>Sheet1!$C$2:$C$2</c:f>');
    expect(xml).toContain('<c:f>Sheet1!$D$2:$D$2</c:f>');
    const sheet = strFromU8(
      unzipSync(chartWorkbook(model))['xl/worksheets/sheet1.xml'] ?? new Uint8Array(),
    );
    expect(sheet).toContain('<c r="C2"><v>30</v></c>');
    expect(sheet).toContain('<c r="D2"><v>70</v></c>');
  });
});
