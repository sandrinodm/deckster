import { describe, expect, it } from 'vite-plus/test';

import { treeCells } from '#diagrams/tree-layout.ts';

describe('treeCells', () => {
  it('lines leaves up in order and puts each parent over its middle child', () => {
    const cells = treeCells([
      {
        id: 'root',
        children: [
          {
            id: 'a',
            children: [
              { id: 'a1', children: [] },
              { id: 'a2', children: [] },
            ],
          },
          { id: 'b', children: [{ id: 'b1', children: [] }] },
          { id: 'c', children: [] },
        ],
      },
    ]);
    expect(cells.get('a1')).toEqual({ depth: 3, across: 1 });
    expect(cells.get('a2')).toEqual({ depth: 3, across: 2 });
    expect(cells.get('a')).toEqual({ depth: 2, across: 1.5 });
    expect(cells.get('b')).toEqual({ depth: 2, across: 3 });
    expect(cells.get('c')).toEqual({ depth: 2, across: 4 });
    expect(cells.get('root')).toEqual({ depth: 1, across: 3 });
  });
});
