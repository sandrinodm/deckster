import { useSyncExternalStore } from 'react';

import type { LayoutRegistry } from '#layouts/layout.ts';

import { useDeckRuntime } from '#deck/deck-runtime.ts';
import { layoutLoadCount, subscribeToLayoutLoads } from '#layouts/layout-loads.ts';

/**
 * The layouts every plugin registered, by name, for chrome and overlays that adapt to the layout of
 * the slide on screen, such as moving the page number off a photo that bleeds to its corner. A
 * component that calls this renders again when a lazy layout finishes loading, so what it reads
 * from the layout (its `bleed`) is the loaded layout's.
 *
 * @throws Error naming the fix when called outside `<Deck>`.
 */
export function useLayouts(): LayoutRegistry {
  useSyncExternalStore(subscribeToLayoutLoads, layoutLoadCount);
  return useDeckRuntime('useLayouts()').runtime.layouts;
}
