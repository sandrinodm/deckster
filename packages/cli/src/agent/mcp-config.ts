import type { ServerInfo } from '@deckster/agent/protocol';

/**
 * The environment variable the configuration reads the token from, so the token never has to be
 * written into a file that gets committed.
 */
export const TOKEN_ENV_VAR = 'DECK_MCP_TOKEN';

/**
 * The name the deck's MCP server has in a client's configuration.
 */
export const SERVER_NAME = 'deck';

/**
 * Spaces of indentation in the JSON snippet.
 */
const JSON_INDENT_SPACES = 2;

/**
 * Ready-to-paste configuration of the deck MCP server for the agent CLIs.
 */
export type McpConfig = {
  /**
   * The deck folder name.
   */
  deck: string;

  /**
   * The endpoint URL.
   */
  url: string;

  /**
   * The environment variable that holds the token in the snippets.
   */
  tokenEnvVar: string;

  /**
   * The token of this run.
   */
  token: string;

  /**
   * The shell line that sets the token variable for the current terminal.
   */
  env: string;

  /**
   * Claude Code's configuration.
   */
  claude: {
    /**
     * The content of a `.mcp.json` file; it expands the token variable when Claude Code starts.
     */
    mcpJson: {
      /**
       * The servers by name.
       */
      mcpServers: Record<string, { type: 'http'; url: string; headers: Record<string, string> }>;
    };

    /**
     * The `claude mcp add` command line, with the token in the header.
     */
    add: string;
  };

  /**
   * Codex's configuration.
   */
  codex: {
    /**
     * A section for `~/.codex/config.toml` (or a project's `.codex/config.toml`); it reads the
     * token from the variable.
     */
    configToml: string;

    /**
     * The `codex mcp add` command line.
     */
    add: string;
  };
};

/**
 * Builds the configuration for a running server.
 *
 * @param info - What the dev server wrote to `server.json`.
 */
export function mcpConfig(info: ServerInfo): McpConfig {
  const header = `Authorization: Bearer ${info.token}`;
  return {
    deck: info.deck,
    url: info.mcpUrl,
    tokenEnvVar: TOKEN_ENV_VAR,
    token: info.token,
    env: `export ${TOKEN_ENV_VAR}='${info.token}'`,
    claude: {
      mcpJson: {
        mcpServers: {
          [SERVER_NAME]: {
            type: 'http',
            url: info.mcpUrl,
            headers: { Authorization: `Bearer \${${TOKEN_ENV_VAR}}` },
          },
        },
      },
      add: `claude mcp add --transport http ${SERVER_NAME} ${info.mcpUrl} --header '${header}'`,
    },
    codex: {
      configToml: [
        `[mcp_servers.${SERVER_NAME}]`,
        `url = "${info.mcpUrl}"`,
        `bearer_token_env_var = "${TOKEN_ENV_VAR}"`,
      ].join('\n'),
      add:
        `codex mcp add ${SERVER_NAME} --url ${info.mcpUrl} ` +
        `--bearer-token-env-var ${TOKEN_ENV_VAR}`,
    },
  };
}

/**
 * The configuration as text for a terminal.
 *
 * @param config - The configuration.
 */
export function formatMcpConfig(config: McpConfig): string {
  return [
    `Deck MCP server for "${config.deck}": ${config.url}`,
    'The token belongs to this dev server run; start `deckster dev --mcp` again and the token changes.',
    '',
    'Set the token for the terminal that starts the agent:',
    `  ${config.env}`,
    '',
    'Claude Code: add to .mcp.json in the project, or run the command ' +
      '(the token goes in the header)',
    JSON.stringify(config.claude.mcpJson, null, JSON_INDENT_SPACES)
      .split('\n')
      .map((line) => `  ${line}`)
      .join('\n'),
    `  ${config.claude.add}`,
    '',
    'Codex: add to ~/.codex/config.toml, or run the command',
    ...config.codex.configToml.split('\n').map((line) => `  ${line}`),
    `  ${config.codex.add}`,
  ].join('\n');
}
