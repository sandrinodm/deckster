import {
  beginTurnGuard,
  resetCodeGate,
  resetTurnGuards,
  syncActiveTurn,
  turnRecordFile,
} from '@deckster/brand/node';
import { NodeServices } from '@effect/platform-node';
import { describe, expect, it } from '@effect/vitest';
import { Effect, Exit, FileSystem, Layer, Scope, Stream } from 'effect';
import path from 'node:path';

import type { AgentEvent } from '#protocol/agent-events.ts';

import { DeckTools } from '#mcp/deck-tools.ts';
import { fakeProvider } from '#providers/fake/fake-provider.ts';
import { makeAgentSessions, sessionFile } from '#session/agent-sessions.ts';
import {
  DEFAULT_BRAND_FILE,
  HELLO_CONFIG,
  processesWith,
  scratchWorkspace,
  sessionTools,
  startFakeHost,
  TITLE_SLIDE,
  waitForEvent,
} from '#session/sessions.fixture.ts';

/**
 * How long one test may take, in milliseconds: each fake turn takes about a second.
 */
const TEST_TIMEOUT_MS = 30_000;

/**
 * The events of one type.
 *
 * @param events - The events.
 * @param type - The type.
 */
function ofType<T extends AgentEvent['type']>(
  events: readonly AgentEvent[],
  type: T,
): Extract<AgentEvent, { type: T }>[] {
  return events.filter((event): event is Extract<AgentEvent, { type: T }> => event.type === type);
}

/**
 * The title slide's text.
 *
 * @param root - The workspace.
 */
const readTitle = (root: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    return yield* fs.readFileString(path.join(root, 'decks/hello/slides/title.mdx'));
  });

describe('agent sessions with the fake provider', () => {
  it.live(
    'runs queued prompts one at a time, in order, and journals each',
    () =>
      Effect.gen(function* () {
        const root = yield* scratchWorkspace;
        const { sessions } = yield* startFakeHost(root);
        for (const title of ['One', 'Two', 'Three']) {
          yield* sessions.submit({
            text: `Retitle [fake-title:${title}]`,
            slide: { id: 'title', step: 0 },
          });
        }

        yield* sessions.idle;
        const events = yield* sessions.history;
        expect(ofType(events, 'turn-queued').map((event) => event.position)).toEqual([0, 1, 2]);
        expect(ofType(events, 'turn-started').map((event) => event.turn)).toEqual([1, 2, 3]);
        const done = ofType(events, 'turn-done');
        expect(done.map((event) => [event.turn, event.status])).toEqual([
          [1, 'completed'],
          [2, 'completed'],
          [3, 'completed'],
        ]);
        expect(done[0]?.changedFiles).toEqual([
          { path: 'decks/hello/slides/title.mdx', kind: 'update' },
        ]);
        for (const turn of [1, 2, 3]) {
          const own = events.filter((event) => event.turn === turn && event.type !== 'turn-queued');
          expect(own.at(-1)?.type === 'turn-done' || own.at(-1)?.type === 'lint').toBe(true);
        }

        expect(yield* readTitle(root)).toContain('# Three');
        expect(ofType(events, 'text-delta')).toEqual([]);
        expect(ofType(events, 'text').length).toBe(3);
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    TEST_TIMEOUT_MS,
  );

  it.live(
    'cancels a running turn with SIGINT and leaves no process behind',
    () =>
      Effect.gen(function* () {
        const root = yield* scratchWorkspace;
        const { sessions } = yield* startFakeHost(root);
        yield* sessions.submit({
          text: 'Write an essay [fake:long]',
          slide: { id: 'title', step: 0 },
        });
        yield* sessions.submit({ text: 'Queued behind it', slide: { id: 'title', step: 0 } });
        const session = yield* waitForEvent(sessions, (event) => event.type === 'session');
        yield* waitForEvent(sessions, (event) => event.type === 'text-delta');
        expect(session.type === 'session' && processesWith(session.sessionId).length).toBe(1);
        yield* sessions.cancel;
        yield* sessions.idle;
        const done = ofType(yield* sessions.history, 'turn-done');
        expect(done.map((event) => [event.turn, event.status])).toEqual([
          [2, 'cancelled'],
          [1, 'cancelled'],
        ]);
        expect(session.type === 'session' && processesWith(session.sessionId)).toEqual([]);
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    TEST_TIMEOUT_MS,
  );

  it.live(
    'lints the touched slide and fixes lint errors with one follow-up turn',
    () =>
      Effect.gen(function* () {
        const root = yield* scratchWorkspace;
        const { sessions, calls } = yield* startFakeHost(root);
        yield* sessions.submit({
          text: 'Retitle [fake:lint-error]',
          slide: { id: 'title', step: 0 },
        });
        yield* sessions.idle;
        const events = yield* sessions.history;
        const lint = ofType(events, 'lint');
        expect(lint.map((event) => [event.turn, event.errors, event.autoFix])).toEqual([
          [1, 1, true],
          [2, 0, false],
        ]);
        const started = ofType(events, 'turn-started');
        expect(started.map((event) => [event.turn, event.kind])).toEqual([
          [1, 'user'],
          [2, 'auto-fix'],
        ]);
        // One baseline lint when the host starts, then one after each turn.
        expect(calls.filter((call) => call === 'deckLint').length).toBe(3);
        expect(calls).not.toContain('deckOutline');
        expect(yield* readTitle(root)).toContain('# Hello, fake agent');
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    TEST_TIMEOUT_MS,
  );

  it.live(
    'starts the automatic follow-up only once, even when errors remain',
    () =>
      Effect.gen(function* () {
        const root = yield* scratchWorkspace;
        const { sessions } = yield* startFakeHost(root, {
          lint: 'always',
          host: { baselineLint: false },
        });
        yield* sessions.submit({
          text: 'Retitle [fake-title:First]',
          slide: { id: 'title', step: 0 },
        });
        yield* sessions.idle;
        const events = yield* sessions.history;
        expect(ofType(events, 'turn-started').map((event) => event.kind)).toEqual([
          'user',
          'auto-fix',
        ]);
        expect(ofType(events, 'lint').map((event) => event.autoFix)).toEqual([true, false]);
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    TEST_TIMEOUT_MS,
  );

  it.live(
    'replays the conversation and the latest status to a new subscriber',
    () =>
      Effect.gen(function* () {
        const root = yield* scratchWorkspace;
        const { sessions } = yield* startFakeHost(root);
        yield* sessions.submit({ text: 'Retitle', slide: { id: 'title', step: 0 } });
        yield* sessions.idle;
        const history = yield* sessions.history;
        const stream = yield* sessions.subscribe;
        const replay = yield* stream.pipe(Stream.take(history.length + 1), Stream.runCollect);
        expect(replay.filter((event) => event.type !== 'status')).toEqual(history);
        expect(replay.at(-1)).toMatchObject({ type: 'status', running: null, canUndo: true });
        const seqs = replay.map((event) => event.seq);
        expect(seqs).toEqual(seqs.toSorted((left, right) => left - right));
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    TEST_TIMEOUT_MS,
  );

  it.live(
    'saves the session id and resumes it after a restart',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const root = yield* scratchWorkspace;
        const first = yield* Scope.make();
        const { sessions } = yield* startFakeHost(root).pipe(Scope.provide(first));
        yield* sessions.submit({ text: 'Retitle', slide: { id: 'title', step: 0 } });
        yield* sessions.idle;
        yield* Scope.close(first, Exit.void);
        const saved = JSON.parse(yield* fs.readFileString(sessionFile(root, 'hello')));
        expect(saved).toMatchObject({ provider: 'fake', established: true, nextTurn: 2 });
        expect(saved.sessionId).toMatch(/^[0-9a-f-]{36}$/);

        const again = yield* startFakeHost(root);
        expect(ofType(yield* again.sessions.history, 'turn-done').length).toBe(1);
        yield* again.sessions.submit({ text: 'Again', slide: { id: 'title', step: 0 } });
        yield* again.sessions.idle;
        const events = yield* again.sessions.history;
        expect(ofType(events, 'turn-started').map((event) => event.turn)).toEqual([1, 2]);
        expect(ofType(events, 'session').map((event) => event.sessionId)).toEqual([
          saved.sessionId,
          saved.sessionId,
        ]);
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    TEST_TIMEOUT_MS,
  );

  it.live(
    'kills the running child when the scope closes',
    () =>
      Effect.gen(function* () {
        const root = yield* scratchWorkspace;
        const scope = yield* Scope.make();
        const { sessions } = yield* startFakeHost(root).pipe(Scope.provide(scope));
        yield* sessions.submit({ text: 'Long [fake:long]', slide: { id: 'title', step: 0 } });
        const session = yield* waitForEvent(sessions, (event) => event.type === 'session');
        const id = session.type === 'session' ? session.sessionId : '';
        yield* waitForEvent(sessions, (event) => event.type === 'text-delta');
        expect(processesWith(id).length).toBe(1);
        yield* Scope.close(scope, Exit.void);
        expect(processesWith(id)).toEqual([]);
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    TEST_TIMEOUT_MS,
  );

  it.live(
    'brings the working copy into the deck every second while the turn still runs',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const root = yield* scratchWorkspace;
        const { sessions } = yield* startFakeHost(root);
        yield* sessions.submit({ text: 'Long [fake:long]', slide: { id: 'title', step: 0 } });
        yield* waitForEvent(sessions, (event) => event.type === 'text-delta');
        const work = path.join(root, '.deck/agent/hello/work');
        const [copy] = yield* fs.readDirectory(work);
        yield* fs.writeFileString(
          path.join(work, copy ?? '', 'slides/title.mdx'),
          '# Synced while running\n',
        );
        let title = yield* readTitle(root);
        for (let attempt = 0; attempt < 40 && !title.includes('Synced'); attempt += 1) {
          yield* Effect.sleep('100 millis');
          title = yield* readTitle(root);
        }

        expect(title).toBe('# Synced while running\n');
        expect(ofType(yield* sessions.history, 'turn-done')).toEqual([]);
        yield* sessions.cancel;
        yield* sessions.idle;
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    TEST_TIMEOUT_MS,
  );

  it.live(
    'undoes and redoes the last turn, and refuses while a turn runs',
    () =>
      Effect.gen(function* () {
        const root = yield* scratchWorkspace;
        const { sessions } = yield* startFakeHost(root);
        yield* sessions.submit({
          text: 'Retitle [fake-title:Changed]',
          slide: { id: 'title', step: 0 },
        });
        yield* sessions.idle;
        expect(yield* readTitle(root)).toContain('# Changed');
        yield* sessions.undo;
        expect(yield* readTitle(root)).toContain('# Hello, deck');
        yield* sessions.redo;
        expect(yield* readTitle(root)).toContain('# Changed');
        const events = yield* sessions.history;
        expect(ofType(events, 'history').map((event) => [event.action, event.target])).toEqual([
          ['undo', 1],
          ['redo', 1],
        ]);

        yield* sessions.submit({ text: 'Long [fake:long]', slide: { id: 'title', step: 0 } });
        yield* waitForEvent(sessions, (event) => event.type === 'text-delta');
        yield* sessions.undo;
        const refused = ofType(yield* sessions.history, 'error').at(-1);
        expect(refused).toMatchObject({ kind: 'bad-request' });
        yield* sessions.cancel;
        yield* sessions.idle;
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    TEST_TIMEOUT_MS,
  );

  it.live(
    'reports not signed in, with its fix, and in the status',
    () =>
      Effect.gen(function* () {
        const root = yield* scratchWorkspace;
        const { sessions } = yield* startFakeHost(root);
        yield* sessions.submit({
          text: 'Hi [fake:not-signed-in]',
          slide: { id: 'title', step: 0 },
        });
        yield* sessions.idle;
        const events = yield* sessions.history;
        expect(ofType(events, 'error')).toEqual([
          expect.objectContaining({ kind: 'not-signed-in', turn: 1 }),
        ]);
        expect(ofType(events, 'turn-done')[0]).toMatchObject({ status: 'failed' });
        const stream = yield* sessions.subscribe;
        const replay = yield* stream.pipe(Stream.take(events.length + 1), Stream.runCollect);
        expect(replay.find((event) => event.type === 'status')).toMatchObject({
          ready: false,
          problem: { kind: 'not-signed-in' },
        });
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    TEST_TIMEOUT_MS,
  );

  it.live(
    'a refused edit ends the turn without changes and shows the denied tool',
    () =>
      Effect.gen(function* () {
        const root = yield* scratchWorkspace;
        const { sessions } = yield* startFakeHost(root);
        yield* sessions.submit({
          text: 'Edit the brand [fake:refused]',
          slide: { id: 'title', step: 0 },
        });
        yield* sessions.idle;
        const events = yield* sessions.history;
        expect(ofType(events, 'tool').some((event) => event.status === 'denied')).toBe(true);
        expect(ofType(events, 'turn-done')[0]).toMatchObject({
          status: 'completed',
          changedFiles: [],
        });
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    TEST_TIMEOUT_MS,
  );

  it.live(
    'attaches comments and a screenshot that fits the size limit',
    () =>
      Effect.gen(function* () {
        const root = yield* scratchWorkspace;
        const { sessions, calls } = yield* startFakeHost(root);
        yield* sessions.submit({
          text: 'Address the comment',
          slide: { id: 'title', step: 0 },
          comments: ['c-1', 'missing'],
          screenshot: true,
        });
        yield* sessions.idle;
        expect(calls).toContain('deckScreenshot:1024');
        expect(ofType(yield* sessions.history, 'turn-done')[0]).toMatchObject({
          status: 'completed',
        });
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    TEST_TIMEOUT_MS,
  );

  it.live(
    'starts a new conversation with a new session',
    () =>
      Effect.gen(function* () {
        const root = yield* scratchWorkspace;
        const { sessions } = yield* startFakeHost(root);
        yield* sessions.submit({ text: 'Retitle', slide: { id: 'title', step: 0 } });
        yield* sessions.idle;
        const first = ofType(yield* sessions.history, 'session')[0];
        yield* sessions.newConversation;
        expect((yield* sessions.history).map((event) => event.type)).toEqual([
          'conversation-reset',
        ]);
        yield* sessions.submit({ text: 'Retitle', slide: { id: 'title', step: 0 } });
        yield* sessions.idle;
        const second = ofType(yield* sessions.history, 'session')[0];
        expect(second?.sessionId).not.toBe(first?.sessionId);
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    TEST_TIMEOUT_MS,
  );

  it.live(
    'shows errors that were there before the turn as already there, and never auto-fixes them',
    () =>
      Effect.gen(function* () {
        const root = yield* scratchWorkspace;
        const { sessions, calls } = yield* startFakeHost(root, { lint: 'always' });
        yield* Effect.promise(async () => {
          while (!calls.includes('deckLint')) {
            await new Promise((resolve) => setTimeout(resolve, 10));
          }
        });
        yield* Effect.sleep(50);
        yield* sessions.submit({
          text: 'Retitle [fake-title:Second]',
          slide: { id: 'title', step: 0 },
        });
        yield* sessions.idle;
        const events = yield* sessions.history;
        expect(ofType(events, 'turn-started').map((event) => event.kind)).toEqual(['user']);
        const [lint] = ofType(events, 'lint');
        expect(lint).toMatchObject({ ok: true, errors: 0, autoFix: false, findings: [] });
        expect(lint?.existing?.map((finding) => finding.rule)).toEqual(['title-length']);
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    TEST_TIMEOUT_MS,
  );

  it.live(
    'drops the automatic follow-up when the turn is cancelled during its lint',
    () =>
      Effect.gen(function* () {
        const root = yield* scratchWorkspace;
        const gate = { open: false };
        const { sessions } = yield* startFakeHost(root, {
          host: { baselineLint: false },
          lintGate: gate,
        });
        yield* sessions.submit({
          text: 'Retitle [fake:lint-error]',
          slide: { id: 'title', step: 0 },
        });
        yield* waitForEvent(sessions, (event) => event.type === 'turn-done');
        yield* Effect.sleep(50);
        yield* sessions.cancel;
        gate.open = true;
        yield* sessions.idle;
        const events = yield* sessions.history;
        expect(ofType(events, 'turn-started').map((event) => event.kind)).toEqual(['user']);
        expect(ofType(events, 'lint')).toEqual([]);
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    TEST_TIMEOUT_MS,
  );

  it.live(
    'a first turn that fails after naming its session leaves a session the next turn resumes',
    () =>
      Effect.gen(function* () {
        const root = yield* scratchWorkspace;
        const { sessions } = yield* startFakeHost(root);
        yield* sessions.submit({
          text: 'Retitle [fake:fail-after-init]',
          slide: { id: 'title', step: 0 },
        });
        yield* sessions.idle;
        yield* sessions.submit({ text: 'Retitle', slide: { id: 'title', step: 0 } });
        yield* sessions.idle;
        const events = yield* sessions.history;
        expect(ofType(events, 'turn-done').map((event) => event.status)).toEqual([
          'failed',
          'completed',
        ]);
        const ids = ofType(events, 'session').map((event) => event.sessionId);
        expect(new Set(ids).size).toBe(1);
        expect(
          ofType(events, 'error').some((event) => event.message.includes('already in use')),
        ).toBe(false);
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    TEST_TIMEOUT_MS,
  );

  it.live(
    'restarts the conversation once when the provider no longer has the session, or already has it',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        for (const established of [true, false]) {
          const root = yield* scratchWorkspace;
          const stale = established
            ? '11111111-1111-4111-8111-111111111111'
            : '22222222-2222-4222-8222-222222222222';
          if (!established) {
            const store = path.join(root, '.deck/fake-sessions');
            yield* fs.makeDirectory(store, { recursive: true });
            yield* fs.writeFileString(path.join(store, stale), '');
          }

          yield* fs.makeDirectory(path.dirname(sessionFile(root, 'hello')), { recursive: true });
          yield* fs.writeFileString(
            sessionFile(root, 'hello'),
            JSON.stringify({
              version: 1,
              provider: 'fake',
              model: null,
              sessionId: stale,
              established,
              costUsd: 0,
              nextTurn: 1,
              seq: 1,
              transcript: [],
            }),
          );
          const { sessions } = yield* startFakeHost(root);
          yield* sessions.submit({ text: 'Retitle', slide: { id: 'title', step: 0 } });
          yield* sessions.idle;
          const events = yield* sessions.history;
          expect(ofType(events, 'turn-done').map((event) => event.status)).toEqual(['completed']);
          expect(
            ofType(events, 'notice').some((event) => event.message.includes('was restarted')),
          ).toBe(true);
          const ids = ofType(events, 'session').map((event) => event.sessionId);
          expect(ids.length).toBeGreaterThan(0);
          expect(ids).not.toContain(stale);
          const saved = JSON.parse(yield* fs.readFileString(sessionFile(root, 'hello')));
          expect(saved).toMatchObject({ established: true });
          expect(saved.sessionId).not.toBe(stale);
        }
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    TEST_TIMEOUT_MS,
  );

  it.live(
    'set-model and new-conversation at once both apply, and leave no temporary files',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const root = yield* scratchWorkspace;
        const { sessions } = yield* startFakeHost(root);
        yield* Effect.all(
          [
            sessions.setModel('model-a'),
            sessions.newConversation,
            sessions.setModel('model-b'),
            sessions.newConversation,
          ],
          { concurrency: 'unbounded' },
        );
        const errors = ofType(yield* sessions.history, 'notice').filter((event) =>
          event.message.includes('Could not save'),
        );
        expect(errors).toEqual([]);
        const saved = JSON.parse(yield* fs.readFileString(sessionFile(root, 'hello')));
        expect(saved.model).toBe('model-b');
        const leftovers = (yield* fs.readDirectory(
          path.dirname(sessionFile(root, 'hello')),
        )).filter((name) => name.endsWith('.tmp'));
        expect(leftovers).toEqual([]);
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    TEST_TIMEOUT_MS,
  );
});

/**
 * A file of the scratch workspace.
 *
 * @param root - The workspace.
 * @param file - The path relative to it.
 */
const readFile = (root: string, file: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    return yield* fs.readFileString(path.join(root, file));
  });

/**
 * Runs one prompt on a fresh fake host and returns the host, the events and the workspace.
 *
 * @param text - The prompt.
 */
const runPrompt = (text: string) =>
  Effect.gen(function* () {
    const root = yield* scratchWorkspace;
    const { sessions } = yield* startFakeHost(root, { host: { baselineLint: false } });
    yield* sessions.submit({ text, slide: { id: 'title', step: 0 } });
    yield* sessions.idle;
    return { root, sessions, events: yield* sessions.history };
  });

describe('the content-only scope, with the fake provider', () => {
  it.live(
    'takes the slide edit from the working copy, ignores the rest, and tells the next turn',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const root = yield* scratchWorkspace;
        const log = path.join(root, 'prompts.log');
        const { sessions } = yield* startFakeHost(root, {
          host: {
            baselineLint: false,
            environment: { ...process.env, DECK_FAKE_DELAY_MS: '1', DECK_FAKE_PROMPT_LOG: log },
          },
        });
        yield* sessions.submit({ text: 'Retitle [fake:escape]', slide: { id: 'title', step: 0 } });
        yield* sessions.idle;
        const events = yield* sessions.history;
        expect(ofType(events, 'reverted')).toEqual([
          expect.objectContaining({
            paths: [
              { path: 'decks/hello/deck.config.ts', what: 'not content' },
              { path: 'decks/hello/slides/styles.css', what: 'not content' },
            ],
            copies: null,
          }),
        ]);
        expect(ofType(events, 'turn-done')[0]?.changedFiles).toEqual([
          { path: 'decks/hello/slides/title.mdx', kind: 'update' },
        ]);
        expect(yield* readFile(root, 'decks/hello/deck.config.ts')).toBe(HELLO_CONFIG);
        expect(yield* fs.exists(path.join(root, 'decks/hello/slides/styles.css'))).toBe(false);
        expect(yield* readFile(root, 'decks/hello/slides/title.mdx')).toContain('fake agent');
        const prompt = (yield* fs.readFileString(log)).split('\n=== end of prompt ===\n')[0] ?? '';
        expect(prompt).toMatch(/^Working copy: .*\/\.deck\/agent\/hello\/work\/1-[0-9a-f]{12}\/$/m);
        expect(prompt).toMatch(/^Slide file: .*\/work\/1-[0-9a-f]{12}\/slides\/title\.mdx$/m);
        expect(prompt).toContain('Slide in the deck: decks/hello/slides/title.mdx');
        expect(yield* fs.readDirectory(path.join(root, '.deck/agent/hello/work'))).toEqual([]);

        yield* sessions.submit({ text: 'Again', slide: { id: 'title', step: 0 } });
        yield* sessions.idle;
        const prompts = (yield* fs.readFileString(log)).split('\n=== end of prompt ===\n');
        expect(prompts[1]).toContain('<deck-data kind="reverted">');
        expect(prompts[1]).toContain('- decks/hello/deck.config.ts (not content)');
        expect(prompts[2] ?? '').not.toContain('kind="reverted"');
        yield* sessions.undo;
        expect(yield* readFile(root, 'decks/hello/slides/title.mdx')).toBe(TITLE_SLIDE);
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    TEST_TIMEOUT_MS,
  );

  it.live(
    'H2 (a process left behind): what it writes after the turn never reaches the deck',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const root = yield* scratchWorkspace;
        const { sessions } = yield* startFakeHost(root, { host: { baselineLint: false } });
        const slides = path.join(root, 'decks/hello/slides');
        yield* sessions.submit({ text: 'Retitle [fake:linger]', slide: { id: 'title', step: 0 } });
        yield* sessions.idle;
        expect(yield* fs.readDirectory(slides)).toEqual(['title.mdx']);
        yield* Effect.sleep(2500);
        expect(yield* fs.readDirectory(slides)).toEqual(['title.mdx']);
        yield* sessions.submit({
          text: 'Retitle again [fake-title:Two]',
          slide: { id: 'title', step: 0 },
        });
        yield* sessions.idle;
        expect(yield* fs.readDirectory(slides)).toEqual(['title.mdx']);
        expect(yield* readFile(root, 'decks/hello/slides/title.mdx')).toContain('Two');
        const reverted = ofType(yield* sessions.history, 'reverted').flatMap(
          (event) => event.paths,
        );
        expect(reverted.map((item) => item.path)).not.toContain('decks/hello/slides/late.mdx');
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    TEST_TIMEOUT_MS,
  );

  it.live(
    'a rename that changes only letter case is ignored and the slide keeps its name',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const { root, events } = yield* runPrompt('Edit [fake:case-rename]');
        expect(ofType(events, 'reverted')[0]?.paths).toEqual([
          {
            path: 'decks/hello/slides/Title.mdx',
            what: 'differs only in letter case from slides/title.mdx',
          },
        ]);
        expect(yield* fs.readDirectory(path.join(root, 'decks/hello/slides'))).toEqual([
          'title.mdx',
        ]);
        expect(yield* readFile(root, 'decks/hello/slides/title.mdx')).toBe(TITLE_SLIDE);
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    TEST_TIMEOUT_MS,
  );

  it.live(
    'puts back a deck config changed in the deck itself, even with a same-length rewrite',
    () =>
      Effect.gen(function* () {
        const { root, events } = yield* runPrompt('Edit [fake:same-stat]');
        expect(ofType(events, 'reverted')[0]?.paths).toEqual([
          { path: 'decks/hello/deck.config.ts', what: 'changed, put back' },
        ]);
        expect(yield* readFile(root, 'decks/hello/deck.config.ts')).toBe(HELLO_CONFIG);
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    TEST_TIMEOUT_MS,
  );

  it.live(
    'an unreadable deck config is put back and the turn says some files could not be read',
    () =>
      Effect.gen(function* () {
        const { root, events } = yield* runPrompt('Edit [fake:unreadable]');
        expect(yield* readFile(root, 'decks/hello/deck.config.ts')).toBe(HELLO_CONFIG);
        expect(ofType(events, 'turn-done')[0]?.changedFiles).toEqual([
          { path: 'decks/hello/slides/title.mdx', kind: 'update' },
        ]);
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    TEST_TIMEOUT_MS,
  );

  it.live(
    'ignores a link the turn made in its working copy, and puts back the brand file',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const linked = yield* runPrompt('Edit [fake:symlink]');
        expect(ofType(linked.events, 'reverted')[0]?.paths).toEqual([
          { path: 'decks/hello/slides/link.mdx', what: 'a link' },
        ]);
        expect(yield* fs.exists(path.join(linked.root, 'decks/hello/slides/link.mdx'))).toBe(false);
        const brand = yield* runPrompt('Edit [fake:edit-brand]');
        expect(ofType(brand.events, 'reverted')[0]?.paths).toEqual([
          { path: 'brands/default/brand.ts', what: 'changed, put back' },
        ]);
        expect(yield* readFile(brand.root, 'brands/default/brand.ts')).toBe(DEFAULT_BRAND_FILE);
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    TEST_TIMEOUT_MS,
  );

  it.live(
    'H4: the brand comes from the server or the deck config, never from the page',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const root = yield* scratchWorkspace;
        const log = path.join(root, 'prompts.log');
        const calls: string[] = [];
        const tools = sessionTools(root, 'never', calls);
        const sessions = yield* makeAgentSessions({
          workspaceRoot: root,
          deck: 'hello',
          brand: undefined,
          provider: fakeProvider,
          model: undefined,
          panel: 'right',
          mcp: () => ({ url: 'http://127.0.0.1:1/__deck/mcp', token: 'test-token' }),
          environment: { ...process.env, DECK_FAKE_DELAY_MS: '1', DECK_FAKE_PROMPT_LOG: log },
          baselineLint: false,
        }).pipe(
          Effect.provide(
            Layer.succeed(
              DeckTools,
              DeckTools.of({
                ...tools,
                currentSlide: Effect.succeed({
                  connected: true,
                  slide: {
                    id: 'title',
                    number: 1,
                    file: 'decks/hello/slides/title.mdx',
                    layout: '',
                    title: '',
                  },
                  step: 0,
                  stepCount: null,
                  brand: 'page-chosen',
                  selection: '',
                  pages: 1,
                }),
              }),
            ),
          ),
          Effect.orDie,
        );
        yield* sessions.submit({
          text: 'Retitle [fake:edit-brand]',
          slide: { id: 'title', step: 0 },
        });
        yield* sessions.idle;
        const prompt = yield* fs.readFileString(log);
        expect(prompt).toContain('(brand "default")');
        expect(prompt).not.toContain('page-chosen');
        expect(calls).toContain('brandName');
        expect(yield* readFile(root, 'brands/default/brand.ts')).toBe(DEFAULT_BRAND_FILE);
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    TEST_TIMEOUT_MS,
  );

  it.live(
    'a host that starts after a killed turn puts the deck back first and never syncs its working copy',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const root = yield* scratchWorkspace;
        const guard = yield* beginTurnGuard(
          { workspaceRoot: root, deck: 'hello', brand: 'default' },
          1,
        );
        yield* fs.writeFileString(
          path.join(guard.staging.absolute, 'slides/title.mdx'),
          '# Synced\n',
        );
        yield* syncActiveTurn(root, 'hello');
        yield* fs.writeFileString(path.join(guard.staging.absolute, 'slides/late.mdx'), '# Late\n');
        yield* fs.writeFileString(path.join(root, 'decks/hello/deck.config.ts'), 'throw 1;\n');
        resetTurnGuards();
        resetCodeGate();
        const record = turnRecordFile(root, 'hello');
        const text = yield* fs.readFileString(record);
        yield* fs.writeFileString(record, text.replace(/"pid": \d+/, '"pid": 2147483646'));
        yield* startFakeHost(root, { host: { baselineLint: false } });
        expect(yield* readFile(root, 'decks/hello/deck.config.ts')).toBe(HELLO_CONFIG);
        expect(yield* readFile(root, 'decks/hello/slides/title.mdx')).toBe(TITLE_SLIDE);
        expect(yield* fs.readDirectory(path.join(root, 'decks/hello/slides'))).toEqual([
          'title.mdx',
        ]);
        expect(yield* fs.exists(guard.staging.absolute)).toBe(false);
        expect(yield* fs.exists(record)).toBe(false);
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    TEST_TIMEOUT_MS,
  );

  it.live(
    'a second host for the same deck refuses to start, with a clear message',
    () =>
      Effect.gen(function* () {
        const root = yield* scratchWorkspace;
        yield* startFakeHost(root, { host: { baselineLint: false } });
        const calls: string[] = [];
        const error = yield* makeAgentSessions({
          workspaceRoot: root,
          deck: 'hello',
          brand: 'default',
          provider: fakeProvider,
          model: undefined,
          panel: 'right',
          mcp: () => ({ url: 'http://127.0.0.1:1/__deck/mcp', token: 'test-token' }),
          baselineLint: false,
        }).pipe(
          Effect.provide(
            Layer.succeed(DeckTools, DeckTools.of(sessionTools(root, 'never', calls))),
          ),
          Effect.flip,
        );
        expect(error.message).toContain('Another dev server already runs an agent for decks/hello');
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    TEST_TIMEOUT_MS,
  );

  it.live(
    'a defect in a turn ends that turn with an error and the queue keeps draining',
    () =>
      Effect.gen(function* () {
        const root = yield* scratchWorkspace;
        const calls: string[] = [];
        const tools = sessionTools(root, 'never', calls);
        let first = true;
        const sessions = yield* makeAgentSessions({
          workspaceRoot: root,
          deck: 'hello',
          brand: 'default',
          provider: fakeProvider,
          model: undefined,
          panel: 'right',
          mcp: () => ({ url: 'http://127.0.0.1:1/__deck/mcp', token: 'test-token' }),
          environment: { ...process.env, DECK_FAKE_DELAY_MS: '1' },
          baselineLint: false,
        }).pipe(
          Effect.provide(
            Layer.succeed(
              DeckTools,
              DeckTools.of({
                ...tools,
                currentSlide: Effect.suspend(() => {
                  if (first) {
                    first = false;
                    return Effect.die(new RangeError('Invalid time value'));
                  }

                  return tools.currentSlide;
                }),
              }),
            ),
          ),
          Effect.orDie,
        );
        yield* sessions.submit({ text: 'One', slide: { id: 'title', step: 0 } });
        yield* sessions.submit({ text: 'Two', slide: { id: 'title', step: 0 } });
        yield* sessions.idle;
        const events = yield* sessions.history;
        expect(ofType(events, 'turn-done').map((event) => [event.turn, event.status])).toEqual([
          [1, 'failed'],
          [2, 'completed'],
        ]);
        expect(ofType(events, 'error')[0]?.message).toContain('internal error');
        const statuses = ofType(events, 'status');
        expect(statuses.at(-1)?.running ?? null).toBeNull();
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    TEST_TIMEOUT_MS,
  );

  it.live(
    'an unknown lint baseline is never blamed on the turn: no automatic fix runs',
    () =>
      Effect.gen(function* () {
        const root = yield* scratchWorkspace;
        const gate = { open: false };
        const { sessions } = yield* startFakeHost(root, {
          lint: 'always',
          lintGate: gate,
          host: { baselineWaitMs: 50 },
        });
        yield* sessions.submit({ text: 'Retitle', slide: { id: 'title', step: 0 } });
        yield* waitForEvent(sessions, (event) => event.type === 'turn-done');
        gate.open = true;
        yield* sessions.idle;
        const events = yield* sessions.history;
        expect(ofType(events, 'turn-started').length).toBe(1);
        expect(ofType(events, 'lint')[0]?.autoFix).toBe(false);
        expect(
          ofType(events, 'notice').some((event) => event.message.includes('not linted before')),
        ).toBe(true);
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    TEST_TIMEOUT_MS,
  );

  it.live(
    'keeps at most the configured number of events in memory and in the replay',
    () =>
      Effect.gen(function* () {
        const root = yield* scratchWorkspace;
        const { sessions } = yield* startFakeHost(root, {
          host: { baselineLint: false, maxLiveEvents: 12 },
        });
        for (const title of ['One', 'Two', 'Three']) {
          yield* sessions.submit({
            text: `Retitle [fake-title:${title}]`,
            slide: { id: 'title', step: 0 },
          });
        }

        yield* sessions.idle;
        const kept = (yield* sessions.history).length;
        expect(kept).toBeGreaterThan(0);
        expect(kept).toBeLessThanOrEqual(12);
        const replayed = yield* Effect.scoped(
          Effect.gen(function* () {
            const stream = yield* sessions.subscribe;
            return yield* Stream.runCollect(Stream.take(stream, kept + 1));
          }),
        );
        expect([...replayed].map((event) => event.type).at(-1)).toBe('status');
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    TEST_TIMEOUT_MS,
  );
});
