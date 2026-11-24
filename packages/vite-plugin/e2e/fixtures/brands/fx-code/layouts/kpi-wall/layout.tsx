import type { ReactNode } from 'react';

import { defineLayout, type LayoutProps } from '@deckster/engine';

import type contract from './contract.ts';

import './layout.css';

/**
 * The body as a wall of tiles, under a label the tests look for.
 */
function KpiWall({ slots, frontmatter }: LayoutProps<typeof contract>): ReactNode {
  return (
    <div data-layout="kpi-wall" data-columns={frontmatter.columns ?? 2} style={{ padding: 96 }}>
      <p data-testid="kpi-label" className="opacity-[0.37]">
        Brand wall
      </p>
      {slots.body}
    </div>
  );
}

export default defineLayout<typeof contract>({ name: 'kpi-wall', component: KpiWall });
