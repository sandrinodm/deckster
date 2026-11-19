import { BrowserWindow, session, type WebContents } from 'electron';

import type { ShellTestOptions } from '#main/config.ts';
import type { ScreenLike } from '#main/displays.ts';
import type { ShellChooserTarget } from '#protocol/shell-messages.ts';

import { clearSession, freshPartition, installFrameSandbox } from '#main/deck-session.ts';
import { listDisplays, operatorDisplay } from '#main/displays.ts';
import { installDownloadPolicy } from '#main/downloads.ts';
import { installPermissions } from '#main/permissions.ts';
import { audienceBounds, cornerBounds } from '#main/window-bounds.ts';

/**
 * The chooser document event used to request an operator return.
 */
const RETURN_EVENT = 'deckster:return-to-chooser';

/**
 * The ID of the return control in a deck window.
 */
const RETURN_BUTTON = 'deck-shell-back-to-decks';

/**
 * The isolated preload channel that accepts a real operator click.
 */
const RETURN_CHANNEL = 'deck-shell:back-to-decks';

/**
 * Styles shared by the controls in the presenter and sole-display deck windows.
 */
const RETURN_STYLE = `
#${RETURN_BUTTON} {
  position: fixed; inset: auto 12px 12px auto; z-index: 2147483647;
  padding: 6px 10px; border: 1px solid transparent; border-radius: 6px;
  background: #1e1c1a; color: #fff; cursor: pointer;
  font: 500 13px/1.4 system-ui, sans-serif;
}
#${RETURN_BUTTON}:hover, #${RETURN_BUTTON}:focus-visible { text-decoration: underline; }
`;

/**
 * The chooser's independent window and its operator display placement.
 */
type ChooserWindow = {
  /**
   * Loads the launcher, rejecting if its document or display is unavailable.
   */
  open: (options: ShellChooserTarget) => Promise<number>;

  /**
   * Changes placement and visibility when a deck is opened, moved or closed.
   */
  place: (
    audienceDisplayId: number,
    operatorDisplayId: number | undefined,
    active: boolean,
  ) => void;

  /**
   * Brings the chooser to the foreground and requests a return from its trusted page.
   */
  requestReturn: (selection: string, onCancelled: () => void) => void;

  /**
   * Returns the chooser window, if it has opened.
   */
  window: () => BrowserWindow | undefined;
};

/**
 * Hosts the chooser on a separate partition at one exact URL. It has no privileged preload,
 * dialogs, external navigation, popups or download handling beyond a deny policy.
 */
export function createChooserWindow(
  screen: ScreenLike,
  test: ShellTestOptions,
  quit: () => void,
  report: (message: string) => void,
): ChooserWindow {
  let chooser: BrowserWindow | undefined;
  let returning = false;

  return {
    open: async (options) => {
      if (chooser !== undefined) {
        throw new Error('The deck chooser is already open.');
      }

      const display = operatorDisplay(
        listDisplays(screen),
        options.audienceDisplayId,
        options.operatorDisplayId,
      );
      if (display === undefined) {
        throw new Error('No display is connected for the deck chooser.');
      }

      const url = new URL(options.url);
      const partition = freshPartition();
      const store = session.fromPartition(partition);
      installPermissions(store, url.origin);
      installDownloadPolicy(store, report);
      installFrameSandbox(store, url.origin);
      const win = new BrowserWindow({
        ...(test.corner ? cornerBounds(display) : audienceBounds(display)),
        show: false,
        title: 'Choose a deck',
        backgroundColor: '#f6f4ef',
        webPreferences: {
          partition,
          contextIsolation: true,
          sandbox: true,
          nodeIntegration: false,
          disableDialogs: true,
          spellcheck: false,
        },
      });
      chooser = win;
      const contents = win.webContents;
      /**
       * Rejects every navigation except reloading the chooser document itself.
       */
      const guard = (event: { url: string; preventDefault: () => void }): void => {
        if (event.url !== url.href) {
          event.preventDefault();
        }
      };
      contents.on('will-navigate', guard);
      contents.on('will-frame-navigate', guard);
      contents.on('will-redirect', guard);
      contents.setWindowOpenHandler(() => ({ action: 'deny' }));
      win.on('closed', () => {
        chooser = undefined;
        void clearSession(store);
        quit();
      });
      await win.loadURL(url.href);
      if (!test.hidden) {
        if (test.corner) {
          win.showInactive();
        } else {
          win.show();
        }
      }

      return display.id;
    },
    place: (audienceDisplayId, operatorDisplayId, active) => {
      const win = chooser;
      if (win === undefined || win.isDestroyed()) {
        return;
      }

      const display = operatorDisplay(listDisplays(screen), audienceDisplayId, operatorDisplayId);
      if (display === undefined) {
        win.hide();
        return;
      }

      if (screen.getDisplayMatching(win.getBounds()).id !== display.id) {
        win.setBounds(test.corner ? cornerBounds(display) : audienceBounds(display));
      }

      if (test.hidden) {
        return;
      }

      if (active && display.id === audienceDisplayId) {
        win.hide();
      } else if (active || test.corner) {
        win.showInactive();
      } else {
        win.show();
      }
    },
    requestReturn: (selection, onCancelled) => {
      const win = chooser;
      if (returning || win === undefined || win.isDestroyed()) {
        return;
      }

      if (!test.hidden) {
        win.show();
      }

      const contents = win.webContents;
      returning = true;
      /**
       * Asks the trusted document to close the selection and restores focus if the operator
       * cancels.
       */
      const request = (): void => {
        const expression = `new Promise((resolve) => {
          const detail = { done: resolve, selection: ${JSON.stringify(selection)} };
          window.dispatchEvent(new CustomEvent(${JSON.stringify(RETURN_EVENT)}, { detail }));
        })`;
        void contents
          .executeJavaScript(expression)
          .then((closed: unknown) => {
            if (closed === false) {
              onCancelled();
            }
          })
          .catch(() => undefined)
          .finally(() => {
            returning = false;
          });
      };
      if (contents.isLoadingMainFrame()) {
        contents.once('did-finish-load', request);
      } else {
        request();
      }
    },
    window: () => chooser,
  };
}

/**
 * Mounts the return button in an eligible deck window. The sandboxed preload accepts only a trusted
 * user click. The main process independently verifies the sender and current window role.
 */
export function installReturnControl(contents: WebContents, visible: boolean): void {
  const source = `
    const id = ${JSON.stringify(RETURN_BUTTON)};
    const current = document.getElementById(id);
    if (${JSON.stringify(visible)}) {
      if (current === null) {
        const button = document.createElement('button');
        button.id = id;
        button.type = 'button';
        button.textContent = 'Back to decks';
        document.body.append(button);
        return true;
      }
    } else {
      current?.remove();
    }
  `;
  void contents
    .executeJavaScript(`(() => { ${source} })()`)
    .then((created: unknown) => (created === true ? contents.insertCSS(RETURN_STYLE) : undefined))
    .catch(() => undefined);
}

/**
 * The preload IPC channel used by the trusted operator return button.
 */
export const backToDecksChannel = RETURN_CHANNEL;
