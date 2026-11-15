/**
 * Variables every provider child gets when the parent has them: the search path, the home folder
 * (where each CLI keeps its login), the user, the shell and temp folder, locale, terminal and
 * certificate settings.
 */
const COMMON_VARIABLES = [
  'PATH',
  'HOME',
  'USER',
  'LOGNAME',
  'SHELL',
  'TMPDIR',
  'TZ',
  'LANG',
  'LANGUAGE',
  'TERM',
  'NODE_EXTRA_CA_CERTS',
  'SSL_CERT_FILE',
  'SSL_CERT_DIR',
  'XDG_CONFIG_HOME',
  'XDG_DATA_HOME',
  'XDG_STATE_HOME',
  'XDG_CACHE_HOME',
];

/**
 * Proxy variables, in both spellings.
 */
const PROXY_VARIABLES = ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY'].flatMap((name) => [
  name,
  name.toLowerCase(),
]);

/**
 * Each provider's own variables: where its configuration lives and how it signs in. Claude Code's
 * go to Claude only and Codex's to Codex only, so one provider never sees the other's secrets. The
 * names come from each CLI's documentation (Claude Code: settings and third-party providers; Codex:
 * authentication) and its binary.
 */
const PROVIDER_VARIABLES = {
  /**
   * Claude Code: its config folder, an Anthropic API key or OAuth token, a gateway's base URL and
   * headers, the model overrides, and the switches for Amazon Bedrock, Google Vertex AI and
   * Microsoft Foundry (their credentials follow in {@link CLOUD_VARIABLES}).
   */
  claude: [
    'CLAUDE_CONFIG_DIR',
    'ANTHROPIC_API_KEY',
    'ANTHROPIC_AUTH_TOKEN',
    'ANTHROPIC_BASE_URL',
    'ANTHROPIC_CUSTOM_HEADERS',
    'ANTHROPIC_MODEL',
    'ANTHROPIC_SMALL_FAST_MODEL',
    'ANTHROPIC_DEFAULT_OPUS_MODEL',
    'ANTHROPIC_DEFAULT_SONNET_MODEL',
    'ANTHROPIC_DEFAULT_HAIKU_MODEL',
    'CLAUDE_CODE_OAUTH_TOKEN',
    'CLAUDE_CODE_USE_BEDROCK',
    'CLAUDE_CODE_USE_VERTEX',
    'CLAUDE_CODE_USE_FOUNDRY',
  ],

  /**
   * Codex: its home folder, an OpenAI or Codex API key or access token, a custom base URL and a CA
   * certificate.
   */
  codex: [
    'CODEX_HOME',
    'CODEX_API_KEY',
    'CODEX_ACCESS_TOKEN',
    'CODEX_CA_CERTIFICATE',
    'OPENAI_API_KEY',
    'OPENAI_BASE_URL',
  ],

  /**
   * The fake provider reads nothing of its own beyond what the host sets.
   */
  fake: [],
} as const;

/**
 * A cloud a provider can run on: the switch that selects it, and the variables (by name or prefix)
 * that carry its credentials, passed only while the switch is set.
 */
type CloudVariables = {
  /**
   * The variable that turns the cloud on, such as `CLAUDE_CODE_USE_BEDROCK`.
   */
  readonly switch: string;

  /**
   * Variables passed by exact name.
   */
  readonly names: readonly string[];

  /**
   * Variables passed by prefix, such as `AWS_`.
   */
  readonly prefixes: readonly string[];
};

/**
 * Claude Code's clouds: Amazon Bedrock, Google Vertex AI and Microsoft Foundry. Their credentials
 * reach the Claude child only, and only when Claude Code is told to use that cloud.
 */
const CLOUD_VARIABLES: readonly CloudVariables[] = [
  {
    switch: 'CLAUDE_CODE_USE_BEDROCK',
    names: ['ANTHROPIC_BEDROCK_BASE_URL', 'CLAUDE_CODE_SKIP_BEDROCK_AUTH'],
    prefixes: ['AWS_'],
  },
  {
    switch: 'CLAUDE_CODE_USE_VERTEX',
    names: [
      'ANTHROPIC_VERTEX_BASE_URL',
      'ANTHROPIC_VERTEX_PROJECT_ID',
      'CLAUDE_CODE_SKIP_VERTEX_AUTH',
      'CLOUD_ML_REGION',
      'GCLOUD_PROJECT',
    ],
    prefixes: ['GOOGLE_', 'VERTEX_REGION_'],
  },
  {
    switch: 'CLAUDE_CODE_USE_FOUNDRY',
    names: [
      'ANTHROPIC_FOUNDRY_API_KEY',
      'ANTHROPIC_FOUNDRY_RESOURCE',
      'ANTHROPIC_FOUNDRY_BASE_URL',
      'CLAUDE_CODE_SKIP_FOUNDRY_AUTH',
    ],
    prefixes: ['AZURE_'],
  },
];

/**
 * Builds a child's environment from an allow-list instead of inheriting everything: the deck CLI
 * may itself run inside Claude Code, whose `CLAUDECODE` and `CLAUDE_CODE_*` variables would change
 * how the child behaves, and secrets of other tools have no business there.
 *
 * @param provider - The provider whose own variables are kept.
 * @param environment - The parent environment.
 * @param extra - Variables the host sets for the child, such as `DECK_MCP_TOKEN`.
 */
export function childEnvironment(
  provider: keyof typeof PROVIDER_VARIABLES,
  environment: Readonly<Record<string, string | undefined>>,
  extra: Readonly<Record<string, string>> = {},
): Record<string, string> {
  const env: Record<string, string> = {};
  for (const name of [...COMMON_VARIABLES, ...PROXY_VARIABLES, ...PROVIDER_VARIABLES[provider]]) {
    const value = environment[name];
    if (value !== undefined && value !== '') {
      env[name] = value;
    }
  }

  const clouds =
    provider === 'claude'
      ? CLOUD_VARIABLES.filter((cloud) => (environment[cloud.switch] ?? '') !== '')
      : [];
  const names = new Set(clouds.flatMap((cloud) => cloud.names));
  const prefixes = ['LC_', ...clouds.flatMap((cloud) => cloud.prefixes)];
  for (const [name, value] of Object.entries(environment)) {
    const wanted = names.has(name) || prefixes.some((prefix) => name.startsWith(prefix));
    if (wanted && value !== undefined && value !== '') {
      env[name] = value;
    }
  }

  return { ...env, ...extra };
}
