import type { ReactNode } from 'react';

import { defineLayout, type LayoutProps } from '@deckster/engine';

import type contract from './contract.ts';

/**
 * The brand's cover. It keeps the kit's frame and cover class names on purpose, so the tests can
 * see that none of the kit cover's rules reach it once the kit layout is replaced.
 */
function BrandCover({ frontmatter, slots }: LayoutProps<typeof contract>): ReactNode {
  return (
    <div className="kit-frame" data-layout="title" data-align={frontmatter.align}>
      <div className="kit-cover-main" data-testid="cover-main">
        <p className="kit-eyebrow" data-testid="cover-eyebrow">
          {frontmatter.eyebrow}
        </p>
        <h1 className="kit-cover-title">{frontmatter.title}</h1>
      </div>
      <p data-testid="cover-label">Brand cover</p>
      {slots.body}
    </div>
  );
}

export default defineLayout<typeof contract>({ name: 'title', component: BrandCover });
