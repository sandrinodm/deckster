import { rmSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vite-plus/test';

import { scratchRoot, writeFiles } from '#layouts/layout-workspace.fixture.ts';
import { usedLayoutNames, type FallbackIndex } from '#layouts/used-layouts.ts';

/**
 * A catalog where `brand-kpi` is a data layout rendered through the `kpi` code layout.
 */
const INDEX: FallbackIndex = new Map([
  ['default', {}],
  ['funnel', {}],
  ['kpi', {}],
  ['brand-kpi', { fallback: 'kpi' }],
]);

describe('usedLayoutNames', () => {
  it('gives the layouts the slides name, the default and their fallbacks', async () => {
    const root = scratchRoot();
    writeFiles(root, {
      'a.mdx': '---\nlayout: brand-kpi\n---\n\nHi\n',
      'b.mdx': 'No frontmatter.\n',
      'c.tsx': "export const frontmatter = { layout: 'funnel' };\nexport default () => null;\n",
    });
    const slides = ['a.mdx', 'b.mdx', 'c.tsx'].map((file) => ({ file: path.join(root, file) }));
    const used = await usedLayoutNames(slides, INDEX);
    expect([...(used ?? [])].toSorted()).toEqual(['brand-kpi', 'default', 'funnel', 'kpi']);
    rmSync(root, { recursive: true, force: true });
  });

  it('gives nothing to narrow by when a slide names a layout the catalog lacks', async () => {
    const root = scratchRoot();
    writeFiles(root, { 'a.mdx': '---\nlayout: other-brand-wall\n---\n\nHi\n' });
    expect(await usedLayoutNames([{ file: path.join(root, 'a.mdx') }], INDEX)).toBe(undefined);
    rmSync(root, { recursive: true, force: true });
  });

  it('gives nothing to narrow by when a slide computes its frontmatter or is missing', async () => {
    const root = scratchRoot();
    writeFiles(root, {
      'computed.tsx': [
        "const name = 'funnel';",
        'export const frontmatter = { layout: name };',
        'export default () => null;',
        '',
      ].join('\n'),
    });
    expect(await usedLayoutNames([{ file: path.join(root, 'computed.tsx') }], INDEX)).toBe(
      undefined,
    );
    expect(await usedLayoutNames([{ file: path.join(root, 'gone.mdx') }], INDEX)).toBe(undefined);
    rmSync(root, { recursive: true, force: true });
  });
});
