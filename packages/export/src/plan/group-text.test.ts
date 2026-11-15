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
});
