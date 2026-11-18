import { describe, expect, it } from 'vite-plus/test';

import { readSlideLayout } from '#slides/read-slide-layout.ts';

describe('readSlideLayout', () => {
  it('reads the layout of an MDX slide’s frontmatter', () => {
    expect(readSlideLayout('s.mdx', '---\nlayout: fx-hero\ntitle: x\n---\nText\n')).toBe('fx-hero');
  });

  it('reads the layout of a TSX slide’s frontmatter literal', () => {
    const source =
      "export const frontmatter = { layout: 'fx-hero' } satisfies object;\nexport default () => <p>Hi</p>;\n";
    expect(readSlideLayout('s.tsx', source)).toBe('fx-hero');
  });

  it('ignores a layout written in the body, and gives undefined for no layout', () => {
    expect(readSlideLayout('s.mdx', '---\ntitle: x\n---\nlayout: fx-hero\n')).toBeUndefined();
    expect(readSlideLayout('s.mdx', 'Text')).toBeUndefined();
  });

  it('gives undefined for frontmatter it cannot read', () => {
    expect(readSlideLayout('s.mdx', '---\nlayout: [\n---\n')).toBeUndefined();
    expect(readSlideLayout('s.tsx', 'export const frontmatter = { layout: f() };')).toBeUndefined();
  });
});
