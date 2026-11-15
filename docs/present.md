# Present from the CLI

`deck present <deck>` opens a deck in its own desktop window and serves it with hot reload, so an
edit shows at once. The window is Electron (the same Chromium family `deck lint`, `deck shot` and
export render in). Closing the window ends the command and stops the server; so does Ctrl+C.

## Set-up

```sh
pnpm install
pnpm --filter @deckster/shell exec install-electron   # downloads the binary, once
pnpm deck present hello
```

Electron's binary is not part of `pnpm install`: since Electron 42 it downloads on first use or with
`install-electron`. It is about 121 MB to download and 380 MB on disk (258 MB extracted, 128 MB in
Electron's cache). The CLI never imports `electron`; it reads `node_modules/electron/path.txt` and
starts the binary itself, so a missing binary is an error with the fix, never a download in the
middle of a command.

On macOS the first `deck present` (or `deck present --list-displays`, which opens no window and so
prepares it ahead of time) also builds `Deckster.app` in `.deck/shell/app/<key>/`: a clone of
Electron's app with its name, icon and helpers changed, so the Dock, Cmd+Tab, the menu bar and
Activity Monitor say Deckster instead of Electron. It takes about 0.3 to 0.5 s once (the first launch of a new bundle takes about 3 to 5 s once, overlapping the deck loading, while macOS looks at it), uses about 1 MB of disk on
APFS (a plain copy elsewhere is about 260 MB), downloads nothing and is reused until Electron or
the recipe changes. It is signed ad hoc, for this Mac only.

The CLI starts Electron first and loads, builds and serves the deck while it boots, then tells the
window which deck to load. On a warm disk `deck present hello` has its window loaded in about 1.6 to
1.8 s (median; it was 2.9 s before), and `deck --help` answers in about 0.2 s (it was 1.5 s).
`pnpm deck` adds about 0.3 s of its own; `./node_modules/.bin/deck present hello`, or an alias to
that file, skips it.

## Flags

```
deck present [deck] [--brand <name>] [--port <n>] [--built] [--fullscreen]
             [--display <n>] [--presenter [display]] [--kiosk] [--browser] [--verbose]
             [--agent claude|codex] [--agent-panel right|bottom] [--agent-model <m>]
             [--agent-web]
deck present --list-displays [--json]
```

- `--brand`, `--port`: as `deck dev`.
- `--built`: builds the deck and presents the static build; no hot reload, comments or agent.
- `--fullscreen`: audience window fullscreen. On macOS this is simple fullscreen, so the other
  display is not blanked and no Space is created.
- `--display <n>`, `--presenter [n]`: indexes from `--list-displays`. See Displays.
- `--kiosk`: fullscreen, no menu, Cmd/Ctrl+Q must be pressed twice.
- `--browser`: Chrome in app mode (else the default browser) instead of Electron, and the URL is
  printed. It is the fallback when the binary is not downloaded, and it is never chosen
  automatically.
- `--agent*`: accepted and handed to the dev server's options; the agent feature owns them.

## Displays

`deck present --list-displays` prints one line per display (`0: DELL U4025QW 3840x1620 @2x
(primary)`); `--json` prints `{ ok, displays: [{ index, id, label, bounds, workArea, scaleFactor,
primary }] }`.

- No flags: the audience window opens windowed on the primary display.
- `--presenter` with two or more displays: notes on the primary display, the audience on the first
  other one. `--display` and `--presenter <n>` override either choice.
- `--presenter` with one display: both windows share it, the presenter window is offset, and
  fullscreen is dropped (it would cover the presenter window). The command says so.
- A display index that does not exist fails and lists the displays.
- Inside the window the presenter button and `p` ask the shell for the presenter window (on the
  other display when there is one), `f` goes through the shell, and a Displays button in the tool
  cluster lists the displays and moves windows.

Window bounds and the display are remembered in `.deck/shell/windows.json` per deck and restored
when the same display is planned again. The window's background is the brand's default surface, so
nothing flashes white while the page loads.

Only the deck server's origin loads in a window; a link, `window.open` or redirect elsewhere opens
in your browser (web and mail links only, at most 3 per window in 10 s), and frames may show web
pages but never open anything. Downloads are refused, so no save dialog can appear; use
`--browser` for a deck that offers a file. The shell's Chromium profile, caches and logs are in
`.deck/shell/profile`, never in your Application Support folder (test runs use a temporary one).

## Troubleshooting

- "Electron's binary is not downloaded": run `pnpm --filter @deckster/shell exec install-electron`, or
  pass `--browser`.
- "The Electron shell did not report ... within the start-up timeout": the shell did not report its
  displays after it was spawned, or the audience page did not load after the deck was served. Open
  the printed URL in a browser to see the build error. Loading and building the deck (including
  `--built`) is not under this timeout.
- `Could not prepare Deckster.app (...); the window will show as "Electron".`: the branded app
  could not be built (a read-only workspace, a full disk, `plutil` missing, or an Electron layout
  newer than the recipe), so the window runs from Electron's own app and shows its name in the Dock
  and menu bar. Fix the reason, or delete `.deck/shell/app` to rebuild. Camera or microphone
  permission may be asked again after an Electron update, and may name your terminal.
- A window that stays blank: `View > Toggle Developer Tools` (Alt+Cmd+I).
- macOS in a sandbox that refuses the app bundle behind a pnpm symlink: the CLI already passes the
  real path.
- Tests keep windows hidden: `DECK_SHELL_TEST_HIDDEN=1` forces `show: false` and skips fullscreen;
  `DECK_SHELL_TEST_CORNER=1` shows a small inactive window in a corner; `DECK_SHELL_TEST_CAPTURE=
  <file>` writes a PNG of the audience window. Use them for every automated run.

## Verified and not

Verified on macOS with one display: hidden windows, the stdio protocol, parent death, the page
integration, a short inactive corner window and its screenshot. Not verified: fullscreen and simple
fullscreen on a live screen, a second or third display, display hot-plug, kiosk, Windows and Linux.
Check these by hand on two displays before relying on them.
