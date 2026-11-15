import type { Effect, FileSystem } from 'effect';
import type { ChildProcessSpawner } from 'effect/process';

import type {
  AgentProblem,
  RevertedChange,
  ProviderEvent,
  ProviderId,
  TurnKind,
  TurnStatus,
} from '#protocol/agent-events.ts';
import type { McpEndpoint } from '#protocol/mcp-endpoint.ts';

/**
 * A review comment attached to a prompt.
 */
export type CommentRef = {
  /**
   * The comment id.
   */
  readonly id: string;

  /**
   * What the reviewer wrote.
   */
  readonly text: string;

  /**
   * Where to edit, such as `decks/hello/slides/title.mdx:7:1`.
   */
  readonly location: string;
};

/**
 * A lint finding an automatic follow-up turn has to fix.
 */
export type FindingRef = {
  /**
   * The slide id, or null.
   */
  readonly slide: string | null;

  /**
   * The file at fault.
   */
  readonly file: string;

  /**
   * The rule id.
   */
  readonly rule: string;

  /**
   * What is wrong.
   */
  readonly message: string;

  /**
   * How to fix it.
   */
  readonly fix: string;
};

/**
 * The slide a prompt is about.
 */
export type SlideRef = {
  /**
   * The slide id.
   */
  readonly id: string;

  /**
   * The slide file relative to the workspace root.
   */
  readonly file: string;

  /**
   * The layout the slide names, or an empty string when unknown.
   */
  readonly layout: string;

  /**
   * The slide's title, or an empty string when unknown.
   */
  readonly title: string;

  /**
   * The step on screen, from 0.
   */
  readonly step: number;
};

/**
 * What the panel asked for, plus what the server knows about the screen.
 */
export type TurnRequest = {
  /**
   * The deck folder name.
   */
  readonly deck: string;

  /**
   * The brand the deck renders with, when known.
   */
  readonly brand: string | undefined;

  /**
   * What the person wrote.
   */
  readonly text: string;

  /**
   * Who asked.
   */
  readonly kind: TurnKind;

  /**
   * The slide on screen, when known.
   */
  readonly slide: SlideRef | undefined;

  /**
   * The selected text or picked element.
   */
  readonly selection:
    | {
        /**
         * The picked element's source location, when known.
         */
        readonly source: string | undefined;

        /**
         * The selected text.
         */
        readonly text: string;
      }
    | undefined;

  /**
   * Attached review comments.
   */
  readonly comments: readonly CommentRef[];

  /**
   * Lint findings to fix (auto-fix turns).
   */
  readonly findings: readonly FindingRef[];

  /**
   * A screenshot of the slide, when one was asked for.
   */
  readonly screenshot: ScreenshotRef | undefined;

  /**
   * What the turn before this one wrote that is not content (ignored, or put back), so the agent
   * hears that those edits were not allowed; empty when nothing was.
   */
  readonly reverted: readonly RevertedChange[];

  /**
   * The turn's working copy, absolute: the only folder the agent edits (`slides/`, `assets/` and
   * `public/` in it). Set once the turn guard has made it.
   */
  readonly workingCopy?: string;

  /**
   * Whether the agent may search the web (`--agent-web`).
   */
  readonly web: boolean;

  /**
   * The model, or undefined for the provider's default.
   */
  readonly model: string | undefined;
};

/**
 * A PNG of the slide, on disk and in memory.
 */
export type ScreenshotRef = {
  /**
   * The absolute path of the PNG.
   */
  readonly path: string;

  /**
   * The PNG, base64 encoded.
   */
  readonly base64: string;
};

/**
 * The provider session a turn continues, or a new one.
 */
export type SessionRef = {
  /**
   * The session id: for Claude the id to create or resume; for Codex the thread to resume.
   */
  readonly id: string | undefined;

  /**
   * Whether the session already exists and is resumed.
   */
  readonly resume: boolean;
};

/**
 * Everything an adapter needs to build one turn's command line.
 */
export type InvocationContext = {
  /**
   * The turn.
   */
  readonly turn: TurnRequest;

  /**
   * The prompt text built from the turn.
   */
  readonly prompt: string;

  /**
   * The standing rules appended to the system prompt (Claude) or put before the prompt (Codex).
   */
  readonly rules: string;

  /**
   * The session to create or resume.
   */
  readonly session: SessionRef;

  /**
   * The deck MCP endpoint.
   */
  readonly mcp: McpEndpoint;

  /**
   * The absolute workspace root.
   */
  readonly workspaceRoot: string;

  /**
   * The absolute folder for the deck's agent files (`.deck/agent/<deck>`).
   */
  readonly agentDir: string;

  /**
   * The turn's working copy, absolute: a fresh folder under `.deck/agent/<deck>/work/` holding a
   * copy of the deck's content. Its `slides/`, `assets/` and `public/` are the only folders a
   * provider may write; the framework brings their content into the deck.
   */
  readonly workingCopy: string;

  /**
   * The parent process environment, from which the child's is picked.
   */
  readonly environment: Readonly<Record<string, string | undefined>>;
};

/**
 * A file to write before the process starts, such as Claude's MCP configuration.
 */
export type InvocationFile = {
  /**
   * The absolute path.
   */
  readonly path: string;

  /**
   * The content.
   */
  readonly content: string;

  /**
   * The file mode, such as 0o600.
   */
  readonly mode: number;
};

/**
 * A fixed command line for one turn: no shell, an explicit environment, the prompt on stdin.
 */
export type Invocation = {
  /**
   * The program.
   */
  readonly command: string;

  /**
   * The arguments.
   */
  readonly args: readonly string[];

  /**
   * The working directory.
   */
  readonly cwd: string;

  /**
   * The complete environment of the child.
   */
  readonly env: Readonly<Record<string, string>>;

  /**
   * What is written to stdin before it is closed.
   */
  readonly stdin: string;

  /**
   * Files to write first.
   */
  readonly files: readonly InvocationFile[];
};

/**
 * What one turn's output said so far. Each adapter reads and updates it line by line.
 */
export type ParseState = {
  /**
   * The absolute workspace root, to make tool paths relative.
   */
  readonly root: string;

  /**
   * The provider's session or thread id, once seen.
   */
  sessionId: string | undefined;

  /**
   * The terminal event seen, if any.
   */
  terminal: TurnStatus | undefined;

  /**
   * A failure the stream itself reported.
   */
  failure: AgentProblem | undefined;

  /**
   * The session's cumulative cost before this turn (Claude reports a running total).
   */
  readonly previousCostUsd: number;

  /**
   * The session's cumulative cost after this turn, once known.
   */
  costUsd: number | undefined;

  /**
   * Tool calls by id, to finish them with the same name and title.
   */
  readonly tools: Map<string, { name: string; title: string; path: string | null }>;

  /**
   * Tool call ids the permission rules refused.
   */
  readonly denied: Set<string>;

  /**
   * How many lines were parsed.
   */
  lines: number;

  /**
   * Folders whose paths are shown as other folders' (the working copy as the deck folder it stands
   * for), absolute.
   */
  readonly aliases: readonly { readonly from: string; readonly to: string }[];
};

/**
 * How the child process ended, as `run-turn` observed it.
 */
export type ProcessExit = {
  /**
   * The exit code, or null when a signal ended it.
   */
  readonly code: number | null;

  /**
   * The signal that ended it, or null.
   */
  readonly signal: string | null;

  /**
   * The start of stderr, bounded.
   */
  readonly stderr: string;

  /**
   * Whether the user cancelled the turn.
   */
  readonly cancelled: boolean;

  /**
   * Which limit ended the turn, if one did.
   */
  readonly timedOut: 'idle' | 'total' | undefined;
};

/**
 * How a turn ended, with the session it leaves.
 */
export type TurnOutcome = {
  /**
   * How it ended.
   */
  readonly status: TurnStatus;

  /**
   * What went wrong, when it failed or was cancelled.
   */
  readonly problem: AgentProblem | undefined;
};

/**
 * What `doctor` found out about a provider.
 */
export type ProviderStatus = {
  /**
   * The provider.
   */
  readonly provider: ProviderId;

  /**
   * Whether the binary was found.
   */
  readonly installed: boolean;

  /**
   * The CLI version, when found.
   */
  readonly version: string | null;

  /**
   * The version the recorded transcripts and tests were made with.
   */
  readonly testedVersion: string;

  /**
   * Whether the CLI is signed in, or null when that could not be checked.
   */
  readonly signedIn: boolean | null;

  /**
   * How it is signed in, such as `claude.ai (max)` or `ChatGPT`, when known.
   */
  readonly account: string | null;

  /**
   * Why it cannot run, with the fix, or null when it can.
   */
  readonly problem: AgentProblem | null;

  /**
   * Things that work but deserve a look, such as an untested version.
   */
  readonly warnings: readonly string[];
};

/**
 * One agent CLI behind the common interface.
 */
export type AgentProvider = {
  /**
   * The provider id.
   */
  readonly id: ProviderId;

  /**
   * The name to show, such as `Claude Code`.
   */
  readonly label: string;

  /**
   * The CLI version the adapter was recorded and tested with.
   */
  readonly testedVersion: string;

  /**
   * Binary found, version, signed in; or a problem with its fix.
   *
   * @param environment - The parent environment, from which the child's is picked.
   */
  readonly doctor: (
    environment: Readonly<Record<string, string | undefined>>,
  ) => Effect.Effect<ProviderStatus, never, ChildProcessSpawner.ChildProcessSpawner>;

  /**
   * The model to pass when the user named none, such as Codex's from its own config; undefined
   * leaves the choice to the CLI.
   *
   * @param environment - The parent environment.
   */
  readonly defaultModel: (
    environment: Readonly<Record<string, string | undefined>>,
  ) => Effect.Effect<string | undefined, never, FileSystem.FileSystem>;

  /**
   * Whether a new session gets its id from the host (Claude's `--session-id`) rather than from the
   * provider's output (Codex's thread id).
   */
  readonly namesSessions: boolean;

  /**
   * The fixed command line for one turn.
   */
  readonly invocation: (context: InvocationContext) => Invocation;

  /**
   * One JSONL line to zero or more normalised events; never throws on unknown shapes.
   */
  readonly parseLine: (line: string, state: ParseState) => readonly ProviderEvent[];

  /**
   * How the turn ended, from the exit and what the stream said.
   */
  readonly interpretExit: (exit: ProcessExit, state: ParseState) => TurnOutcome;
};

/**
 * A fresh parse state for one turn.
 *
 * @param root - The absolute workspace root.
 * @param previousCostUsd - The session's cumulative cost before the turn.
 * @param aliases - Folders whose paths are shown as other folders'.
 */
export function makeParseState(
  root: string,
  previousCostUsd = 0,
  aliases: ParseState['aliases'] = [],
): ParseState {
  return {
    root,
    sessionId: undefined,
    terminal: undefined,
    failure: undefined,
    previousCostUsd,
    costUsd: undefined,
    tools: new Map(),
    denied: new Set(),
    lines: 0,
    aliases,
  };
}
