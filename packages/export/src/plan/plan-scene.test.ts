import { describe, expect, it } from 'vite-plus/test';

import type { MasterBackground } from '#plan/plan-scene.ts';
import type { SvgNode } from '#scene/scene.ts';

import { isTranslucentGradient, planScene } from '#plan/plan-scene.ts';
import { dryRunReport, formatDryRun } from '#report/dry-run.ts';
import { boxNode, line, paragraph, scene, textNode } from '#scene/scene.fixture.ts';

/**
 * The default surface's master: a flat near-white.
 */
function master(): MasterBackground {
  return { paint: { kind: 'solid', color: '#fcfcfd' }, texture: null };
}

/**
 * An inline SVG that uses text.
 */
function complexSvg(): SvgNode {
  return { ...boxNode(9), kind: 'svg', markup: '<svg/>', shapes: null, href: null };
}

describe('planScene', () => {
  it('rasterises a filtered element with everything inside it in hybrid mode', () => {
    const frame = boxNode(1, {
      fill: null,
      hints: [{ reason: 'filter', scope: 'subtree', detail: 'filter: url(#duotone)' }],
    });
    const caption = textNode(2, paragraph([line('Inside', 140)]), { parent: 1 });
    const outside = textNode(3, paragraph([line('Outside', 400)]));
    const plan = planScene(scene({ nodes: [frame, caption, outside] }), 'hybrid', master());
    expect(plan.items.map((item) => [item.kind, item.node.id])).toEqual([
      ['picture', 1],
      ['native', 3],
    ]);
    expect(plan.notes[0]).toMatchObject({ outcome: 'picture', why: 'filter: url(#duotone)' });
  });

  it('never rasterises in native mode and reports what it dropped', () => {
    const frame = boxNode(1, {
      hints: [{ reason: 'filter', scope: 'subtree', detail: 'filter: blur(4px)' }],
    });
    const plan = planScene(scene({ nodes: [frame, complexSvg()] }), 'native', master());
    expect(plan.items.map((item) => item.kind)).toEqual(['native']);
    expect(plan.notes.map((note) => note.outcome)).toEqual(['simplified', 'dropped']);
  });

  it('pictures only the paint of a textured box and keeps its content native', () => {
    const card = boxNode(1, {
      hints: [{ reason: 'background-image', scope: 'paint', detail: 'background-image: url()' }],
    });
    const label = textNode(2, paragraph([line('Label', 140)]), { parent: 1 });
    const plan = planScene(scene({ nodes: [card, label] }), 'hybrid', master());
    expect(plan.items.map((item) => (item.kind === 'picture' ? item.scope : item.kind))).toEqual([
      'paint',
      'native',
    ]);
  });

  it('pictures a scrim over a photo with its alpha in hybrid mode and keeps the text native', () => {
    const photo = {
      ...boxNode(1),
      kind: 'image' as const,
      src: 'photo.jpg',
      alt: 'A street',
      natural: { width: 1920, height: 1080 },
      crop: { left: 0, top: 0, right: 0, bottom: 0 },
      radii: [0, 0, 0, 0] as [number, number, number, number],
      vector: false,
      grayscale: false,
      href: null,
    };
    const scrim = boxNode(2, {
      fill: {
        kind: 'linear',
        angle: 0,
        stops: [
          { color: '#0c0e139e', at: 0 },
          { color: '#0c0e138c', at: 0.4 },
          { color: '#00000000', at: 1 },
        ],
      },
    });
    const title = textNode(3, paragraph([line('Title', 400)]));
    const hybrid = planScene(scene({ nodes: [photo, scrim, title] }), 'hybrid', master());
    expect(
      hybrid.items.map((item) => [item.node.id, item.kind === 'picture' ? item.scope : 'native']),
    ).toEqual([
      [1, 'native'],
      [2, 'paint'],
      [3, 'native'],
    ]);
    expect(hybrid.items[1]).toMatchObject({ reasons: [{ reason: 'translucent-gradient' }] });
    const native = planScene(scene({ nodes: [photo, scrim, title] }), 'native', master());
    expect(native.items.map((item) => item.kind)).toEqual(['native', 'native', 'native']);
    expect(native.notes.find((entry) => entry.what === 'box')?.outcome).toBe('simplified');
  });

  it('keeps opaque gradients and translucent solid fills native', () => {
    expect(
      isTranslucentGradient({
        kind: 'linear',
        angle: 90,
        stops: [
          { color: '#ff0000', at: 0 },
          { color: '#0000ffff', at: 1 },
        ],
      }),
    ).toBe(false);
    expect(isTranslucentGradient({ kind: 'solid', color: '#00000080' })).toBe(false);
    expect(
      isTranslucentGradient({
        kind: 'radial',
        center: { x: 0.5, y: 0.5 },
        stops: [
          { color: '#ffffff80', at: 0 },
          { color: '#ffffff80', at: 1 },
        ],
      }),
    ).toBe(true);
    const panel = boxNode(1, { fill: { kind: 'solid', color: '#ffffff1f' } });
    expect(planScene(scene({ nodes: [panel] }), 'hybrid', master()).items).toMatchObject([
      { kind: 'native' },
    ]);
  });

  it('lets the master draw a background that matches it, and a slide its own when it differs', () => {
    const backdrop = boxNode(1, {
      fullBleed: true,
      rect: { x: 0, y: 0, width: 1920, height: 1080 },
      fill: { kind: 'solid', color: '#fcfcfd' },
    });
    expect(planScene(scene({ nodes: [backdrop] }), 'hybrid', master())).toMatchObject({
      items: [],
      background: { kind: 'master' },
    });
    const own = planScene(
      scene({ background: { kind: 'solid', color: '#2d4ae0' } }),
      'hybrid',
      master(),
    );
    expect(own.background).toEqual({
      kind: 'paint',
      paint: { kind: 'solid', color: '#2d4ae0' },
      grain: false,
    });
  });

  it('notes boxes whose layered shadows are simplified', () => {
    const shadows = [
      { x: 0, y: 8, blur: 24, spread: -8, color: '#00000024', inset: false },
      { x: 0, y: 2, blur: 6, spread: 0, color: '#0000000d', inset: false },
    ];
    const plan = planScene(scene({ nodes: [boxNode(1, { shadows })] }), 'hybrid', master());
    expect(plan.notes).toEqual([
      expect.objectContaining({
        outcome: 'simplified',
        why: 'box-shadow reduced to one PowerPoint shadow',
      }),
    ]);
  });

  it('keeps a placed shape with shapePreset or paragraphs even without fill or borders', () => {
    const emptyPreset = boxNode(1, { fill: null, shapePreset: 'ellipse', placed: true });
    const textOnlyBox = boxNode(2, {
      fill: null,
      paragraphs: [paragraph([line('Callout text', 140)])],
    });
    const plan = planScene(scene({ nodes: [emptyPreset, textOnlyBox] }), 'hybrid', master());
    expect(plan.items.map((item) => [item.kind, item.node.id])).toEqual([
      ['native', 1],
      ['native', 2],
    ]);
  });
});

describe('dry-run report', () => {
  it('counts outcomes per slide and lists what is not native', () => {
    const frame = boxNode(1, {
      fill: null,
      hints: [{ reason: 'filter', scope: 'subtree', detail: 'filter: url(#grain)' }],
    });
    const text = textNode(2, paragraph([line('Hello', 140)]));
    const plan = planScene(scene({ nodes: [frame, text] }), 'hybrid', master());
    const report = dryRunReport('hybrid', [
      { number: 3, id: 'heat-map', layout: 'split', step: null, plan },
    ]);
    expect(report.totals).toEqual({ native: 1, picture: 1, simplified: 0, dropped: 0 });
    const text_ = formatDryRun(report);
    expect(text_).toContain('03 heat-map [split]: 1 / 1 / 0 / 0');
    expect(text_).toContain('picture    box    div:nth-of-type(1): filter: url(#grain)');
  });
});
