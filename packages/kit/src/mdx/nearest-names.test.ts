import { describe, expect, it } from 'vite-plus/test';

import { nearestNames } from '#mdx/nearest-names.ts';

describe('nearestNames', () => {
  const names = ['rocket', 'pocket', 'leaf', 'tent', 'arrow-up', 'arrow-down', 'chart-bar'];

  it('ranks names by edit distance, closest first', () => {
    expect(nearestNames('rockt', names, 6)).toEqual(['rocket', 'pocket']);
    expect(nearestNames('Rocket', names, 1)).toEqual(['rocket']);
  });

  it('finds names that contain the one written, or make up most of it', () => {
    expect(nearestNames('arrow', names, 6)).toEqual(['arrow-up', 'arrow-down']);
    expect(nearestNames('leafs', names, 6)).toEqual(['leaf']);
  });

  it('finds nothing for a name that is not close to any', () => {
    expect(nearestNames('nonexistent', names, 6)).toEqual([]);
  });
});
