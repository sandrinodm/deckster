import path from 'node:path';
import { describe, expect, it } from 'vite-plus/test';

import { isHotLayoutEdit } from '#layouts/watch-layouts.ts';

const LAYOUTS = path.join('/workspace', 'brands', 'acme', 'layouts');

describe('isHotLayoutEdit', () => {
  it('is true for an edited component or stylesheet inside a layout folder or _shared', () => {
    for (const file of ['kpi-wall/layout.tsx', 'kpi-wall/layout.css', '_shared/card.tsx']) {
      expect(isHotLayoutEdit(LAYOUTS, 'change', path.join(LAYOUTS, file))).toBe(true);
    }
  });

  it('is false for a contract, limits or helper, which change what slides are checked against', () => {
    for (const file of ['kpi-wall/contract.ts', 'kpi-wall/limits.ts', '_shared/fields.ts']) {
      expect(isHotLayoutEdit(LAYOUTS, 'change', path.join(LAYOUTS, file))).toBe(false);
    }
  });

  it('is false for a file added or removed, which may add or remove a layout', () => {
    const file = path.join(LAYOUTS, 'kpi-wall', 'layout.tsx');
    expect(isHotLayoutEdit(LAYOUTS, 'add', file)).toBe(false);
    expect(isHotLayoutEdit(LAYOUTS, 'unlink', file)).toBe(false);
  });

  it('is false for files at the top of layouts/ and outside it', () => {
    expect(isHotLayoutEdit(LAYOUTS, 'change', path.join(LAYOUTS, 'art.css'))).toBe(false);
    expect(isHotLayoutEdit(LAYOUTS, 'change', '/workspace/brands/acme/brand.css')).toBe(false);
    expect(isHotLayoutEdit(LAYOUTS, 'change', '/workspace/brands/other/layouts/a/layout.tsx')).toBe(
      false,
    );
  });

  it('is false for a component of a layout that is not registered, so its name is checked again', () => {
    const component = path.join(LAYOUTS, 'kpi-wall', 'layout.tsx');
    /**
     * Whether a component belongs to a layout that is not registered.
     *
     * @param file - An absolute path.
     */
    const isUnregistered = (file: string) => file === component;
    expect(isHotLayoutEdit(LAYOUTS, 'change', component, isUnregistered)).toBe(false);
    expect(
      isHotLayoutEdit(
        LAYOUTS,
        'change',
        path.join(LAYOUTS, 'kpi-wall', 'layout.css'),
        isUnregistered,
      ),
    ).toBe(true);
    expect(
      isHotLayoutEdit(LAYOUTS, 'change', path.join(LAYOUTS, 'other', 'layout.tsx'), isUnregistered),
    ).toBe(true);
  });
});
