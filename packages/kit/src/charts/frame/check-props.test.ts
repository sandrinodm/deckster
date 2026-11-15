import { describe, expect, it } from 'vite-plus/test';

import { checkProps, closestProp } from '#charts/frame/check-props.ts';

describe('closestProp', () => {
  it('reads a synonym', () => {
    expect(closestProp('highlighted', ['highlight', 'x'])).toBe('highlight');
  });

  it.each(['constructor', 'toString', '__proto__', 'hasOwnProperty'])(
    'does not read `%s` as a synonym',
    (name) => {
      expect(closestProp(name, ['x', 'y'])).toBeUndefined();
    },
  );
});

describe('checkProps', () => {
  it.each(['constructor', 'toString', 'hasOwnProperty'])('names `%s` as not a prop', (name) => {
    expect(() => checkProps('BarChart', { [name]: 1 })).toThrow(`\`${name}\` is not a prop`);
  });
});
