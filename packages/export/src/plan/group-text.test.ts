import { describe, expect, it } from 'vite-plus/test';

import { groupText } from '#plan/group-text.ts';
import { boxNode, line, paragraph, textNode } from '#scene/scene.fixture.ts';

describe('groupText', () => {
  it('sets stacked paragraphs of one block in one frame', () => {
    const first = textNode(1, paragraph([line('One', 140)]));
    const second = textNode(2, paragraph([line('Two', 214)]));
    const items = groupText([
      { kind: 'native', node: first },
      { kind: 'native', node: second },
    ]);
    expect(items).toHaveLength(1);
    expect(items[0]?.node.kind === 'text' && items[0].node.paragraphs).toHaveLength(2);
  });

  it('keeps paragraphs apart across slots, side by side, or with a shape drawn between them', () => {
    const left = textNode(1, paragraph([line('Left', 140)]));
    const aside = textNode(2, paragraph([line('Aside', 214)]), { slot: 'aside' });
    const beside = textNode(
      3,
      paragraph([line('Beside', 140)], { box: { x: 1100, y: 106, width: 400, height: 50 } }),
    );
    expect(
      groupText([
        { kind: 'native', node: left },
        { kind: 'native', node: aside },
      ]),
    ).toHaveLength(2);
    expect(
      groupText([
        { kind: 'native', node: left },
        { kind: 'native', node: beside },
      ]),
    ).toHaveLength(2);
    const below = textNode(4, paragraph([line('Below', 214)]));
    const rule = boxNode(5, { rect: { x: 128, y: 160, width: 800, height: 4 } });
    expect(
      groupText([
        { kind: 'native', node: left },
        { kind: 'native', node: rule },
        { kind: 'native', node: below },
      ]),
    ).toHaveLength(3);
  });

  it('keeps stacked paragraphs apart when they are replaced at different steps', () => {
    const copy = textNode(1, paragraph([line('Copy', 140)], { replacedAt: 1 }), { replacedAt: 1 });
    const plain = textNode(2, paragraph([line('Plain', 214)]));
    const same = textNode(3, paragraph([line('Same', 214)], { replacedAt: 1 }), { replacedAt: 1 });
    expect(
      groupText([
        { kind: 'native', node: copy },
        { kind: 'native', node: plain },
      ]),
    ).toHaveLength(2);
    expect(
      groupText([
        { kind: 'native', node: copy },
        { kind: 'native', node: same },
      ]),
    ).toHaveLength(1);
  });

  it('merges paragraphs inside the same exportText container and keeps separate ones apart', () => {
    const heading = textNode(
      1,
      paragraph([line('Heading', 140)], { align: 'center', wrapWidth: null }),
      { exportText: true, placed: true, slot: null, container: 10 },
    );
    const bullet = textNode(
      2,
      paragraph([line('Bullet item', 240)], {
        align: 'left',
        wrapWidth: 400,
        bullet: {
          kind: 'shape',
          rect: { x: 104, y: 224, width: 10, height: 10 },
          color: '#2d4ae0',
          radius: 5,
        },
      }),
      { exportText: true, placed: true, slot: null, container: 10 },
    );
    const other = textNode(3, paragraph([line('Separate text box', 320)]), {
      exportText: true,
      placed: true,
      slot: null,
      container: 20,
    });
    const merged = groupText([
      { kind: 'native', node: heading },
      { kind: 'native', node: bullet },
      { kind: 'native', node: other },
    ]);
    expect(merged).toHaveLength(2);
    expect(merged[0]?.node.kind === 'text' && merged[0].node.paragraphs).toHaveLength(2);
    expect(merged[1]?.node.kind === 'text' && merged[1].node.paragraphs).toHaveLength(1);
  });
});
