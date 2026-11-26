import type { ReactNode } from 'react';

import { defineLayout, type LayoutProps } from '@deckster/engine';

import type contract from './contract.ts';

/**
 * A heading over the body as a wall of tiles.
 */
function KpiWall({ slots, frontmatter }: LayoutProps<typeof contract>): ReactNode {
  return (
    <div className="kpi-wall flex flex-col gap-lg p-3xl" data-columns={frontmatter.columns ?? 2}>
      <h2 className="kpi-wall-heading type-title">Brand wall</h2>
      <div className="type-body">{slots.body}</div>
    </div>
  );
}

export default defineLayout<typeof contract>({ name: 'kpi-wall', component: KpiWall });
