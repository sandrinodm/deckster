import { describe, expect, it } from 'vite-plus/test';

import {
  boxGeometry,
  boxXml,
  customGeometry,
  idAllocator,
  pictureXml,
  shadowXml,
  subpathGroups,
} from '#pptx/shape-xml.ts';
import { surfaceThemeFixture } from '#pptx/theme.fixture.ts';
import { boxNode } from '#scene/scene.fixture.ts';
import { parsePathData } from '#vector/svg-path.ts';

describe('boxes', () => {
  it('draws equal radii as a rounded rectangle and uneven ones as a custom path', () => {
    const rect = { x: 0, y: 0, width: 400, height: 200 };
    expect(boxGeometry(rect, [0, 0, 0, 0])).toContain('prst="rect"');
    expect(boxGeometry(rect, [20, 20, 20, 20])).toContain('<a:gd name="adj" fmla="val 10000"/>');
    expect(boxGeometry(rect, [20, 20, 0, 0])).toContain('<a:custGeom>');
  });

  it('draws a uniform border inside the box and uneven borders as side rectangles', () => {
    const border = { width: 4, color: '#2d4ae0', style: 'solid' as const };
    const uniform = boxXml(
      boxNode(1, { borders: [border, border, border, border] }),
      idAllocator(),
      surfaceThemeFixture(),
    );
    expect(uniform).toContain(
      '<a:ln w="25400"><a:solidFill><a:schemeClr val="accent1"/></a:solidFill>',
    );
    expect(uniform).toContain('<a:off x="647700" y="647700"/>');
    const top = boxXml(
      boxNode(2, { fill: null, borders: [border, null, null, null] }),
      idAllocator(),
      surfaceThemeFixture(),
    );
    expect(top.match(/<p:sp>/g)).toHaveLength(1);
    expect(top).toContain('<a:ext cx="2540000" cy="25400"/>');
  });

  it('fills a box with a linear gradient', () => {
    const fill = {
      kind: 'linear' as const,
      angle: 160,
      stops: [
        { color: '#2439b8', at: 0 },
        { color: '#0c0e13', at: 1 },
      ],
    };
    expect(boxXml(boxNode(3, { fill }), idAllocator(), surfaceThemeFixture())).toContain(
      '<a:gradFill rotWithShape="1">',
    );
  });

  it('keeps the most visible shadow layer, with spread as a scale', () => {
    const xml = shadowXml(
      [
        { x: 0, y: 8, blur: 24, spread: -8, color: '#0c0e1324', inset: false },
        { x: 0, y: 2, blur: 6, spread: 0, color: '#0c0e130d', inset: false },
      ],
      { x: 0, y: 0, width: 400, height: 200 },
      null,
    );
    expect(xml).toContain(
      '<a:outerShdw blurRad="152400" dist="50800" dir="5400000" sx="96000" sy="92000"',
    );
    expect(xml).toContain('<a:alpha val="14118"/>');
  });
});

describe('pictures', () => {
  it('crops, rounds, grays and links a picture, and carries an SVG original', () => {
    const xml = pictureXml({ x: 0, y: 0, width: 100, height: 100 }, 5, {
      imageId: 'rId1',
      svgId: 'rId2',
      name: 'Logo',
      descr: 'The logo',
      crop: { left: 0.1, top: 0, right: 0.1, bottom: 0 },
      radii: [10, 10, 10, 10],
      grayscale: true,
      link: { id: 'rId3' },
    });
    expect(xml).toContain('<a:srcRect l="10000" r="10000"/>');
    expect(xml).toContain('<a:grayscl/>');
    expect(xml).toContain('<asvg:svgBlip');
    expect(xml).toContain('descr="The logo"><a:hlinkClick r:id="rId3"/>');
    expect(xml).toContain('prst="roundRect"');
  });

  it('draws a translucent picture at its opacity and locks a background layer', () => {
    const rect = { x: 0, y: 0, width: 100, height: 100 };
    const base = { imageId: 'rId1', name: 'Picture', descr: '' };
    const layer = pictureXml(rect, 5, { ...base, opacity: 0.12, locked: true });
    expect(layer).toContain('<a:blip r:embed="rId1"><a:alphaModFix amt="12000"/></a:blip>');
    expect(layer).toContain(
      '<a:picLocks noGrp="1" noSelect="1" noRot="1" noChangeAspect="1" noMove="1" noResize="1"/>',
    );

    const plain = pictureXml(rect, 5, { ...base, opacity: 1 });
    expect(plain).not.toContain('alphaModFix');
    expect(plain).toContain('<a:picLocks noChangeAspect="1"/>');
  });
});

describe('custom geometry', () => {
  it('writes subpaths that only touch as separate paths, so Apple apps draw every one', () => {
    const modules = parsePathData('M0 0h10v10h-10z M10 0h10v10h-10z M0 10h10v10h-10z');
    expect(subpathGroups(modules)).toHaveLength(3);
    const xml = customGeometry(modules, { x: 0, y: 0, width: 20, height: 20 });
    expect(xml.match(/<a:path /g)).toHaveLength(3);
  });

  it('keeps a counter in the path of the outline it cuts', () => {
    const ring = parsePathData('M0 0h30v30h-30z M10 10v10h10v-10z M40 0h10v10h-10z');
    const groups = subpathGroups(ring);
    expect(groups.map((group) => group.filter((command) => command.type === 'M').length)).toEqual([
      2, 1,
    ]);
    expect(subpathGroups(parsePathData('M0 0L10 10'))).toHaveLength(1);
  });
});
