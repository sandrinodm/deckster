import { useEffect, useEffectEvent, type Dispatch } from 'react';

import type { DeckControls } from '#deck/deck-context.ts';
import type { NavigationAction } from '#navigation/navigation.ts';
import type { DeckRuntime } from '#plugins/compose-plugins.ts';

import { isEditableTarget, isSpaceForTarget, keyToAction } from '#navigation/keyboard.ts';

/**
 * Handles the navigation keys on the window. Plugins see each key first and can claim it; keys
 * typed into inputs, already handled elsewhere (`defaultPrevented`), part of an IME composition, or
 * Space on a focused button, link, `<summary>`, media element or button-like role are ignored.
 *
 * @param controls - The deck's controls, passed to plugin key handlers.
 * @param keyHandlers - Plugin key handlers, in plugin order.
 * @param dispatch - The navigation dispatcher.
 */
export function useKeyboardNavigation(
  controls: DeckControls,
  keyHandlers: DeckRuntime['keyHandlers'],
  dispatch: Dispatch<NavigationAction>,
): void {
  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    const isElementKey = isEditableTarget(event.target) || isSpaceForTarget(event);
    if (event.defaultPrevented || event.isComposing || isElementKey) {
      return;
    }

    if (keyHandlers.some((handler) => handler(event, controls))) {
      event.preventDefault();
      return;
    }

    const action = keyToAction(event);
    if (action === undefined) {
      return;
    }

    event.preventDefault();
    dispatch(action);
  });

  useEffect(() => {
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
