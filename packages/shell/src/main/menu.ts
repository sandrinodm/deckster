import type { MenuItemConstructorOptions } from 'electron';

/**
 * What the menu items do.
 */
export type MenuActions = {
  /**
   * Toggles fullscreen on the audience window.
   */
  toggleFullscreen: () => void;

  /**
   * Opens or focuses the presenter window.
   */
  openPresenter: () => void;

  /**
   * Moves the focused window to the next display.
   */
  moveToNextDisplay: () => void;

  /**
   * Reloads the focused page.
   */
  reload: () => void;

  /**
   * Toggles the developer tools of the focused page.
   */
  toggleDevTools: () => void;

  /**
   * Quits the shell.
   */
  quit: () => void;

  /**
   * Returns to the chooser during a workspace presentation, if available.
   */
  backToDecks?: () => void;
};

/**
 * Builds the application menu. Kiosk mode has none: nothing on screen but the slide.
 *
 * @param actions - What the items do.
 * @param platform - `process.platform`.
 * @param appName - The name shown in the macOS application menu.
 * @param kiosk - Whether kiosk mode is on.
 * @returns The template, or `undefined` for no menu.
 */
export function buildMenuTemplate(
  actions: MenuActions,
  platform: string,
  appName: string,
  kiosk: boolean,
): MenuItemConstructorOptions[] | undefined {
  if (kiosk) {
    return undefined;
  }

  const quit: MenuItemConstructorOptions = {
    label: 'Quit',
    accelerator: 'CmdOrCtrl+Q',
    click: actions.quit,
  };
  const backToDecks: MenuItemConstructorOptions[] =
    actions.backToDecks === undefined
      ? []
      : [
          {
            label: 'Back to decks',
            accelerator: 'CmdOrCtrl+Shift+B',
            click: actions.backToDecks,
          },
        ];
  const app: MenuItemConstructorOptions[] =
    platform === 'darwin' ? [{ label: appName, submenu: [quit] }] : [];
  return [
    ...app,
    {
      label: 'File',
      submenu: platform === 'darwin' ? [{ role: 'close' }] : [quit],
    },
    { role: 'editMenu' },
    {
      label: 'Present',
      submenu: [
        ...backToDecks,
        {
          label: 'Toggle Fullscreen',
          accelerator: platform === 'darwin' ? 'Ctrl+Cmd+F' : 'F11',
          click: actions.toggleFullscreen,
        },
        {
          label: 'Presenter Window',
          accelerator: 'CmdOrCtrl+Shift+P',
          click: actions.openPresenter,
        },
        {
          label: 'Move to Next Display',
          accelerator: 'CmdOrCtrl+Shift+D',
          click: actions.moveToNextDisplay,
        },
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Reload', accelerator: 'CmdOrCtrl+R', click: actions.reload },
        {
          label: 'Toggle Developer Tools',
          accelerator: 'Alt+CmdOrCtrl+I',
          click: actions.toggleDevTools,
        },
      ],
    },
  ];
}
