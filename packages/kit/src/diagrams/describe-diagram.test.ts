// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vite-plus/test';

import { describeDiagram, type DescribeInput } from '#diagrams/describe-diagram.ts';

/**
 * Matches `rgb(r, g, b)` and `rgb(r g b / a)`.
 */
const RGB_PATTERN = /rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)/;

// happy-dom computes no opacity, so the opacities read here are not checked.

/**
 * A stand-in for the one-pixel canvas the description converts colors on, which happy-dom does not
 * paint: it reads back `rgb()` colors and treats anything else as transparent.
 */
function fakeContext(): unknown {
  let fill = '';
  return {
    clearRect: () => undefined,
    fillRect: () => undefined,
    set fillStyle(value: string) {
      fill = value;
    },
    get fillStyle() {
      return fill;
    },
    getImageData: () => {
      const match = RGB_PATTERN.exec(fill);
      const alpha = match?.[4] === undefined ? 1 : Number(match[4]);
      return {
        data:
          match === null
            ? [0, 0, 0, 0]
            : [Number(match[1]), Number(match[2]), Number(match[3]), Math.round(alpha * 255)],
      };
    },
  };
}

beforeAll(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () => fakeContext() as CanvasRenderingContext2D,
  );
});

afterEach(() => {
  document.body.replaceChildren();
});

/**
 * A rendered one-node flow with an open-arrowed edge, as the kit draws it: with a card's inline
 * variables, shadow and accent stripe, or as a stylesheet without cards draws it.
 *
 * @param cards - Whether the stylesheet defines cards.
 */
function renderedFlow(cards: boolean): HTMLElement {
  const root = document.createElement('div');
  const card = cards
    ? 'style="--kit-card-fill: var(--x); --kit-card-radius: 20px" data-card="raised"'
    : 'data-card="default"';
  root.innerHTML = `
    <svg>
      ${
        cards
          ? `<g class="kit-flow-shadow" data-node="api">
              <g class="kit-flow-shadow-cast" style="filter: drop-shadow(rgb(22, 25, 32) 8px 8px 0px)">
                <path style="fill: rgb(252, 252, 253)" d="M0 0" />
              </g>
            </g>`
          : ''
      }
      <g class="kit-flow-edge" data-edge="api->db">
        <path class="kit-flow-edge-line" style="stroke: rgb(85, 92, 106); stroke-width: 3px" />
        <path class="kit-flow-arrow" ${cards ? 'data-arrow="open"' : ''} />
      </g>
      <g class="kit-flow-shape" data-node="api" ${card}>
        <path class="kit-flow-outline" style="fill: rgb(244, 245, 248); stroke: rgb(217, 220, 228); stroke-width: 2px" />
        ${
          cards
            ? '<rect class="kit-flow-accent" data-side="left" x="10" y="20" width="6" height="100" style="fill: rgb(45, 74, 224)" />'
            : ''
        }
      </g>
    </svg>
    <div class="kit-flow-node" data-node="api"><span class="kit-flow-node-title">API</span></div>`;
  document.body.append(root);
  return root;
}

/**
 * What the flow component passes to the description for the rendered flow.
 *
 * @param element - The rendered flow.
 */
function input(element: HTMLElement): DescribeInput {
  return {
    element,
    kind: 'flow',
    id: 'flow-a',
    step: 0,
    summary: '',
    groups: [],
    nodes: [
      {
        id: 'api',
        kind: 'service',
        state: 'default',
        shape: 'card',
        rect: { x: 10, y: 20, width: 200, height: 100 },
      },
    ],
    edges: [
      {
        id: 'api->db',
        from: 'api',
        to: 'db',
        route: 'straight',
        arrow: 'end',
        points: [
          { x: 210, y: 70 },
          { x: 400, y: 70 },
        ],
        segments: [{ kind: 'line', from: { x: 210, y: 70 }, to: { x: 400, y: 70 } }],
        tone: 'default',
      },
    ],
    packets: { dots: [], tags: [] },
  };
}

describe('describeDiagram', () => {
  it("reads a card node's name, radius, shadow and accent, and the edge's arrowhead", () => {
    const diagram = describeDiagram(input(renderedFlow(true)));
    const [node] = diagram.nodes;
    expect(node).toMatchObject({
      card: 'raised',
      radius: 20,
      shadow: { layers: [{ x: 8, y: 8, blur: 0, color: '#161920' }], fill: '#fcfcfd' },
      accent: { side: 'left', box: { x: 10, y: 20, width: 6, height: 100 }, color: '#2d4ae0' },
    });
    expect(diagram.edges[0]?.arrow).toBe('open');
    expect(diagram.edges[0]?.width).toBe(3);
  });

  it('describes a diagram without cards as it was described before cards existed', () => {
    const diagram = describeDiagram(input(renderedFlow(false)));
    const [node] = diagram.nodes;
    expect(node).toBeDefined();
    for (const key of ['card', 'shadow', 'accent']) {
      expect(node).not.toHaveProperty(key);
    }

    expect(diagram.edges[0]).not.toHaveProperty('arrow');
  });

  it('reads a split outline, a dotted connector, styled note text, and image artwork', () => {
    const element = renderedFlow(true);
    const outline = element.querySelector('.kit-flow-outline');
    outline?.setAttribute('style', 'fill: rgb(244, 245, 248); stroke: none');
    outline?.insertAdjacentHTML(
      'afterend',
      '<path class="kit-flow-outline kit-flow-outline-stroke" data-line-style="dotted" ' +
        'style="stroke: rgb(217, 220, 228); stroke-width: 6px; stroke-dasharray: 0 12px" />',
    );
    element.querySelector('.kit-flow-edge')?.setAttribute('data-line-style', 'dashed');
    element
      .querySelector('.kit-flow-node')
      ?.insertAdjacentHTML(
        'beforeend',
        '<span data-diagram-part="icon"><img src="https://example.test/source.png" alt="" /></span>' +
          '<span class="kit-flow-node-subtitle" style="font: 700 28px Georgia">Build status</span>',
      );
    const diagram = describeDiagram(input(element));
    expect(diagram.nodes[0]).toMatchObject({
      paint: {
        fill: '#f4f5f8',
        stroke: '#d9dce4',
        strokeWidth: 6,
        dashed: true,
        lineStyle: 'dotted',
      },
      icon: { src: 'https://example.test/source.png', color: null, svg: '' },
      texts: [expect.anything(), { text: 'Build status', fontFamily: 'Georgia', fontSizePx: 28 }],
    });
    expect(diagram.edges[0]).toMatchObject({ width: 3, dashed: true, lineStyle: 'dashed' });
  });

  it('reads the border when the timeline axis is drawn as a patterned HTML line', () => {
    const element = document.createElement('div');
    const axis = document.createElement('div');
    axis.style.borderTop = '5px dotted rgb(45, 74, 224)';
    element.append(axis);
    document.body.append(element);
    const diagram = describeDiagram({
      ...input(element),
      kind: 'timeline',
      nodes: [],
      edges: [],
      lines: [
        {
          role: 'axis',
          element: axis,
          points: [
            { x: 0, y: 0 },
            { x: 30, y: 0 },
          ],
        },
      ],
    });
    expect(diagram.lines?.[0]).toMatchObject({
      width: 5,
      color: '#2d4ae0',
      dashed: true,
      lineStyle: 'dotted',
    });
  });

  it('reads the shadow and accent of a band drawn in HTML from its box shadows', () => {
    const element = document.createElement('div');
    const band = document.createElement('section');
    band.setAttribute('data-card', 'raised');
    band.setAttribute('data-accent', 'left');
    for (const [name, value] of Object.entries({
      '--kit-card-fill': 'var(--x)',
      '--kit-card-accent-width': '6px',
      '--kit-card-accent': 'rgb(45, 74, 224)',
      'box-shadow': 'rgb(22, 25, 32) 6px 6px 0px 0px, rgb(45, 74, 224) 6px 0px 0px 0px inset',
    })) {
      band.style.setProperty(name, value);
    }

    element.append(band);
    document.body.append(element);
    const diagram = describeDiagram({
      ...input(element),
      kind: 'layers',
      nodes: [],
      edges: [],
      boxes: [
        {
          id: 'layer-1',
          kind: 'layer',
          state: 'default',
          shape: band,
          described: 'roundRect',
          texts: [],
        },
      ],
    });
    expect(diagram.nodes[0]).toMatchObject({
      card: 'raised',
      shadow: { layers: [{ x: 6, y: 6, blur: 0, color: '#161920' }], fill: null },
      accent: { side: 'left', color: '#2d4ae0' },
    });
  });
});
