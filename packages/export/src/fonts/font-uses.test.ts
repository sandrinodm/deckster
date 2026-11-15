import { describe, expect, it } from 'vite-plus/test';

import { fontUses } from '#fonts/font-uses.ts';
import { line, paragraph, run, runStyle, scene, textNode } from '#scene/scene.fixture.ts';

describe('fontUses', () => {
  it('collects each style once with its characters, upper case for caps and extra text', () => {
    const bold = runStyle({ weight: 600, axes: { wght: 600 } });
    const label = runStyle({ caps: 'all' });
    const body = paragraph([
      line('aba', 100, { runs: [run('aba'), run('cd', { style: bold })] }),
      line('ab', 150, { runs: [run('eyebrow', { style: label })] }),
    ]);
    const uses = fontUses(
      [scene({ nodes: [textNode(1, body)] })],
      [{ style: { ...runStyle(), family: 'Bricolage Grotesque' }, text: 'Node' }],
    );
    expect(uses.map((use) => [use.family, use.weight, use.text])).toEqual([
      ['Inter', 400, 'abeyrowEYBROW'],
      ['Inter', 600, 'cd'],
      ['Bricolage Grotesque', 400, 'Node'],
    ]);
  });
});
