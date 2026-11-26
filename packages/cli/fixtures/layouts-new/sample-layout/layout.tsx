import type { ReactNode } from 'react';

import { defineLayout, type LayoutProps } from '@deckster/engine';
import { Frame, Region, SlideHeader } from '@deckster/kit/layout-parts';

import type contract from './contract.ts';

import './layout.css';

/**
 * The shared header with the eyebrow and the title, then the body in a region that takes the height
 * left, in an eight-column reading measure. Content taller than the region spills out of it, which
 * `deckster lint` and `deckster layouts check` report.
 */
function Layout({ frontmatter, slots }: LayoutProps<typeof contract>): ReactNode {
  return (
    <Frame layout="sample-layout">
      <SlideHeader eyebrow={frontmatter.eyebrow} title={frontmatter.title} />
      <Region>
        <div className="kit-grid">
          <div className="layout-body kit-prose">{slots.body}</div>
        </div>
      </Region>
    </Frame>
  );
}

/**
 * The layout's component, registered under the name of its folder and its contract.
 */
export default defineLayout<typeof contract>({
  name: 'sample-layout',
  component: Layout,
});
