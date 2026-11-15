import { AGENT_HELP } from '#agent/agent-flags.ts';
import { DEFAULT_DECK } from '#workspace.ts';

/**
 * The text `deck dev --help` prints.
 */
export const HELP = `Usage: deck dev [deck] [--port <n>] [--host] [--brand <name>] [--mcp]
                [--agent claude|codex] [--agent-panel right|bottom] [--agent-model <m>]
                [--agent-web]

Serves a deck with hot reload and prints the URL. It runs until you press q or Ctrl+C.

Arguments:
  deck            Deck folder name under decks/. Default: $DECK, else "${DEFAULT_DECK}", else the only deck.

Options:
  --port <n>      Use this port and fail if it is taken. Default: the first free port from 5173.
  --host          Listen on all network interfaces, for example to present from a phone.
  --brand <name>  Render with brands/<name> instead of the deck config's brand.
  --mcp           Also serve the deck's MCP tools at /__deck/mcp on 127.0.0.1, for agents (Claude
                  Code, Codex). Requests need a per-run bearer token, which is written with the port
                  to .deck/agent/<deck>/server.json (mode 0600) until the server stops. Run
                  \`deck mcp <deck>\` for ready-to-paste client configuration.
${AGENT_HELP}
  -h, --help      Show this help.`;
