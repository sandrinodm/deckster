import { lazyRun, type Command } from '#command.ts';
import { DEFAULT_DECK } from '#workspace.ts';

/**
 * The text `deckster mcp --help` prints.
 */
const HELP = `Usage: deckster mcp [deck] [--json]

Prints ready-to-paste configuration that connects Claude Code and Codex to the MCP tools of a
running \`deckster dev <deck> --mcp\`: the environment variable that holds the token, a \`.mcp.json\`
snippet and the \`claude mcp add\` command, and a \`config.toml\` section and the \`codex mcp add\`
command. The port and token are read from .deck/agent/<deck>/server.json, which the dev server
writes while it runs. Without a running server it says how to start one.

Arguments:
  deck          Deck folder name under decks/. Default: $DECK, else "${DEFAULT_DECK}".

Options:
  --json        Print { deck, url, tokenEnvVar, token, env, claude: { mcpJson, add }, codex:
                { configToml, add } }. A failure prints { ok: false, error: { type, message } }.
  -h, --help    Show this help.`;

/**
 * `deckster mcp`: client configuration for a running deck MCP server.
 */
export const mcpCommand: Command = {
  /**
   * The word after `deckster` that selects this command.
   */
  name: 'mcp',

  /**
   * The line `deckster --help` shows for this command.
   */
  summary: 'Print Claude Code and Codex configuration for a running deckster dev --mcp',

  /**
   * The text `deckster mcp --help` prints.
   */
  help: HELP,

  /**
   * Loads the command's body on first use and runs it.
   */
  run: lazyRun('mcp-run.ts', () => import('#commands/mcp-run.ts')),
};
