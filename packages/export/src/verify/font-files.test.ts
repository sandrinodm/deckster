import { describe, expect, it } from 'vite-plus/test';

import { fontFamily } from '#verify/font-files.ts';

describe('fontFamily', () => {
  it('returns null for bytes that are not a font', () => {
    expect(fontFamily(new Uint8Array([0, 1, 2, 3]))).toBeNull();
  });
});
