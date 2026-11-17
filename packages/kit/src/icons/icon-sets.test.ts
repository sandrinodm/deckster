import { describe, expect, it } from 'vite-plus/test';

import { iconSetNames, installIconSetHint } from '#icons/icon-sets.ts';

describe('iconSetNames', () => {
  it('lists the names of an installed set and nothing for a missing one', () => {
    expect(iconSetNames('lucide')).toContain('book');
    expect(iconSetNames('no-such-set')).toBeUndefined();
  });
});

describe('installIconSetHint', () => {
  it('tells a published CLI user to install the set where the CLI is, with npm or pnpm', () => {
    expect(installIconSetHint('mdi', true)).toBe(
      'Install `@iconify-json/mdi` where the deck CLI is installed, with the same tool ' +
        '(`npm install --global @iconify-json/mdi` for a global npm install, ' +
        '`pnpm add --global @iconify-json/mdi` for pnpm)',
    );
  });

  it("tells a framework developer to add the set to the kit's dependencies", () => {
    expect(installIconSetHint('mdi', false)).toBe(
      "Add `@iconify-json/mdi` to @deckster/kit's dependencies and run `pnpm install`",
    );
  });
});
