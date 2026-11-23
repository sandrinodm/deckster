import type { ReactNode } from 'react';

import { useDeck } from '@deckster/engine';

import { DisplaysPanel } from '#displays/displays-panel.tsx';
import { GotoPrompt } from '#goto/goto-prompt.tsx';
import { HelpOverlay } from '#help/help-overlay.tsx';
import { LaserLayer } from '#laser/laser-layer.tsx';
import { Overview } from '#overview/overview.tsx';
import { PresenterView } from '#presenter/presenter-view.tsx';
import { Sidebar } from '#sidebar/sidebar.tsx';
import { SyncBridge } from '#sync/sync-bridge.tsx';
import { ToolCluster } from '#tools/tool-cluster.tsx';
import { Blackout } from '#ui/blackout.tsx';
import { windowKind } from '#ui/window-kind.ts';

/**
 * Everything the presenter tools draw over the deck. It draws nothing in static mode, so `deck
 * shot`, `deckster lint` and export see exactly the slides. The audience window gets the sidebar,
 * overview, blackout and laser; the presenter window gets the presenter view; both get the sync
 * bridge, the go-to prompt and the help. The audience window also gets the tool cluster.
 */
export function PresenterOverlay(): ReactNode {
  const deck = useDeck();
  if (deck.isStatic) {
    return null;
  }

  return windowKind() === 'presenter' ? (
    <>
      <PresenterView />
      <SyncBridge />
      <GotoPrompt />
      <HelpOverlay />
    </>
  ) : (
    <>
      <Sidebar />
      <Overview />
      <SyncBridge />
      <GotoPrompt />
      <HelpOverlay />
      <DisplaysPanel />
      <ToolCluster />
      <LaserLayer />
      <Blackout />
    </>
  );
}
