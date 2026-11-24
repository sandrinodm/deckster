import type { ReactNode } from 'react';

import { defineLayout, type LayoutProps } from '@deckster/engine';

import type { codeLayoutContract } from '#layouts/code-layout.contract.ts';

import { Footnote, Frame, Region, SlideHeader, useEnter } from '#layout-parts.ts';

/**
 * The most lines the code layout's title takes before it steps down in size: one, so the code keeps
 * as much height as the slide can give it.
 */
const CODE_TITLE_LINES = 1;

/**
 * The `code` layout: the shared header on one line, then the code area in eight columns with the
 * notes in the last four, or in all twelve when there are no notes, and the footnote on the bottom
 * line. The code and its notes sit optically in the height between the title and the footnote, and
 * a short block steps its type up into that height.
 */
function CodeLayout({ frontmatter, slots }: LayoutProps<typeof codeLayoutContract>): ReactNode {
  const hasAside = slots.aside !== undefined;
  const bodyEnter = useEnter(1);
  const asideEnter = useEnter(2);
  return (
    <Frame layout="code" variant={{ 'data-aside': String(hasAside) }}>
      <SlideHeader
        eyebrow={frontmatter.eyebrow}
        title={frontmatter.title}
        maxLines={CODE_TITLE_LINES}
      />
      <Region className="kit-code-layout kit-code-region kit-body" place="optical">
        <div className="kit-code-row kit-grid">
          <div className="kit-code-main" {...bodyEnter}>
            {slots.body}
          </div>
          {hasAside ? (
            <aside className="kit-code-aside kit-prose" {...asideEnter}>
              {slots.aside}
            </aside>
          ) : null}
        </div>
      </Region>
      <Footnote>{slots.footnote}</Footnote>
    </Frame>
  );
}

/**
 * The `code` layout's component.
 */
export const codeLayout = defineLayout<typeof codeLayoutContract>({
  name: 'code',
  component: CodeLayout,
});
