import type { ReactNode } from 'react';

import type { engineDefaultContract } from '#layouts/default-layout.contract.ts';

import { defineLayout, type LayoutProps } from '#layouts/layout.ts';

/**
 * The plain layout the engine ships so a deck renders before the kit registers real layouts: the
 * slide content in a padded column, with no brand styling.
 */
function DefaultLayout({ slots }: LayoutProps<typeof engineDefaultContract>): ReactNode {
  return <div className="deck-layout-default">{slots.body}</div>;
}

/**
 * The engine's `default` layout, registered before every plugin.
 */
export const engineDefaultLayout = defineLayout<typeof engineDefaultContract>({
  name: 'default',
  component: DefaultLayout,
});
