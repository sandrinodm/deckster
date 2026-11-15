import path from 'node:path';

import type { Invocation, InvocationContext } from '#providers/provider-types.ts';

import { childEnvironment } from '#providers/child-env.ts';

/**
 * The Codex version the adapter was recorded and tested with.
 */
export const CODEX_TESTED_VERSION = '0.167.2';

/**
 * The environment variable the child reads the deck MCP token from.
 */
export const CODEX_TOKEN_VARIABLE = 'DECK_MCP_TOKEN';

/**
 * Codex features a turn does not need. The shell stays: Codex reads files through it.
 */
export const CODEX_DISABLED_FEATURES = [
  'plugins',
  'apps',
  'multi_agent',
  'hooks',
  'goals',
  'browser_use',
  'computer_use',
  'image_generation',
  'in_app_browser',
] as const;

/**
 * The `-c` overrides of every turn: no approvals (exec has none), an `AGENTS.md` at the workspace
 * root found from the deck folder and read whole if there is one, no web search (live search, which
 * also opens pages, with `--agent-web`; the sandbox itself keeps no network), no writes to `/tmp`
 * or `$TMPDIR`, and the deck MCP server with its tools pre-approved and required, so a wrong token
 * fails the turn at once instead of silently dropping the tools.
 *
 * @param mcpUrl - The deck MCP endpoint.
 * @param web - Whether the agent may search the web and open pages.
 */
export function codexOverrides(mcpUrl: string, web: boolean): readonly string[] {
  return [
    'approval_policy="never"',
    'project_doc_max_bytes=131072',
    'project_root_markers=["pnpm-workspace.yaml"]',
    web ? 'web_search="live"' : 'web_search="disabled"',
    'sandbox_workspace_write.exclude_slash_tmp=true',
    'sandbox_workspace_write.exclude_tmpdir_env_var=true',
    `mcp_servers.deck.url=${JSON.stringify(mcpUrl)}`,
    `mcp_servers.deck.bearer_token_env_var="${CODEX_TOKEN_VARIABLE}"`,
    'mcp_servers.deck.default_tools_approval_mode="approve"',
    'mcp_servers.deck.required=true',
  ];
}

/**
 * The stdin of a Codex turn: exec has no system prompt option, so the standing rules come first.
 *
 * @param context - The turn.
 */
export function codexStdin(context: InvocationContext): string {
  return `${context.rules}\n\n---\n\n${context.prompt}`;
}

/**
 * The folders the sandbox lets Codex write: its working folder, the working copy's `slides/`, and
 * the working copy's `assets/` and `public/` as `--add-dir` writable roots. Nothing in the
 * repository is writable to it: not the real deck, not `.deck/` outside the working copy (the
 * journal, the turn record and the token), not brands or packages. A process its shell leaves
 * behind can only ever write in this working copy, which is retired when the turn ends.
 *
 * @param context - The turn.
 */
export function codexWritableFolders(context: Pick<InvocationContext, 'workingCopy'>): {
  readonly workDir: string;
  readonly added: readonly string[];
} {
  return {
    workDir: path.join(context.workingCopy, 'slides'),
    added: ['assets', 'public'].map((folder) => path.join(context.workingCopy, folder)),
  };
}

/**
 * The command line of one Codex turn: run from the workspace root with `-C` on the working copy's
 * `slides/` folder and its other content folders as `--add-dir` roots, so `workspace-write`
 * confines every write (its patch tool and its shell alike) to the working copy;
 * `project_root_markers` still finds the workspace root from there (the working copy is inside the
 * workspace). The user's own config is ignored (it would bring their MCP servers, plugins and
 * hooks), so the model is passed explicitly; `resume <thread_id>` comes after every exec flag; the
 * token is only in the child's environment.
 *
 * @param context - The turn, its prompt, session and MCP endpoint.
 */
export function codexInvocation(context: InvocationContext): Invocation {
  const { turn, session } = context;
  const { workDir, added } = codexWritableFolders(context);
  const writable = added.flatMap((folder) => ['--add-dir', folder]);
  return {
    command: 'codex',
    args: [
      'exec',
      '--json',
      '--skip-git-repo-check',
      '--ignore-user-config',
      '--ignore-rules',
      '-C',
      workDir,
      '-s',
      'workspace-write',
      ...writable,
      ...(turn.model === undefined ? [] : ['-m', turn.model]),
      ...codexOverrides(context.mcp.url, turn.web).flatMap((override) => ['-c', override]),
      ...CODEX_DISABLED_FEATURES.flatMap((feature) => ['--disable', feature]),
      ...(turn.screenshot === undefined ? [] : ['--image', turn.screenshot.path]),
      ...(session.resume && session.id !== undefined ? ['resume', session.id] : []),
      '-',
    ],
    cwd: context.workspaceRoot,
    env: childEnvironment('codex', context.environment, {
      [CODEX_TOKEN_VARIABLE]: context.mcp.token,
    }),
    stdin: codexStdin(context),
    files: [],
  };
}
