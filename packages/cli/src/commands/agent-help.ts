import { PUBLIC_PROVIDERS } from '@deckster/agent/providers';
import { CONTENT_SCOPE_SENTENCE } from '@deckster/brand/node';

/**
 * The text `deck agent --help` prints.
 */
export const HELP = `Usage: deck agent doctor [--agent claude|codex] [--json]

Checks the agent CLIs \`deck dev --agent\` and \`deck present --agent\` drive: whether each binary is
on the PATH, its version (and whether it is the version the adapter was tested with), and whether
it is signed in, with the command that fixes each problem. It runs \`claude --version\`,
\`claude auth status --json\`, \`codex --version\` and \`codex login status\`; it never prints an
e-mail address or a token.

${CONTENT_SCOPE_SENTENCE}

Options:
  --agent <name>  Check one provider: ${PUBLIC_PROVIDERS.join(' or ')}. Default: both.
  --json          Print { ok, providers: [{ provider, label, installed, version, testedVersion,
                  signedIn, account, problem: { kind, message, fix } | null, warnings }] }. A
                  failure prints { ok: false, error: { type, message } }.
  -h, --help      Show this help.

Exits with 1 when a checked provider has a problem.`;
