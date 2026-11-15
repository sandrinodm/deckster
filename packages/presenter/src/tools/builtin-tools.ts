import { useSyncExternalStore } from 'react';

import { deckShell, shellFullscreen, watchShellFullscreen } from '#shell/deck-shell.ts';
import { registerToolButton } from '#tools/tool-registry.ts';
import { openOverview, setSidebarOpen, uiState, updateUi, useUiState } from '#ui/ui-state.ts';
import { openPresenterWindow } from '#ui/window-kind.ts';

/**
 * Icon paths for the built-in buttons, drawn in a 24x24 box.
 */
const ICONS = {
  /**
   * A window with a panel on its left.
   */
  sidebar: ['M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z', 'M9 3v18'],

  /**
   * Four tiles.
   */
  overview: [
    'M4 5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z',
    'M14 5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1z',
    'M4 15a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z',
    'M14 15a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1z',
  ],

  /**
   * A screen on a stand with a second window, for the presenter view.
   */
  presenter: ['M2 3h20', 'M21 3v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3', 'M7 21l5-5 5 5'],

  /**
   * Four corners.
   */
  fullscreen: [
    'M8 3H5a2 2 0 0 0-2 2v3',
    'M21 8V5a2 2 0 0 0-2-2h-3',
    'M3 16v3a2 2 0 0 0 2 2h3',
    'M16 21h3a2 2 0 0 0 2-2v-3',
  ],

  /**
   * A monitor on a stand, for the displays panel.
   */
  displays: ['M3 4h18v12H3z', 'M8 20h8', 'M12 16v4'],

  /**
   * A question mark in a circle.
   */
  help: [
    'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
    'M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3',
    'M12 17h.01',
  ],
} as const;

/**
 * The position of each built-in button in the tool cluster, lower first. Plugins' buttons default
 * to a later position.
 */
const BUTTON_ORDER = {
  /**
   * The slide sidebar.
   */
  sidebar: 10,

  /**
   * The overview.
   */
  overview: 20,

  /**
   * The presenter window.
   */
  presenter: 30,

  /**
   * Fullscreen.
   */
  fullscreen: 40,

  /**
   * The displays panel, which only the desktop shell has.
   */
  displays: 45,

  /**
   * The keyboard shortcut help.
   */
  help: 50,
} as const;

/**
 * Removes the displays button when the page is not in the shell, so a hot reload stays correct.
 */
let unregisterDisplaysButton: (() => void) | undefined;

/**
 * Registers the presenter tools' own buttons in the tool cluster. Registering again replaces each
 * button, so a hot reload is safe.
 */
export function registerBuiltinTools(): void {
  registerToolButton({
    id: 'panels.sidebar',
    label: 'Slide sidebar',
    shortcut: 's',
    icon: ICONS.sidebar,
    order: BUTTON_ORDER.sidebar,
    run: () => setSidebarOpen(),
    usePressed: () => useUiState().sidebarOpen,
  });
  registerToolButton({
    id: 'panels.overview',
    label: 'Overview',
    shortcut: 'o',
    icon: ICONS.overview,
    order: BUTTON_ORDER.overview,
    run: ({ deck }) => {
      if (uiState.get().overviewOpen) {
        updateUi({ overviewOpen: false });
        return;
      }

      openOverview(deck.position.slide);
    },
    usePressed: () => useUiState().overviewOpen,
  });
  registerToolButton({
    id: 'panels.presenter',
    label: 'Presenter window',
    shortcut: 'p',
    icon: ICONS.presenter,
    order: BUTTON_ORDER.presenter,
    run: openPresenterWindow,
  });
  registerToolButton({
    id: 'presenting.fullscreen',
    label: 'Fullscreen',
    shortcut: 'f',
    icon: ICONS.fullscreen,
    order: BUTTON_ORDER.fullscreen,
    run: toggleFullscreen,
    usePressed: useFullscreen,
  });
  watchShellFullscreen();
  syncDisplaysButton();
  registerToolButton({
    id: 'panels.help',
    label: 'Keyboard shortcuts',
    shortcut: '?',
    icon: ICONS.help,
    order: BUTTON_ORDER.help,
    run: () => updateUi({ helpOpen: !uiState.get().helpOpen }),
    usePressed: () => useUiState().helpOpen,
  });
}

/**
 * Adds the displays button inside the desktop shell and removes it everywhere else.
 */
function syncDisplaysButton(): void {
  if (deckShell() === undefined) {
    unregisterDisplaysButton?.();
    unregisterDisplaysButton = undefined;
    return;
  }

  unregisterDisplaysButton = registerToolButton({
    id: 'shell.displays',
    label: 'Displays',
    icon: ICONS.displays,
    order: BUTTON_ORDER.displays,
    run: () => updateUi({ displaysOpen: !uiState.get().displaysOpen }),
    usePressed: () => useUiState().displaysOpen,
  });
}

/**
 * Enters fullscreen, or leaves it when the page is fullscreen already. The browser refuses without
 * a user gesture; that failure is ignored because the key press or click is the gesture. Inside the
 * desktop shell the shell's window goes fullscreen instead, which needs no gesture.
 */
export function toggleFullscreen(): void {
  const shell = deckShell();
  if (shell !== undefined) {
    shell.setFullscreen(!shellFullscreen.get()).catch(() => undefined);
    return;
  }

  if (document.fullscreenElement !== null) {
    void document.exitFullscreen();
    return;
  }

  document.documentElement.requestFullscreen().catch(() => undefined);
}

/**
 * Whether the page is fullscreen, kept current in a component.
 */
function useFullscreen(): boolean {
  const inPage = useSyncExternalStore(subscribeFullscreen, isFullscreen, () => false);
  const inShell = useSyncExternalStore(shellFullscreen.subscribe, shellFullscreen.get, () => false);
  return deckShell() === undefined ? inPage : inShell;
}

/**
 * Listens for fullscreen changes.
 *
 * @param listener - Called on every change.
 */
function subscribeFullscreen(listener: () => void): () => void {
  document.addEventListener('fullscreenchange', listener);
  return () => document.removeEventListener('fullscreenchange', listener);
}

/**
 * Whether the page is fullscreen now.
 */
function isFullscreen(): boolean {
  return document.fullscreenElement !== null;
}
