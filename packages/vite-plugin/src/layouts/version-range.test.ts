import { describe, expect, it } from 'vite-plus/test';

import { satisfiesRange } from '#layouts/version-range.ts';

describe('satisfiesRange', () => {
  it('reads comparators joined by spaces, all of which must hold', () => {
    expect(satisfiesRange('0.10.2', '>=0.10 <0.12')).toBe(true);
    expect(satisfiesRange('0.11.9', '>=0.10 <0.12')).toBe(true);
    expect(satisfiesRange('0.12.0', '>=0.10 <0.12')).toBe(false);
    expect(satisfiesRange('0.9.0', '>=0.10 <0.12')).toBe(false);
  });

  it('treats a short version as every version that starts with it', () => {
    expect(satisfiesRange('0.10.7', '0.10')).toBe(true);
    expect(satisfiesRange('0.11.0', '=0.10')).toBe(false);
    expect(satisfiesRange('0.10.7', '<=0.10')).toBe(true);
    expect(satisfiesRange('0.10.7', '>0.10')).toBe(false);
    expect(satisfiesRange('0.11.0', '>0.10')).toBe(true);
    expect(satisfiesRange('1.4.0', '>=1')).toBe(true);
  });

  it('compares full versions exactly', () => {
    expect(satisfiesRange('0.10.2', '>0.10.2')).toBe(false);
    expect(satisfiesRange('0.10.3', '>0.10.2')).toBe(true);
    expect(satisfiesRange('0.10.2', '<=0.10.2')).toBe(true);
    expect(satisfiesRange('0.10.2', '0.10.2')).toBe(true);
  });

  it('ignores a prerelease suffix of the version', () => {
    expect(satisfiesRange('0.10.0-beta.1', '>=0.10')).toBe(true);
  });

  it('answers undefined for a range or a version it cannot read', () => {
    expect(satisfiesRange('0.10.2', '^0.10')).toBeUndefined();
    expect(satisfiesRange('0.10.2', '>=0.10 || 2')).toBeUndefined();
    expect(satisfiesRange('0.10.2', '')).toBeUndefined();
    expect(satisfiesRange('unknown', '>=0.10')).toBeUndefined();
  });
});
