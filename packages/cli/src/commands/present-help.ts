import { FRAMEWORK_INSTALLED } from '@deckster/brand/node';

import { AGENT_HELP } from '#agent/agent-flags.ts';
import { DEFAULT_DECK } from '#workspace.ts';

/**
 * How the Electron binary is downloaded: one command in the repository; in a published install the
 * error that appears when the binary is missing prints the exact command.
 */
const ELECTRON_DOWNLOAD = FRAMEWORK_INSTALLED
  ? "Electron's binary is downloaded once; `deck present` prints the command when it is missing"
  : "Electron's binary is downloaded once with `pnpm --filter @deckster/shell exec install-electron`";

/**
 * The text `deck present --help` prints.
 */
export const HELP = `Usage: deck present [deck] [--brand <name>] [--port <n>] [--built] [--fullscreen]
                    [--display <n>] [--presenter [display]] [--kiosk] [--browser] [--verbose]
                    [--agent claude|codex] [--agent-panel right|bottom] [--agent-model <m>]
                    [--agent-web]
       deck present --list-displays [--json]

Opens a deck in its own desktop window (Electron) and serves it with hot reload, so edits show at
once. Closing the window stops the server; so does Ctrl+C. The terminal shows a short status (the
URL, the window, the agent and its turns); --verbose adds the dev server's log.

Arguments:
  deck            Deck folder name under decks/. Default: $DECK, else "${DEFAULT_DECK}", else the only deck.

Options:
  --brand <name>  Render with brands/<name> instead of the deck config's brand.
  --port <n>      Use this port and fail if it is taken. Default: the first free port from 5173.
  --built         Build the deck and present the static build instead of the dev server: no hot
                  reload, comments, agent or other dev tools. Cannot be combined with --brand or
                  --agent.
  --fullscreen    Make the audience window fullscreen.
  --display <n>   Open the audience window on display n (see --list-displays). Default: the
                  primary display, or the display that is not the presenter's.
  --presenter [n] Also open the presenter window, with notes and timer, on display n. Default: the
                  other display; with one display both windows share it. The audience window then
                  stays windowed.
  --kiosk         Fullscreen with no menu; Cmd/Ctrl+Q must be pressed twice to quit.
  --browser       Open the deck in Chrome's app mode (else the default browser) instead of
                  Electron, and print the URL. The fallback when Electron's binary is not
                  downloaded.
  --list-displays Print the connected displays and exit.
  --json          With --list-displays, print { ok, displays } as JSON.
  --verbose       Also print the dev server's log (hot updates, requests).
${AGENT_HELP}
                  In the window, only the window's own first page load gets the session that
                  the agent panel and comments need.
  -h, --help      Show this help.

${ELECTRON_DOWNLOAD} (about 120 MB). See docs/present.md.`;
