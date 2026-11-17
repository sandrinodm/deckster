# Present from the CLI

`deck present <deck>` opens a deck in its own desktop window (Electron) and serves it with hot
reload. How to use it is in the documentation:
[deck present and displays](https://sandrinodm.github.io/deckster/present/deck-present-and-displays/)
covers the Electron download, the flags and putting the slides and the notes on different displays;
[Presenter tools and shortcuts](https://sandrinodm.github.io/deckster/present/presenter-tools-and-shortcuts/)
covers the tools inside the window; and
[Troubleshooting](https://sandrinodm.github.io/deckster/present/troubleshooting/) covers the
messages `deck present` prints. This page keeps the details for working on `deck present` in this
repository.

## Set-up in a clone

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

## How it starts

On macOS the first `deck present` (or `deck present --list-displays`, which opens no window and so
prepares it ahead of time) also builds `Deckster.app` in `.deck/shell/app/<key>/`: a clone of
Electron's app with its name, icon and helpers changed, so the Dock, Cmd+Tab, the menu bar and
Activity Monitor say Deckster instead of Electron. It takes about 0.3 to 0.5 s once (the first
launch of a new bundle takes about 3 to 5 s once, overlapping the deck loading, while macOS looks at
it), uses about 1 MB of disk on APFS (a plain copy elsewhere is about 260 MB), downloads nothing and
is reused until Electron or the recipe changes. It is signed ad hoc, for this Mac only.

The CLI starts Electron first and loads, builds and serves the deck while it boots, then tells the
window which deck to load. On a warm disk `deck present hello` has its window loaded in about 1.6 to
1.8 s (median; it was 2.9 s before), and `deck --help` answers in about 0.2 s (it was 1.5 s).
`pnpm deck` adds about 0.3 s of its own; `./node_modules/.bin/deck present hello`, or an alias to
that file, skips it.

## Window details

- `--fullscreen` on macOS is simple fullscreen, so the other display is not blanked and no Space is
  created.
- `--browser` is never chosen automatically, not even when the binary is missing.
- The window's background is the brand's default surface, so nothing flashes white while the page
  loads.
- The `--agent*` flags are accepted and handed to the dev server's options; the agent feature owns
  them.
- Only the deck server's origin loads in a window. Frames may show web pages but never open
  anything.
- The shell's Chromium profile, caches and logs are in `.deck/shell/profile`, never in your
  Application Support folder (test runs use a temporary one).
- macOS in a sandbox that refuses the app bundle behind a pnpm symlink: the CLI already passes the
  real path.

## Testing

Tests keep windows hidden: `DECK_SHELL_TEST_HIDDEN=1` forces `show: false` and skips fullscreen;
`DECK_SHELL_TEST_CORNER=1` shows a small inactive window in a corner;
`DECK_SHELL_TEST_CAPTURE=<file>` writes a PNG of the audience window. Use them for every automated
run.

## Verified and not

Verified on macOS with one display: hidden windows, the stdio protocol, parent death, the page
integration, a short inactive corner window and its screenshot. Not verified: fullscreen and simple
fullscreen on a live screen, a second or third display, display hot-plug, kiosk, Windows and Linux.
Check these by hand on two displays before relying on them.
