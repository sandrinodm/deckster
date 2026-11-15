import { describe, expect, it } from 'vite-plus/test';

import {
  DIAGRAM_DESCRIPTION_ATTRIBUTE,
  readDiagramDescriptions,
} from '#diagrams/diagram-description.ts';

describe('readDiagramDescriptions', () => {
  it('reads every laid-out diagram in document order and skips the rest', () => {
    const description = { version: 1, kind: 'flow', id: 'stack', step: 2, nodes: [], edges: [] };
    const elements = [
      { getAttribute: () => JSON.stringify(description) },
      { getAttribute: () => '' },
      { getAttribute: () => '{not json' },
    ];
    const root = {
      querySelectorAll: (selector: string) => {
        expect(selector).toBe(`[${DIAGRAM_DESCRIPTION_ATTRIBUTE}]`);
        return elements;
      },
    };
    expect(readDiagramDescriptions(root)).toEqual([description]);
  });
});
