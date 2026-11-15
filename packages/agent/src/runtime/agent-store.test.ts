import type { ChildProcessSpawner } from 'effect/process';

import { NodeServices } from '@effect/platform-node';
import { describe, expect, it } from '@effect/vitest';
import { Effect, FileSystem, Stream, type Scope } from 'effect';
import path from 'node:path';

import type { AgentEvent, ProviderEvent } from '#protocol/agent-events.ts';
import type { AgentSessionsApi } from '#session/agent-sessions.ts';

import { codexProvider } from '#providers/index.ts';
import { parseTranscript } from '#providers/transcripts.fixture.ts';
import {
  INITIAL_AGENT_STATE,
  MAX_PANEL_TURNS,
  MAX_TURN_ITEMS,
  isBusy,
  lintFindingsFor,
  reduceAgent,
  reduceAll,
  reduceConnection,
  redoTarget,
  requestDiffState,
  undoTarget,
  type AgentViewState,
  type TranscriptItem,
} from '#runtime/agent-store.ts';
import { scratchWorkspace, startFakeHost, waitForEvent } from '#session/sessions.fixture.ts';

/**
 * How long one test may take, in milliseconds.
 */
const TEST_TIMEOUT_MS = 40_000;

/**
 * Starts a fake host on a scratch workspace and records every event it streams (deltas included,
 * which the host's own history drops once a turn ends).
 *
 * @param lint - When lint reports an error.
 */
const recordingHost = (lint: 'marker' | 'never' = 'marker') =>
  Effect.gen(function* () {
    const root = yield* scratchWorkspace;
    const { sessions } = yield* startFakeHost(root, { lint });
    const events: AgentEvent[] = [];
    const stream = yield* sessions.subscribe;
    yield* Effect.forkScoped(
      Stream.runForEach(stream, (event) => Effect.sync(() => events.push(event))),
    );
    return { root, sessions, events };
  });

/**
 * Waits until the recorded stream has a matching event.
 *
 * @param events - The recorded events.
 * @param predicate - What to wait for.
 */
const waitFor = (events: readonly AgentEvent[], predicate: (event: AgentEvent) => boolean) =>
  Effect.gen(function* () {
    while (!events.some(predicate)) {
      yield* Effect.sleep(10);
    }
  });

/**
 * Sends a prompt about the title slide.
 *
 * @param sessions - The host.
 * @param text - The prompt.
 */
const ask = (sessions: AgentSessionsApi, text: string) =>
  sessions.submit({ text, slide: { id: 'title', step: 0 } });

/**
 * The items of one turn, as `kind:detail` strings.
 *
 * @param state - The view state.
 * @param turn - The turn number.
 */
function itemsOf(state: AgentViewState, turn: number): string[] {
  return (state.turns.find((one) => one.turn === turn)?.items ?? []).map(describeItem);
}

/**
 * One item as a short string.
 *
 * @param item - The item.
 */
function describeItem(item: TranscriptItem): string {
  switch (item.kind) {
    case 'text':
      return `text${item.streaming ? '…' : ''}`;
    case 'tool':
      return `tool:${item.name}:${item.status}`;
    case 'reasoning':
      return 'reasoning';
    case 'notice':
      return `notice:${item.notice}`;
    case 'error':
      return `error:${item.problem.kind}`;
  }
}

/**
 * Runs a test body against a recording fake host.
 *
 * @param body - The test.
 */
const live = <A, E>(
  body: Effect.Effect<
    A,
    E,
    Scope.Scope | FileSystem.FileSystem | ChildProcessSpawner.ChildProcessSpawner
  >,
) => body.pipe(Effect.scoped, Effect.provide(NodeServices.layer));

describe('the agent store, from the fake provider', () => {
  it.live(
    'assembles streamed text, keeps tool calls in order and ends with the footer data',
    () =>
      live(
        Effect.gen(function* () {
          const { sessions, events } = yield* recordingHost('never');
          yield* ask(sessions, 'Retitle [fake-title:Hi]');
          yield* sessions.idle;
          yield* waitFor(events, (event) => event.type === 'status' && event.running === null);
          expect(events.some((event) => event.type === 'text-delta')).toBe(true);

          // Halfway through the stream, the answer is open and partial.
          const firstDelta = events.findIndex((event) => event.type === 'text-delta');
          const midway = reduceAll(events.slice(0, firstDelta + 3));
          const open = midway.turns[0]?.items.at(-1);
          expect(open).toMatchObject({ kind: 'text', streaming: true });

          const state = reduceAll(events);
          const turn = state.turns[0];
          expect(turn).toMatchObject({
            turn: 1,
            kind: 'user',
            prompt: 'Retitle [fake-title:Hi]',
            phase: 'completed',
            provider: 'fake',
            slide: { id: 'title', file: 'decks/hello/slides/title.mdx', step: 0 },
            changedFiles: [{ path: 'decks/hello/slides/title.mdx', kind: 'update' }],
            history: 'applied',
          });
          expect(turn?.items.filter((item) => item.kind === 'text')).toHaveLength(1);
          const text = turn?.items.find((item) => item.kind === 'text');
          expect(text).toMatchObject({ streaming: false });
          const complete = events.findLast((event) => event.type === 'text');
          expect(text?.kind === 'text' ? text.text : '').toBe(
            complete?.type === 'text' ? complete.text : 'missing',
          );
          expect(itemsOf(state, 1)).toContain('tool:Edit:done');
          expect(turn?.usage?.costUsd).toBeGreaterThan(0);
          expect(turn?.durationMs).toBeGreaterThan(0);
          expect(turn?.lint).toMatchObject({ ok: true, errors: 0, autoFix: false });
          expect(isBusy(state)).toBe(false);
          expect(undoTarget(state)).toBe(1);
          expect(state.announcement).toMatch(/1 file changed/);
        }),
      ),
    TEST_TIMEOUT_MS,
  );

  it.live(
    'marks a refused edit as denied and changes nothing',
    () =>
      live(
        Effect.gen(function* () {
          const { sessions, events } = yield* recordingHost('never');
          yield* ask(sessions, 'Edit the brand [fake:refused]');
          yield* sessions.idle;
          const state = reduceAll(events);
          expect(itemsOf(state, 1)).toContain('tool:Edit:denied');
          const denied = state.turns[0]?.items.find(
            (item) => item.kind === 'tool' && item.status === 'denied',
          );
          expect(denied?.kind === 'tool' ? denied.detail : null).toMatch(/denied/i);
          expect(state.turns[0]).toMatchObject({ phase: 'completed', changedFiles: [] });
          expect(undoTarget(state)).toBeUndefined();
        }),
      ),
    TEST_TIMEOUT_MS,
  );

  it.live(
    'queues a prompt behind a long turn, and cancel stops one and drops the other',
    () =>
      live(
        Effect.gen(function* () {
          const { sessions, events } = yield* recordingHost('never');
          yield* ask(sessions, 'Go on and on [fake:long]');
          yield* ask(sessions, 'Then this');
          yield* waitFor(events, (event) => event.type === 'text-delta');
          const running = reduceAll(events);
          expect(running.turns.map((turn) => [turn.turn, turn.phase])).toEqual([
            [1, 'running'],
            [2, 'queued'],
          ]);
          expect(running.turns[1]?.position).toBe(1);
          expect(isBusy(running)).toBe(true);

          yield* sessions.cancel;
          yield* sessions.idle;
          yield* waitFor(events, (event) => event.type === 'status' && event.running === null);
          const stopped = reduceAll(events);
          expect(stopped.turns.map((turn) => [turn.turn, turn.phase, turn.provider])).toEqual([
            [1, 'cancelled', 'fake'],
            [2, 'cancelled', null],
          ]);
          expect(isBusy(stopped)).toBe(false);
          expect(
            stopped.turns[0]?.items.every((item) => item.kind !== 'text' || !item.streaming),
          ).toBe(true);
        }),
      ),
    TEST_TIMEOUT_MS,
  );

  it.live(
    'keeps a not-signed-in error with its fix, ready for a retry',
    () =>
      live(
        Effect.gen(function* () {
          const { sessions, events } = yield* recordingHost('never');
          yield* ask(sessions, 'Hello [fake:not-signed-in]');
          yield* sessions.idle;
          const failed = reduceAll(events);
          expect(failed.turns[0]).toMatchObject({
            phase: 'failed',
            error: { kind: 'not-signed-in' },
          });
          expect(failed.turns[0]?.error?.fix).toContain('`claude`');
          expect(failed.status?.problem?.kind).toBe('not-signed-in');

          yield* ask(sessions, 'Hello [fake-title:Again]');
          yield* sessions.idle;
          yield* waitFor(events, (event) => event.type === 'status' && event.running === null);
          const retried = reduceAll(events);
          expect(retried.turns.map((turn) => turn.phase)).toEqual(['failed', 'completed']);
          expect(retried.status?.problem).toBeNull();
        }),
      ),
    TEST_TIMEOUT_MS,
  );

  it.live(
    'links the automatic lint fix to the turn whose lint failed',
    () =>
      live(
        Effect.gen(function* () {
          const { sessions, events } = yield* recordingHost('marker');
          yield* ask(sessions, 'Retitle [fake:lint-error]');
          yield* waitFor(events, (event) => event.type === 'turn-done' && event.turn === 2);
          yield* sessions.idle;
          const state = reduceAll(events);
          expect(state.turns[0]?.lint).toMatchObject({ ok: false, errors: 1, autoFix: true });
          expect(state.turns[0]?.lint?.findings[0]).toMatchObject({ rule: 'title-length' });
          expect(state.turns[1]).toMatchObject({ kind: 'auto-fix', autoFixOf: 1 });
          // The fix turn's own lint is clean, so the slide has no findings left.
          expect(state.turns[1]?.lint).toMatchObject({ ok: true, autoFix: false });
          expect(lintFindingsFor(state, 'title')).toEqual([]);
          expect(
            lintFindingsFor(reduceAll(events.filter((event) => event.turn !== 2)), 'title'),
          ).toHaveLength(1);
        }),
      ),
    TEST_TIMEOUT_MS,
  );

  it.live(
    'follows undo and redo, and shows the journal refusing as the request problem',
    () =>
      live(
        Effect.gen(function* () {
          const { root, sessions, events } = yield* recordingHost('never');
          yield* ask(sessions, 'Retitle [fake-title:One]');
          yield* sessions.idle;
          yield* sessions.undo;
          yield* waitFor(events, (event) => event.type === 'history');
          yield* waitFor(events, (event) => event.type === 'status' && event.canRedo);
          const undone = reduceAll(events);
          expect(undone.turns[0]?.history).toBe('undone');
          expect(undoTarget(undone)).toBeUndefined();
          expect(redoTarget(undone)).toBe(1);

          yield* sessions.redo;
          yield* waitFor(events, (event) => event.type === 'history' && event.action === 'redo');
          yield* waitFor(events, (event) => event.type === 'status' && event.canUndo);
          const redone = reduceAll(events);
          expect(redone.turns[0]?.history).toBe('applied');
          expect(undoTarget(redone)).toBe(1);

          const fs = yield* FileSystem.FileSystem;
          yield* fs.writeFileString(path.join(root, 'decks/hello/slides/title.mdx'), '# By hand\n');
          yield* sessions.undo;
          yield* waitFor(events, (event) => event.type === 'error' && event.kind === 'conflict');
          const refused = reduceAll(events);
          expect(refused.requestProblem).toMatchObject({ kind: 'conflict' });
          expect(refused.requestProblem?.message).toContain('decks/hello/slides/title.mdx');
          expect(refused.turns[0]?.history).toBe('applied');
        }),
      ),
    TEST_TIMEOUT_MS,
  );

  it.live(
    'shows what the guard ignored on the turn that made the change',
    () =>
      live(
        Effect.gen(function* () {
          const root = yield* scratchWorkspace;
          const { sessions } = yield* startFakeHost(root, { host: { baselineLint: false } });
          const events: AgentEvent[] = [];
          const stream = yield* sessions.subscribe;
          yield* Effect.forkScoped(
            Stream.runForEach(stream, (event) => Effect.sync(() => events.push(event))),
          );
          yield* sessions.submit({ text: 'Edit [fake:escape]', slide: { id: 'title', step: 0 } });
          yield* sessions.idle;
          yield* waitFor(events, (event) => event.type === 'turn-done');
          const view = reduceAll(events);
          expect(view.turns[0]?.reverted).toEqual({
            paths: [
              { path: 'decks/hello/deck.config.ts', what: 'not content' },
              { path: 'decks/hello/slides/styles.css', what: 'not content' },
            ],
            copies: null,
          });
          expect(view.turns[0]?.changedFiles.map((file) => file.path)).toEqual([
            'decks/hello/slides/title.mdx',
          ]);
        }),
      ),
    TEST_TIMEOUT_MS,
  );

  it.live(
    'clears the conversation on reset and keeps the status',
    () =>
      live(
        Effect.gen(function* () {
          const { sessions, events } = yield* recordingHost('never');
          yield* ask(sessions, 'Retitle');
          yield* sessions.idle;
          yield* sessions.newConversation;
          yield* waitFor(events, (event) => event.type === 'conversation-reset');
          const state = reduceAll(events);
          expect(state.turns).toEqual([]);
          expect(state.status).not.toBeNull();
        }),
      ),
    TEST_TIMEOUT_MS,
  );

  it.live(
    'applies a replay after a reconnect without duplicating anything',
    () =>
      live(
        Effect.gen(function* () {
          const { sessions, events } = yield* recordingHost('never');
          yield* ask(sessions, 'Retitle');
          yield* sessions.idle;
          yield* waitForEvent(sessions, (event) => event.type === 'turn-done');
          const once = reduceAll(events);
          // A reconnect replays the conversation (without its deltas) and the latest status.
          const replay = [...(yield* sessions.history)];
          const twice = reduceAll(
            replay,
            reduceConnection(reduceConnection(once, 'connecting'), 'open'),
          );
          expect(twice.turns).toEqual(once.turns);
          expect(twice.lastSeq).toBe(once.lastSeq);
        }),
      ),
    TEST_TIMEOUT_MS,
  );
});

describe('the agent store, from recorded transcripts', () => {
  /**
   * A provider's events wrapped as one turn of the host's stream.
   *
   * @param provider - The parsed events.
   */
  function asTurn(provider: readonly ProviderEvent[]): AgentEvent[] {
    let seq = 1;
    const envelope = () => ({ seq: seq++, at: 1000 + seq, turn: 1 });
    return [
      {
        type: 'turn-started',
        text: 'Retitle',
        kind: 'user',
        slide: null,
        provider: 'codex',
        model: null,
        ...envelope(),
      },
      ...provider.map((event): AgentEvent => ({ ...event, ...envelope() })),
      { type: 'turn-done', status: 'completed', changedFiles: [], durationMs: 9000, ...envelope() },
    ];
  }

  it('shows whole messages from a provider that does not stream (Codex)', () => {
    const { events } = parseTranscript(codexProvider, 'codex-0.167.2-turn1-edit-title.jsonl');
    expect(events.some((event) => event.type === 'text-delta')).toBe(false);
    const state = reduceAll(asTurn(events));
    const texts = state.turns[0]?.items.filter((item) => item.kind === 'text') ?? [];
    expect(texts.length).toBeGreaterThan(0);
    expect(texts.every((item) => item.kind === 'text' && !item.streaming)).toBe(true);
    expect(itemsOf(state, 1).some((item) => item.startsWith('tool:apply_patch'))).toBe(true);
    expect(state.turns[0]?.usage?.costUsd).toBeNull();
  });
});

describe('the agent store, by hand', () => {
  /**
   * An event with an envelope.
   *
   * @param seq - Its number.
   * @param turn - Its turn.
   * @param body - The rest.
   */
  function at(seq: number, turn: number | null, body: Record<string, unknown>): AgentEvent {
    return { seq, at: seq, turn, ...body } as AgentEvent;
  }

  it('ignores event types it does not know and keeps unknown fields harmless', () => {
    const before = reduceAll([at(1, 1, { type: 'text', text: 'Hi.' })]);
    const after = reduceAll(
      [
        at(2, 1, { type: 'turn-preflight', findings: [] }),
        at(3, 1, { type: 'text', text: 'More.', source: 'assistant' }),
      ],
      before,
    );
    expect(after.lastSeq).toBe(3);
    expect(itemsOf(after, 1)).toEqual(['text', 'text']);
  });

  it('caps the turns it keeps and the items of one turn', () => {
    const events: AgentEvent[] = [];
    for (let turn = 1; turn <= MAX_PANEL_TURNS + 5; turn += 1) {
      events.push(at(turn, turn, { type: 'text', text: `Turn ${turn}.` }));
    }

    const many = reduceAll(events);
    expect(many.turns).toHaveLength(MAX_PANEL_TURNS);
    expect(many.turns[0]?.turn).toBe(6);
    const items: AgentEvent[] = [];
    for (let index = 1; index <= MAX_TURN_ITEMS + 10; index += 1) {
      items.push(at(index, 1, { type: 'notice', kind: 'info', message: `n${index}` }));
    }

    expect(reduceAll(items).turns[0]?.items).toHaveLength(MAX_TURN_ITEMS);
  });

  it('records what the guard ignored on its turn, and a reset clears it', () => {
    const reverted = reduceAll([
      at(1, 1, {
        type: 'reverted',
        paths: [{ path: 'decks/hello/deck.config.ts', what: 'changed' }],
        copies: null,
      }),
    ]);
    expect(reverted.turns[0]?.reverted?.paths).toHaveLength(1);
    expect(reverted.announcement).toBe('Ignored 1 change outside the slides.');
    expect(reduceAll([at(2, null, { type: 'conversation-reset' })], reverted).turns).toEqual([]);
  });

  it('keeps findings that were already there, and the files an undo skipped', () => {
    const big = { path: 'decks/hello/assets/big.png', kind: 'update', undoable: false };
    const state = reduceAll([
      at(1, 1, {
        type: 'turn-done',
        status: 'completed',
        changedFiles: [big],
        durationMs: 1,
      }),
      at(2, 1, {
        type: 'lint',
        ok: true,
        slides: ['title'],
        errors: 0,
        warnings: 0,
        findings: [],
        autoFix: false,
        existing: [
          {
            slide: 'title',
            file: 'decks/hello/slides/title.mdx',
            step: null,
            rule: 'contrast',
            severity: 'error',
            message: 'Old.',
            fix: '',
          },
        ],
      }),
      at(3, null, { type: 'history', action: 'undo', target: 1, files: [], skipped: [big] }),
    ]);
    expect(state.turns[0]?.lint?.existing).toHaveLength(1);
    expect(state.turns[0]?.skipped).toEqual([big]);
    expect(lintFindingsFor(state, 'title')).toHaveLength(1);
  });

  it('reads a drop after the first open as reconnecting', () => {
    const open = reduceConnection(INITIAL_AGENT_STATE, 'open');
    expect(reduceConnection(INITIAL_AGENT_STATE, 'connecting').connection).toBe('connecting');
    expect(reduceConnection(open, 'connecting').connection).toBe('reconnecting');
  });

  it('opens a new text item after a tool call instead of appending to the old one', () => {
    const state = reduceAll([
      at(1, 1, { type: 'text-delta', text: 'Reading. ' }),
      at(2, 1, {
        type: 'tool',
        id: 't1',
        name: 'Read',
        title: 'Read x',
        status: 'running',
        path: null,
        detail: null,
      }),
      at(3, 1, { type: 'text', text: 'Reading.' }),
      at(4, 1, { type: 'text-delta', text: 'Done' }),
      at(5, 1, { type: 'text', text: 'Done.' }),
    ]);
    expect(itemsOf(state, 1)).toEqual(['text', 'tool:Read:running', 'text']);
    expect(state.turns[0]?.items.map((item) => (item.kind === 'text' ? item.text : ''))).toEqual([
      'Reading.',
      '',
      'Done.',
    ]);
  });

  it('records a diff answer, and a new request for an unavailable one', () => {
    const asked = requestDiffState(INITIAL_AGENT_STATE, 3);
    expect(asked.diffs[3]).toEqual({ state: 'loading' });
    expect(requestDiffState(asked, 3)).toBe(asked);
    const missing = reduceAgent(
      asked,
      at(0, 3, { type: 'diff', available: false, message: 'Gone.', files: [] }),
    );
    expect(missing.diffs[3]).toEqual({ state: 'unavailable', message: 'Gone.' });
    expect(requestDiffState(missing, 3).diffs[3]).toEqual({ state: 'loading' });
  });

  it('marks undone turns as past redoing once a later turn changes files', () => {
    const state = reduceAll([
      at(1, 1, {
        type: 'turn-done',
        status: 'completed',
        changedFiles: [{ path: 'a', kind: 'update' }],
        durationMs: 1,
      }),
      at(2, null, { type: 'history', action: 'undo', target: 1, files: [] }),
      at(3, 2, {
        type: 'turn-done',
        status: 'completed',
        changedFiles: [{ path: 'a', kind: 'update' }],
        durationMs: 1,
      }),
    ]);
    expect(state.turns.map((turn) => turn.history)).toEqual(['discarded', 'applied']);
  });
});
