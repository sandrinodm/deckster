import { describe, expect, it } from 'vite-plus/test';

import { outcomeFor } from '#layouts/logo-state.ts';

describe('outcomeFor', () => {
  it('gives the outcome of the file the cell shows', () => {
    expect(outcomeFor({ source: '/a.svg', outcome: 'failed' }, '/a.svg')).toBe('failed');
  });

  it('forgets a failure when the cell shows another file', () => {
    expect(outcomeFor({ source: '/a.svg', outcome: 'failed' }, '/b.svg')).toBeUndefined();
    expect(outcomeFor({ source: '/a.svg', outcome: 'failed' }, undefined)).toBeUndefined();
    expect(outcomeFor(undefined, '/b.svg')).toBeUndefined();
  });
});
