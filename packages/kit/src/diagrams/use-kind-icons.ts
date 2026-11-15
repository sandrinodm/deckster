import { getBrand } from '@deckster/brand/runtime';
import { useReadyHold } from '@deckster/engine';
import { useEffect, useState } from 'react';

import type { IconComponent } from '#diagrams/flow-parts.tsx';

import { NODE_KINDS, type NodeKind } from '#diagrams/node-kinds.ts';

/**
 * A node that may need its kind's icon.
 */
export type KindIconRequest = {
  /**
   * The node's kind.
   */
  kind: NodeKind;

  /**
   * Whether it already has an icon, or asked for none (`icon="none"`).
   */
  settled: boolean;
};

/**
 * No icons.
 */
const NONE: ReadonlyMap<NodeKind, IconComponent> = new Map();

/**
 * The kinds' icons once loaded; module state, so the chunk loads once for the whole deck.
 */
let loaded: ReadonlyMap<NodeKind, IconComponent> | undefined;

/**
 * The kinds' icons in the brand's set for nodes written in TSX, where no build step resolved them:
 * when a node has a `kind` with an icon and no `icon` of its own, the kinds' icon chunk loads
 * (once, for the whole deck) and the slide's `ready()` waits for it. MDX nodes arrive with their
 * icons already imported, so this loads nothing for them.
 *
 * @param requests - The nodes.
 * @returns Each kind's icon; empty until the chunk has loaded, or when nothing needs it.
 */
export function useKindIcons(
  requests: readonly KindIconRequest[],
): ReadonlyMap<NodeKind, IconComponent> {
  const needed = requests.some(
    (request) => !request.settled && NODE_KINDS[request.kind].icons !== null,
  );
  const [icons, setIcons] = useState<ReadonlyMap<NodeKind, IconComponent>>(loaded ?? NONE);
  const [failed, setFailed] = useState(false);
  useReadyHold(needed && icons.size === 0 && !failed);
  useEffect(() => {
    if (!needed || icons.size > 0 || failed) {
      return undefined;
    }

    return settleIconLoad(loadKindIcons, { loaded: setIcons, failed: () => setFailed(true) });
  }, [needed, icons, failed]);
  return needed ? icons : NONE;
}

/**
 * Starts loading the kinds' icons and reports how it ended. A load that fails (the chunk did not
 * arrive) is reported as a warning and leaves the nodes without icons, so the slide does not wait
 * on it.
 *
 * @param load - Loads the icons.
 * @param handlers - What to do with the icons, and when the load failed.
 * @returns Stops the report, for when the component goes away first.
 */
export function settleIconLoad(
  load: () => Promise<ReadonlyMap<NodeKind, IconComponent>>,
  handlers: { loaded: (icons: ReadonlyMap<NodeKind, IconComponent>) => void; failed: () => void },
): () => void {
  let live = true;
  load().then(
    (found) => {
      if (live) {
        handlers.loaded(found);
      }
    },
    (error: unknown) => {
      console.warn(
        'The diagram could not load its node icons, so its nodes are drawn without them: ' +
          `${error instanceof Error ? error.message : String(error)}. Reload the page.`,
      );
      if (live) {
        handlers.failed();
      }
    },
  );
  return () => {
    live = false;
  };
}

/**
 * Loads the kinds' icons in the brand's icon set (Lucide's for a set the kit does not map).
 */
async function loadKindIcons(): Promise<ReadonlyMap<NodeKind, IconComponent>> {
  if (loaded !== undefined) {
    return loaded;
  }

  const { KIND_ICON_SETS } = await import('#diagrams/kind-icon-set.ts');
  const set = getBrand().brand.icons.set;
  const icons =
    (Object.hasOwn(KIND_ICON_SETS, set) ? KIND_ICON_SETS[set] : undefined) ??
    KIND_ICON_SETS['lucide'] ??
    {};
  loaded = new Map(Object.entries(icons) as [NodeKind, IconComponent][]);
  return loaded;
}
