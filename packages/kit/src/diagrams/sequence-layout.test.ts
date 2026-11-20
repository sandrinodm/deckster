import { describe, expect, it } from 'vite-plus/test';

import { layoutSequence, sequenceActorWidth } from '#diagrams/sequence-layout.ts';

/**
 * Sizes for a diagram whose actor boxes get at most 240 px with 64 px between them.
 */
const METRICS = { actorMaxWidth: 240, actorHeight: 90, gutter: 64, rowMax: 120, loopWidth: 64 };

describe('sequenceActorWidth', () => {
  it('gives every actor the widest box when the diagram has room', () => {
    expect(sequenceActorWidth(3, 1200, METRICS)).toBe(240);
  });

  it("narrows the boxes to each actor's share less the gutter in a narrow diagram", () => {
    expect(sequenceActorWidth(5, 1250, METRICS)).toBe(186);
  });

  it('counts no actors as one', () => {
    expect(sequenceActorWidth(0, 200, METRICS)).toBe(136);
  });
});

describe('layoutSequence', () => {
  it('aligns the actors, lifelines and messages as one compact scene', () => {
    const layout = layoutSequence(
      ['client', 'service'],
      [{ from: 'client', to: 'service' }],
      { width: 1250, height: 600 },
      {
        ...METRICS,
        align: 'right',
        actorWidths: new Map([
          ['client', 200],
          ['service', 100],
        ]),
      },
    );
    expect(layout.actors.get('client')?.width).toBe(200);
    expect(layout.actors.get('service')?.x).toBe(1150);
    expect(layout.lifelines.get('service')?.from.x).toBe(1200);
    expect(layout.messages[0]?.[1]?.x).toBe(1200);
  });

  it('keeps a self-message label inside the compact scene', () => {
    const layout = layoutSequence(
      ['actor'],
      [{ from: 'actor', to: 'actor', labelWidth: 160 }],
      { width: 1250, height: 600 },
      { ...METRICS, actorMaxWidth: 100, align: 'right', loopLabelGap: 8 },
    );
    const loop = layout.messages[0]?.[1];
    expect(loop?.x).toBe(1082);
  });

  it('draws every actor box at the width the actors are measured at', () => {
    const actors = ['shop', 'api', 'flock', 'rider', 'recipient'];
    const layout = layoutSequence(
      actors,
      [{ from: 'shop', to: 'api' }],
      { width: 1250, height: 600 },
      METRICS,
    );
    const widths = [...layout.actors.values()].map((box) => box.width);
    expect(widths).toEqual(actors.map(() => sequenceActorWidth(actors.length, 1250, METRICS)));
  });
});
