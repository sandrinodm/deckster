import type { ReactNode } from 'react';

import { defineLayout, type LayoutProps } from '@deckster/engine';

import type { columnsContract } from './columns-layout.contract.ts';

/**
 * The body as a heading above two columns.
 */
function ColumnsLayout({ slots, frontmatter }: LayoutProps<typeof columnsContract>): ReactNode {
  return (
    <div data-layout="columns" data-gap={frontmatter.gap ?? 'tight'} style={{ padding: 96 }}>
      <header>{slots.body}</header>
      <div style={{ display: 'flex', gap: 64 }}>
        <div data-column="left">{slots.left}</div>
        <div data-column="right">{slots.right}</div>
      </div>
    </div>
  );
}

/**
 * The columns layout's runtime registration.
 */
export const columnsLayout = defineLayout<typeof columnsContract>({
  name: 'columns',
  component: ColumnsLayout,
});
