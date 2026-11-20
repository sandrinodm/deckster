import { describe, expect, it } from 'vite-plus/test';

import type { TextContext } from '#pptx/text-xml.ts';

import {
  asDecodedDescription,
  decodeDiagramDescription,
  isDrawableDiagram,
} from '#diagram/decode-diagram.ts';
import { diagramPlanNote } from '#diagram/diagram-plan.ts';
import {
  describedCardDiagram,
  describedDiagram,
  describedEdge,
  describedNode,
  describedText,
} from '#diagram/diagram.fixture.ts';
import { diagramXml, over, withOpacity } from '#pptx/diagram-xml.ts';
import { idAllocator } from '#pptx/shape-xml.ts';
import { surfaceThemeFixture } from '#pptx/theme.fixture.ts';
import { line, paragraph, run, runStyle, textNode } from '#scene/scene.fixture.ts';
import { pxToEmu } from '#units.ts';

/**
 * A text context on a light surface.
 */
function context(): TextContext {
  return {
    theme: surfaceThemeFixture(),
    families: { major: 'Bricolage Grotesque', minor: 'Inter' },
    link: () => null,
    slideNumber: null,
  };
}

/**
 * The shapes a diagram is written as, with no page elements to match.
 *
 * @param diagram - The description.
 */
function write(diagram = describedDiagram()): string {
  return diagramXml({
    diagram,
    nodeId: 10,
    scene: { nodes: [], tree: {} },
    nextId: idAllocator(),
    context: context(),
  });
}

/**
 * The id of the shape with a name.
 *
 * @param xml - The shapes.
 * @param name - The name.
 */
function shapeId(xml: string, name: string): string | undefined {
  return new RegExp(`<p:cNvPr id="(\\d+)" (?:descr="[^"]*" )?name="${name}"`).exec(xml)?.[1];
}

/**
 * The markup of the shape with a name, from its name to the end of the shape.
 *
 * @param xml - The shapes.
 * @param name - The name.
 */
function shapeXmlNamed(xml: string, name: string): string {
  return new RegExp(`name="${name}".*?</p:sp>`).exec(xml)?.[0] ?? '';
}

/**
 * The fill of a shape's markup: the first fill after its geometry.
 *
 * @param xml - The shape.
 */
function fillOf(xml: string): string {
  return (
    /<\/a:(?:prstGeom|custGeom)>(<a:(?:solidFill>.*?<\/a:solidFill|noFill\/)>)/.exec(xml)?.[1] ?? ''
  );
}

describe('diagramXml', () => {
  it('writes nodes as named shapes with their title as text, not grouped', () => {
    const xml = write();
    expect(xml).toContain('name="Node: API"');
    expect(xml).toContain('<a:t>API</a:t>');
    expect(xml).not.toContain('<p:grpSp>');
    expect(xml).toContain('descr="3 nodes and 3 connections."');
  });

  it('glues a straight connector to the sites its route meets', () => {
    const xml = write();
    const api = shapeId(xml, 'Node: API');
    const db = shapeId(xml, 'Node: DB');
    const straight =
      /<p:cxnSp>(?:(?!<\/p:cxnSp>).)*straightConnector1(?:(?!<\/p:cxnSp>).)*<\/p:cxnSp>/.exec(
        xml,
      )?.[0] ?? '';
    expect(straight).toContain(`<a:stCxn id="${api}" idx="3"/>`);
    expect(straight).toMatch(new RegExp(`<a:endCxn id="${db}" idx="\\d+"/>`));
    expect(straight).toContain('<a:tailEnd type="triangle"');
  });

  it('bends a connector along its route and draws other shapes from their outline', () => {
    const xml = write();
    expect(xml).toContain('prst="bentConnector2"');
    expect(xml).toContain('prst="bentConnector3"');
    expect(xml).toContain('<a:gd name="adj1"');
    const gate = /name="Node: GATE".*?<\/p:sp>/.exec(xml)?.[0] ?? '';
    expect(gate).toContain('<a:custGeom>');
    expect(gate).toContain('<a:cxnLst><a:cxn');
  });

  it('draws a card whose connector leaves off the middle of a side from its outline', () => {
    const api = /name="Node: API".*?<\/p:sp>/.exec(write())?.[0] ?? '';
    expect(api).toContain('<a:custGeom>');
  });

  it('keeps a card a preset when every connector meets a preset site', () => {
    const base = describedDiagram();
    const xml = write({ ...base, edges: base.edges.slice(0, 2) });
    const api = /name="Node: API".*?<\/p:sp>/.exec(xml)?.[0] ?? '';
    expect(api).toContain('prst="roundRect"');
  });

  it('draws a curved edge as a freeform line', () => {
    const base = describedDiagram();
    const edges = base.edges.slice(0, 1).map((edge) => ({
      ...edge,
      route: 'curved' as const,
      path: 'M300 350 C400 300 500 300 597 350',
    }));
    const xml = write({ ...base, edges });
    expect(xml).not.toContain('<p:cxnSp>');
    expect(xml).toContain('<a:cubicBezTo>');
  });

  it('sets text in the measured runs of the element that drew it', () => {
    const base = describedDiagram();
    const styled = run('Api', { style: runStyle({ caps: 'all', letterSpacing: 2 }) });
    const node = textNode(12, paragraph([line('Api', 360, { runs: [styled] })]), {
      parent: 11,
      rect: { x: 150, y: 333, width: 100, height: 34 },
    });
    const xml = diagramXml({
      diagram: base,
      nodeId: 10,
      scene: { nodes: [node], tree: { '11': 10, '12': 11 } },
      nextId: idAllocator(),
      context: context(),
    });
    expect(xml).toContain('cap="all"');
    expect(xml).not.toContain('name="Text: Api"');
  });

  it('puts an edge label on its chip', () => {
    const base = describedDiagram();
    const [first, ...rest] = base.edges;
    const labelled =
      first === undefined
        ? []
        : [
            {
              ...first,
              label: {
                ...describedText('HTTPS', { x: 400, y: 310, width: 96, height: 34 }),
                background: '#fcfcfd',
              },
            },
          ];
    const xml = write({ ...base, edges: [...labelled, ...rest] });
    expect(xml).toContain('name="Label: HTTPS"');
    expect(xml).toMatch(/name="Label: HTTPS".*?<a:solidFill><a:schemeClr val="bg1"\/>/);
  });

  it('casts a node shadow from a copy of its outline in its own fill, before the connectors', () => {
    const xml = write(describedCardDiagram());
    const shadow = shapeXmlNamed(xml, 'Shadow: API');
    expect(shadow).toContain('<a:outerShdw blurRad="0"');
    expect(shadow).toContain('dir="2700000"');
    expect(shadow).toContain('<a:ln><a:noFill/></a:ln>');
    expect(xml.indexOf('name="Shadow: API"')).toBeLessThan(xml.indexOf('<p:cxnSp>'));
    const node = shapeXmlNamed(xml, 'Node: API');
    expect(node).not.toContain('outerShdw');
    expect(fillOf(shadow)).toBe(fillOf(node));
  });

  it('casts shadows before the lifelines, which the page draws over them', () => {
    const xml = write(
      describedCardDiagram({
        lines: [
          {
            role: 'lifeline',
            node: 'api',
            points: [
              { x: 200, y: 400 },
              { x: 200, y: 900 },
            ],
            color: '#555c6a',
            width: 2,
            dashed: true,
            opacity: 1,
          },
        ],
      }),
    );
    expect(xml.indexOf('name="Shadow: API"')).toBeLessThan(xml.indexOf('name="Line: lifeline"'));
  });

  it('flattens a translucent or dimmed node with a shadow onto its backdrop, groups included', () => {
    const base = describedCardDiagram();
    const group = {
      id: 'zone',
      box: { x: 50, y: 250, width: 400, height: 300 },
      radius: 0,
      paint: { fill: '#e7e7e3', stroke: '#161920', strokeWidth: 1, dashed: false, opacity: 1 },
      label: null,
      parent: null,
    };
    const nodes = base.nodes.map((node) =>
      node.id === 'api'
        ? {
            ...node,
            group: 'zone',
            paint: { ...node.paint, fill: '#2d4ae01f', opacity: 0.5 },
          }
        : node,
    );
    const xml = write({ ...base, groups: [group], nodes });
    const flat = over(withOpacity('#2d4ae01f', 0.5), over('#e7e7e3', '#fcfcfd'));
    const node = shapeXmlNamed(xml, 'Node: API');
    expect(fillOf(node)).toBe(fillOf(shapeXmlNamed(xml, 'Shadow: API')));
    expect(fillOf(node)).toContain(flat.slice(1).toUpperCase());
    expect(fillOf(node)).not.toContain('<a:alpha');
  });

  it('keeps the shadow colour at the shadow opacity once, on an opaque copy', () => {
    const base = describedCardDiagram();
    const nodes = base.nodes.map((node) =>
      node.id === 'api' && node.shadow !== undefined && node.shadow !== null
        ? { ...node, shadow: { ...node.shadow, opacity: 0.5 } }
        : node,
    );
    const shadow = shapeXmlNamed(write({ ...base, nodes }), 'Shadow: API');
    // 0.5 is written as the nearest byte, 128 / 255.
    expect(shadow).toMatch(/<a:outerShdw [^>]*><a:schemeClr val="tx1"><a:alpha val="50196"\/>/);
    expect(fillOf(shadow)).not.toContain('<a:alpha');
  });

  it('puts the shadow of a node that casts it itself on its own shape', () => {
    const base = describedDiagram({ edges: [] });
    const band = describedNode(
      'band',
      { x: 100, y: 300, width: 400, height: 80 },
      {
        shadow: { layers: [{ x: 0, y: 6, blur: 10, color: '#0000002e' }], fill: null, opacity: 1 },
      },
    );
    const xml = write({ ...base, nodes: [band] });
    expect(xml).not.toContain('name="Shadow:');
    expect(shapeXmlNamed(xml, 'Node: BAND')).toContain('<a:outerShdw');
  });

  it('draws an accent stripe clipped to the outline, under a second copy of the line', () => {
    const xml = write(describedCardDiagram());
    const order = ['Node: API', 'Accent: API', 'Outline: API'].map((name) =>
      xml.indexOf(`name="${name}"`),
    );
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(order[0]).toBeGreaterThan(-1);
    const outline = shapeXmlNamed(xml, 'Outline: API');
    expect(outline).toMatch(/<\/a:xfrm><a:custGeom>.*<\/a:custGeom><a:noFill\/><a:ln w="12700">/);

    // The gate's hexagon slants in by 20px over its 50px half height, so a stripe 8px deep along
    // its top runs from 616.8px to 783.2px at the stripe's foot.
    const stripe = shapeXmlNamed(xml, 'Accent: GATE');
    expect(stripe).toContain(`<a:off x="${pxToEmu(616.8)}" y="${pxToEmu(700)}"/>`);
    expect(stripe).toContain(`<a:ext cx="${pxToEmu(166.4)}" cy="${pxToEmu(8)}"/>`);
    const points = [...stripe.matchAll(/<a:pt x="(\d+)" y="(\d+)"\/>/g)].map(([, x, y]) => [
      Number(x),
      Number(y),
    ]);
    expect(points).toEqual([
      [0, pxToEmu(8)],
      [pxToEmu(3.2), 0],
      [pxToEmu(163.2), 0],
      [pxToEmu(166.4), pxToEmu(8)],
    ]);
    expect(stripe).toContain('<a:ln><a:noFill/></a:ln>');
    expect(stripe).not.toContain('<a:cubicBezTo>');
  });

  it('writes a diagram without cards exactly as before cards existed', () => {
    const plain = describedDiagram({
      nodes: [
        describedNode('api', { x: 100, y: 300, width: 200, height: 100 }),
        describedNode('db', { x: 600, y: 300, width: 200, height: 100 }),
      ],
      edges: [
        describedEdge('api', 'db', [
          { x: 300, y: 350 },
          { x: 600, y: 350 },
        ]),
      ],
      summary: 'Two nodes.',
    });
    expect(write(plain)).toMatchInlineSnapshot(
      `"<p:cxnSp><p:nvCxnSpPr><p:cNvPr descr="Two nodes." id="4" name="Connector: API → DB"/><p:cNvCxnSpPr><a:stCxn id="2" idx="3"/><a:endCxn id="3" idx="1"/></p:cNvCxnSpPr><p:nvPr/></p:nvCxnSpPr><p:spPr><a:xfrm><a:off x="1905000" y="2222500"/><a:ext cx="1905000" cy="0"/></a:xfrm><a:prstGeom prst="straightConnector1"><a:avLst/></a:prstGeom><a:noFill/><a:ln w="12700"><a:solidFill><a:schemeClr val="tx2"/></a:solidFill><a:prstDash val="solid"/><a:round/><a:tailEnd type="triangle" w="lg" len="lg"/></a:ln></p:spPr></p:cxnSp><p:sp><p:nvSpPr><p:cNvPr id="2" name="Node: API"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="635000" y="1905000"/><a:ext cx="1270000" cy="635000"/></a:xfrm><a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val 12000"/></a:avLst></a:prstGeom><a:solidFill><a:schemeClr val="bg2"/></a:solidFill><a:ln w="12700"><a:solidFill><a:srgbClr val="D9DCE4"/></a:solidFill><a:prstDash val="solid"/><a:round/></a:ln></p:spPr><p:txBody><a:bodyPr wrap="square" lIns="3082" tIns="163102" rIns="3082" bIns="0" rtlCol="0" anchor="t" anchorCtr="0"><a:noAutofit/></a:bodyPr><a:lstStyle/><a:p><a:pPr algn="ctr"><a:lnSpc><a:spcPts val="1700"/></a:lnSpc></a:pPr><a:r><a:rPr sz="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/></a:rPr><a:t>API</a:t></a:r><a:endParaRPr sz="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/></a:endParaRPr></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id="3" name="Node: DB"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="3810000" y="1905000"/><a:ext cx="1270000" cy="635000"/></a:xfrm><a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val 12000"/></a:avLst></a:prstGeom><a:solidFill><a:schemeClr val="bg2"/></a:solidFill><a:ln w="12700"><a:solidFill><a:srgbClr val="D9DCE4"/></a:solidFill><a:prstDash val="solid"/><a:round/></a:ln></p:spPr><p:txBody><a:bodyPr wrap="square" lIns="3082" tIns="163102" rIns="3082" bIns="0" rtlCol="0" anchor="t" anchorCtr="0"><a:noAutofit/></a:bodyPr><a:lstStyle/><a:p><a:pPr algn="ctr"><a:lnSpc><a:spcPts val="1700"/></a:lnSpc></a:pPr><a:r><a:rPr sz="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/></a:rPr><a:t>DB</a:t></a:r><a:endParaRPr sz="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/></a:endParaRPr></a:p></p:txBody></p:sp>"`,
    );
  });

  it('ends connectors in the brand arrowhead', () => {
    expect(write(describedCardDiagram())).toContain('<a:tailEnd type="oval" w="med" len="med"/>');
    const base = describedDiagram();
    const open = write({ ...base, edges: base.edges.map((edge) => ({ ...edge, arrow: 'open' })) });
    expect(open).toContain('<a:tailEnd type="arrow" w="lg" len="lg"/>');
    expect(write()).toContain('<a:tailEnd type="triangle" w="lg" len="lg"/>');
  });

  it('keeps explicit dotted and solid strokes alongside legacy dashed lines', () => {
    const base = describedCardDiagram();
    const [first, second, third] = base.edges;
    expect(first && second && third).toBeDefined();
    if (first === undefined || second === undefined || third === undefined) {
      return;
    }

    const diagram = {
      ...base,
      edges: [
        { ...first, width: 7, dashed: true, lineStyle: 'dotted' as const },
        { ...second, width: 8, dashed: true },
        { ...third, width: 9, dashed: true, lineStyle: 'solid' as const },
      ],
      lines: [
        {
          role: 'axis' as const,
          node: null,
          points: [
            { x: 100, y: 800 },
            { x: 800, y: 800 },
          ],
          color: '#000000',
          width: 6,
          dashed: true,
          lineStyle: 'dotted' as const,
          opacity: 1,
        },
      ],
    };
    const xml = write(diagram);
    expect(xml).toMatch(/<a:ln w="44450" cap="rnd">.*?<a:prstDash val="sysDot"\/>/);
    expect(xml).toMatch(/<a:ln w="50800">.*?<a:prstDash val="dash"\/>/);
    expect(xml).toMatch(/<a:ln w="57150">.*?<a:prstDash val="solid"\/>/);
    expect(xml).toMatch(/<a:ln w="38100" cap="rnd">.*?<a:prstDash val="sysDot"\/>/);
    expect(decodeDiagramDescription(JSON.stringify(diagram))).toEqual(diagram);
  });
});

describe('withOpacity', () => {
  it('folds an opacity into a color alpha', () => {
    expect(withOpacity('#2d4ae0', 1)).toBe('#2d4ae0');
    expect(withOpacity('#2d4ae0', 0.5)).toBe('#2d4ae080');
    expect(withOpacity('#2d4ae080', 0.5)).toBe('#2d4ae040');
  });
});

describe('decodeDiagramDescription', () => {
  it('reads a kit description', () => {
    const decoded = decodeDiagramDescription(JSON.stringify(describedDiagram()));
    expect(typeof decoded).toBe('object');
    expect(asDecodedDescription(describedDiagram()).kind).toBe('flow');
  });

  it('keeps the card, shadow, accent and arrowhead fields', () => {
    const decoded = decodeDiagramDescription(JSON.stringify(describedCardDiagram()));
    expect(decoded).toEqual(describedCardDiagram());
  });

  it('says why a description cannot be read', () => {
    expect(decodeDiagramDescription('{')).toContain('is not JSON');
    expect(decodeDiagramDescription(JSON.stringify({ version: 1, kind: 'flow' }))).toContain(
      'does not match version 1',
    );
  });

  it('tells a description with shapes from one with only text', () => {
    expect(isDrawableDiagram(describedDiagram())).toBe(true);
    expect(isDrawableDiagram(describedDiagram({ nodes: [], edges: [] }))).toBe(false);
  });
});

describe('diagramPlanNote', () => {
  it('counts glued connectors and reports what differs', () => {
    const note = diagramPlanNote(describedDiagram());
    expect(note.why).toContain('3 shapes');
    expect(note.why).toContain('3 connectors (3 glued at both ends)');
    expect(note.outcome).toBe('native');
  });

  it('reports curved routes as freeform lines', () => {
    const base = describedDiagram();
    const edges = base.edges.map((edge) => ({ ...edge, route: 'curved' as const }));
    const note = diagramPlanNote({ ...base, edges });
    expect(note.outcome).toBe('simplified');
    expect(note.why).toContain('freeform');
  });
});
