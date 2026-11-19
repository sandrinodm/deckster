import { FRAMEWORK_ROOT } from '@deckster/brand/node';
import { Effect } from 'effect';
import { describe, expect, it } from 'vite-plus/test';

import { cliLayer } from '#cli.ts';
import { startDevServer } from '#server/dev-server.ts';
import { Workspace } from '#workspace.ts';

describe('startDevServer', () => {
  it('closes a reused chooser port and retries before publishing the selected server', async () => {
    const ports: number[] = [];
    const probe = Effect.gen(function* () {
      const selected = yield* startDevServer({
        workspaceRoot: FRAMEWORK_ROOT,
        deck: 'hello',
        port: 0,
        host: false,
        brand: undefined,
        mcp: false,
        agent: undefined,
        printUrls: false,
        chooser: {
          port: 5173,
          key: 'test-selection',
          claimPort: (port) => {
            ports.push(port);
            return ports.length > 1;
          },
        },
      });
      expect(ports).toHaveLength(2);
      const failed = new URL(selected.url);
      failed.port = String(ports[0]);
      yield* Effect.promise(() => expect(fetch(failed)).rejects.toThrow('fetch failed'));
      const response = yield* Effect.promise(() => fetch(selected.url));
      expect(response.ok).toBe(true);
      yield* Effect.promise(() => response.body?.cancel() ?? Promise.resolve());
    });
    await Effect.runPromise(
      probe.pipe(Effect.scoped, Effect.provide(cliLayer(Workspace.at(FRAMEWORK_ROOT)))),
    );
  }, 25_000);
});
