import type { ChildProcessSpawner } from 'effect/process';

import { NodeServices } from '@effect/platform-node';
import { Effect, FileSystem, Layer, type Scope } from 'effect';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

import type { AgentEvent } from '#protocol/agent-events.ts';

import { agentError } from '#errors.ts';
import { DeckTools, type DeckToolsApi } from '#mcp/deck-tools.ts';
import { PIXEL_PNG } from '#mcp/fake-deck-tools.fixture.ts';
import { fakeProvider } from '#providers/fake/fake-provider.ts';
import {
  makeAgentSessions,
  type AgentSessionsApi,
  type AgentSessionsOptions,
} from '#session/agent-sessions.ts';

/**
 * The title slide every scratch deck starts with.
 */
export const TITLE_SLIDE = `---
title: Hello, deck
---

# Hello, deck

A sample.
`;

/**
 * When the fake lint reports an error.
 */
export type LintMode = 'marker' | 'always' | 'never';

/**
 * Deck tools for the agent host's tests: lint reads the title slide from disk (an error while it
 * contains `LINT-ERROR`, in `marker` mode), the outline is unknown (so the host finds slides on
 * disk), and the page is not connected.
 *
 * @param root - The scratch workspace.
 * @param lint - When lint reports an error.
 * @param calls - Receives the name of every call.
 */
export function sessionTools(
  root: string,
  lint: LintMode,
  calls: string[],
  lintGate?: { readonly open: boolean },
): DeckToolsApi {
  const unused = Effect.fail(agentError('Not part of these tests.'));
  return {
    currentSlide: Effect.succeed({ connected: false, message: 'No page.' }),
    deckOutline: unused,
    slideFile: (id) =>
      Effect.gen(function* () {
        calls.push('slideFile');
        const fs = yield* FileSystem.FileSystem;
        const file = `decks/hello/slides/${id}.mdx`;
        return (yield* fs.exists(path.join(root, file)).pipe(Effect.orElseSucceed(() => false)))
          ? file
          : undefined;
      }).pipe(Effect.provide(NodeServices.layer)),
    brandName: Effect.sync(() => {
      calls.push('brandName');
      return 'default';
    }),
    deckLint: () =>
      Effect.gen(function* () {
        calls.push('deckLint');
        while (lintGate !== undefined && !lintGate.open) {
          yield* Effect.sleep(10);
        }

        const fs = yield* FileSystem.FileSystem;
        const text = yield* fs
          .readFileString(path.join(root, 'decks/hello/slides/title.mdx'))
          .pipe(Effect.orElseSucceed(() => ''));
        const failing = lint === 'always' || (lint === 'marker' && text.includes('LINT-ERROR'));
        return {
          ok: !failing,
          findings: failing
            ? [
                {
                  slide: 'title',
                  file: 'decks/hello/slides/title.mdx',
                  step: null,
                  rule: 'title-length',
                  severity: 'error',
                  message: 'The title says LINT-ERROR.',
                  fix: 'Write a real title.',
                  selector: null,
                },
              ]
            : [],
        };
      }).pipe(Effect.provide(NodeServices.layer)),
    deckScreenshot: (input) =>
      Effect.sync(() => {
        calls.push(`deckScreenshot:${input.width ?? 'default'}`);
        return {
          path: path.join(root, '.deck/agent/hello/shots/title-0.png'),
          slide: input.slide,
          step: input.step ?? null,
          width: input.width ?? 1280,
          height: 720,
          error: null,
          data: PIXEL_PNG,
        };
      }),
    catalog: () => unused,
    comments: () =>
      Effect.succeed({
        comments: [
          { id: 'c-1', text: 'Shorter, please.', location: 'decks/hello/slides/title.mdx:5:1' },
        ],
      }),
    goto: () => unused,
    newSlide: () => unused,
    reorderSlides: () => unused,
    removeSlide: () => unused,
  };
}

/**
 * The deck config every scratch deck starts with.
 */
export const HELLO_CONFIG = `import { defineDeck } from '@deckster/engine/config';

export default defineDeck({ title: 'Hello', slides: ['title'] });
`;

/**
 * The brand file every scratch workspace starts with.
 */
export const DEFAULT_BRAND_FILE = "export default { name: 'default' };\n";

/**
 * A scratch workspace with the hello deck (its config and title slide) and a default brand.
 */
export const scratchWorkspace = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const root = yield* fs.makeTempDirectoryScoped();
  yield* fs.makeDirectory(path.join(root, 'decks/hello/slides'), { recursive: true });
  yield* fs.makeDirectory(path.join(root, 'brands/default'), { recursive: true });
  yield* fs.writeFileString(path.join(root, 'decks/hello/slides/title.mdx'), TITLE_SLIDE);
  yield* fs.writeFileString(path.join(root, 'decks/hello/deck.config.ts'), HELLO_CONFIG);
  yield* fs.writeFileString(path.join(root, 'brands/default/brand.ts'), DEFAULT_BRAND_FILE);
  return root;
});

/**
 * Starts an agent host with the fake provider on a scratch workspace, in the caller's scope.
 *
 * @param root - The workspace.
 * @param options - Changes to the defaults (lint mode, a gate that holds every lint until it opens,
 *   and host options).
 */
export const startFakeHost = (
  root: string,
  options: {
    readonly lint?: LintMode;
    readonly lintGate?: { readonly open: boolean };
    readonly host?: Partial<AgentSessionsOptions>;
  } = {},
): Effect.Effect<
  { readonly sessions: AgentSessionsApi; readonly calls: string[] },
  never,
  Scope.Scope | FileSystem.FileSystem | ChildProcessSpawner.ChildProcessSpawner
> =>
  Effect.gen(function* () {
    const calls: string[] = [];
    const tools = sessionTools(root, options.lint ?? 'marker', calls, options.lintGate);
    const sessions = yield* makeAgentSessions({
      workspaceRoot: root,
      deck: 'hello',
      brand: 'default',
      provider: fakeProvider,
      model: undefined,
      panel: 'right',
      mcp: () => ({ url: 'http://127.0.0.1:1/__deck/mcp', token: 'test-token' }),
      environment: { ...process.env, DECK_FAKE_DELAY_MS: '1' },
      limits: { graceMs: 1500, killAfterMs: 1000 },
      ...options.host,
    }).pipe(Effect.provide(Layer.succeed(DeckTools, DeckTools.of(tools))), Effect.orDie);
    return { sessions, calls };
  });

/**
 * Waits until the conversation has an event the predicate accepts.
 *
 * @param sessions - The host.
 * @param predicate - What to wait for.
 */
export const waitForEvent = (
  sessions: AgentSessionsApi,
  predicate: (event: AgentEvent) => boolean,
): Effect.Effect<AgentEvent> =>
  Effect.gen(function* () {
    for (;;) {
      const found = (yield* sessions.history).find(predicate);
      if (found !== undefined) {
        return found;
      }

      yield* Effect.sleep(10);
    }
  });

/**
 * The fake agent processes running with a session id, by `pgrep`.
 *
 * @param sessionId - A string unique to the processes.
 */
export function processesWith(sessionId: string): string[] {
  try {
    return execFileSync('pgrep', ['-f', sessionId], { encoding: 'utf8' })
      .split('\n')
      .filter((line) => line.trim() !== '');
  } catch {
    return [];
  }
}
