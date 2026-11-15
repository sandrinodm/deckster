import type { LayoutRegistry } from '#layouts/layout.ts';

import { useDeckRuntime } from '#deck/deck-runtime.ts';

/**
 * The layouts every plugin registered, by name, for chrome and overlays that adapt to the layout of
 * the slide on screen, such as moving the page number off a photo that bleeds to its corner.
 *
 * @throws Error naming the fix when called outside `<Deck>`.
 */
export function useLayouts(): LayoutRegistry {
  return useDeckRuntime('useLayouts()').runtime.layouts;
}
