import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vite-plus/test';

import { appIconPath } from '#main/app-icon.ts';

describe('the shell icon', () => {
  it.each([
    ['darwin', 'icon.png'],
    ['win32', 'icon.ico'],
    ['linux', 'icon.png'],
  ])('names an icon file that exists for %s', (platform, file) => {
    const path = appIconPath(platform);
    expect(path.endsWith(`/assets/${file}`) || path.endsWith(`\\assets\\${file}`)).toBe(true);
    expect(existsSync(path)).toBe(true);
  });
});
