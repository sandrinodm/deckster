import { CONTENT_FOLDER_NAMES, CONTENT_FOLDERS } from '@deckster/brand/node';
import path from 'node:path';

import type { Invocation, InvocationContext } from '#providers/provider-types.ts';

import { childEnvironment } from '#providers/child-env.ts';

/**
 * The Claude Code version the adapter was recorded and tested with.
 */
export const CLAUDE_TESTED_VERSION = '2.1.325';

/**
 * The built-in tools a turn may use. Without `--tools` Claude Code offers a dozen more (Task,
 * Workflow, ToolSearch…); without ToolSearch the MCP tools load directly. No `Skill`: a skill's
 * `allowed-tools` pre-approves tools while it runs, even in a `-p` run, which would widen the edit
 * rules below.
 */
export const CLAUDE_TOOLS = 'Read,Glob,Grep,Edit,Write';

/**
 * The tools `--agent-web` adds: search, and fetching a page by its address.
 */
export const CLAUDE_WEB_TOOLS = ['WebSearch', 'WebFetch'] as const;

/**
 * The name of the MCP configuration file in the deck's agent folder.
 */
export const CLAUDE_MCP_CONFIG_FILE = 'claude-mcp.json';

/**
 * The mode of files that hold the token.
 */
const SECRET_FILE_MODE = 0o600;

/**
 * The working copy relative to the workspace root (Claude's working folder), with forward slashes.
 *
 * @param context - The turn.
 */
function workingCopyRelative(
  context: Pick<InvocationContext, 'workspaceRoot' | 'workingCopy'>,
): string {
  return path.relative(context.workspaceRoot, context.workingCopy).split(path.sep).join('/');
}

/**
 * The allow rules for edits: one per content folder of the turn's working copy and allowed
 * extension (slide files in `slides/`, media and data in `assets/` and `public/`), nothing else. A
 * leading `/` anchors at the working directory (the workspace root); `Edit(...)` governs Write as
 * well, and `**` also matches no folder at all, so `slides/x.mdx` is covered. Nothing in the real
 * deck is allowed: the framework copies the working copy's content into it.
 *
 * @param context - The turn's workspace root and working copy.
 */
export function claudeEditRules(
  context: Pick<InvocationContext, 'workspaceRoot' | 'workingCopy'>,
): readonly string[] {
  const base = workingCopyRelative(context);
  return CONTENT_FOLDER_NAMES.flatMap((folder) =>
    (CONTENT_FOLDERS[folder] ?? []).map(
      (extension) => `Edit(/${base}/${folder}/**/*.${extension})`,
    ),
  );
}

/**
 * The deny rules, a second belt over the allow rules (deny wins): every deck and brand, the deck
 * config, every stylesheet, Claude Code's own `.claude/` folder, and the `Skill` tool.
 *
 * @param deck - The deck folder name.
 */
export function claudeDenyRules(deck: string): readonly string[] {
  return [
    'Edit(/decks/**)',
    'Edit(/brands/**)',
    `Edit(/decks/${deck}/deck.config.ts)`,
    'Edit(**/deck.config.ts)',
    'Edit(**/*.css)',
    'Edit(/.claude/**)',
    'Skill',
  ];
}

/**
 * The stdin of a turn: the prompt as text, or, with a screenshot, one stream-json user message with
 * the text and the image.
 *
 * @param context - The turn.
 */
export function claudeStdin(context: InvocationContext): string {
  const { screenshot } = context.turn;
  if (screenshot === undefined) {
    return context.prompt;
  }

  const message = {
    type: 'user',
    message: {
      role: 'user',
      content: [
        { type: 'text', text: context.prompt },
        {
          type: 'image',
          source: { type: 'base64', media_type: 'image/png', data: screenshot.base64 },
        },
      ],
    },
  };
  return `${JSON.stringify(message)}\n`;
}

/**
 * The command line of one Claude Code turn: run from the workspace root, edits allowed only to the
 * content files of the turn's working copy (and denied for decks, brands, the deck config,
 * stylesheets and `.claude/`), no skills, web search and fetch only with `--agent-web`, the deck
 * MCP server from a 0600 file (never on the command line, where `ps` shows it), no settings file at
 * all (`--setting-sources ""`: a project's `.claude/settings.json` allow rules or hooks never
 * apply), and a clean environment.
 *
 * @param context - The turn, its prompt, session and MCP endpoint.
 */
export function claudeInvocation(context: InvocationContext): Invocation {
  const { turn, session } = context;
  // The prompt itself and the screenshot go on stdin, never into arguments.
  const mcpFile = path.join(context.agentDir, CLAUDE_MCP_CONFIG_FILE);
  const mcpConfig = {
    mcpServers: {
      deck: {
        type: 'http',
        url: context.mcp.url,
        headers: { Authorization: `Bearer ${context.mcp.token}` },
      },
    },
  };
  const sessionArgs: string[] = [];
  if (session.id !== undefined) {
    sessionArgs.push(session.resume ? '--resume' : '--session-id', session.id);
  }

  return {
    command: 'claude',
    args: [
      '-p',
      '--output-format',
      'stream-json',
      '--verbose',
      '--include-partial-messages',
      ...sessionArgs,
      '--permission-mode',
      'dontAsk',
      '--tools',
      turn.web ? [CLAUDE_TOOLS, ...CLAUDE_WEB_TOOLS].join(',') : CLAUDE_TOOLS,
      '--allowedTools',
      ...claudeEditRules(context),
      'mcp__deck__*',
      // dontAsk refuses a tool that is offered but not allowed, so the web tools need both lists.
      ...(turn.web ? CLAUDE_WEB_TOOLS : []),
      '--disallowedTools',
      ...claudeDenyRules(turn.deck),
      '--mcp-config',
      mcpFile,
      '--strict-mcp-config',
      '--setting-sources',
      '',
      '--append-system-prompt',
      context.rules,
      ...(turn.model === undefined ? [] : ['--model', turn.model]),
      ...(turn.screenshot === undefined ? [] : ['--input-format', 'stream-json']),
    ],
    cwd: context.workspaceRoot,
    env: childEnvironment('claude', context.environment),
    stdin: claudeStdin(context),
    files: [{ path: mcpFile, content: `${JSON.stringify(mcpConfig)}\n`, mode: SECRET_FILE_MODE }],
  };
}
