# Present from the CLI

`deckster present <deck>` opens a deck in its own desktop window (Electron) and serves it with hot
reload. How to use it is in the documentation:
[deckster present and displays](https://sandrinodm.github.io/deckster/present/deck-present-and-displays/)
covers the Electron download, the flags and putting the slides and the notes on different displays;
[Presenter tools and shortcuts](https://sandrinodm.github.io/deckster/present/presenter-tools-and-shortcuts/)
covers the tools inside the window; and
[Troubleshooting](https://sandrinodm.github.io/deckster/present/troubleshooting/) covers the
messages `deckster present` prints. This page keeps the details for working on `deckster present` in this
repository.

Run `deckster present` without a name to open the gallery when the workspace contains several decks.
A name on the command line takes precedence over `DECK`, and a workspace with just one deck
opens it directly. In gallery mode, use **Back to decks** to stop the current presentation and
choose another. The gallery uses an operator display when one is available. With a single display in fullscreen or kiosk
mode, **Cmd/Ctrl+Shift+B** returns to the gallery. Closing the gallery or quitting
Deckster stops the command.

## Set-up in a clone

```sh
pnpm install
pnpm deckster electron install   # downloads the binary, once
pnpm deckster present hello
```

Electron's binary is not part of `pnpm install` (or of `npm install --global @deckster/cli`, whose
package manager usually skips the download): `deckster electron install` fetches it, `deckster electron
status` shows what is there, and `deckster electron update` fetches the version a newer CLI needs. It is about 121 MB to download and 380 MB on disk (258 MB extracted, 128 MB in
Electron's cache). The CLI never imports `electron`; it reads `node_modules/electron/path.txt` and
starts the binary itself, so a missing binary is an error with the fix, never a download in the
middle of a command.

## How it starts

On macOS the first `deckster present` (or `deckster present --list-displays`, which opens no window and so
prepares it ahead of time) also builds `Deckster.app` in `.deck/shell/app/<key>/`: a clone of
Electron's app with its name, icon and helpers changed, so the Dock, Cmd+Tab, the menu bar and
Activity Monitor say Deckster instead of Electron. It takes about 0.3 to 0.5 s once (the first
launch of a new bundle takes about 3 to 5 s once, overlapping the deck loading, while macOS looks at
it), uses about 1 MB of disk on APFS (a plain copy elsewhere is about 260 MB), downloads nothing and
is reused until Electron or the recipe changes. It is signed ad hoc, for this Mac only.

The CLI starts Electron first and loads, builds and serves the deck while it boots, then tells the
window which deck to load. On a warm disk `deckster present hello` has its window loaded in about 1.6 to
1.8 s (median; it was 2.9 s before), and `deckster --help` answers in about 0.2 s (it was 1.5 s).
`pnpm deckster` adds about 0.3 s of its own; `./node_modules/.bin/deckster present hello`, or an alias to
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

## Hidden slides

A slide with `hidden: true` is skipped when you present, so it can wait as a backup for a question.
Next, previous, Home and End pass over it in the audience window and in the presenter window. To
show one, open the slide sidebar (`s`) or the overview (`o`) and select it, press `g` and type its
number, or open a link to it. Numbers here are positions in the full slide list, hidden slides
included, the same as in the sidebar. From the hidden slide, next and previous step through its own
steps and then go to the nearest shown slide after or before it, not back to the slide you jumped
from. A backup slide placed after the last shown slide has no shown slide after it, so next does
nothing there; previous goes to the last shown slide, and Home, End, the sidebar, the overview and
`g` also leave it.

In the sidebar and the overview a hidden slide is dimmed and has a "Hidden" badge. The presenter
window's header says "Slide 12 of 40 · hidden" on one, and its next-slide preview is the next shown
slide, which is the slide the audience gets after it. Pacing leaves hidden slides out: their budgets
are not in the planned total, and the deck's `duration` is shared between the shown slides.

The audience's page number and progress bar count shown slides only, and a hidden slide shows no
page number. A deck needs at least one shown slide.

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
