import { BrowserWindow, shell, type BrowserWindowConstructorOptions } from 'electron';
import { writeFileSync } from 'node:fs';

import type { ShellConfig, ShellTestOptions } from '#main/config.ts';
import type { PowerGuard } from '#main/power.ts';
import type {
  ShellDisplay,
  ShellEvent,
  ShellPlan,
  ShellRect,
  ShellWindowInfo,
  ShellWindowRole,
} from '#protocol/shell-messages.ts';

import { agentCodeOnce } from '#main/agent-code.ts';
import { appIconPath } from '#main/app-icon.ts';
import {
  findDisplay,
  listDisplays,
  nextDisplay,
  presenterDisplay,
  type ScreenLike,
} from '#main/displays.ts';
import { createExternalOpener, installNavigationGuards } from '#main/navigation-guard.ts';
import { decideWindowOpen, isDeckOpener, presenterUrlOnDeck } from '#main/navigation.ts';
import { createQuitGate } from '#main/quit-gate.ts';
import { waitForDeck } from '#main/wait-for-deck.ts';
import { audienceBounds, cornerBounds, presenterBounds } from '#main/window-bounds.ts';
import {
  readWindowState,
  restorableBounds,
  savedWindow,
  withSavedWindow,
  writeWindowState,
} from '#main/window-state.ts';
import { windowTitle } from '#main/window-title.ts';

/**
 * How long after a move or resize the window's position is saved.
 */
const SAVE_DEBOUNCE_MS = 400;

/**
 * A display to compute bounds against when none is connected, which Electron never reports.
 */
const FALLBACK_DISPLAY: ShellDisplay = {
  /**
   * The display id.
   */
  id: 0,

  /**
   * The display name.
   */
  label: '',

  /**
   * The full area.
   */
  bounds: { x: 0, y: 0, width: 1920, height: 1080 },

  /**
   * The usable area.
   */
  workArea: { x: 0, y: 0, width: 1920, height: 1080 },

  /**
   * Device pixels per point.
   */
  scaleFactor: 1,

  /**
   * Whether it is the primary display.
   */
  primary: true,
};

/**
 * The deck the windows show, as the window manager needs it: what the shell adopts from its
 * configuration or from the `open` command.
 */
export type WindowTarget = {
  /**
   * The deck's URL.
   */
  url: string;

  /**
   * The deck's title, for the window titles.
   */
  title: string;

  /**
   * The brand's default surface colour.
   */
  backgroundColor: string;

  /**
   * The one-time agent code for the audience window's first load, if any.
   */
  agentCode?: string;

  /**
   * The session partition every window of this run uses, the presenter popup included (an in-memory
   * `deck-<random>`, never `persist:`, so a deck's service workers, storage and cookies never
   * outlive the run).
   */
  partition: string;

  /**
   * Uses the shell config's state key when a chooser has not supplied a selected deck.
   */
  stateKey?: string;
};

/**
 * What the window manager needs from the rest of the shell.
 */
export type WindowManagerDeps = {
  /**
   * The shell's configuration.
   */
  config: ShellConfig;

  /**
   * The test options.
   */
  test: ShellTestOptions;

  /**
   * Electron's `screen`.
   */
  screen: ScreenLike;

  /**
   * The absolute path of the preload script.
   */
  preloadPath: string;

  /**
   * Writes an event to the CLI.
   */
  send: (event: ShellEvent) => void;

  /**
   * Keeps the display awake while a window is fullscreen.
   */
  power: PowerGuard;

  /**
   * Quits the app; called when the kiosk quit gate confirms a second Cmd/Ctrl+Q.
   */
  quit: () => void;

  /**
   * The platform, as `process.platform`.
   */
  platform: string;

  /**
   * Where notes about refused links go; standard error in the shell.
   */
  report: (message: string) => void;

  /**
   * Routes an audience close to the chooser. True means the shell should defer closing.
   */
  returnToChooser?: () => boolean;

  /**
   * Repositions the chooser when the audience moves.
   */
  audienceMoved?: () => void;

  /**
   * Mounts the desktop return control in a trusted window, when eligible.
   */
  updateReturnControl?: (win: BrowserWindow, role: ShellWindowRole) => void;
};

/**
 * Everything that creates, finds and moves the shell's windows.
 */
export type WindowManager = {
  /**
   * Sets the deck the windows show; called once, before the first `open`. Rejects a second target.
   *
   * @param target - The deck.
   */
  setTarget: (target: WindowTarget) => void;

  /**
   * Whether a target is set.
   */
  hasTarget: () => boolean;

  /**
   * Opens the windows of a plan and resolves when the audience page has loaded. Rejects, opening
   * nothing, when the audience window is already open or no target is set.
   *
   * @param plan - Where the windows go.
   */
  open: (plan: ShellPlan, requestId?: string) => Promise<void>;

  /**
   * Destroys the current deck's windows and releases the target for the next selection.
   */
  closeDeck: () => void;

  /**
   * The display that currently contains the audience, if any.
   */
  audienceDisplay: () => number | undefined;

  /**
   * Opens the presenter window, or focuses (and moves) it when it is open. Before the audience
   * window shows its first page the request waits, and is carried out once the page has loaded.
   *
   * @param displayId - The display to use; `undefined` picks the display other than the audience's.
   */
  openPresenter: (displayId?: number) => ShellWindowInfo | undefined;

  /**
   * Makes the audience window fullscreen or windowed.
   *
   * @param on - Whether to be fullscreen.
   */
  setAudienceFullscreen: (on: boolean) => void;

  /**
   * Makes one window fullscreen or windowed.
   *
   * @param win - The window.
   * @param on - Whether to be fullscreen.
   */
  setFullscreen: (win: BrowserWindow, on: boolean) => void;

  /**
   * Whether a window is fullscreen.
   *
   * @param win - The window.
   */
  isFullscreen: (win: BrowserWindow) => boolean;

  /**
   * Moves a window to a display.
   *
   * @param win - The window.
   * @param displayId - The display's id.
   */
  moveToDisplay: (win: BrowserWindow, displayId: number) => void;

  /**
   * Moves a window to the next display.
   *
   * @param win - The window.
   */
  moveToNextDisplay: (win: BrowserWindow) => void;

  /**
   * Brings the audience window to the front.
   */
  focus: () => void;

  /**
   * The window the user is in: the focused one, else the audience window.
   */
  current: () => BrowserWindow | undefined;

  /**
   * The audience window.
   */
  audience: () => BrowserWindow | undefined;

  /**
   * The window of a role, if it is open.
   *
   * @param role - Which window.
   */
  window: (role: ShellWindowRole) => BrowserWindow | undefined;

  /**
   * Destroys every window without waiting.
   */
  destroyAll: () => void;
};

/**
 * Creates the window manager.
 *
 * @param deps - What it needs from the shell.
 */
export function createWindowManager(deps: WindowManagerDeps): WindowManager {
  const { config, test, screen, send, power, platform } = deps;
  const windows = new Map<ShellWindowRole, BrowserWindow>();
  let quitGate = createQuitGate();
  const keepsState = !test.hidden && !test.corner && config.stateFile !== undefined;
  let target: (WindowTarget & { origin: string }) | undefined;
  let agentCode = agentCodeOnce(undefined);
  const openExternal = createExternalOpener({
    openExternal: (url) => shell.openExternal(url),
    report: deps.report,
  });
  let plan: ShellPlan | undefined;
  let queuedPresenter: { displayId: number | undefined } | undefined;

  /**
   * The target, which `open` and everything after it needs.
   */
  const need = (): WindowTarget & { origin: string } => {
    if (target === undefined) {
      throw new Error('No deck is set: send open with a target.');
    }

    return target;
  };

  /**
   * The connected displays as plain data.
   */
  const displayList = (): ShellDisplay[] => listDisplays(screen);

  /**
   * Which role a window has, if it is one of the shell's.
   */
  const roleOf = (win: BrowserWindow): ShellWindowRole | undefined =>
    [...windows.entries()].find(([, candidate]) => candidate === win)?.[0];

  /**
   * Whether a window is fullscreen.
   */
  const isFullscreen = (win: BrowserWindow): boolean =>
    !win.isDestroyed() && (platform === 'darwin' ? win.isSimpleFullScreen() : win.isFullScreen());

  /**
   * Whether any window is fullscreen.
   */
  const anyFullscreen = (): boolean =>
    [...windows.values()].some((candidate) => isFullscreen(candidate));

  /**
   * Describes one open window for the CLI.
   */
  const infoOf = (role: ShellWindowRole, win: BrowserWindow): ShellWindowInfo => ({
    window: role,
    displayId: screen.getDisplayMatching(win.getBounds()).id,
    bounds: win.getBounds(),
  });

  /**
   * Tells the power guard, the CLI and the page that a window changed fullscreen state.
   */
  const announceFullscreen = (role: ShellWindowRole, win: BrowserWindow, on: boolean): void => {
    power.update(anyFullscreen());
    send({ type: 'fullscreen', window: role, on });
    if (!win.isDestroyed()) {
      win.webContents.send('deck-shell:fullscreen', on);
      deps.updateReturnControl?.(win, role);
    }
  };

  /**
   * Makes a window fullscreen or windowed; a no-op under the test options.
   */
  const setFullscreen = (win: BrowserWindow, on: boolean): void => {
    const role = roleOf(win);
    if (role === undefined || test.hidden || test.corner || isFullscreen(win) === on) {
      return;
    }

    if (platform === 'darwin') {
      win.setSimpleFullScreen(on);
      announceFullscreen(role, win, on);
    } else {
      win.setFullScreen(on);
    }
  };

  /**
   * Shows a window once it is painted: hidden under the test option, inactive in the corner mode.
   */
  const reveal = (win: BrowserWindow): void => {
    if (test.hidden) {
      return;
    }

    if (test.corner) {
      win.showInactive();
    } else {
      win.show();
    }
  };

  /**
   * The options every shell window is created with.
   */
  const windowOptions = (bounds: ShellRect): BrowserWindowConstructorOptions => ({
    ...bounds,
    show: false,
    title: windowTitle(need().title, 'audience'),
    backgroundColor: need().backgroundColor,
    ...(platform === 'darwin' ? {} : { icon: appIconPath(platform) }),
    autoHideMenuBar: plan?.kiosk === true,
    webPreferences: {
      preload: deps.preloadPath,
      partition: need().partition,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      disableDialogs: true,
      spellcheck: false,
      backgroundThrottling: false,
    },
  });

  /**
   * Remembers where a window is, unless it is fullscreen or a test run.
   */
  const savePosition = (role: ShellWindowRole, win: BrowserWindow): void => {
    if (!keepsState || config.stateFile === undefined || win.isDestroyed() || isFullscreen(win)) {
      return;
    }

    const bounds = win.getBounds();
    writeWindowState(
      config.stateFile,
      withSavedWindow(readWindowState(config.stateFile), need().stateKey ?? config.stateKey, role, {
        bounds,
        displayId: screen.getDisplayMatching(bounds).id,
      }),
    );
  };

  /**
   * The remembered bounds of a window when they are still usable.
   */
  const restorePosition = (
    role: ShellWindowRole,
    display: ShellDisplay,
    displays: readonly ShellDisplay[],
  ): ShellRect | undefined => {
    if (!keepsState || config.stateFile === undefined) {
      return undefined;
    }

    const saved = savedWindow(
      readWindowState(config.stateFile),
      need().stateKey ?? config.stateKey,
      role,
    );
    return restorableBounds(saved, display.id, displays);
  };

  /**
   * The id of the display the audience window is on.
   */
  const currentAudienceDisplay = (): number => {
    const audience = windows.get('audience');
    return audience === undefined
      ? screen.getPrimaryDisplay().id
      : screen.getDisplayMatching(audience.getBounds()).id;
  };

  /**
   * Destroys every window without waiting.
   */
  const destroyAll = (): void => {
    for (const win of windows.values()) {
      if (!win.isDestroyed()) {
        win.destroy();
      }
    }

    windows.clear();
  };

  /**
   * Registers a window under a role and wires its events.
   */
  const track = (role: ShellWindowRole, win: BrowserWindow): void => {
    windows.set(role, win);
    deps.audienceMoved?.();
    win.setTitle(windowTitle(need().title, role));
    win.on('page-title-updated', (event) => event.preventDefault());
    let timer: NodeJS.Timeout | undefined;
    /**
     * Saves the window's position shortly after it stops moving.
     */
    const schedule = (): void => {
      clearTimeout(timer);
      timer = setTimeout(() => savePosition(role, win), SAVE_DEBOUNCE_MS);
      timer.unref();
    };
    win.on('moved', schedule);
    win.on('resized', schedule);
    win.on('close', (event) => {
      if (role === 'audience' && deps.returnToChooser?.() === true) {
        event.preventDefault();
        return;
      }

      clearTimeout(timer);
      savePosition(role, win);
    });
    win.on('closed', () => {
      clearTimeout(timer);
      if (windows.get(role) === win) {
        windows.delete(role);
        deps.audienceMoved?.();
      }

      power.update(anyFullscreen());
      send({ type: 'window-closed', window: role });
      if (role === 'audience') {
        destroyAll();
      }
    });
    if (platform !== 'darwin') {
      win.on('enter-full-screen', () => announceFullscreen(role, win, true));
      win.on('leave-full-screen', () => announceFullscreen(role, win, false));
    }

    if (role === 'audience') {
      win.on('move', () => deps.audienceMoved?.());
    }

    const contents = win.webContents;
    const { origin } = need();
    contents.on('dom-ready', () => deps.updateReturnControl?.(win, role));
    installNavigationGuards(contents, origin, openExternal);
    contents.on('will-prevent-unload', (event) => event.preventDefault());
    contents.setWindowOpenHandler((details) => {
      if (!isDeckOpener(details.referrer.url, origin)) {
        deps.report(
          `deck shell: refused a window.open of ${JSON.stringify(details.url.slice(0, 200))} ` +
            'from a frame of another origin.',
        );
        return { action: 'deny' };
      }

      const decision = decideWindowOpen(
        details.url,
        details.frameName,
        origin,
        windows.has('presenter'),
      );
      switch (decision) {
        case 'presenter-popup': {
          const displays = displayList();
          const display = presenterDisplay(displays, currentAudienceDisplay());
          return {
            action: 'allow',
            overrideBrowserWindowOptions: windowOptions(
              presenterBounds(
                display ?? displays[0] ?? FALLBACK_DISPLAY,
                display?.id === currentAudienceDisplay(),
              ),
            ),
          };
        }

        case 'focus-presenter':
          windows.get('presenter')?.focus();
          return { action: 'deny' };
        case 'external':
          openExternal(details.url);
          return { action: 'deny' };
        case 'internal':
        case 'blocked':
          return { action: 'deny' };
      }
    });
    contents.on('did-create-window', (child) => {
      if (!windows.has('presenter')) {
        track('presenter', child);
        child.once('ready-to-show', () => reveal(child));
        send({ type: 'window-opened', info: infoOf('presenter', child) });
      }
    });
    contents.on('before-input-event', (event, input) => {
      const pressed = input.type === 'keyDown' && !input.isAutoRepeat;
      const withModifier = input.meta || input.control;
      const returnKey = input.shift && input.key.toLowerCase() === 'b';
      if (pressed && withModifier && returnKey) {
        if (deps.returnToChooser?.() === true) {
          event.preventDefault();
        }
      }

      const quitKey =
        input.type === 'keyDown' && !input.isAutoRepeat && input.key.toLowerCase() === 'q';
      if (plan?.kiosk === true && quitKey && (input.meta || input.control)) {
        event.preventDefault();
        if (quitGate.press(Date.now())) {
          deps.quit();
        }
      }
    });
  };

  /**
   * Writes a PNG of the window once its fonts have loaded.
   */
  const capture = async (win: BrowserWindow, file: string): Promise<void> => {
    await win.webContents
      .executeJavaScript('document.fonts.ready.then(() => true)')
      .catch(() => false);
    await new Promise((resolve) => setTimeout(resolve, 600));
    const image = await win.webContents.capturePage();
    writeFileSync(file, image.toPNG());
    send({ type: 'captured', path: file });
  };

  /**
   * Moves a window to a display, keeping its fullscreen state.
   */
  const moveToDisplay = (win: BrowserWindow, displayId: number): void => {
    const display = findDisplay(displayList(), displayId);
    const role = roleOf(win);
    if (display === undefined || role === undefined) {
      return;
    }

    const wasFullscreen = isFullscreen(win);
    if (wasFullscreen) {
      setFullscreen(win, false);
    }

    win.setBounds(role === 'audience' ? audienceBounds(display) : presenterBounds(display, false));
    if (wasFullscreen) {
      setFullscreen(win, true);
    }
  };

  /**
   * Opens the presenter window, or focuses it when it is open.
   */
  const openPresenter = (displayId?: number): ShellWindowInfo | undefined => {
    const displays = displayList();
    const existing = windows.get('presenter');
    if (existing !== undefined && !existing.isDestroyed()) {
      if (displayId !== undefined) {
        moveToDisplay(existing, displayId);
      }

      existing.focus();
      return infoOf('presenter', existing);
    }

    const audience = windows.get('audience');
    if (audience === undefined) {
      return undefined;
    }

    const url = presenterUrlOnDeck(audience.webContents.getURL(), need().origin);
    if (url === undefined) {
      queuedPresenter = { displayId };
      return undefined;
    }

    const audienceDisplay = currentAudienceDisplay();
    const display = findDisplay(displays, displayId) ?? presenterDisplay(displays, audienceDisplay);
    if (display === undefined) {
      return undefined;
    }

    const win = new BrowserWindow(
      windowOptions(
        restorePosition('presenter', display, displays) ??
          presenterBounds(display, display.id === audienceDisplay),
      ),
    );
    track('presenter', win);
    win.once('ready-to-show', () => reveal(win));
    void win.loadURL(url).catch(() => undefined);
    const info = infoOf('presenter', win);
    send({ type: 'window-opened', info });
    return info;
  };
  return {
    setTarget: (next) => {
      if (target !== undefined) {
        throw new Error('The deck is already set.');
      }

      target = { ...next, origin: new URL(next.url).origin };
      agentCode = agentCodeOnce(next.agentCode);
    },
    hasTarget: () => target !== undefined,
    closeDeck: () => {
      for (const [role, win] of windows) {
        savePosition(role, win);
      }

      destroyAll();
      target = undefined;
      plan = undefined;
      queuedPresenter = undefined;
      agentCode = agentCodeOnce(undefined);
      quitGate = createQuitGate();
    },
    audienceDisplay: () => (windows.has('audience') ? currentAudienceDisplay() : undefined),
    open: async (nextPlan, requestId) => {
      if (windows.has('audience')) {
        throw new Error(
          'The audience window is already open: send focus, open-presenter or move-to-display.',
        );
      }

      const { url } = need();

      plan = nextPlan;
      const displays = displayList();
      const primary = displays.find((display) => display.primary) ?? displays[0];
      const display = findDisplay(displays, nextPlan.audience.displayId) ?? primary;
      if (display === undefined) {
        throw new Error('No display is connected.');
      }

      const bounds = test.corner
        ? cornerBounds(primary ?? display)
        : (restorePosition('audience', display, displays) ?? audienceBounds(display));
      const win = new BrowserWindow(windowOptions(bounds));
      track('audience', win);
      win.once('ready-to-show', () => {
        reveal(win);
        if (nextPlan.audience.fullscreen) {
          setFullscreen(win, true);
        }
      });
      try {
        const withCode = agentCode.take();
        await (withCode === undefined ? win.loadURL(url) : win.loadURL(url, withCode));
      } catch (error) {
        throw new Error(
          `Could not load ${url}: ${error instanceof Error ? error.message : String(error)}`,
          { cause: error },
        );
      }

      const queued = queuedPresenter;
      queuedPresenter = undefined;
      if (queued !== undefined) {
        openPresenter(queued.displayId);
      }

      const hasDeck = await waitForDeck(win.webContents);
      if (nextPlan.presenter !== undefined) {
        openPresenter(nextPlan.presenter.displayId);
      }

      send({
        type: 'ready',
        ...(requestId === undefined ? {} : { requestId }),
        windows: [...windows.entries()].map(([role, window]) => infoOf(role, window)),
        url: win.webContents.getURL(),
        title: win.webContents.getTitle(),
        hasDeck,
      });
      if (test.capture !== undefined) {
        await capture(win, test.capture);
      }
    },
    openPresenter,
    setAudienceFullscreen: (on) => {
      const audience = windows.get('audience');
      if (audience !== undefined) {
        setFullscreen(audience, on);
      }
    },
    setFullscreen,
    isFullscreen,
    moveToDisplay,
    moveToNextDisplay: (win) => {
      const next = nextDisplay(displayList(), screen.getDisplayMatching(win.getBounds()).id);
      if (next !== undefined) {
        moveToDisplay(win, next.id);
      }
    },
    focus: () => windows.get('audience')?.focus(),
    current: () => BrowserWindow.getFocusedWindow() ?? windows.get('audience'),
    audience: () => windows.get('audience'),
    window: (role) => windows.get(role),
    destroyAll,
  };
}
