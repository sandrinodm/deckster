import type { ShellWindowRole } from '#protocol/shell-messages.ts';

import { APP_NAME } from '#bundle/app-identity.ts';

/**
 * The shell's name for a deck, `Deckster: <deck title>`: the app name the dock and the About and
 * Hide items use, and the audience window's title.
 *
 * @param deckTitle - The deck's title from its config.
 */
export function appTitle(deckTitle: string): string {
  return `${APP_NAME}: ${deckTitle}`;
}

/**
 * The title of one of the shell's windows. The shell sets it and ignores the page's own `<title>`,
 * so the deck window and the presenter window always say what they are.
 *
 * @param deckTitle - The deck's title from its config.
 * @param role - Which window.
 */
export function windowTitle(deckTitle: string, role: ShellWindowRole): string {
  return role === 'presenter' ? `${appTitle(deckTitle)} · Presenter` : appTitle(deckTitle);
}
