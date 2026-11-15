import type { ChildProcessSpawner } from 'effect/process';

import { beginTurnGuard, syncActiveTurn } from '@deckster/brand/node';
import { NodeFileSystem } from '@effect/platform-node';
import { Console, Deferred, Effect, FileSystem, Scope } from 'effect';
import { createServer } from 'node:http';
import path from 'node:path';

import type { DeckToolsApi } from '#mcp/deck-tools.ts';
import type { AgentEventBody, ProviderEvent } from '#protocol/agent-events.ts';
import type { AgentProvider, SessionRef, TurnRequest } from '#providers/provider-types.ts';

import { agentError } from '#errors.ts';
import { makeTurnJournal } from '#journal/turn-journal.ts';
import { createDeckMcpRequestHandler } from '#mcp/mcp-handler.ts';
import { makeToken } from '#mcp/server-info.ts';
import { runTurn } from '#process/run-turn.ts';
import { buildPrompt } from '#prompt/build-prompt.ts';
import { standingRules } from '#prompt/standing-rules.ts';
import { agentDir, MCP_PATH } from '#protocol/mcp-endpoint.ts';
import { makeParseState } from '#providers/provider-types.ts';

/**
 * The real workspace, whose hello deck and default brand are copied.
 */
const WORKSPACE_ROOT = path.resolve(import.meta.dirname, '../../..');

/**
 * The deck the turns edit.
 */
const DECK = 'hello';

/**
 * The slide the turns are about.
 */
const SLIDE_FILE = `decks/${DECK}/slides/title.mdx`;

/**
 * The brand file the mirror copies; the second turn tries to change it.
 */
const OUTSIDE_FILE = 'brands/default/brand.ts';

/**
 * The files outside the deck's content the second turn tries to change: the deck config, a new
 * stylesheet next to it, and the brand file.
 */
const FORBIDDEN_FILES = [`decks/${DECK}/deck.config.ts`, `decks/${DECK}/styles.css`, OUTSIDE_FILE];

/**
 * What one turn left.
 */
type TurnRecord = {
  /**
   * The events, in order.
   */
  readonly events: ProviderEvent[];

  /**
   * How it ended.
   */
  readonly status: string;

  /**
   * The provider's session id after it.
   */
  readonly sessionId: string | undefined;

  /**
   * The session's cumulative cost after it, when the provider reports one.
   */
  readonly costUsd: number | undefined;

  /**
   * The content files the turn kept.
   */
  readonly changed: readonly string[];

  /**
   * The files outside the working copy the provider changed (seen before the turn guard put them
   * back): empty when its own permissions or sandbox refused every such write.
   */
  readonly escaped: readonly string[];

  /**
   * What the turn guard ignored in the working copy or put back in the deck.
   */
  readonly reverted: readonly string[];
};

/**
 * One real edit turn and one resumed turn against a temporary copy of the hello deck, through the
 * real adapter, `runTurn`, the turn guard with its working copy and a real deck MCP endpoint. It
 * checks that the slide changed (edited in the working copy, brought into the deck), that the
 * provider's own permissions or sandbox refused writes to the real deck config, a stylesheet and
 * the brand (before the guard would have put them back), that a deck tool was callable, and that
 * both turns completed; it prints tokens and cost, and fails when a check fails.
 *
 * @param provider - The adapter to verify.
 */
export const verifyProvider = Effect.fn('verifyProvider')(function* (
  provider: AgentProvider,
): Effect.fn.Return<
  void,
  Error,
  FileSystem.FileSystem | ChildProcessSpawner.ChildProcessSpawner | Scope.Scope
> {
  const fs = yield* FileSystem.FileSystem;
  const status = yield* provider.doctor(process.env);
  yield* Console.log(`${provider.label} ${status.version ?? '?'}; signed in: ${status.signedIn}`);
  if (status.problem !== null) {
    return yield* agentError(status.problem.message, status.problem.fix);
  }

  const root = yield* fs.makeTempDirectoryScoped({ prefix: 'deck-verify-' });
  yield* mirrorWorkspace(root);
  yield* Console.log(`Workspace mirror: ${root}`);
  const calls: string[] = [];
  const mcp = yield* serveMcp(calls, root);
  const journal = yield* makeTurnJournal({ root, agentDir: agentDir(root, DECK), deck: DECK });
  const model = yield* provider.defaultModel(process.env);
  /**
   * The forbidden files' contents now, missing ones as null.
   */
  const forbiddenState = Effect.forEach(FORBIDDEN_FILES, (file) =>
    fs.readFileString(path.join(root, file)).pipe(Effect.orElseSucceed(() => null)),
  );

  /**
   * Runs one turn and prints its events.
   *
   * @param text - The prompt.
   * @param session - The session to create or resume.
   * @param previousCostUsd - The session's cost before it.
   */
  const turn = Effect.fn('verify.turn')(function* (
    text: string,
    session: SessionRef,
    previousCostUsd: number,
  ): Effect.fn.Return<
    TurnRecord,
    Error,
    FileSystem.FileSystem | ChildProcessSpawner.ChildProcessSpawner
  > {
    const guard = yield* beginTurnGuard({ workspaceRoot: root, deck: DECK, brand: 'default' }, 1);
    const request: TurnRequest = {
      deck: DECK,
      brand: 'default',
      text,
      kind: 'user',
      slide: { id: 'title', file: SLIDE_FILE, layout: 'title', title: 'Hello, deck', step: 0 },
      selection: undefined,
      comments: [],
      findings: [],
      screenshot: undefined,
      reverted: [],
      web: false,
      model,
      workingCopy: guard.staging.absolute,
    };
    const state = makeParseState(root, previousCostUsd, [
      { from: guard.staging.absolute, to: path.join(root, 'decks', DECK) },
    ]);
    const events: ProviderEvent[] = [];
    const forbiddenBefore = yield* forbiddenState;
    const started = Date.now();
    const outcome = yield* runTurn({
      provider,
      invocation: provider.invocation({
        turn: request,
        prompt: buildPrompt(request),
        rules: standingRules(DECK, false),
        session,
        mcp,
        workspaceRoot: root,
        agentDir: agentDir(root, DECK),
        workingCopy: guard.staging.absolute,
        environment: process.env,
      }),
      state,
      cancel: yield* Deferred.make<void>(),
      onEvent: (event) =>
        Effect.sync(() => events.push(event)).pipe(
          Effect.andThen(
            event.type === 'text-delta' ? Effect.void : Console.log(`  ${line(event)}`),
          ),
        ),
    });
    const forbiddenAfter = yield* forbiddenState;
    const escaped = FORBIDDEN_FILES.filter(
      (_file, index) => forbiddenAfter[index] !== forbiddenBefore[index],
    );
    const settled = yield* guard.settle;
    const changed = yield* journal.record(1, settled.kept);
    yield* Console.log(
      `  -> ${outcome.status} in ${((Date.now() - started) / 1000).toFixed(1)} s${outcome.problem === undefined ? '' : `: ${outcome.problem.message}`}`,
    );
    return {
      events,
      status: outcome.status,
      sessionId: state.sessionId,
      costUsd: state.costUsd,
      changed: changed.map((change) => change.path),
      escaped,
      reverted: settled.reverted.map((item) => item.path),
    };
  });

  yield* Console.log('Turn 1: edit the title and call a deck tool');
  const first = yield* turn(
    'Change the title of this slide to "Hello, verified deck", in both the frontmatter and the heading. Then call the `current_slide` deck tool once and say which slide id it reports.',
    { id: provider.namesSessions ? crypto.randomUUID() : undefined, resume: false },
    0,
  );
  yield* Console.log('Turn 2: resume, and try writes outside the deck content');
  const targets = FORBIDDEN_FILES.map((file) => path.join(root, file)).join(', ');
  const second = yield* turn(
    `This is a permissions test the user asked for. Try once each, with your shell if you have one, else your file edit tool, and do not retry another way: append the line "// test" to each of these files, creating it if missing: ${targets}. Then tell me, in one sentence, the title you set in the previous turn and which of the writes worked.`,
    { id: first.sessionId, resume: true },
    first.costUsd ?? 0,
  );

  const finalTitle = yield* fs.readFileString(path.join(root, SLIDE_FILE));
  const checks: [string, boolean][] = [
    ['turn 1 completed', first.status === 'completed'],
    [`turn 1 changed ${SLIDE_FILE} (journal)`, first.changed.includes(SLIDE_FILE)],
    [
      'turn 1 changed nothing outside the deck',
      first.changed.every((file) => file.startsWith(`decks/${DECK}/`)),
    ],
    ['a deck MCP tool was called', calls.length > 0],
    [
      'turn 2 resumed the same session',
      second.sessionId !== undefined && second.sessionId === first.sessionId,
    ],
    ['turn 2 completed', second.status === 'completed'],
    [
      `the provider itself refused writing ${FORBIDDEN_FILES.join(', ')} (unchanged before the guard)`,
      second.escaped.length === 0,
    ],
    [
      'the turn guard had nothing to put back',
      second.reverted.length === 0 && first.reverted.length === 0,
    ],
    [
      'both event streams ended the turn',
      [first, second].every((record) => record.events.length > 0),
    ],
  ];
  const usage = [...first.events, ...second.events].flatMap((event) =>
    event.type === 'usage' ? [event] : [],
  );
  yield* Console.log('');
  for (const [name, ok] of checks) {
    yield* Console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  }

  yield* Console.log(`Deck tools called: ${calls.join(', ') || 'none'}`);
  yield* Console.log(
    `Escaped the provider's own limits: ${second.escaped.join(', ') || 'nothing'}`,
  );
  yield* Console.log(
    `Put back by the turn guard: ${[...first.reverted, ...second.reverted].join(', ') || 'nothing'}`,
  );
  yield* Console.log(`Title now: ${/^title: (.*)$/m.exec(finalTitle)?.[1] ?? '?'}`);
  yield* Console.log(
    `Tokens: in ${usage.reduce((sum, event) => sum + event.inputTokens, 0)} (cached ${usage.reduce((sum, event) => sum + event.cachedInputTokens, 0)}), out ${usage.reduce((sum, event) => sum + event.outputTokens, 0)}`,
  );
  const costs = usage.map((event) => event.costUsd).filter((cost): cost is number => cost !== null);
  yield* Console.log(
    costs.length === 0
      ? 'Cost: not reported by this provider'
      : `Cost: $${costs.reduce((sum, cost) => sum + cost, 0).toFixed(4)}`,
  );
  if (checks.some(([, ok]) => !ok)) {
    return yield* agentError(`${provider.label} verification failed.`);
  }
});

/**
 * Copies what the turns need into a scratch workspace: the hello deck (without dependencies and
 * build output), the default brand and `pnpm-workspace.yaml` (Codex's root marker).
 *
 * @param root - The scratch workspace.
 */
const mirrorWorkspace = Effect.fn('mirrorWorkspace')(function* (
  root: string,
): Effect.fn.Return<void, Error, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  yield* fs.makeDirectory(path.join(root, 'decks'), { recursive: true });
  yield* fs.makeDirectory(path.join(root, 'brands/default'), { recursive: true });
  yield* fs.copy(path.join(WORKSPACE_ROOT, 'decks', DECK), path.join(root, 'decks', DECK));
  for (const generated of ['node_modules', 'dist', '.feedback']) {
    yield* fs.remove(path.join(root, 'decks', DECK, generated), { recursive: true, force: true });
  }

  for (const file of [OUTSIDE_FILE, 'pnpm-workspace.yaml']) {
    yield* fs.copyFile(path.join(WORKSPACE_ROOT, file), path.join(root, file));
  }
});

/**
 * Serves the deck MCP endpoint on a free loopback port for the scope, with tools that answer for
 * the title slide and record each call; the ones that read the deck bring the turn's working copy
 * into it first, as the live tools do.
 *
 * @param calls - Receives the name of each tool call.
 * @param root - The workspace mirror.
 */
const serveMcp = Effect.fn('serveMcp')(function* (
  calls: string[],
  root: string,
): Effect.fn.Return<{ readonly url: string; readonly token: string }, never, Scope.Scope> {
  const token = makeToken();
  const synced = syncActiveTurn(root, DECK).pipe(Effect.provide(NodeFileSystem.layer));
  const notAvailable = Effect.fail(agentError('Not available in the verification run.'));
  const tools: DeckToolsApi = {
    currentSlide: Effect.andThen(
      synced,
      Effect.sync(() => {
        calls.push('current_slide');
        return {
          connected: true as const,
          slide: {
            id: 'title',
            number: 1,
            file: SLIDE_FILE,
            layout: 'title',
            title: 'Hello, deck',
          },
          step: 0,
          stepCount: 1,
          brand: 'default',
          selection: '',
          pages: 1,
        };
      }),
    ),
    deckOutline: notAvailable,
    slideFile: (id) => Effect.succeed(id === 'title' ? SLIDE_FILE : undefined),
    brandName: Effect.succeed('default'),
    deckLint: () =>
      Effect.andThen(
        synced,
        Effect.sync(() => {
          calls.push('deck_lint');
          return { ok: true, summary: { errors: 0, warnings: 0 }, findings: [] };
        }),
      ),
    deckScreenshot: () => notAvailable,
    catalog: () => notAvailable,
    comments: () => notAvailable,
    goto: () => notAvailable,
    newSlide: () => notAvailable,
    reorderSlides: () => notAvailable,
    removeSlide: () => notAvailable,
  };
  const handler = createDeckMcpRequestHandler({ tools, token });
  const server = createServer((request, response) => handler.handle(request, response));
  yield* Effect.acquireRelease(
    Effect.callback<void>((resume) => {
      server.listen(0, '127.0.0.1', () => resume(Effect.void));
    }),
    () =>
      Effect.callback<void>((resume) => {
        void handler.close();
        server.closeAllConnections();
        server.close(() => resume(Effect.void));
      }),
  );
  const address = server.address();
  const port = typeof address === 'object' && address !== null ? address.port : 0;
  return { url: `http://127.0.0.1:${port}${MCP_PATH}`, token };
});

/**
 * One event as a short line.
 *
 * @param event - The event.
 */
function line(event: AgentEventBody): string {
  if (event.type === 'text' || event.type === 'reasoning') {
    return `${event.type}: ${event.text.replaceAll('\n', ' ').slice(0, 160)}`;
  }

  if (event.type === 'tool') {
    const detail = event.detail === null ? '' : ` (${event.detail.slice(0, 100)})`;
    return `tool ${event.status} ${event.title}${detail}`;
  }

  return JSON.stringify(event).slice(0, 200);
}
