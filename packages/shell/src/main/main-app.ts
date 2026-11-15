import { app, BrowserWindow, ipcMain, Menu, powerSaveBlocker, screen, session } from 'electron';
import { fileURLToPath } from 'node:url';

import type { ShellCommand, ShellEvent, ShellTarget } from '#protocol/shell-messages.ts';

import { APP_NAME, isStockElectron } from '#bundle/app-identity.ts';
import { adoptTarget } from '#main/adopt-target.ts';
import { installAgentCodeGuard } from '#main/agent-code.ts';
import { appIconPath } from '#main/app-icon.ts';
import { readConfig, readTestOptions } from '#main/config.ts';
import { clearSession, installFrameSandbox } from '#main/deck-session.ts';
import { listDisplays, watchDisplays } from '#main/displays.ts';
import { installDownloadPolicy } from '#main/downloads.ts';
import { buildMenuTemplate } from '#main/menu.ts';
import { installPermissions } from '#main/permissions.ts';
import { appNameFor, applyPlatformIdentity } from '#main/platform-identity.ts';
import { createPowerGuard } from '#main/power.ts';
import { applyProfile, chooseProfile, removeTemporaryProfile } from '#main/profile.ts';
import { createCommandHandler } from '#main/shell-commands.ts';
import { startUp } from '#main/start-up.ts';
import { createCommandReader, createEventWriter } from '#main/stdio.ts';
import { appTitle } from '#main/window-title.ts';
import { createWindowManager } from '#main/windows.ts';

/**
 * How often the shell checks that its parent still runs, as a second line of defence behind the
 * closing of standard input.
 */
const PARENT_POLL_MS = 1000;

/**
 * How long the shell waits after reporting a fatal error before it exits, so the report is written.
 */
const FLUSH_MS = 150;

/**
 * The shell's configuration from `DECK_SHELL_CONFIG`.
 */
const config = readConfig(process.env);

/**
 * The test options from the environment.
 */
const testOptions = readTestOptions(process.env);

/**
 * Where the shell's Chromium profile, caches, logs and crash dumps go: the CLI's folder in the
 * workspace, or a temporary folder under the test options.
 */
const profile = chooseProfile(config, testOptions);
applyProfile(app, profile.dir);
process.on('exit', () => removeTemporaryProfile(profile));

/**
 * The deck server's origin; only it stays inside the app. Set once, as the last step of adopting
 * the deck: from the configuration's `url` when the shell is ready, or by the first `open` that
 * carries a target.
 */
let appOrigin: string | undefined;

/**
 * Clears the default session in the background, started right after the displays are sent.
 */
let defaultCleared: Promise<void> = Promise.resolve();

/**
 * Keeps the display awake while a window is fullscreen.
 */
const power = createPowerGuard(powerSaveBlocker);

let leaving = false;

/**
 * Exits at once: closes every window, releases the power blocker and ends the process. Nothing
 * waits on a window or a dialog, so the shell never outlives its parent.
 *
 * @param code - The exit code.
 */
function leave(code: number): void {
  if (leaving) {
    return;
  }

  leaving = true;
  manager?.destroyAll();
  power.release();
  app.exit(code);
}

/**
 * Writes a note to standard error, which the CLI keeps for its error messages.
 *
 * @param message - The note.
 */
function report(message: string): void {
  process.stderr.write(`${message}\n`, () => undefined);
}

/**
 * Writes an event to the CLI.
 *
 * @param event - The event.
 */
function send(event: ShellEvent): void {
  writer.send(event);
}

/**
 * Reports a fatal problem and exits with code 1 once the report is written.
 *
 * @param message - What failed.
 */
function fail(message: string): void {
  send({ type: 'error', message });
  setTimeout(() => leave(1), FLUSH_MS);
}

// The dock stays visible while the shell waits for a deck: hiding it and showing it again recreates
// the dock tile, which drops the icon set afterwards and leaves Electron's own.
if (
  (testOptions.hidden || testOptions.corner || config.listOnly) &&
  process.platform === 'darwin'
) {
  app.dock?.hide();
}

applyPlatformIdentity(app, process.platform);
app.setName(
  appNameFor(process.platform, config.url === undefined ? APP_NAME : appTitle(config.title)),
);

/**
 * Creates and moves the shell's windows.
 */
const manager = createWindowManager({
  config,
  test: testOptions,
  screen,
  preloadPath: fileURLToPath(new URL('../preload/preload.cjs', import.meta.url)),
  send,
  power,
  quit: () => leave(0),
  platform: process.platform,
  report,
});

/**
 * Writes events to the CLI; a broken pipe makes the shell leave.
 */
const writer = createEventWriter(process.stdout, () => leave(0));

app.on('window-all-closed', () => leave(0));

/**
 * Applies one command from the CLI.
 */
const handle = createCommandHandler({
  windows: manager,
  hasTarget: () => manager.hasTarget(),
  adoptTarget: adopt,
  leaving: () => leaving,
  installMenu: (kiosk) => installMenu(kiosk),
  send,
  displays: () => listDisplays(screen),
  leave,
  fail,
});

/**
 * Puts the shell's icon in the dock on macOS, in place of Electron's, when the shell runs from
 * stock Electron (the fallback when the CLI could not build the branded Deckster.app, whose bundle
 * already carries the icon from the first frame); nothing in the test modes and `listOnly`, whose
 * dock icon is hidden. Called when the app is ready and again when a deck is adopted (setting the
 * same icon twice is harmless).
 */
async function activateDock(): Promise<void> {
  if (
    process.platform !== 'darwin' ||
    testOptions.hidden ||
    testOptions.corner ||
    config.listOnly ||
    !isStockElectron(process.execPath)
  ) {
    return;
  }

  app.dock?.setIcon(appIconPath(process.platform));
}

/**
 * Fixes the deck the shell shows, in the order {@link adoptTarget} documents.
 *
 * @param target - The deck, from the configuration or an `open` command.
 */
function adopt(target: ShellTarget): Promise<void> {
  return adoptTarget(target, {
    sessionFor: (partition) => session.fromPartition(partition),
    installHooks: (deckSession, origin) => {
      installPermissions(deckSession, origin);
      installDownloadPolicy(deckSession, report);
      installAgentCodeGuard(deckSession, origin);
      installFrameSandbox(deckSession, origin);
    },
    setName: (name) => app.setName(appNameFor(process.platform, name)),
    defaultCleared: () => defaultCleared,
    activateDock,
    setTarget: (windowTarget) => {
      manager.setTarget(windowTarget);
      appOrigin = new URL(windowTarget.url).origin;
    },
  });
}

/**
 * Installs the application menu; kiosk mode has none.
 *
 * @param kiosk - Whether kiosk mode is on.
 */
function installMenu(kiosk: boolean): void {
  const template = buildMenuTemplate(
    {
      toggleFullscreen: () => {
        const win = manager.audience();
        if (win !== undefined) {
          manager.setFullscreen(win, !manager.isFullscreen(win));
        }
      },
      openPresenter: () => manager.openPresenter(),
      moveToNextDisplay: () => {
        const win = manager.current();
        if (win !== undefined) {
          manager.moveToNextDisplay(win);
        }
      },
      reload: () => manager.current()?.webContents.reload(),
      toggleDevTools: () => manager.current()?.webContents.toggleDevTools(),
      quit: () => leave(0),
    },
    process.platform,
    APP_NAME,
    kiosk,
  );
  Menu.setApplicationMenu(template === undefined ? null : Menu.buildFromTemplate(template));
}

/**
 * Whether an IPC request comes from a page of the deck server; any other sender is refused.
 *
 * @param event - The IPC event.
 */
function isTrusted(event: { senderFrame?: { url: string } | null }): boolean {
  const url = event.senderFrame?.url;
  return (
    url !== undefined &&
    appOrigin !== undefined &&
    URL.canParse(url) &&
    new URL(url).origin === appOrigin
  );
}

/**
 * Registers one IPC handler that refuses untrusted senders.
 *
 * @param channel - The channel name.
 * @param run - Handles the request.
 */
function handleIpc(
  channel: string,
  run: (event: Electron.IpcMainInvokeEvent, ...args: unknown[]) => unknown,
): void {
  ipcMain.handle(channel, (event, ...args) => {
    if (!isTrusted(event)) {
      throw new Error('The request did not come from the deck.');
    }

    return run(event, ...args);
  });
}

/**
 * The window that sent an IPC request.
 *
 * @param event - The IPC event.
 */
function senderWindow(event: Electron.IpcMainInvokeEvent): BrowserWindow | undefined {
  return BrowserWindow.fromWebContents(event.sender) ?? undefined;
}

handleIpc('deck-shell:displays', () => listDisplays(screen));
handleIpc('deck-shell:open-presenter', (_event, displayId) => {
  manager.openPresenter(typeof displayId === 'number' ? displayId : undefined);
});
handleIpc('deck-shell:set-fullscreen', (event, on) => {
  const win = senderWindow(event);
  if (win !== undefined) {
    manager.setFullscreen(win, on === true);
  }
});
handleIpc('deck-shell:is-fullscreen', (event) => {
  const win = senderWindow(event);
  return win !== undefined && manager.isFullscreen(win);
});
handleIpc('deck-shell:move-to-display', (event, displayId) => {
  const win = senderWindow(event);
  if (win !== undefined && typeof displayId === 'number') {
    manager.moveToDisplay(win, displayId);
  }
});

/**
 * Commands that arrived before the shell was ready to apply them.
 */
const waiting: ShellCommand[] = [];

/**
 * Whether the shell has finished starting (the app is ready and the configured deck, if any, is
 * adopted); commands that arrive earlier wait.
 */
let started = false;

/**
 * Applies a command, or keeps it until the shell has started.
 *
 * @param command - The command.
 */
function dispatch(command: ShellCommand): void {
  if (started) {
    handle(command);
  } else {
    waiting.push(command);
  }
}

/**
 * Reads commands from the CLI's standard input.
 */
const reader = createCommandReader(dispatch, (reason) =>
  send({ type: 'error', message: `bad line: ${reason}` }),
);

process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk: string) => reader.push(chunk));
if (config.watchParent) {
  process.stdin.on('end', () => leave(0));
  process.stdin.on('close', () => leave(0));
  process.stdin.on('error', () => leave(0));
  const parent = process.ppid;
  setInterval(() => {
    try {
      process.kill(parent, 0);
    } catch {
      leave(0);
    }
  }, PARENT_POLL_MS);
}

void app.whenReady().then(async () => {
  await activateDock();
  defaultCleared = startUp({
    listOnly: config.listOnly,
    sendDisplays: () => send({ type: 'displays', displays: listDisplays(screen) }),
    clearDefault: () => clearSession(session.defaultSession),
  });
  if (config.listOnly) {
    setTimeout(() => leave(0), FLUSH_MS);
  }

  try {
    if (config.url !== undefined && !config.listOnly) {
      await adopt({
        url: config.url,
        title: config.title,
        backgroundColor: config.backgroundColor,
        ...(config.agentCode === undefined ? {} : { agentCode: config.agentCode }),
      });
    }
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
    return;
  }

  watchDisplays(screen, () => send({ type: 'displays', displays: listDisplays(screen) }));
  started = true;
  if (config.plan !== undefined) {
    handle({ type: 'open', plan: config.plan });
  }

  for (const command of waiting.splice(0)) {
    handle(command);
  }
});
