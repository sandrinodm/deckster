/**
 * A host process for the watchdog test: it starts the watchdog, writes and tracks a token file,
 * runs one long fake turn (`DECK_FAKE_SCENARIO=long`) named by a session id, prints `started` once
 * the turn streams, and waits to be killed. Run as `node watchdog-host.fixture.ts <root> <file>
 * <session id>`.
 */
import { NodeRuntime, NodeServices } from '@effect/platform-node';
import { Deferred, Effect } from 'effect';
import { writeFileSync } from 'node:fs';

import { trackFile } from '#process/cleanup-registry.ts';
import { runTurn } from '#process/run-turn.ts';
import { startWatchdog } from '#process/watchdog.ts';
import { fakeProvider } from '#providers/fake/fake-provider.ts';
import { makeParseState } from '#providers/provider-types.ts';

const [root, file, sessionId] = process.argv.slice(2);
if (root === undefined || file === undefined || sessionId === undefined) {
  throw new Error('usage: watchdog-host.fixture.ts <root> <file> <session id>');
}

writeFileSync(file, 'token');
trackFile(file);
let announced = false;
NodeRuntime.runMain(
  Effect.scoped(
    Effect.gen(function* () {
      yield* startWatchdog();
      const cancel = yield* Deferred.make<void>();
      yield* runTurn({
        provider: fakeProvider,
        invocation: fakeProvider.invocation({
          turn: {
            deck: 'hello',
            brand: undefined,
            text: 'Long',
            kind: 'user',
            slide: undefined,
            selection: undefined,
            comments: [],
            findings: [],
            screenshot: undefined,
            reverted: [],
            web: false,
            model: undefined,
          },
          prompt: 'Long',
          rules: '',
          session: { id: sessionId, resume: false },
          mcp: { url: 'http://127.0.0.1:1/__deck/mcp', token: 'x' },
          workspaceRoot: root,
          agentDir: root,
          workingCopy: root,
          environment: { ...process.env, DECK_FAKE_SCENARIO: 'long', DECK_FAKE_IGNORE_PARENT: '1' },
        }),
        state: makeParseState(root),
        cancel,
        onEvent: () =>
          Effect.sync(() => {
            if (!announced) {
              announced = true;
              process.stdout.write('started\n');
            }
          }),
      });
    }),
  ).pipe(Effect.provide(NodeServices.layer)),
);
