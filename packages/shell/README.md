# @deckster/shell

The Electron app behind `deckster present`. It opens the audience and presenter windows for a deck the
CLI is already serving, and does nothing else: no deck loading, no agent, no server. The CLI starts
it as a child process and drives it over stdin and stdout.

It is the only package in the workspace that imports `electron`. It is private and not published.

## Setup

`pnpm install` does not download Electron's binary. Download it once:

```sh
pnpm deckster electron install
pnpm deckster present --help
```

The CLI never imports `electron`. It reads the binary's location from
`node_modules/electron/path.txt` and runs it with [`src/main/main.ts`](src/main/main.ts) as the
entry. When the binary is missing, `deckster present` fails with that install command and the
`--browser` fallback. It never downloads anything mid-command.

On macOS the CLI does not run Electron's own app. On the first `deckster present` (or `deckster present
--list-displays`) it builds a branded copy, `.deck/shell/app/<key>/Deckster.app`, from the recipe in
[`src/bundle/`](src/bundle/branded-app-plan.ts), so the Dock, Cmd+Tab and the menu bar say Deckster
from the first frame. If that fails, it prints one warning and runs stock Electron.

How to present, the flags, displays and troubleshooting are in [docs/present.md](../../docs/present.md).

## Exports

| Export                     | File                                                               | Used by                                                                                                                                                                            |
| -------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@deckster/shell/bundle`   | [`src/bundle/index.ts`](src/bundle/index.ts)                       | The CLI (`present/branded-app.ts`) and the plugin e2e tests: the app's identity, `brandedAppKey`, `brandedAppPlan` and `findBrandedApp`                                            |
| `@deckster/shell/protocol` | [`src/protocol/shell-messages.ts`](src/protocol/shell-messages.ts) | The CLI (`packages/cli/src/present/`) and `@deckster/presenter`, for `ShellDisplay`, `ShellPlan`, `ShellEvent`, `ShellCommand`, `encodeMessage`, `decodeEvent` and `decodeCommand` |
| `@deckster/shell/api`      | [`src/api/deck-shell-api.ts`](src/api/deck-shell-api.ts)           | `@deckster/presenter`, as a type only: `DeckShellApi`, the shape of `window.deckShell`                                                                                             |
| `@deckster/shell/main`     | [`src/main/main.ts`](src/main/main.ts)                             | The Electron entry. The CLI and the Playwright e2e test resolve its path; nothing imports it                                                                                       |
| `@deckster/shell/preload`  | [`src/preload/preload.cjs`](src/preload/preload.cjs)               | The preload script every window loads                                                                                                                                              |

`@deckster/presenter` imports `@deckster/shell/api` only as a type, so the browser code never depends on
`electron`.

## How the CLI talks to it

The CLI passes a JSON configuration in the `DECK_SHELL_CONFIG` environment variable (see
`ShellConfig` in [`src/main/config.ts`](src/main/config.ts)): the window-state file and key, the
profile folder, and optionally the deck URL (an `http:` or `https:` URL on a loopback host), the
window title, the brand's background colour, a start-up plan and a one-time agent code (only with a
`url`). `deckster present` sends no `url`: the shell starts, reports its displays and waits, and the
deck comes later in the `open` command's `target`. A missing or malformed configuration makes the
shell exit 1 with the reason on stderr.

After that, both sides write one JSON object per line:

| Direction             | Messages                                                                                                                        |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Shell to CLI (stdout) | `displays`, `ready` (windows, url, title, `hasDeck`), `window-opened`, `window-closed`, `fullscreen`, `captured`, `error`       |
| CLI to shell (stdin)  | `open` (a plan, optionally a `target`), `list-displays`, `open-presenter`, `set-fullscreen`, `move-to-display`, `focus`, `quit` |

The shell reports `displays` first, right after the app is ready and before it clears the default
session. The CLI computes where the windows go from those displays and the flags (`planWindows` in
`packages/cli/src/present/window-plan.ts`) and sends the result back as `open`. The shell carries
out the plan and never decides placement itself. Without a config `url`, `open` carries
`target: { url, title, backgroundColor, agentCode? }` (a loopback URL, a title of at most 200
characters, a colour of at most 64); a second target is refused, and an `open` without a target is
an error. Commands that arrive before the app is ready are queued. The target is applied by
[`adopt-target.ts`](src/main/adopt-target.ts) in a fixed order, with the origin set last. Lines that are not
valid messages, such as Electron's own log output, are reported by `decodeEvent` and
`decodeCommand`, never thrown.

Inside a window, deck pages reach the shell through `window.deckShell` (`displays`,
`openPresenter`, `setFullscreen`, `isFullscreen`, `onFullscreenChange`, `moveToDisplay`). Every IPC
handler refuses a sender whose frame is not on the deck server's origin.

## Rules for changing it

Each of these has a test in `src/main/`.

- No native dialogs, ever. [`main.ts`](src/main/main.ts) installs hardening before anything
  else: `dialog.showErrorBox` becomes a no-op, and an uncaught exception or unhandled rejection
  exits 1 on stderr. A dialog would stay on screen after the CLI is gone. `main.ts` stays tiny and
  imports `src/main/main-app.ts` afterwards; a failed import also exits 1 on stderr.
- The shell never outlives the CLI. It exits when stdin ends or closes, when a stdout write
  fails, and when a once-a-second poll finds its parent gone.
- Only the deck's origin loads in a window. Navigation and redirects elsewhere are blocked or
  handed to the system browser: http, https and mailto only, at most 3 opens per window in 10
  seconds. `window.open('', 'deck-presenter')` becomes the presenter window. Downloads are refused.
  Permissions are limited to fullscreen, media and clipboard writes, for the deck's origin only.
  Windows run with `contextIsolation`, `sandbox` and no `nodeIntegration`.
- Nothing goes to the user's Library. The Chromium profile, caches, logs and crash dumps go to
  `<workspace>/.deck/shell/profile` (`profileDir`, set by the CLI), or to a temporary folder under
  the test options. Each run also uses a fresh in-memory session partition. Window bounds persist
  in `.deck/shell/windows.json`.
- The bundle recipe is versioned. Bump `RECIPE_VERSION` in
  [`branded-app-plan.ts`](src/bundle/branded-app-plan.ts) when its steps change, and keep the
  helper names (`<CFBundleName> Helper<suffix>`) in step with what Electron looks for. The shell
  sets the Dock icon itself only when it runs from stock Electron. Started without an entry file,
  the branded app exits with code 64.
- The preload is hand-written CommonJS. A sandboxed preload takes neither TypeScript nor ESM.
  Keep [`preload.cjs`](src/preload/preload.cjs) in step with `DeckShellApi`, the one place
  `window.deckShell` is typed.
- Tests never show a window. `DECK_SHELL_TEST_HIDDEN=1` forces `show: false` and skips
  fullscreen. `DECK_SHELL_TEST_CORNER=1` (a small inactive window in a corner) and
  `DECK_SHELL_TEST_CAPTURE=<png>` exist for a supervised look. Do not start Electron any other
  way while developing, run one at a time, and check `ps` afterwards for leftover processes.

## Tests

```sh
pnpm --filter @deckster/shell test
```

These unit tests run without Electron: the modules in `src/main/` take small fakes of the Electron
objects they use.

The tests that start the real binary live elsewhere and skip when it is not downloaded:

- `packages/cli/src/present/deck-shell.electron.test.ts` spawns the shell through the CLI's
  `DeckShell` service: quit, list displays, and parent death (`parent-death.fixture.ts`).
- The same file checks the branded app: its signature, the cache, and that no process is named
  Electron.
- `packages/vite-plugin/e2e/shell.e2e.ts` drives it with Playwright's Electron launcher, using
  `watchParent: false` and a `plan` in `DECK_SHELL_CONFIG`.

Electron cannot start inside an agent sandbox, so those runs need the sandbox lifted.

## Platform status

Verified on macOS with one display. Fullscreen on a live screen, several displays, kiosk mode,
Windows and Linux have not been checked. [docs/present.md](../../docs/present.md#verified-and-not)
has the full list.
