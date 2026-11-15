import { describe, expect, it } from 'vite-plus/test';

import type { TextContext } from '#pptx/text-xml.ts';

import {
  asDecodedDescription,
  decodeDiagramDescription,
  isDrawableDiagram,
} from '#diagram/decode-diagram.ts';
import { diagramPlanNote } from '#diagram/diagram-plan.ts';
import { describedDiagram, describedText } from '#diagram/diagram.fixture.ts';
import { diagramXml, withOpacity } from '#pptx/diagram-xml.ts';
import { idAllocator } from '#pptx/shape-xml.ts';
import { surfaceThemeFixture } from '#pptx/theme.fixture.ts';
import { line, paragraph, run, runStyle, textNode } from '#scene/scene.fixture.ts';

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
